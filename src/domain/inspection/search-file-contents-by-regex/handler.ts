import { normalizeError } from "@shared/errors";

import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter";

import {
  createGuardrailedSearchRegexExecutionPlan,
  isRegexSearchPatternContractError,
} from "@domain/shared/guardrails/regex-search-safety";
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
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";
import type { InspectionResumeSessionSqliteStore } from "@infrastructure/persistence/inspection-resume-session-sqlite-store";

import { SEARCH_FILE_CONTENTS_BY_REGEX_TOOL_NAME } from "./schema";
import {
  createRegexSearchAggregateBudgetState,
  getSearchRegexPathResult,
  type SearchRegexRootContinuationState,
} from "./search-regex-path-result";
import {
  assertFormattedRegexResponseBudget,
  formatSearchRegexContinuationAwareTextOutput,
  type SearchRegexPathResult,
  type SearchRegexResult,
} from "./search-regex-result";
const SEARCH_REGEX_CONTINUATION_GUIDANCE =
  "Resume the same regex-search request by sending only resumeToken with resumeMode='next-chunk' to the same endpoint to receive the next bounded chunk of matches.";

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
  activeResumeToken: string | null;
  activeResumeExpiresAt: string | null;
  requestedResumeMode: InspectionResumeMode | null;
}

interface HandleSearchRegexOptions {
  resumeToken: string | undefined;
  resumeMode: InspectionResumeMode | undefined;
  searchPaths: string[];
  pattern: string;
  filePatterns: string[];
  excludePatterns: string[];
  includeExcludedGlobs: string[];
  respectGitIgnore: boolean;
  maxResults: number;
  caseSensitive: boolean;
  allowedDirectories: string[];
  inspectionResumeSessionStore: InspectionResumeSessionSqliteStore | undefined;
}

interface GetSearchRegexResultOptions {
  resumeToken: string | undefined;
  resumeMode: InspectionResumeMode | undefined;
  searchPaths: string[];
  pattern: string;
  filePatterns: string[];
  excludePatterns: string[];
  includeExcludedGlobs: string[];
  respectGitIgnore: boolean;
  maxResults: number;
  caseSensitive: boolean;
  allowedDirectories: string[];
  inspectionResumeSessionStore: InspectionResumeSessionSqliteStore | undefined;
}

interface ResolveSearchRegexExecutionContextOptions {
  resumeToken: string | undefined;
  resumeMode: InspectionResumeMode | undefined;
  searchPaths: string[];
  pattern: string;
  filePatterns: string[];
  excludePatterns: string[];
  includeExcludedGlobs: string[];
  respectGitIgnore: boolean;
  maxResults: number;
  caseSensitive: boolean;
  inspectionResumeSessionStore: InspectionResumeSessionSqliteStore | undefined;
  now: Date;
}

type SearchRegexRootExecutionResult = SearchRegexPathResult & {
  admissionOutcome: TraversalWorkloadAdmissionOutcome;
  nextContinuationState: SearchRegexRootContinuationState | null;
};

interface BuildSearchRegexContinuationEnvelopeOptions {
  resumeToken: string | null;
  resumeExpiresAt: string | null;
  nextContinuationState: SearchRegexContinuationState | null;
  inspectionResumeSessionStore: InspectionResumeSessionSqliteStore | undefined;
  requestPayload: SearchRegexRequestPayload;
  roots: SearchRegexRootExecutionResult[];
  requestedResumeMode: InspectionResumeMode | null;
  now: Date;
}

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
  regexExecutionPlan: ReturnType<typeof createGuardrailedSearchRegexExecutionPlan>;
} {
  const regexExecutionPlan = createGuardrailedSearchRegexExecutionPlan(
    SEARCH_FILE_CONTENTS_BY_REGEX_TOOL_NAME,
    pattern,
    caseSensitive,
  );

  return {
    aggregateBudgetState: createRegexSearchAggregateBudgetState(),
    executionPolicy: resolveSearchExecutionPolicy(detectIoCapabilityProfile()),
    regexExecutionPlan,
  };
}

/**
 * Resolves the execution context for one regex-search request or resume request.
 *
 * @param options - Request payload, resume metadata, and infrastructure dependencies needed to derive the active execution context.
 * @returns Normalized execution context for the current regex-search flow.
 */
function resolveSearchRegexExecutionContext(
  options: ResolveSearchRegexExecutionContextOptions,
): SearchRegexExecutionContext {
  const {
    resumeToken,
    resumeMode,
    searchPaths,
    pattern,
    filePatterns,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    maxResults,
    caseSensitive,
    inspectionResumeSessionStore,
    now,
  } = options;

  if (resumeToken === undefined) {
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
      activeResumeToken: null,
      activeResumeExpiresAt: null,
      requestedResumeMode: null,
    };
  }

  if (inspectionResumeSessionStore === undefined) {
    throw new Error("Resume-session storage is unavailable for regex-search resume requests.");
  }

  const resumeSession = inspectionResumeSessionStore.loadActiveSession<
    SearchRegexRequestPayload,
    SearchRegexContinuationState
  >(
    resumeToken,
    SEARCH_FILE_CONTENTS_BY_REGEX_TOOL_NAME,
    SEARCH_FILE_CONTENTS_BY_REGEX_TOOL_NAME,
    now,
  );

  if (resumeSession === null) {
    throw new Error(getResumeSessionNotFoundMessage(SEARCH_FILE_CONTENTS_BY_REGEX_TOOL_NAME));
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

/**
 * Builds the resume envelope for the regex-search family.
 *
 * @param options - Resume-session inputs, request payload, root results, and timing state for the current envelope decision.
 * @returns Resume metadata for the current regex-search response.
 */
function buildSearchRegexContinuationEnvelope(
  options: BuildSearchRegexContinuationEnvelopeOptions,
): Pick<SearchRegexResult, "admission" | "resume"> {
  const {
    resumeToken,
    resumeExpiresAt,
    nextContinuationState,
    inspectionResumeSessionStore,
    requestPayload,
    roots,
    requestedResumeMode,
    now,
  } = options;

  const effectiveResumeMode = requestedResumeMode ?? INSPECTION_RESUME_MODES.NEXT_CHUNK;
  const admissionOutcome = effectiveResumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT
    ? INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED
    : INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST;
  const guidanceText = effectiveResumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT
    ? "Resume the same regex-search request by sending only resumeToken with resumeMode='complete-result' to the same endpoint so the server can continue the persisted completion attempt toward a final complete result."
    : SEARCH_REGEX_CONTINUATION_GUIDANCE;
  const scopeReductionGuidanceText =
    "Scope reduction alternative: narrow roots, add includeGlobs, or tighten the regex to the intended file set.";
  const previewFirstActive = roots.some(
    (rootResult) =>
      rootResult.admissionOutcome === INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
  );

  if (!previewFirstActive) {
    return createInlineResumeEnvelope();
  }

  if (nextContinuationState === null) {
    return createResumeEnvelope(
      admissionOutcome,
      guidanceText,
      scopeReductionGuidanceText,
      null,
    );
  }

  if (inspectionResumeSessionStore === undefined) {
    throw new Error("Resume-session storage is unavailable for preview-first regex search.");
  }

  if (resumeToken === null) {
    const resumeSession = inspectionResumeSessionStore.createSession(
      {
        endpointName: SEARCH_FILE_CONTENTS_BY_REGEX_TOOL_NAME,
        familyMember: SEARCH_FILE_CONTENTS_BY_REGEX_TOOL_NAME,
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
    throw new Error("Active regex-search resume session is missing an expiration timestamp.");
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
 * Executes regex search across one or more roots and returns the formatted text response surface.
 *
 * @remarks
 * This handler preserves the public regex endpoint contract while delegating the heavy execution
 * lane to endpoint-local helper modules that consume the shared runtime policy, classifiers, and
 * native `ugrep` backend. Invalid regex patterns remain global failures, while multi-root runtime
 * problems are preserved as root-local failures instead of collapsing the whole batch response.
 *
 * @param options - Request, resume, and environment options for the formatted regex-search flow.
 * @returns Formatted text output that respects the regex-search family response cap.
 */
export async function handleSearchRegex(
  options: HandleSearchRegexOptions,
): Promise<string> {
  const {
    resumeToken,
    resumeMode,
    searchPaths,
    pattern,
    filePatterns,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    maxResults,
    caseSensitive,
    allowedDirectories,
    inspectionResumeSessionStore,
  } = options;

  const executionContext = resolveSearchRegexExecutionContext(
    {
      resumeToken,
      resumeMode,
      searchPaths,
      pattern,
      filePatterns,
      excludePatterns,
      includeExcludedGlobs,
      respectGitIgnore,
      maxResults,
      caseSensitive,
      inspectionResumeSessionStore,
      now: new Date(),
    },
  );
  const structuredResult = await getSearchRegexResult({
    resumeToken,
    resumeMode,
    searchPaths,
    pattern,
    filePatterns,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    maxResults,
    caseSensitive,
    allowedDirectories,
    inspectionResumeSessionStore,
  });
  const effectiveMaxResults = Math.min(
    executionContext.requestPayload.maxResults,
    REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
  );
  const effectivePattern = executionContext.requestPayload.pattern;

  const output = assertFormattedRegexResponseBudget(
    SEARCH_FILE_CONTENTS_BY_REGEX_TOOL_NAME,
    formatSearchRegexContinuationAwareTextOutput(
      structuredResult,
      effectivePattern,
      effectiveMaxResults,
    ),
    executionContext.requestedResumeMode,
  );

  if (resumeToken !== undefined && !structuredResult.resume.resumable && structuredResult.resume.resumeToken === null) {
    inspectionResumeSessionStore?.markSessionCompleted(resumeToken, new Date());
  }

  return output;
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
 * @param options - Request, resume, and environment options for the structured regex-search flow.
 * @returns Structured per-root results with preserved field names and harmonized failure semantics.
 */
export async function getSearchRegexResult(
  options: GetSearchRegexResultOptions,
): Promise<SearchRegexResult> {
  const {
    resumeToken,
    resumeMode,
    searchPaths,
    pattern,
    filePatterns,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    maxResults,
    caseSensitive,
    allowedDirectories,
    inspectionResumeSessionStore,
  } = options;

  const now = new Date();
  const executionContext = resolveSearchRegexExecutionContext(
    {
      resumeToken,
      resumeMode,
      searchPaths,
      pattern,
      filePatterns,
      excludePatterns,
      includeExcludedGlobs,
      respectGitIgnore,
      maxResults,
      caseSensitive,
      inspectionResumeSessionStore,
      now,
    },
  );
  const effectiveMaxResults = Math.min(
    executionContext.requestPayload.maxResults,
    REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
  );
  const { aggregateBudgetState, executionPolicy, regexExecutionPlan } = createSharedRegexExecutionContext(
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

  const roots: SearchRegexRootExecutionResult[] = [];

  for (const searchPath of activeSearchPaths) {
    try {
      const result = await getSearchRegexPathResult({
        toolName: SEARCH_FILE_CONTENTS_BY_REGEX_TOOL_NAME,
        searchPath,
        pattern: executionContext.requestPayload.pattern,
        filePatterns: executionContext.requestPayload.filePatterns,
        excludePatterns: executionContext.requestPayload.excludePatterns,
        includeExcludedGlobs: executionContext.requestPayload.includeExcludedGlobs,
        respectGitIgnore: executionContext.requestPayload.respectGitIgnore,
        maxResults: effectiveMaxResults,
        caseSensitive: executionContext.requestPayload.caseSensitive,
        allowedDirectories,
        executionPolicy,
        aggregateBudgetState,
        batchRootCount: activeSearchPaths.length,
        continuationState: executionContext.continuationState?.rootTraversalStates[searchPath] ?? null,
        requestedResumeMode: executionContext.requestedResumeMode,
        regexExecutionPlan,
      });

      roots.push(result);
    } catch (error) {
      if (isRegexSearchPatternContractError(error)) {
        throw error;
      }

      const errorMessage = normalizeError(error).message;

      roots.push({
        ...createRegexRootErrorResult(searchPath, errorMessage),
        admissionOutcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.INLINE,
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
  const continuationEnvelope = buildSearchRegexContinuationEnvelope({
    resumeToken: executionContext.activeResumeToken,
    resumeExpiresAt: executionContext.activeResumeExpiresAt,
    nextContinuationState,
    inspectionResumeSessionStore,
    requestPayload: executionContext.requestPayload,
    roots,
    requestedResumeMode: executionContext.requestedResumeMode,
    now,
  });

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
