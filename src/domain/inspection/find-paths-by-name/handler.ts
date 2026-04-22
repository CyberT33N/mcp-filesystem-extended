import {
  DISCOVERY_MAX_RESULTS_HARD_CAP,
  DISCOVERY_RESPONSE_CAP_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import { buildTraversalNarrowingGuidance } from "@domain/shared/guardrails/filesystem-preflight";
import type { TraversalWorkloadAdmissionOutcome } from "@domain/shared/guardrails/traversal-workload-admission";
import {
  createContinuationEnvelope,
  createInlineContinuationEnvelope,
  createPersistedContinuationEnvelope,
  getContinuationNotFoundMessage,
  INSPECTION_CONTINUATION_ADMISSION_OUTCOMES,
  INSPECTION_CONTINUATION_STATUSES,
} from "@domain/shared/continuation/inspection-continuation-contract";
import type {
  InspectionContinuationAdmission,
  InspectionContinuationMetadata,
} from "@domain/shared/continuation/inspection-continuation-contract";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter";
import type { InspectionContinuationSqliteStore } from "@infrastructure/persistence/inspection-continuation-sqlite-store";

import {
  FIND_PATHS_BY_NAME_FAMILY_MEMBER,
  type FindPathsByNameContinuationState,
  searchFiles,
} from "./helpers";

/**
 * Describes the structured name-search result for one requested root.
 *
 * @remarks
 * This contract preserves root-local matches and truncation state so callers
 * can distinguish complete traversal from a family-budget cutoff.
 */
export interface FindPathsByNameRootResult {
  root: string;
  matches: string[];
  truncated: boolean;
}

/**
 * Describes the structured name-search result across the full request batch.
 *
 * @remarks
 * The batch result aggregates per-root discovery output while keeping one
 * shared truncation signal for callers that need machine-readable breadth data.
 */
export interface FindPathsByNameResult {
  roots: FindPathsByNameRootResult[];
  totalMatches: number;
  truncated: boolean;
  admission: InspectionContinuationAdmission;
  continuation: InspectionContinuationMetadata;
}

interface FindPathsByNameRequestPayload {
  directoryPaths: string[];
  pattern: string;
  excludePatterns: string[];
  includeExcludedGlobs: string[];
  respectGitIgnore: boolean;
  maxResults: number;
}

interface FindPathsByNameBatchContinuationState {
  rootTraversalStates: Record<string, FindPathsByNameContinuationState>;
}

interface FindPathsByNameExecutionContext {
  requestPayload: FindPathsByNameRequestPayload;
  continuationState: FindPathsByNameBatchContinuationState | null;
  activeContinuationToken: string | null;
  activeContinuationExpiresAt: string | null;
}

interface FindPathsByNameRootExecutionResult extends FindPathsByNameRootResult {
  admissionOutcome: TraversalWorkloadAdmissionOutcome;
  nextContinuationState: FindPathsByNameContinuationState | null;
}

const FIND_PATHS_BY_NAME_CONTINUATION_GUIDANCE =
  "Resume the same name-discovery request by sending only continuationToken to the same endpoint to receive the next bounded chunk of matches.";

function formatFindPathsByNameTextOutput(
  result: FindPathsByNameResult,
  maxResults: number,
): string {
  if (!result.continuation.resumable) {
    if (result.roots.length === 1) {
      const firstRootResult = result.roots[0];

      if (firstRootResult === undefined) {
        throw new Error("Expected one root result for name-based search.");
      }

      return formatFindPathsByNameRootOutput(firstRootResult, maxResults);
    }

    return formatBatchTextOperationResults(
      "search files",
      result.roots.map((rootResult) => ({
        label: rootResult.root,
        output: formatFindPathsByNameRootOutput(rootResult, maxResults),
      })),
    );
  }

  const totalMatches = result.totalMatches;
  const rootLabel = result.roots.length === 1 ? "root" : "roots";

  return [
    `Name-discovery preview is available for ${result.roots.length} ${rootLabel} with ${totalMatches} matches in this bounded chunk.`,
    result.admission.guidanceText ?? FIND_PATHS_BY_NAME_CONTINUATION_GUIDANCE,
    "The authoritative match payload remains in structuredContent.",
    "Resume the same request by sending only continuationToken on this endpoint.",
  ].join("\n");
}

function resolveFindPathsByNameExecutionContext(
  continuationToken: string | undefined,
  directoryPaths: string[],
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
        directoryPaths,
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
    FindPathsByNameBatchContinuationState
  >(
    continuationToken,
    FIND_PATHS_BY_NAME_FAMILY_MEMBER,
    FIND_PATHS_BY_NAME_FAMILY_MEMBER,
    now,
  );

  if (continuationSession === null) {
    throw new Error(getContinuationNotFoundMessage(FIND_PATHS_BY_NAME_FAMILY_MEMBER));
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
  nextContinuationState: FindPathsByNameBatchContinuationState | null,
  inspectionContinuationStore: InspectionContinuationSqliteStore | undefined,
  requestPayload: FindPathsByNameRequestPayload,
  rootResults: FindPathsByNameRootExecutionResult[],
  now: Date,
): Pick<FindPathsByNameResult, "admission" | "continuation"> {
  const previewFirstActive = rootResults.some(
    (rootResult) =>
      rootResult.admissionOutcome === INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
  );

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
        endpointName: FIND_PATHS_BY_NAME_FAMILY_MEMBER,
        familyMember: FIND_PATHS_BY_NAME_FAMILY_MEMBER,
        requestPayload,
        continuationState: nextContinuationState,
        admissionOutcome: INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      },
      now,
    );

    return createPersistedContinuationEnvelope(
      FIND_PATHS_BY_NAME_FAMILY_MEMBER,
      continuationSession.continuationToken,
      continuationSession.status,
      continuationSession.expiresAt,
      FIND_PATHS_BY_NAME_CONTINUATION_GUIDANCE,
      INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
    );
  }

  if (continuationExpiresAt === null) {
    throw new Error("Active name-discovery continuation session is missing an expiration timestamp.");
  }

  inspectionContinuationStore.updateContinuationState(continuationToken, nextContinuationState, now);

  return createPersistedContinuationEnvelope(
    FIND_PATHS_BY_NAME_FAMILY_MEMBER,
    continuationToken,
    INSPECTION_CONTINUATION_STATUSES.ACTIVE,
    continuationExpiresAt,
    FIND_PATHS_BY_NAME_CONTINUATION_GUIDANCE,
    INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
  );
}

async function getFindPathsByNameRootResult(
  directoryPath: string,
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  allowedDirectories: string[],
  maxResults: number,
  continuationState: FindPathsByNameContinuationState | null = null,
): Promise<FindPathsByNameRootExecutionResult> {
  const result = await searchFiles(
    directoryPath,
    pattern,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    allowedDirectories,
    maxResults,
    continuationState,
  );

  return {
    root: directoryPath,
    matches: result.matches,
    truncated: result.truncated,
    admissionOutcome: result.admissionOutcome ?? INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.INLINE,
    nextContinuationState: result.nextContinuationState ?? null,
  };
}

function formatFindPathsByNameRootOutput(
  result: FindPathsByNameRootResult,
  maxResults: number,
): string {
  if (result.matches.length === 0) {
    if (result.truncated) {
      return `Traversal scope exceeded the bounded preview-first lane before matching paths could be collected. ${buildTraversalNarrowingGuidance(result.root)}`;
    }

    return "No matches found";
  }

  let output = result.matches.join("\n");

  if (result.truncated) {
    output += `\n(limited to ${maxResults} results)`;
  }

  assertActualTextBudget(
    "find_paths_by_name",
    output.length,
    DISCOVERY_RESPONSE_CAP_CHARS,
    "formatted name-based search results",
  );

  return output;
}

/**
 * Returns the structured name-search result for one or more requested roots.
 *
 * @remarks
 * Use this surface when callers need machine-readable discovery output while
 * still inheriting path validation, helper-driven traversal, and family-level
 * response-budget protection in downstream formatting layers.
 *
 * @param directoryPaths - Requested root directories in caller-supplied order.
 * @param pattern - Case-insensitive name substring applied to files and directories.
 * @param excludePatterns - Glob patterns removed from traversal before result collection.
 * @param includeExcludedGlobs - Explicit descendant re-include globs that may reopen excluded subtrees.
 * @param respectGitIgnore - Indicates whether optional root-local `.gitignore` enrichment should participate in traversal.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @param maxResults - Maximum number of matches retained per root before truncation.
 * @returns Structured per-root name-search results and aggregate totals.
 */
export async function getFindPathsByNameResult(
  continuationToken: string | undefined,
  directoryPaths: string[],
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[] = [],
  respectGitIgnore = false,
  inspectionContinuationStore: InspectionContinuationSqliteStore | undefined,
  allowedDirectories: string[],
  maxResults = DISCOVERY_MAX_RESULTS_HARD_CAP,
): Promise<FindPathsByNameResult> {
  const now = new Date();
  const executionContext = resolveFindPathsByNameExecutionContext(
    continuationToken,
    directoryPaths,
    pattern,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    maxResults,
    inspectionContinuationStore,
    now,
  );
  const activeDirectoryPaths = executionContext.continuationState === null
    ? executionContext.requestPayload.directoryPaths
    : executionContext.requestPayload.directoryPaths.filter(
        (requestedDirectoryPath) =>
          executionContext.continuationState?.rootTraversalStates[requestedDirectoryPath] !== undefined,
      );

  if (activeDirectoryPaths.length === 0) {
    if (executionContext.activeContinuationToken !== null && inspectionContinuationStore !== undefined) {
      inspectionContinuationStore.markSessionCompleted(executionContext.activeContinuationToken, now);
    }

    return {
      roots: [],
      totalMatches: 0,
      truncated: false,
      ...createInlineContinuationEnvelope(),
    };
  }

  const roots = await Promise.all(
    activeDirectoryPaths.map((directoryPath) =>
      getFindPathsByNameRootResult(
        directoryPath,
        executionContext.requestPayload.pattern,
        executionContext.requestPayload.excludePatterns,
        executionContext.requestPayload.includeExcludedGlobs,
        executionContext.requestPayload.respectGitIgnore,
        allowedDirectories,
        executionContext.requestPayload.maxResults,
        executionContext.continuationState?.rootTraversalStates[directoryPath] ?? null,
      )
    )
  );

  const nextContinuationState = roots.reduce<FindPathsByNameBatchContinuationState | null>(
    (accumulatedState, rootResult) => {
      if (rootResult.nextContinuationState === null) {
        return accumulatedState;
      }

      return {
        rootTraversalStates: {
          ...(accumulatedState?.rootTraversalStates ?? {}),
          [rootResult.root]: rootResult.nextContinuationState,
        },
      };
    },
    null,
  );
  const continuationEnvelope = buildFindPathsByNameContinuationEnvelope(
    executionContext.activeContinuationToken,
    executionContext.activeContinuationExpiresAt,
    nextContinuationState,
    inspectionContinuationStore,
    executionContext.requestPayload,
    roots,
    now,
  );

  return {
    roots: roots.map(({ root, matches, truncated }) => ({
      root,
      matches,
      truncated,
    })),
    totalMatches: roots.reduce((total, root) => total + root.matches.length, 0),
    truncated: roots.some((root) => root.truncated),
    ...continuationEnvelope,
  };
}

/**
 * Formats name-search results for the caller-visible text response surface.
 *
 * @remarks
 * This discovery entrypoint keeps name-based search broad enough for caller use
 * but still rejects oversized formatted output through the shared discovery
 * response budget instead of returning unbounded path lists.
 *
 * @param directoryPaths - Requested root directories in caller-supplied order.
 * @param pattern - Case-insensitive name substring applied to files and directories.
 * @param excludePatterns - Glob patterns removed from traversal before result collection.
 * @param includeExcludedGlobs - Explicit descendant re-include globs that may reopen excluded subtrees.
 * @param respectGitIgnore - Indicates whether optional root-local `.gitignore` enrichment should participate in traversal.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @param maxResults - Maximum number of matches retained per root before truncation.
 * @returns Human-readable name-search output bounded by the discovery-family text budget.
 */
export async function handleSearchFiles(
  continuationToken: string | undefined,
  directoryPaths: string[],
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[] = [],
  respectGitIgnore = false,
  inspectionContinuationStore: InspectionContinuationSqliteStore | undefined,
  allowedDirectories: string[],
  maxResults = DISCOVERY_MAX_RESULTS_HARD_CAP,
): Promise<string> {
  const result = await getFindPathsByNameResult(
    continuationToken,
    directoryPaths,
    pattern,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    inspectionContinuationStore,
    allowedDirectories,
    maxResults,
  );

  const output = formatFindPathsByNameTextOutput(result, maxResults);

  assertActualTextBudget(
    FIND_PATHS_BY_NAME_FAMILY_MEMBER,
    output.length,
    DISCOVERY_RESPONSE_CAP_CHARS,
    "formatted batched name-based search results",
  );

  return output;
}
