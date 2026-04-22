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
  createContinuationEnvelope,
  createInlineContinuationEnvelope,
  createPersistedContinuationEnvelope,
  getContinuationNotFoundMessage,
  INSPECTION_CONTINUATION_ADMISSION_OUTCOMES,
  INSPECTION_CONTINUATION_STATUSES,
} from "@domain/shared/continuation/inspection-continuation-contract";
import { DISCOVERY_RESPONSE_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import { validatePath } from "@infrastructure/filesystem/path-guard";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";
import type { InspectionContinuationSqliteStore } from "@infrastructure/persistence/inspection-continuation-sqlite-store";

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
  activeContinuationToken: string | null;
  activeContinuationExpiresAt: string | null;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function cloneFindPathsByNameTraversalFrames(
  traversalFrames: FindPathsByNameTraversalFrame[],
): FindPathsByNameTraversalFrame[] {
  return traversalFrames.map((traversalFrame) => ({ ...traversalFrame }));
}

function createInitialFindPathsByNameTraversalFrames(): FindPathsByNameTraversalFrame[] {
  return [{ directoryRelativePath: "", nextEntryIndex: 0 }];
}

async function readSortedDirectoryEntries(currentPath: string): Promise<import("fs").Dirent<string>[]> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  return entries.sort((leftEntry, rightEntry) => leftEntry.name.localeCompare(rightEntry.name));
}

function resolveFindPathsByNameExecutionContext(
  continuationToken: string | undefined,
  rootPath: string,
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  inspectionContinuationStore: InspectionContinuationSqliteStore | undefined,
  now: Date,
): FindPathsByNameExecutionContext {
  if (continuationToken === undefined) {
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
      activeContinuationToken: null,
      activeContinuationExpiresAt: null,
    };
  }

  if (inspectionContinuationStore === undefined) {
    throw new Error("Continuation storage is unavailable for find_paths_by_name resume requests.");
  }

  const continuationSession = inspectionContinuationStore.loadActiveSession<
    FindPathsByNameRequestPayload,
    FindPathsByNameContinuationState
  >(
    continuationToken,
    "find_paths_by_name",
    "find_paths_by_name",
    now,
  );

  if (continuationSession === null) {
    throw new Error(getContinuationNotFoundMessage("find_paths_by_name"));
  }

  return {
    requestPayload: continuationSession.requestPayload,
    continuationState: continuationSession.continuationState,
    activeContinuationToken: continuationSession.continuationToken,
    activeContinuationExpiresAt: continuationSession.expiresAt,
  };
}

function buildFindPathsByNameContinuationEnvelope(
  continuationToken: string | null,
  continuationExpiresAt: string | null,
  nextContinuationState: FindPathsByNameContinuationState | null,
  inspectionContinuationStore: InspectionContinuationSqliteStore | undefined,
  requestPayload: FindPathsByNameRequestPayload,
  previewFirstActive: boolean,
  now: Date,
): Pick<SearchFilesResult, never> & {
  admission: ReturnType<typeof createInlineContinuationEnvelope>["admission"];
  continuation: ReturnType<typeof createInlineContinuationEnvelope>["continuation"];
} {
  if (!previewFirstActive) {
    return createInlineContinuationEnvelope();
  }

  if (nextContinuationState === null) {
    if (continuationToken !== null && inspectionContinuationStore !== undefined) {
      inspectionContinuationStore.markSessionCompleted(continuationToken, now);
    }

    return createContinuationEnvelope(
      INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      null,
      null,
    );
  }

  if (inspectionContinuationStore === undefined) {
    throw new Error("Continuation storage is unavailable for preview-first name discovery.");
  }

  if (continuationToken === null) {
    const continuationSession = inspectionContinuationStore.createSession(
      {
        endpointName: "find_paths_by_name",
        familyMember: "find_paths_by_name",
        requestPayload,
        continuationState: nextContinuationState,
        admissionOutcome: INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      },
      now,
    );

    return createPersistedContinuationEnvelope(
      "find_paths_by_name",
      continuationSession.continuationToken,
      continuationSession.status,
      continuationSession.expiresAt,
      "Resume the same name-discovery request by sending only continuationToken to the same endpoint to receive the next bounded chunk of matches.",
      INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
    );
  }

  if (continuationExpiresAt === null) {
    throw new Error("Active name-discovery continuation session is missing an expiration timestamp.");
  }

  inspectionContinuationStore.updateContinuationState(continuationToken, nextContinuationState, now);

  return createPersistedContinuationEnvelope(
    "find_paths_by_name",
    continuationToken,
    INSPECTION_CONTINUATION_STATUSES.ACTIVE,
    continuationExpiresAt,
    "Resume the same name-discovery request by sending only continuationToken to the same endpoint to receive the next bounded chunk of matches.",
    INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
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
    === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.TASK_BACKED_REQUIRED
  ) {
    throw new Error(
      traversalAdmissionDecision.guidanceText ?? buildTraversalNarrowingGuidance(rootPath),
    );
  }
  const validatedRootPath = traversalPreflightContext.rootEntry.validPath;
  const traversalScopePolicyResolution = traversalPreflightContext.traversalScopePolicyResolution;
  const traversalRuntimeBudgetState = createTraversalRuntimeBudgetState();
  const traversalNarrowingGuidance = buildTraversalNarrowingGuidance(rootPath);
  const previewExecutionRuntimeBudgetLimits =
    traversalAdmissionDecision.outcome === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST
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

      currentTraversalFrame.nextEntryIndex += 1;

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
        continue;
      }

      try {
        await validatePath(fullPath, allowedDirectories);
      } catch {
        continue;
      }

      if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
        results.push(fullPath);

        if (results.length >= maxResults) {
          truncated = true;
          break;
        }
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
