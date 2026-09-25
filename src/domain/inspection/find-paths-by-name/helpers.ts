import fs from "fs/promises";
import path from "path";
import {
  buildTraversalNarrowingGuidance,
  resolveTraversalPreflightContext,
} from "@domain/shared/guardrails/filesystem-preflight";
import {
  TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS,
  resolveTraversalWorkloadAdmissionDecision,
  TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES,
} from "@domain/shared/guardrails/traversal-workload-admission";
import { collectTraversalCandidateWorkloadEvidence } from "@domain/shared/guardrails/traversal-candidate-workload";
import {
  assertTraversalRuntimeBudget,
  COMPLETE_RESULT_TRAVERSAL_RUNTIME_BUDGET_LIMITS,
  createTraversalRuntimeBudgetState,
  isTraversalRuntimeBudgetExceededError,
  recordTraversalDirectoryVisit,
  recordTraversalEntryVisit,
} from "@domain/shared/guardrails/traversal-runtime-budget";
import { resolveTraversalScopeEntryPolicy } from "@domain/shared/guardrails/traversal-scope-policy";
import {
  INSPECTION_RESUME_MODES,
  type InspectionResumeMode,
} from "@domain/shared/resume/inspection-resume-contract";
import {
  cloneInspectionResumeTraversalFrames,
  commitInspectionResumeTraversalEntry,
} from "@domain/shared/resume/inspection-resume-frontier";
import { DISCOVERY_RESPONSE_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";
import type { FileSystemEntrySymlinkMarking } from "@domain/inspection/shared/filesystem-entry-metadata-contract";
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import { resolveSymlinkTargetPath } from "@infrastructure/filesystem/filesystem-entry-metadata";
import { validatePath } from "@infrastructure/filesystem/path-guard";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";

/**
 * Describes the helper-level result for one name-search traversal.
 *
 * @remarks
 * This contract preserves collected matches and truncation state so callers can
 * build structured or formatted discovery output without recomputing traversal
 * breadth decisions.
 */
export interface SearchFilesResult {
  matches: string[];
  truncated: boolean;
  /**
   * Symbolic-link markings for delivered matches that are aliases.
   *
   * @remarks
   * Present only when at least one delivered match is a symbolic link. The match itself
   * stays in `matches` as the truthful traversal path; the marking adds the alias nature.
   */
  symlinkMatches?: FileSystemEntrySymlinkMarking[];
  admissionOutcome?: typeof TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES[keyof typeof TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES];
  nextContinuationState?: FindPathsByNameContinuationState | null;
}

interface FindPathsByNameTraversalFrame {
  directoryRelativePath: string;
  nextEntryIndex: number;
}

export interface FindPathsByNameContinuationState {
  traversalFrames: FindPathsByNameTraversalFrame[];
}

export const FIND_PATHS_BY_NAME_FAMILY_MEMBER = "find_paths_by_name";
const FIND_PATHS_BY_NAME_INLINE_RESPONSE_OVERHEAD_CHARS = 64;

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function cloneFindPathsByNameTraversalFrames(
  traversalFrames: FindPathsByNameTraversalFrame[],
): FindPathsByNameTraversalFrame[] {
  return cloneInspectionResumeTraversalFrames(traversalFrames);
}

function createInitialFindPathsByNameTraversalFrames(): FindPathsByNameTraversalFrame[] {
  return [{ directoryRelativePath: "", nextEntryIndex: 0 }];
}

async function readSortedDirectoryEntries(currentPath: string): Promise<import("fs").Dirent<string>[]> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  return entries.sort((leftEntry, rightEntry) => leftEntry.name.localeCompare(rightEntry.name));
}

/**
 * Traverses one validated root and collects case-insensitive name matches.
 *
 * @remarks
 * The helper normalizes exclude-pattern handling, enforces path validation on
 * every visited entry, and stops traversal once the effective result ceiling is
 * reached so discovery output cannot grow without a bounded truncation signal.
 *
 * @param rootPath - Validated root path used as the traversal anchor.
 * @param pattern - Case-insensitive substring matched against entry names.
 * @param excludePatterns - Glob-like exclusion patterns applied to relative paths.
 * @param includeExcludedGlobs - Explicit descendant re-include globs that may reopen excluded subtrees.
 * @param respectGitIgnore - Indicates whether optional directory-scoped hierarchical `.gitignore` enrichment should participate in traversal.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @param maxResults - Maximum number of collected matches before truncation.
 * @param batchRootCount - Number of roots participating in the current caller-visible batch surface.
 * @returns Helper-level matches and truncation state for the traversal.
 */
export async function searchFiles(
  rootPath: string,
  pattern: string,
  excludePatterns: string[] = [],
  includeExcludedGlobs: string[] = [],
  respectGitIgnore: boolean,
  allowedDirectories: string[],
  maxResults: number,
  batchRootCount: number = 1,
  continuationState: FindPathsByNameContinuationState | null = null,
  requestedResumeMode: InspectionResumeMode | null = null,
): Promise<SearchFilesResult> {
  const results: string[] = [];
  const symlinkMatches: FileSystemEntrySymlinkMarking[] = [];
  let truncated = false;
  const traversalPreflightContext = await resolveTraversalPreflightContext(
    "find_paths_by_name",
    rootPath,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    allowedDirectories,
    ["directory"],
  );
  const executionPolicy = resolveSearchExecutionPolicy(detectIoCapabilityProfile());
  const normalizedPattern = pattern.toLowerCase();
  const candidateWorkloadEvidence = await collectTraversalCandidateWorkloadEvidence({
    validRootPath: traversalPreflightContext.rootEntry.validPath,
    traversalScopePolicyResolution: traversalPreflightContext.traversalScopePolicyResolution,
    runtimeBudgetLimits: {
      maxVisitedEntries: executionPolicy.traversalPreviewExecutionEntryBudget,
      maxVisitedDirectories: executionPolicy.traversalPreviewExecutionDirectoryBudget,
      softTimeBudgetMs: executionPolicy.traversalPreviewExecutionTimeBudgetMs,
    },
    inlineCandidateByteBudget: null,
    fileMatcher: () => true,
    responseSurfaceEstimator: {
      shouldCountEntry: (_candidateRelativePath, entry) =>
        entry.name.toLowerCase().includes(normalizedPattern),
      estimateEntryResponseChars: (candidateRelativePath) =>
        traversalPreflightContext.rootEntry.validPath.length + candidateRelativePath.length + 3,
    },
  });
  const projectedInlineTextChars = candidateWorkloadEvidence.estimatedResponseChars === null
    ? null
    : FIND_PATHS_BY_NAME_INLINE_RESPONSE_OVERHEAD_CHARS
      + candidateWorkloadEvidence.estimatedResponseChars;
  const inlineTextResponseCapChars = Math.max(
    1,
    Math.floor(DISCOVERY_RESPONSE_CAP_CHARS / Math.max(1, batchRootCount)),
  );
  const traversalAdmissionDecision = resolveTraversalWorkloadAdmissionDecision({
    requestedRoot: rootPath,
    rootEntry: traversalPreflightContext.rootEntry,
    admissionEvidence: traversalPreflightContext.traversalPreflightAdmissionEvidence,
    candidateWorkloadEvidence,
    projectedInlineTextChars,
    executionPolicy,
    consumerCapabilities: {
      toolName: FIND_PATHS_BY_NAME_FAMILY_MEMBER,
      previewFirstSupported: true,
      inlineCandidateFileBudget: executionPolicy.traversalInlineCandidateFileBudget,
      inlineTextResponseCapChars,
      executionTimeCostMultiplier:
        TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.DISCOVERY.executionTimeCostMultiplier,
      estimatedPerCandidateFileCostMs:
        TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.DISCOVERY.estimatedPerCandidateFileCostMs,
      taskBackedExecutionSupported: false,
    },
  });

  if (
    traversalAdmissionDecision.outcome
    === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.NARROWING_REQUIRED
    || traversalAdmissionDecision.outcome
    === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED
  ) {
    throw new Error(
      traversalAdmissionDecision.guidanceText ?? buildTraversalNarrowingGuidance(rootPath),
    );
  }
  const validatedRootPath = traversalPreflightContext.rootEntry.validPath;
  const traversalScopePolicyResolution = traversalPreflightContext.traversalScopePolicyResolution;
  const traversalRuntimeBudgetState = createTraversalRuntimeBudgetState();
  const traversalNarrowingGuidance = buildTraversalNarrowingGuidance(rootPath);
  const completeResultRequested =
    traversalAdmissionDecision.outcome === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST
    && requestedResumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT;
  const previewExecutionRuntimeBudgetLimits =
    traversalAdmissionDecision.outcome === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST
    && !completeResultRequested
      ? {
          maxVisitedEntries: executionPolicy.traversalPreviewExecutionEntryBudget,
          maxVisitedDirectories: executionPolicy.traversalPreviewExecutionDirectoryBudget,
          softTimeBudgetMs: executionPolicy.traversalPreviewExecutionTimeBudgetMs,
        }
      : undefined;
  const effectiveTraversalRuntimeBudgetLimits = completeResultRequested
    ? COMPLETE_RESULT_TRAVERSAL_RUNTIME_BUDGET_LIMITS
    : previewExecutionRuntimeBudgetLimits;
  const traversalFrames = continuationState === null
    ? createInitialFindPathsByNameTraversalFrames()
    : cloneFindPathsByNameTraversalFrames(continuationState.traversalFrames);

  while (traversalFrames.length > 0 && !truncated) {
    const currentTraversalFrame = traversalFrames[traversalFrames.length - 1];

    if (currentTraversalFrame === undefined) {
      break;
    }

    const currentPath = currentTraversalFrame.directoryRelativePath === ""
      ? validatedRootPath
      : path.join(validatedRootPath, currentTraversalFrame.directoryRelativePath);

    if (currentTraversalFrame.nextEntryIndex === 0) {
      try {
        recordTraversalDirectoryVisit(traversalRuntimeBudgetState);
        assertTraversalRuntimeBudget(
          FIND_PATHS_BY_NAME_FAMILY_MEMBER,
          traversalRuntimeBudgetState,
          Date.now(),
          traversalNarrowingGuidance,
          effectiveTraversalRuntimeBudgetLimits,
        );
      } catch (error) {
        if (isTraversalRuntimeBudgetExceededError(error)) {
          if (results.length === 0) {
            throw error;
          }

          truncated = true;
          break;
        }

        throw error;
      }
    }

    const entries = await readSortedDirectoryEntries(currentPath);
    let descendedIntoChildDirectory = false;

    while (currentTraversalFrame.nextEntryIndex < entries.length && !truncated) {
      try {
        recordTraversalEntryVisit(traversalRuntimeBudgetState);
        assertTraversalRuntimeBudget(
          FIND_PATHS_BY_NAME_FAMILY_MEMBER,
          traversalRuntimeBudgetState,
          Date.now(),
          traversalNarrowingGuidance,
          effectiveTraversalRuntimeBudgetLimits,
        );
      } catch (error) {
        if (isTraversalRuntimeBudgetExceededError(error)) {
          if (results.length === 0) {
            throw error;
          }

          truncated = true;
          break;
        }

        throw error;
      }

      const entry = entries[currentTraversalFrame.nextEntryIndex];

      if (entry === undefined) {
        break;
      }

      const fullPath = path.join(currentPath, entry.name);
      const rawRelativePath = currentTraversalFrame.directoryRelativePath === ""
        ? entry.name
        : path.join(currentTraversalFrame.directoryRelativePath, entry.name);
      const relativePath = normalizeRelativePath(rawRelativePath);
      const entryPolicy = await resolveTraversalScopeEntryPolicy(
        relativePath,
        entry.isDirectory(),
        traversalScopePolicyResolution,
      );

      if (entryPolicy.excluded) {
        commitInspectionResumeTraversalEntry(currentTraversalFrame);
        continue;
      }

      try {
        await validatePath(fullPath, allowedDirectories);
      } catch {
        commitInspectionResumeTraversalEntry(currentTraversalFrame);
        continue;
      }

      if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
        results.push(fullPath);

        if (entry.isSymbolicLink()) {
          try {
            symlinkMatches.push({
              path: fullPath,
              linkTarget: await resolveSymlinkTargetPath(fullPath),
            });
          } catch {
            // An alias that vanished mid-traversal is delivered without its marking.
          }
        }
      }

      commitInspectionResumeTraversalEntry(currentTraversalFrame);

      if (results.length >= maxResults) {
        truncated = true;
        break;
      }

      if (entry.isDirectory() && entryPolicy.shouldTraverse) {
        traversalFrames.push({
          directoryRelativePath: rawRelativePath,
          nextEntryIndex: 0,
        });
        descendedIntoChildDirectory = true;
        break;
      }
    }

    if (!descendedIntoChildDirectory && currentTraversalFrame.nextEntryIndex >= entries.length) {
      traversalFrames.pop();
    }
  }

  const nextContinuationState =
    traversalAdmissionDecision.outcome === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST
    && traversalFrames.length > 0
      ? {
          traversalFrames: cloneFindPathsByNameTraversalFrames(traversalFrames),
        }
      : null;

  return {
    matches: results,
    truncated,
    ...(symlinkMatches.length > 0 ? { symlinkMatches } : {}),
    admissionOutcome: traversalAdmissionDecision.outcome,
    nextContinuationState,
  };
}
