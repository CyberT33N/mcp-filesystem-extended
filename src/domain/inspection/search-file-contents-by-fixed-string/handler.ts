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
import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";
import type { InspectionContinuationSqliteStore } from "@infrastructure/persistence/inspection-continuation-sqlite-store";
import {
  assertFormattedFixedStringResponseBudget,
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
  "Resume the same fixed-string-search request by sending only continuationToken to the same endpoint to receive the next bounded chunk of matches.";

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
  activeContinuationToken: string | null;
  activeContinuationExpiresAt: string | null;
}

type SearchFixedStringRootExecutionResult = SearchFixedStringPathResult & {
  admissionOutcome: TraversalWorkloadAdmissionOutcome;
  nextContinuationState: SearchFixedStringRootContinuationState | null;
};

function resolveSearchFixedStringExecutionContext(
  continuationToken: string | undefined,
  searchPaths: string[],
  fixedString: string,
  filePatterns: string[],
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  caseSensitive: boolean,
  inspectionContinuationStore: InspectionContinuationSqliteStore | undefined,
  now: Date,
): SearchFixedStringExecutionContext {
  if (continuationToken === undefined) {
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
      activeContinuationToken: null,
      activeContinuationExpiresAt: null,
    };
  }

  if (inspectionContinuationStore === undefined) {
    throw new Error("Continuation storage is unavailable for fixed-string-search resume requests.");
  }

  const continuationSession = inspectionContinuationStore.loadActiveSession<
    SearchFixedStringRequestPayload,
    SearchFixedStringContinuationState
  >(
    continuationToken,
    SEARCH_FIXED_STRING_TOOL_NAME,
    SEARCH_FIXED_STRING_TOOL_NAME,
    now,
  );

  if (continuationSession === null) {
    throw new Error(getContinuationNotFoundMessage(SEARCH_FIXED_STRING_TOOL_NAME));
  }

  return {
    requestPayload: continuationSession.requestPayload,
    continuationState: continuationSession.continuationState,
    activeContinuationToken: continuationSession.continuationToken,
    activeContinuationExpiresAt: continuationSession.expiresAt,
  };
}

function buildSearchFixedStringContinuationEnvelope(
  continuationToken: string | null,
  continuationExpiresAt: string | null,
  nextContinuationState: SearchFixedStringContinuationState | null,
  inspectionContinuationStore: InspectionContinuationSqliteStore | undefined,
  requestPayload: SearchFixedStringRequestPayload,
  roots: SearchFixedStringRootExecutionResult[],
  now: Date,
): Pick<SearchFixedStringResult, "admission" | "continuation"> {
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
    throw new Error("Continuation storage is unavailable for preview-first fixed-string search.");
  }

  if (continuationToken === null) {
    const continuationSession = inspectionContinuationStore.createSession(
      {
        endpointName: SEARCH_FIXED_STRING_TOOL_NAME,
        familyMember: SEARCH_FIXED_STRING_TOOL_NAME,
        requestPayload,
        continuationState: nextContinuationState,
        admissionOutcome: INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      },
      now,
    );

    return createPersistedContinuationEnvelope(
      SEARCH_FIXED_STRING_TOOL_NAME,
      continuationSession.continuationToken,
      continuationSession.status,
      continuationSession.expiresAt,
      SEARCH_FIXED_STRING_CONTINUATION_GUIDANCE,
      INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
    );
  }

  if (continuationExpiresAt === null) {
    throw new Error("Active fixed-string-search continuation session is missing an expiration timestamp.");
  }

  inspectionContinuationStore.updateContinuationState(continuationToken, nextContinuationState, now);

  return createPersistedContinuationEnvelope(
    SEARCH_FIXED_STRING_TOOL_NAME,
    continuationToken,
    INSPECTION_CONTINUATION_STATUSES.ACTIVE,
    continuationExpiresAt,
    SEARCH_FIXED_STRING_CONTINUATION_GUIDANCE,
    INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
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
  continuationToken: string | undefined,
  searchPaths: string[],
  fixedString: string,
  filePatterns: string[],
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  caseSensitive: boolean,
  allowedDirectories: string[],
  inspectionContinuationStore?: InspectionContinuationSqliteStore,
): Promise<string> {
  const structuredResult = await getSearchFixedStringResult(
    continuationToken,
    searchPaths,
    fixedString,
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

  if (structuredResult.roots.length === 1) {
    const firstRootResult = structuredResult.roots[0];

    if (firstRootResult === undefined) {
      throw new Error("Expected one root result for fixed-string formatting.");
    }

    return assertFormattedFixedStringResponseBudget(
      SEARCH_FIXED_STRING_TOOL_NAME,
      formatSearchFixedStringPathOutput(firstRootResult, fixedString, effectiveMaxResults),
    );
  }

  return assertFormattedFixedStringResponseBudget(
    SEARCH_FIXED_STRING_TOOL_NAME,
    formatBatchTextOperationResults(
      "search fixed string",
      structuredResult.roots.map((rootResult) => ({
        label: rootResult.root,
        output: formatSearchFixedStringPathOutput(rootResult, fixedString, effectiveMaxResults),
      })),
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
  continuationToken: string | undefined,
  searchPaths: string[],
  fixedString: string,
  filePatterns: string[],
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  caseSensitive: boolean,
  allowedDirectories: string[],
  inspectionContinuationStore?: InspectionContinuationSqliteStore,
): Promise<SearchFixedStringResult> {
  const now = new Date();
  const executionContext = resolveSearchFixedStringExecutionContext(
    continuationToken,
    searchPaths,
    fixedString,
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
  const aggregateBudgetState = createFixedStringSearchAggregateBudgetState();
  const executionPolicy = resolveSearchExecutionPolicy(detectIoCapabilityProfile());
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
        executionContext.continuationState?.rootTraversalStates[searchPath] ?? null,
      );

      roots.push(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      roots.push({
        ...createFixedStringRootErrorResult(searchPath, errorMessage),
        admissionOutcome: INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.INLINE,
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
