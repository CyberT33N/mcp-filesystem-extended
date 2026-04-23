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
  createTraversalRuntimeBudgetState,
  isTraversalRuntimeBudgetExceededError,
  recordTraversalDirectoryVisit,
  recordTraversalEntryVisit,
} from "@domain/shared/guardrails/traversal-runtime-budget";
import {
  shouldExcludeTraversalScopePath,
  shouldTraverseTraversalScopeDirectoryPath,
} from "@domain/shared/guardrails/traversal-scope-policy";
import {
  createInlineResumeEnvelope,
  createPersistedResumeEnvelope,
  createResumeEnvelope,
  getResumeSessionNotFoundMessage,
  INSPECTION_PREVIEW_SUPPORTED_RESUME_MODES,
  INSPECTION_RESUME_ADMISSION_OUTCOMES,
  INSPECTION_RESUME_MODES,
  INSPECTION_RESUME_STATUSES,
  type InspectionResumeMode,
} from "@domain/shared/resume/inspection-resume-contract";
import {
  cloneInspectionResumeTraversalFrames,
  commitInspectionResumeTraversalEntry,
} from "@domain/shared/resume/inspection-resume-frontier";
import { DISCOVERY_RESPONSE_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import { validatePath } from "@infrastructure/filesystem/path-guard";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";
import type { InspectionResumeSessionSqliteStore } from "@infrastructure/persistence/inspection-resume-session-sqlite-store";

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

interface FindPathsByNameRequestPayload {
  rootPath: string;
  pattern: string;
  excludePatterns: string[];
  includeExcludedGlobs: string[];
  respectGitIgnore: boolean;
  maxResults: number;
}

interface FindPathsByNameExecutionContext {
  requestPayload: FindPathsByNameRequestPayload;
  continuationState: FindPathsByNameContinuationState | null;
  activeResumeToken: string | null;
  activeResumeExpiresAt: string | null;
  requestedResumeMode: InspectionResumeMode | null;
}

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

function resolveFindPathsByNameExecutionContext(
  resumeToken: string | undefined,
  resumeMode: InspectionResumeMode | undefined,
  rootPath: string,
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  inspectionResumeSessionStore: InspectionResumeSessionSqliteStore | undefined,
  now: Date,
): FindPathsByNameExecutionContext {
  if (resumeToken === undefined) {
    return {
      requestPayload: {
        rootPath,
        pattern,
        excludePatterns,
        includeExcludedGlobs,
        respectGitIgnore,
        maxResults,
      },
      continuationState: null,
      activeResumeToken: null,
      activeResumeExpiresAt: null,
      requestedResumeMode: null,
    };
  }

  if (inspectionResumeSessionStore === undefined) {
    throw new Error("Resume-session storage is unavailable for find_paths_by_name resume requests.");
  }

  const continuationSession = inspectionResumeSessionStore.loadActiveSession<
    FindPathsByNameRequestPayload,
    FindPathsByNameContinuationState
  >(
    resumeToken,
    "find_paths_by_name",
    "find_paths_by_name",
    now,
  );

  if (continuationSession === null) {
    throw new Error(getResumeSessionNotFoundMessage("find_paths_by_name"));
  }

  return {
    requestPayload: continuationSession.requestPayload,
    continuationState: continuationSession.resumeState,
    activeResumeToken: continuationSession.resumeToken,
    activeResumeExpiresAt: continuationSession.expiresAt,
    requestedResumeMode: resumeMode ?? INSPECTION_RESUME_MODES.NEXT_CHUNK,
  };
}

function buildFindPathsByNameResumeEnvelope(
  resumeToken: string | null,
  resumeExpiresAt: string | null,
  resumeMode: InspectionResumeMode | null,
  nextContinuationState: FindPathsByNameContinuationState | null,
  inspectionResumeSessionStore: InspectionResumeSessionSqliteStore | undefined,
  requestPayload: FindPathsByNameRequestPayload,
  previewFirstActive: boolean,
  now: Date,
): Pick<SearchFilesResult, never> & {
  admission: ReturnType<typeof createInlineResumeEnvelope>["admission"];
  resume: ReturnType<typeof createInlineResumeEnvelope>["resume"];
} {
  if (!previewFirstActive) {
    return createInlineResumeEnvelope();
  }

  const effectiveResumeMode = resumeMode ?? INSPECTION_RESUME_MODES.NEXT_CHUNK;
  const scopeReductionGuidanceText = buildTraversalNarrowingGuidance(requestPayload.rootPath);
  const guidanceText = effectiveResumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT
    ? "Resume the same name-discovery request by sending only resumeToken with resumeMode='complete-result' to let the server continue the session toward a complete result without bypassing caps."
    : "Resume the same name-discovery request by sending only resumeToken with resumeMode='next-chunk' to the same endpoint to receive the next bounded chunk of matches.";
  const admissionOutcome = effectiveResumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT
    ? INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED
    : INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST;

  if (nextContinuationState === null) {
    if (resumeToken !== null && inspectionResumeSessionStore !== undefined) {
      inspectionResumeSessionStore.markSessionCompleted(resumeToken, now);
    }

    return createResumeEnvelope(
      admissionOutcome,
      null,
      scopeReductionGuidanceText,
      null,
    );
  }

  if (inspectionResumeSessionStore === undefined) {
    throw new Error("Resume-session storage is unavailable for preview-first name discovery.");
  }

  if (resumeToken === null) {
    const continuationSession = inspectionResumeSessionStore.createSession(
      {
        endpointName: "find_paths_by_name",
        familyMember: "find_paths_by_name",
        requestPayload,
        resumeState: nextContinuationState,
        admissionOutcome,
        lastRequestedResumeMode: resumeMode,
      },
      now,
    );

    return createPersistedResumeEnvelope(
      continuationSession.resumeToken,
      continuationSession.status,
      continuationSession.expiresAt,
      INSPECTION_PREVIEW_SUPPORTED_RESUME_MODES,
      effectiveResumeMode,
      guidanceText,
      scopeReductionGuidanceText,
      admissionOutcome,
    );
  }

  if (resumeExpiresAt === null) {
    throw new Error("Active name-discovery resume session is missing an expiration timestamp.");
  }

  inspectionResumeSessionStore.updateResumeState(
    resumeToken,
    nextContinuationState,
    now,
    effectiveResumeMode,
  );

  return createPersistedResumeEnvelope(
    resumeToken,
    INSPECTION_RESUME_STATUSES.ACTIVE,
    resumeExpiresAt,
    INSPECTION_PREVIEW_SUPPORTED_RESUME_MODES,
    effectiveResumeMode,
    guidanceText,
    scopeReductionGuidanceText,
    admissionOutcome,
  );
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
 * @param respectGitIgnore - Indicates whether optional root-local `.gitignore` enrichment should participate in traversal.
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
          previewExecutionRuntimeBudgetLimits,
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
          previewExecutionRuntimeBudgetLimits,
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
      const shouldTraverseExcludedDirectory =
        entry.isDirectory() &&
        shouldTraverseTraversalScopeDirectoryPath(
          relativePath,
          traversalScopePolicyResolution,
        );

      if (
        shouldExcludeTraversalScopePath(relativePath, traversalScopePolicyResolution)
        && !shouldTraverseExcludedDirectory
      ) {
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
      }

      commitInspectionResumeTraversalEntry(currentTraversalFrame);

      if (results.length >= maxResults) {
        truncated = true;
        break;
      }

      if (entry.isDirectory()) {
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
    && !completeResultRequested
    && traversalFrames.length > 0
      ? {
          traversalFrames: cloneFindPathsByNameTraversalFrames(traversalFrames),
        }
      : null;

  return {
    matches: results,
    truncated,
    admissionOutcome: traversalAdmissionDecision.outcome,
    nextContinuationState,
  };
}
