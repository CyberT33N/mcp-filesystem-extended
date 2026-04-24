import {
  DISCOVERY_MAX_RESULTS_HARD_CAP,
  DISCOVERY_RESPONSE_CAP_CHARS,
  GLOBAL_RESPONSE_HARD_CAP_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import { buildTraversalNarrowingGuidance } from "@domain/shared/guardrails/filesystem-preflight";
import type { TraversalWorkloadAdmissionOutcome } from "@domain/shared/guardrails/traversal-workload-admission";
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
import type {
  InspectionResumeAdmission,
  InspectionResumeMetadata,
} from "@domain/shared/resume/inspection-resume-contract";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter";
import type { InspectionResumeSessionSqliteStore } from "@infrastructure/persistence/inspection-resume-session-sqlite-store";

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
  admission: InspectionResumeAdmission;
  resume: InspectionResumeMetadata;
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
  activeResumeToken: string | null;
  activeResumeExpiresAt: string | null;
  requestedResumeMode: InspectionResumeMode | null;
}

interface FindPathsByNameRootExecutionResult extends FindPathsByNameRootResult {
  admissionOutcome: TraversalWorkloadAdmissionOutcome;
  nextContinuationState: FindPathsByNameContinuationState | null;
}

const FIND_PATHS_BY_NAME_CONTINUATION_GUIDANCE =
  "Resume the same name-discovery request by sending only resumeToken with resumeMode='next-chunk' to the same endpoint to receive the next bounded chunk of matches.";
const FIND_PATHS_BY_NAME_COMPLETE_RESULT_GUIDANCE =
  "Resume the same name-discovery request by sending only resumeToken with resumeMode='complete-result' to let the server continue the session toward a complete result without bypassing caps.";

function buildFindPathsByNameScopeReductionGuidance(directoryPaths: string[]): string | null {
  if (directoryPaths.length === 1) {
    const directoryPath = directoryPaths[0];

    return directoryPath === undefined ? null : buildTraversalNarrowingGuidance(directoryPath);
  }

  return "Reduce the discovery scope by narrowing roots or making nameContains more specific.";
}

function formatFindPathsByNameTextOutput(
  result: FindPathsByNameResult,
  maxResults: number,
): string {
  const hasResumableResume =
    result.resume.resumable
    && result.resume.resumeToken !== null;

  if (result.admission.outcome === INSPECTION_RESUME_ADMISSION_OUTCOMES.INLINE) {
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
  const previewSummary =
    result.admission.outcome === INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED
      ? `Name-discovery completion progress is available for ${result.roots.length} ${rootLabel} with ${totalMatches} matches in this bounded chunk.`
      : `Name-discovery preview is available for ${result.roots.length} ${rootLabel} with ${totalMatches} matches in this bounded chunk.`;
  const structuredPayloadGuidance = "The authoritative match payload remains in structuredContent.";

  if (!hasResumableResume) {
    return [
      previewSummary,
      structuredPayloadGuidance,
      "This response is finalized and exposes no active resume token.",
    ].join("\n");
  }

  return [
    previewSummary,
    `Active resumeToken: ${result.resume.resumeToken}`,
    `Supported resume modes: ${result.resume.supportedResumeModes.join(", ")}`,
    result.admission.guidanceText ?? FIND_PATHS_BY_NAME_CONTINUATION_GUIDANCE,
    structuredPayloadGuidance,
    result.admission.scopeReductionGuidanceText ?? "",
  ].join("\n");
}

function resolveFindPathsByNameExecutionContext(
  resumeToken: string | undefined,
  resumeMode: InspectionResumeMode | undefined,
  directoryPaths: string[],
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
        directoryPaths,
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
    FindPathsByNameBatchContinuationState
  >(
    resumeToken,
    FIND_PATHS_BY_NAME_FAMILY_MEMBER,
    FIND_PATHS_BY_NAME_FAMILY_MEMBER,
    now,
  );

  if (continuationSession === null) {
    throw new Error(getResumeSessionNotFoundMessage(FIND_PATHS_BY_NAME_FAMILY_MEMBER));
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
  nextContinuationState: FindPathsByNameBatchContinuationState | null,
  inspectionResumeSessionStore: InspectionResumeSessionSqliteStore | undefined,
  requestPayload: FindPathsByNameRequestPayload,
  rootResults: FindPathsByNameRootExecutionResult[],
  now: Date,
) : Pick<FindPathsByNameResult, "admission" | "resume"> {
  const previewFirstActive = rootResults.some(
    (rootResult) =>
      rootResult.admissionOutcome === INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
  );

  if (!previewFirstActive) {
    return createInlineResumeEnvelope();
  }

  const effectiveResumeMode = resumeMode ?? INSPECTION_RESUME_MODES.NEXT_CHUNK;
  const guidanceText = effectiveResumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT
    ? FIND_PATHS_BY_NAME_COMPLETE_RESULT_GUIDANCE
    : FIND_PATHS_BY_NAME_CONTINUATION_GUIDANCE;
  const scopeReductionGuidanceText = buildFindPathsByNameScopeReductionGuidance(
    requestPayload.directoryPaths,
  );
  const admissionOutcome = effectiveResumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT
    ? INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED
    : INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST;

  if (nextContinuationState === null) {
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
        endpointName: FIND_PATHS_BY_NAME_FAMILY_MEMBER,
        familyMember: FIND_PATHS_BY_NAME_FAMILY_MEMBER,
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

async function getFindPathsByNameRootResult(
  directoryPath: string,
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  allowedDirectories: string[],
  maxResults: number,
  batchRootCount: number,
  continuationState: FindPathsByNameContinuationState | null = null,
  requestedResumeMode: InspectionResumeMode | null = null,
): Promise<FindPathsByNameRootExecutionResult> {
  const result = await searchFiles(
    directoryPath,
    pattern,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    allowedDirectories,
    maxResults,
    batchRootCount,
    continuationState,
    requestedResumeMode,
  );

  return {
    root: directoryPath,
    matches: result.matches,
    truncated: result.truncated,
    admissionOutcome: result.admissionOutcome ?? INSPECTION_RESUME_ADMISSION_OUTCOMES.INLINE,
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
  resumeToken: string | undefined,
  resumeMode: InspectionResumeMode | undefined,
  directoryPaths: string[],
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[] = [],
  respectGitIgnore = false,
  inspectionResumeSessionStore: InspectionResumeSessionSqliteStore | undefined,
  allowedDirectories: string[],
  maxResults = DISCOVERY_MAX_RESULTS_HARD_CAP,
): Promise<FindPathsByNameResult> {
  const now = new Date();
  const executionContext = resolveFindPathsByNameExecutionContext(
    resumeToken,
    resumeMode,
    directoryPaths,
    pattern,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    maxResults,
    inspectionResumeSessionStore,
    now,
  );
  const activeDirectoryPaths = executionContext.continuationState === null
    ? executionContext.requestPayload.directoryPaths
    : executionContext.requestPayload.directoryPaths.filter(
        (requestedDirectoryPath) =>
          executionContext.continuationState?.rootTraversalStates[requestedDirectoryPath] !== undefined,
      );

  if (activeDirectoryPaths.length === 0) {
    if (executionContext.activeResumeToken !== null && inspectionResumeSessionStore !== undefined) {
      inspectionResumeSessionStore.markSessionCompleted(executionContext.activeResumeToken, now);
    }

    return {
      roots: [],
      totalMatches: 0,
      truncated: false,
      ...createInlineResumeEnvelope(),
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
        activeDirectoryPaths.length,
        executionContext.continuationState?.rootTraversalStates[directoryPath] ?? null,
        executionContext.requestedResumeMode,
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
  const continuationEnvelope = buildFindPathsByNameResumeEnvelope(
    executionContext.activeResumeToken,
    executionContext.activeResumeExpiresAt,
    executionContext.requestedResumeMode,
    nextContinuationState,
    inspectionResumeSessionStore,
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
 * while applying a mode-aware response cap instead of returning unbounded path lists:
 *
 * - In `inline` and `next-chunk` modes the family-specific `DISCOVERY_RESPONSE_CAP_CHARS`
 *   (150,000 chars) limits text output to protect the caller's context window.
 * - In `complete-result` mode only the global response fuse (`GLOBAL_RESPONSE_HARD_CAP_CHARS`,
 *   600,000 chars) applies, because the caller has explicitly contracted for a complete result.
 *
 * @see {@link conventions/resume-architecture/guardrail-interaction.md} for the mode-aware cap rule.
 *
 * @param resumeToken - Opaque server-owned session handle from a prior preview-first response. Absent on base requests.
 * @param resumeMode - Delivery intent for resume requests. `'next-chunk'` or `'complete-result'`.
 * @param directoryPaths - Requested root directories in caller-supplied order.
 * @param pattern - Case-insensitive name substring applied to files and directories.
 * @param excludePatterns - Glob patterns removed from traversal before result collection.
 * @param includeExcludedGlobs - Explicit descendant re-include globs that may reopen excluded subtrees.
 * @param respectGitIgnore - Indicates whether optional root-local `.gitignore` enrichment should participate in traversal.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @param maxResults - Maximum number of matches retained per root before truncation.
 * @returns Human-readable name-search output respecting the mode-appropriate response ceiling.
 */
export async function handleSearchFiles(
  resumeToken: string | undefined,
  resumeMode: InspectionResumeMode | undefined,
  directoryPaths: string[],
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[] = [],
  respectGitIgnore = false,
  inspectionResumeSessionStore: InspectionResumeSessionSqliteStore | undefined,
  allowedDirectories: string[],
  maxResults = DISCOVERY_MAX_RESULTS_HARD_CAP,
): Promise<string> {
  const result = await getFindPathsByNameResult(
    resumeToken,
    resumeMode,
    directoryPaths,
    pattern,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    inspectionResumeSessionStore,
    allowedDirectories,
    maxResults,
  );

  const output = formatFindPathsByNameTextOutput(result, maxResults);

  const isCompleteResultMode = resumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT;
  const effectiveResponseCap = isCompleteResultMode
    ? GLOBAL_RESPONSE_HARD_CAP_CHARS
    : DISCOVERY_RESPONSE_CAP_CHARS;

  assertActualTextBudget(
    FIND_PATHS_BY_NAME_FAMILY_MEMBER,
    output.length,
    effectiveResponseCap,
    "name-discovery text output",
  );

  if (resumeToken !== undefined && !result.resume.resumable && result.resume.resumeToken === null) {
    inspectionResumeSessionStore?.markSessionCompleted(resumeToken, new Date());
  }

  return output;
}
