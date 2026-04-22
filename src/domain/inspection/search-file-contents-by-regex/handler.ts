import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter";

import { compileGuardrailedSearchRegex } from "@domain/shared/guardrails/regex-search-safety";
import { REGEX_SEARCH_MAX_RESULTS_HARD_CAP } from "@domain/shared/guardrails/tool-guardrail-limits";
import type { TraversalWorkloadAdmissionOutcome } from "@domain/shared/guardrails/traversal-workload-admission";
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import {
  createContinuationEnvelope,
  createInlineContinuationEnvelope,
  createPersistedContinuationEnvelope,
  getContinuationNotFoundMessage,
  INSPECTION_CONTINUATION_ADMISSION_OUTCOMES,
  INSPECTION_CONTINUATION_STATUSES,
} from "@domain/shared/continuation/inspection-continuation-contract";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";
import type { InspectionContinuationSqliteStore } from "@infrastructure/persistence/inspection-continuation-sqlite-store";

import {
  createRegexSearchAggregateBudgetState,
  getSearchRegexPathResult,
  type SearchRegexRootContinuationState,
} from "./search-regex-path-result";
import {
  assertFormattedRegexResponseBudget,
  formatSearchRegexContinuationAwareTextOutput,
  formatSearchRegexPathOutput,
  type SearchRegexPathResult,
  type SearchRegexResult,
} from "./search-regex-result";

const SEARCH_REGEX_TOOL_NAME = "search_file_contents_by_regex";
const SEARCH_REGEX_CONTINUATION_GUIDANCE =
  "Resume the same regex-search request by sending only continuationToken to the same endpoint to receive the next bounded chunk of matches.";

interface SearchRegexRequestPayload {
  searchPaths: string[];
  pattern: string;
  filePatterns: string[];
  excludePatterns: string[];
  includeExcludedGlobs: string[];
  respectGitIgnore: boolean;
  maxResults: number;
  caseSensitive: boolean;
}

interface SearchRegexContinuationState {
  rootTraversalStates: Record<string, SearchRegexRootContinuationState>;
}

interface SearchRegexExecutionContext {
  requestPayload: SearchRegexRequestPayload;
  continuationState: SearchRegexContinuationState | null;
  activeContinuationToken: string | null;
  activeContinuationExpiresAt: string | null;
}

type SearchRegexRootExecutionResult = SearchRegexPathResult & {
  admissionOutcome: TraversalWorkloadAdmissionOutcome;
  nextContinuationState: SearchRegexRootContinuationState | null;
};

function createRegexRootErrorResult(
  searchPath: string,
  errorMessage: string,
): SearchRegexPathResult {
  return {
    root: searchPath,
    matches: [],
    filesSearched: 0,
    totalMatches: 0,
    truncated: false,
    error: errorMessage,
  };
}

function createSharedRegexExecutionContext(
  pattern: string,
  caseSensitive: boolean,
): {
  aggregateBudgetState: ReturnType<typeof createRegexSearchAggregateBudgetState>;
  executionPolicy: ReturnType<typeof resolveSearchExecutionPolicy>;
} {
  compileGuardrailedSearchRegex(SEARCH_REGEX_TOOL_NAME, pattern, caseSensitive);

  return {
    aggregateBudgetState: createRegexSearchAggregateBudgetState(),
    executionPolicy: resolveSearchExecutionPolicy(detectIoCapabilityProfile()),
  };
}

function resolveSearchRegexExecutionContext(
  continuationToken: string | undefined,
  searchPaths: string[],
  pattern: string,
  filePatterns: string[],
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  caseSensitive: boolean,
  inspectionContinuationStore: InspectionContinuationSqliteStore | undefined,
  now: Date,
): SearchRegexExecutionContext {
  if (continuationToken === undefined) {
    return {
      requestPayload: {
        searchPaths,
        pattern,
        filePatterns,
        excludePatterns,
        includeExcludedGlobs,
        respectGitIgnore,
        maxResults,
        caseSensitive,
      },
      continuationState: null,
      activeContinuationToken: null,
      activeContinuationExpiresAt: null,
    };
  }

  if (inspectionContinuationStore === undefined) {
    throw new Error("Continuation storage is unavailable for regex-search resume requests.");
  }

  const continuationSession = inspectionContinuationStore.loadActiveSession<
    SearchRegexRequestPayload,
    SearchRegexContinuationState
  >(
    continuationToken,
    SEARCH_REGEX_TOOL_NAME,
    SEARCH_REGEX_TOOL_NAME,
    now,
  );

  if (continuationSession === null) {
    throw new Error(getContinuationNotFoundMessage(SEARCH_REGEX_TOOL_NAME));
  }

  return {
    requestPayload: continuationSession.requestPayload,
    continuationState: continuationSession.continuationState,
    activeContinuationToken: continuationSession.continuationToken,
    activeContinuationExpiresAt: continuationSession.expiresAt,
  };
}

function buildSearchRegexContinuationEnvelope(
  continuationToken: string | null,
  continuationExpiresAt: string | null,
  nextContinuationState: SearchRegexContinuationState | null,
  inspectionContinuationStore: InspectionContinuationSqliteStore | undefined,
  requestPayload: SearchRegexRequestPayload,
  roots: SearchRegexRootExecutionResult[],
  now: Date,
): Pick<SearchRegexResult, "admission" | "continuation"> {
  const previewFirstActive = roots.some(
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
    throw new Error("Continuation storage is unavailable for preview-first regex search.");
  }

  if (continuationToken === null) {
    const continuationSession = inspectionContinuationStore.createSession(
      {
        endpointName: SEARCH_REGEX_TOOL_NAME,
        familyMember: SEARCH_REGEX_TOOL_NAME,
        requestPayload,
        continuationState: nextContinuationState,
        admissionOutcome: INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      },
      now,
    );

    return createPersistedContinuationEnvelope(
      SEARCH_REGEX_TOOL_NAME,
      continuationSession.continuationToken,
      continuationSession.status,
      continuationSession.expiresAt,
      SEARCH_REGEX_CONTINUATION_GUIDANCE,
      INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
    );
  }

  if (continuationExpiresAt === null) {
    throw new Error("Active regex-search continuation session is missing an expiration timestamp.");
  }

  inspectionContinuationStore.updateContinuationState(continuationToken, nextContinuationState, now);

  return createPersistedContinuationEnvelope(
    SEARCH_REGEX_TOOL_NAME,
    continuationToken,
    INSPECTION_CONTINUATION_STATUSES.ACTIVE,
    continuationExpiresAt,
    SEARCH_REGEX_CONTINUATION_GUIDANCE,
    INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
  );
}

/**
 * Executes regex search across one or more roots and returns the formatted text response surface.
 *
 * @remarks
 * This handler preserves the public regex endpoint contract while delegating the heavy execution
 * lane to endpoint-local helper modules that consume the shared runtime policy, classifiers, and
 * native `ugrep` backend. Invalid regex patterns remain global failures, while multi-root runtime
 * problems are preserved as root-local failures instead of collapsing the whole batch response.
 *
 * @param searchPaths - File or directory search scopes in caller-supplied order.
 * @param pattern - Raw regex pattern supplied by the caller.
 * @param filePatterns - Include globs that narrow candidate file names before content scanning.
 * @param excludePatterns - Exclude globs that remove candidate paths from traversal.
 * @param includeExcludedGlobs - Additive descendant re-include globs that reopen excluded subtrees.
 * @param respectGitIgnore - Whether optional root-local `.gitignore` enrichment participates in traversal.
 * @param maxResults - Caller-requested maximum number of returned locations per root.
 * @param caseSensitive - Whether regex compilation should preserve case sensitivity.
 * @param allowedDirectories - Allowed directory roots enforced by the shared path guard.
 * @returns Formatted text output that respects the regex-search family response cap.
 */
export async function handleSearchRegex(
  continuationToken: string | undefined,
  searchPaths: string[],
  pattern: string,
  filePatterns: string[],
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  caseSensitive: boolean,
  allowedDirectories: string[],
  inspectionContinuationStore?: InspectionContinuationSqliteStore,
): Promise<string> {
  const executionContext = resolveSearchRegexExecutionContext(
    continuationToken,
    searchPaths,
    pattern,
    filePatterns,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    maxResults,
    caseSensitive,
    inspectionContinuationStore,
    new Date(),
  );
  const structuredResult = await getSearchRegexResult(
    continuationToken,
    searchPaths,
    pattern,
    filePatterns,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    maxResults,
    caseSensitive,
    allowedDirectories,
    inspectionContinuationStore,
  );
  const effectiveMaxResults = Math.min(maxResults, REGEX_SEARCH_MAX_RESULTS_HARD_CAP);
  const effectivePattern = executionContext.requestPayload.pattern;

  return assertFormattedRegexResponseBudget(
    SEARCH_REGEX_TOOL_NAME,
    formatSearchRegexContinuationAwareTextOutput(
      structuredResult,
      effectivePattern,
      effectiveMaxResults,
    ),
  );
}

/**
 * Executes regex search across one or more roots and returns the structured result surface.
 *
 * @remarks
 * Structured callers consume the same shared runtime policy, native backend, and aggregate budget
 * state as the formatted handler. Single-root requests preserve strict failures, while multi-root
 * requests encode root-local failures inside the per-root result surface so later consumers can
 * distinguish partial root failures from successful roots.
 *
 * @param searchPaths - File or directory search scopes in caller-supplied order.
 * @param pattern - Raw regex pattern supplied by the caller.
 * @param filePatterns - Include globs that narrow candidate file names before content scanning.
 * @param excludePatterns - Exclude globs that remove candidate paths from traversal.
 * @param includeExcludedGlobs - Additive descendant re-include globs that reopen excluded subtrees.
 * @param respectGitIgnore - Whether optional root-local `.gitignore` enrichment participates in traversal.
 * @param maxResults - Caller-requested maximum number of returned locations per root.
 * @param caseSensitive - Whether regex compilation should preserve case sensitivity.
 * @param allowedDirectories - Allowed directory roots enforced by the shared path guard.
 * @returns Structured per-root results with preserved field names and harmonized failure semantics.
 */
export async function getSearchRegexResult(
  continuationToken: string | undefined,
  searchPaths: string[],
  pattern: string,
  filePatterns: string[],
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  caseSensitive: boolean,
  allowedDirectories: string[],
  inspectionContinuationStore?: InspectionContinuationSqliteStore,
): Promise<SearchRegexResult> {
  const now = new Date();
  const executionContext = resolveSearchRegexExecutionContext(
    continuationToken,
    searchPaths,
    pattern,
    filePatterns,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    maxResults,
    caseSensitive,
    inspectionContinuationStore,
    now,
  );
  const effectiveMaxResults = Math.min(
    executionContext.requestPayload.maxResults,
    REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
  );
  const { aggregateBudgetState, executionPolicy } = createSharedRegexExecutionContext(
    executionContext.requestPayload.pattern,
    executionContext.requestPayload.caseSensitive,
  );
  const activeSearchPaths = executionContext.continuationState === null
    ? executionContext.requestPayload.searchPaths
    : executionContext.requestPayload.searchPaths.filter(
        (requestedSearchPath) =>
          executionContext.continuationState?.rootTraversalStates[requestedSearchPath] !== undefined,
      );

  if (activeSearchPaths.length === 0) {
    if (executionContext.activeContinuationToken !== null && inspectionContinuationStore !== undefined) {
      inspectionContinuationStore.markSessionCompleted(executionContext.activeContinuationToken, now);
    }

    return {
      roots: [],
      totalLocations: 0,
      totalMatches: 0,
      truncated: false,
      ...createInlineContinuationEnvelope(),
    };
  }

  const roots: SearchRegexRootExecutionResult[] = [];

  for (const searchPath of activeSearchPaths) {
    try {
      const result = await getSearchRegexPathResult(
        SEARCH_REGEX_TOOL_NAME,
        searchPath,
        executionContext.requestPayload.pattern,
        executionContext.requestPayload.filePatterns,
        executionContext.requestPayload.excludePatterns,
        executionContext.requestPayload.includeExcludedGlobs,
        executionContext.requestPayload.respectGitIgnore,
        effectiveMaxResults,
        executionContext.requestPayload.caseSensitive,
        allowedDirectories,
        executionPolicy,
        aggregateBudgetState,
        executionContext.continuationState?.rootTraversalStates[searchPath] ?? null,
      );

      roots.push(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      roots.push({
        ...createRegexRootErrorResult(searchPath, errorMessage),
        admissionOutcome: INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.INLINE,
        nextContinuationState: null,
      });
    }
  }

  const nextContinuationState = roots.reduce<SearchRegexContinuationState | null>(
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
  const continuationEnvelope = buildSearchRegexContinuationEnvelope(
    executionContext.activeContinuationToken,
    executionContext.activeContinuationExpiresAt,
    nextContinuationState,
    inspectionContinuationStore,
    executionContext.requestPayload,
    roots,
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
