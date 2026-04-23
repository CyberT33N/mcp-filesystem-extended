import { REGEX_SEARCH_MAX_RESULTS_HARD_CAP } from "@domain/shared/guardrails/tool-guardrail-limits";
import type { TraversalWorkloadAdmissionOutcome } from "@domain/shared/guardrails/traversal-workload-admission";
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
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
import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";
import type { InspectionResumeSessionSqliteStore } from "@infrastructure/persistence/inspection-resume-session-sqlite-store";
import {
  assertFormattedFixedStringResponseBudget,
  formatSearchFixedStringContinuationAwareTextOutput,
  formatSearchFixedStringPathOutput,
  type SearchFixedStringPathResult,
  type SearchFixedStringResult,
} from "./search-fixed-string-result";
import { createFixedStringSearchAggregateBudgetState } from "./fixed-string-search-aggregate-budget-state";
import {
  getSearchFixedStringPathResult,
  type SearchFixedStringRootContinuationState,
} from "./search-fixed-string-path-result";
import { createFixedStringRootErrorResult } from "./fixed-string-search-support";

const SEARCH_FIXED_STRING_TOOL_NAME = "search_file_contents_by_fixed_string";
const SEARCH_FIXED_STRING_CONTINUATION_GUIDANCE =
  "Resume the same fixed-string-search request by sending only resumeToken with resumeMode='next-chunk' to the same endpoint to receive the next bounded chunk of matches.";

interface SearchFixedStringRequestPayload {
  searchPaths: string[];
  fixedString: string;
  filePatterns: string[];
  excludePatterns: string[];
  includeExcludedGlobs: string[];
  respectGitIgnore: boolean;
  maxResults: number;
  caseSensitive: boolean;
}

interface SearchFixedStringContinuationState {
  rootTraversalStates: Record<string, SearchFixedStringRootContinuationState>;
}

interface SearchFixedStringExecutionContext {
  requestPayload: SearchFixedStringRequestPayload;
  continuationState: SearchFixedStringContinuationState | null;
  activeResumeToken: string | null;
  activeResumeExpiresAt: string | null;
  requestedResumeMode: InspectionResumeMode | null;
}

type SearchFixedStringRootExecutionResult = SearchFixedStringPathResult & {
  admissionOutcome: TraversalWorkloadAdmissionOutcome;
  nextContinuationState: SearchFixedStringRootContinuationState | null;
};

function resolveSearchFixedStringExecutionContext(
  resumeToken: string | undefined,
  resumeMode: InspectionResumeMode | undefined,
  searchPaths: string[],
  fixedString: string,
  filePatterns: string[],
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  caseSensitive: boolean,
  inspectionResumeSessionStore: InspectionResumeSessionSqliteStore | undefined,
  now: Date,
): SearchFixedStringExecutionContext {
  if (resumeToken === undefined) {
    return {
      requestPayload: {
        searchPaths,
        fixedString,
        filePatterns,
        excludePatterns,
        includeExcludedGlobs,
        respectGitIgnore,
        maxResults,
        caseSensitive,
      },
      continuationState: null,
      activeResumeToken: null,
      activeResumeExpiresAt: null,
      requestedResumeMode: null,
    };
  }

  if (inspectionResumeSessionStore === undefined) {
    throw new Error("Resume-session storage is unavailable for fixed-string-search resume requests.");
  }

  const resumeSession = inspectionResumeSessionStore.loadActiveSession<
    SearchFixedStringRequestPayload,
    SearchFixedStringContinuationState
  >(
    resumeToken,
    SEARCH_FIXED_STRING_TOOL_NAME,
    SEARCH_FIXED_STRING_TOOL_NAME,
    now,
  );

  if (resumeSession === null) {
    throw new Error(getResumeSessionNotFoundMessage(SEARCH_FIXED_STRING_TOOL_NAME));
  }

  return {
    requestPayload: resumeSession.requestPayload,
    continuationState: resumeSession.resumeState,
    activeResumeToken: resumeSession.resumeToken,
    activeResumeExpiresAt: resumeSession.expiresAt,
    requestedResumeMode:
      resumeMode
      ?? resumeSession.lastRequestedResumeMode
      ?? INSPECTION_RESUME_MODES.NEXT_CHUNK,
  };
}

function buildSearchFixedStringContinuationEnvelope(
  resumeToken: string | null,
  resumeExpiresAt: string | null,
  nextContinuationState: SearchFixedStringContinuationState | null,
  inspectionResumeSessionStore: InspectionResumeSessionSqliteStore | undefined,
  requestPayload: SearchFixedStringRequestPayload,
  roots: SearchFixedStringRootExecutionResult[],
  requestedResumeMode: InspectionResumeMode | null,
  now: Date,
): Pick<SearchFixedStringResult, "admission" | "resume"> {
  const effectiveResumeMode = requestedResumeMode ?? INSPECTION_RESUME_MODES.NEXT_CHUNK;
  const admissionOutcome = effectiveResumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT
    ? INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED
    : INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST;
  const guidanceText = effectiveResumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT
    ? "Resume the same fixed-string-search request by sending only resumeToken with resumeMode='complete-result' to the same endpoint so the server can continue the persisted completion attempt toward a final complete result."
    : SEARCH_FIXED_STRING_CONTINUATION_GUIDANCE;
  const scopeReductionGuidanceText =
    "Scope reduction alternative: narrow roots, add includeGlobs, or reduce the search to the relevant subtree.";
  const previewFirstActive = roots.some(
    (rootResult) =>
      rootResult.admissionOutcome === INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
  );

  if (!previewFirstActive) {
    return createInlineResumeEnvelope();
  }

  if (nextContinuationState === null) {
    if (resumeToken !== null && inspectionResumeSessionStore !== undefined) {
      inspectionResumeSessionStore.markSessionCompleted(resumeToken, now);
    }

    return createResumeEnvelope(
      admissionOutcome,
      guidanceText,
      scopeReductionGuidanceText,
      null,
    );
  }

  if (inspectionResumeSessionStore === undefined) {
    throw new Error("Resume-session storage is unavailable for preview-first fixed-string search.");
  }

  if (resumeToken === null) {
    const resumeSession = inspectionResumeSessionStore.createSession(
      {
        endpointName: SEARCH_FIXED_STRING_TOOL_NAME,
        familyMember: SEARCH_FIXED_STRING_TOOL_NAME,
        requestPayload,
        resumeState: nextContinuationState,
        admissionOutcome,
        lastRequestedResumeMode: effectiveResumeMode,
      },
      now,
    );

    return createPersistedResumeEnvelope(
      resumeSession.resumeToken,
      resumeSession.status,
      resumeSession.expiresAt,
      INSPECTION_PREVIEW_SUPPORTED_RESUME_MODES,
      effectiveResumeMode,
      guidanceText,
      scopeReductionGuidanceText,
      admissionOutcome,
    );
  }

  if (resumeExpiresAt === null) {
    throw new Error("Active fixed-string-search resume session is missing an expiration timestamp.");
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
 * Executes fixed-string search across one or more roots and returns the formatted text response surface.
 *
 * @param searchPaths - File or directory search scopes in caller-supplied order.
 * @param fixedString - Exact literal string supplied by the caller.
 * @param filePatterns - Include globs that narrow candidate file names before content scanning.
 * @param excludePatterns - Exclude globs that remove candidate paths from traversal.
 * @param includeExcludedGlobs - Additive descendant re-include globs that reopen excluded subtrees.
 * @param respectGitIgnore - Whether optional root-local `.gitignore` enrichment participates in traversal.
 * @param maxResults - Caller-requested maximum number of returned locations per root.
 * @param caseSensitive - Whether literal matching should preserve case sensitivity.
 * @param allowedDirectories - Allowed directory roots enforced by the shared path guard.
 * @returns Formatted text output that respects the shared search-family response cap.
 */
export async function handleSearchFixedString(
  resumeToken: string | undefined,
  resumeMode: InspectionResumeMode | undefined,
  searchPaths: string[],
  fixedString: string,
  filePatterns: string[],
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  caseSensitive: boolean,
  allowedDirectories: string[],
  inspectionResumeSessionStore?: InspectionResumeSessionSqliteStore,
): Promise<string> {
  const executionContext = resolveSearchFixedStringExecutionContext(
    resumeToken,
    resumeMode,
    searchPaths,
    fixedString,
    filePatterns,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    maxResults,
    caseSensitive,
    inspectionResumeSessionStore,
    new Date(),
  );
  const structuredResult = await getSearchFixedStringResult(
    resumeToken,
    resumeMode,
    searchPaths,
    fixedString,
    filePatterns,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    maxResults,
    caseSensitive,
    allowedDirectories,
    inspectionResumeSessionStore,
  );
  const effectiveMaxResults = Math.min(
    executionContext.requestPayload.maxResults,
    REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
  );
  const effectiveFixedString = executionContext.requestPayload.fixedString;

  return assertFormattedFixedStringResponseBudget(
    SEARCH_FIXED_STRING_TOOL_NAME,
    formatSearchFixedStringContinuationAwareTextOutput(
      structuredResult,
      effectiveFixedString,
      effectiveMaxResults,
    ),
  );
}

/**
 * Executes fixed-string search across one or more roots and returns the structured result surface.
 *
 * @param searchPaths - File or directory search scopes in caller-supplied order.
 * @param fixedString - Exact literal string supplied by the caller.
 * @param filePatterns - Include globs that narrow candidate file names before content scanning.
 * @param excludePatterns - Exclude globs that remove candidate paths from traversal.
 * @param includeExcludedGlobs - Additive descendant re-include globs that reopen excluded subtrees.
 * @param respectGitIgnore - Whether optional root-local `.gitignore` enrichment participates in traversal.
 * @param maxResults - Caller-requested maximum number of returned locations per root.
 * @param caseSensitive - Whether literal matching should preserve case sensitivity.
 * @param allowedDirectories - Allowed directory roots enforced by the shared path guard.
 * @returns Structured per-root results with harmonized partial-failure semantics.
 */
export async function getSearchFixedStringResult(
  resumeToken: string | undefined,
  resumeMode: InspectionResumeMode | undefined,
  searchPaths: string[],
  fixedString: string,
  filePatterns: string[],
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  caseSensitive: boolean,
  allowedDirectories: string[],
  inspectionResumeSessionStore?: InspectionResumeSessionSqliteStore,
): Promise<SearchFixedStringResult> {
  const now = new Date();
  const executionContext = resolveSearchFixedStringExecutionContext(
    resumeToken,
    resumeMode,
    searchPaths,
    fixedString,
    filePatterns,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    maxResults,
    caseSensitive,
    inspectionResumeSessionStore,
    now,
  );
  const effectiveMaxResults = Math.min(
    executionContext.requestPayload.maxResults,
    REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
  );
  const aggregateBudgetState = createFixedStringSearchAggregateBudgetState();
  const executionPolicy = resolveSearchExecutionPolicy(detectIoCapabilityProfile());
  const activeSearchPaths = executionContext.continuationState === null
    ? executionContext.requestPayload.searchPaths
    : executionContext.requestPayload.searchPaths.filter(
        (requestedSearchPath) =>
          executionContext.continuationState?.rootTraversalStates[requestedSearchPath] !== undefined,
      );

  if (activeSearchPaths.length === 0) {
    if (executionContext.activeResumeToken !== null && inspectionResumeSessionStore !== undefined) {
      inspectionResumeSessionStore.markSessionCompleted(executionContext.activeResumeToken, now);
    }

    return {
      roots: [],
      totalLocations: 0,
      totalMatches: 0,
      truncated: false,
      ...createInlineResumeEnvelope(),
    };
  }

  const roots: SearchFixedStringRootExecutionResult[] = [];

  for (const searchPath of activeSearchPaths) {
    try {
      const result = await getSearchFixedStringPathResult(
        searchPath,
        executionContext.requestPayload.fixedString,
        executionContext.requestPayload.filePatterns,
        executionContext.requestPayload.excludePatterns,
        executionContext.requestPayload.includeExcludedGlobs,
        executionContext.requestPayload.respectGitIgnore,
        effectiveMaxResults,
        executionContext.requestPayload.caseSensitive,
        allowedDirectories,
        executionPolicy,
        aggregateBudgetState,
        activeSearchPaths.length,
        executionContext.continuationState?.rootTraversalStates[searchPath] ?? null,
        executionContext.requestedResumeMode,
      );

      roots.push(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      roots.push({
        ...createFixedStringRootErrorResult(searchPath, errorMessage),
        admissionOutcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.INLINE,
        nextContinuationState: null,
      });
    }
  }

  const nextContinuationState = roots.reduce<SearchFixedStringContinuationState | null>(
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
  const continuationEnvelope = buildSearchFixedStringContinuationEnvelope(
    executionContext.activeResumeToken,
    executionContext.activeResumeExpiresAt,
    nextContinuationState,
    inspectionResumeSessionStore,
    executionContext.requestPayload,
    roots,
    executionContext.requestedResumeMode,
    now,
  );

  return {
    roots: roots.map(({ root, matches, filesSearched, totalMatches, truncated, error }) => ({
      root,
      matches,
      filesSearched,
      totalMatches,
      truncated,
      error,
    })),
    totalLocations: roots.reduce((total, root) => total + root.matches.length, 0),
    totalMatches: roots.reduce((total, root) => total + root.totalMatches, 0),
    truncated: roots.some((root) => root.truncated),
    ...continuationEnvelope,
  };
}
