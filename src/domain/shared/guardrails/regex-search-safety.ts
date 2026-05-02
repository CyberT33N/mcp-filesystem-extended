/**
 * Shared regex runtime-safety helpers for content-search endpoints.
 *
 * @remarks
 * This module owns the low-false-positive runtime safety layer for regex execution. It performs a
 * tiny structural reject pass for invalid syntax, empty patterns, and zero-length matching
 * patterns, then relies on candidate-byte and collected-result budgets to control legitimate
 * high-frequency searches without falling back to a broad semantic blacklist.
 */
import {
  REGEX_PATTERN_MAX_CHARS,
  REGEX_SEARCH_EXCERPT_MAX_CHARS,
  REGEX_SEARCH_MAX_CANDIDATE_BYTES,
  REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
} from "./tool-guardrail-limits";
import {
  classifyPattern,
  type PatternClassification,
} from "@domain/shared/search/pattern-classifier";
import {
  createRegexContentMatchContractRejectedFailure,
  createRegexRuntimeRejectedFailure,
  createRuntimeBudgetExceededFailure,
  formatToolGuardrailFailureAsText,
} from "./tool-guardrail-error-contract";

const CASE_SENSITIVE_REGEX_FLAGS = "mg";
const CASE_INSENSITIVE_REGEX_FLAGS = "img";
const ZERO_LENGTH_SENTINEL_INPUTS = ["", "a", " ", "\n"] as const;

/**
 * Canonical request-wide pattern-contract error for regex-search surfaces.
 *
 * @remarks
 * Callers must treat this failure as a whole-request contract rejection instead of degrading it
 * into a root-local operational error surface.
 */
export class RegexSearchPatternContractError extends Error {
  /**
   * Creates one request-wide regex pattern-contract failure.
   *
   * @param message - Canonical caller-visible guardrail message.
   */
  public constructor(message: string) {
    super(message);
    this.name = "RegexSearchPatternContractError";
  }
}

/**
 * Canonical request-wide execution plan for guarded regex search.
 */
export interface GuardrailedSearchRegexExecutionPlan {
  /**
   * Shared pattern-classification output consumed by native-lane routing.
   */
  patternClassification: PatternClassification;

  /**
   * JavaScript regex instance used for zero-length protection and local match extraction.
   */
  regex: RegExp;
}

function resolveSearchRegexFlags(caseSensitive: boolean): string {
  return caseSensitive ? CASE_SENSITIVE_REGEX_FLAGS : CASE_INSENSITIVE_REGEX_FLAGS;
}

function formatRegexPatternSummary(pattern: string, flags: string): string {
  const preview =
    pattern.length <= REGEX_PATTERN_MAX_CHARS
      ? pattern
      : `${pattern.slice(0, REGEX_PATTERN_MAX_CHARS)}…`;

  return `/${preview}/${flags}`;
}

function createRegexSearchPatternContractError(
  toolName: string,
  patternSummary: string,
  reason: string,
): RegexSearchPatternContractError {
  return new RegexSearchPatternContractError(
    formatToolGuardrailFailureAsText(
      createRegexRuntimeRejectedFailure({
        toolName,
        patternSummary,
        reason,
        candidateBytes: 0,
      }),
    ),
  );
}

function createRegexContentMatchPatternContractError(
  toolName: string,
  patternSummary: string,
  reason: string,
): RegexSearchPatternContractError {
  return new RegexSearchPatternContractError(
    formatToolGuardrailFailureAsText(
      createRegexContentMatchContractRejectedFailure({
        toolName,
        patternSummary,
        reason,
        candidateBytes: 0,
      }),
    ),
  );
}

function throwRegexRuntimeRejected(
  toolName: string,
  patternSummary: string,
  reason: string,
): never {
  throw createRegexSearchPatternContractError(toolName, patternSummary, reason);
}

function throwRegexContentMatchContractRejected(
  toolName: string,
  patternSummary: string,
  reason: string,
): never {
  throw createRegexContentMatchPatternContractError(toolName, patternSummary, reason);
}

function assertRegexDoesNotProduceZeroLengthMatches(
  toolName: string,
  regex: RegExp,
  patternSummary: string,
): void {
  for (const sentinelInput of ZERO_LENGTH_SENTINEL_INPUTS) {
    resetRegexLastIndex(regex);

    const match = regex.exec(sentinelInput);

    if (match !== null && match[0].length === 0) {
      throwRegexContentMatchContractRejected(
        toolName,
        patternSummary,
        `The pattern can produce a zero-length match on sentinel input ${JSON.stringify(
          sentinelInput,
        )}.`,
      );
    }
  }

  resetRegexLastIndex(regex);
}

/**
 * Builds the canonical request-wide execution plan for one caller-supplied regex.
 *
 * @param toolName - Exact MCP tool name requesting regex execution.
 * @param pattern - Raw regex pattern supplied by the caller.
 * @param caseSensitive - Whether the resulting regex should omit the case-insensitive flag.
 * @returns Request-wide execution plan shared by lane routing and local match extraction.
 */
export function createGuardrailedSearchRegexExecutionPlan(
  toolName: string,
  pattern: string,
  caseSensitive: boolean,
): GuardrailedSearchRegexExecutionPlan {
  if (pattern.length === 0) {
    throwRegexContentMatchContractRejected(
      toolName,
      "(empty pattern)",
      "Empty regex patterns do not produce content-bearing matches for this endpoint.",
    );
  }

  const flags = resolveSearchRegexFlags(caseSensitive);
  const patternSummary = formatRegexPatternSummary(pattern, flags);
  const patternClassification = classifyPattern(pattern);

  let regex: RegExp;

  try {
    regex = new RegExp(pattern, flags);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Invalid regular expression syntax.";

    throwRegexRuntimeRejected(
      toolName,
      patternSummary,
      `Invalid regular expression syntax: ${reason}`,
    );
  }

  assertRegexDoesNotProduceZeroLengthMatches(toolName, regex, patternSummary);
  resetRegexLastIndex(regex);

  return {
    patternClassification,
    regex,
  };
}

/**
 * Compiles a caller-supplied regex into the shared low-false-positive runtime safety model.
 *
 * @param toolName - Exact MCP tool name requesting regex execution.
 * @param pattern - Raw regex pattern supplied by the caller.
 * @param caseSensitive - Whether the resulting regex should omit the case-insensitive flag.
 * @returns A compiled regex ready for guarded runtime execution.
 */
export function compileGuardrailedSearchRegex(
  toolName: string,
  pattern: string,
  caseSensitive: boolean,
): RegExp {
  return createGuardrailedSearchRegexExecutionPlan(
    toolName,
    pattern,
    caseSensitive,
  ).regex;
}

/**
 * Creates a canonical request-wide pattern-contract error when the native backend rejects the
 * caller pattern for the selected execution lane.
 *
 * @param toolName - Exact MCP tool name requesting regex execution.
 * @param pattern - Raw regex pattern supplied by the caller.
 * @param caseSensitive - Whether the resulting regex should omit the case-insensitive flag.
 * @param reason - Native-backend rejection reason.
 * @returns Request-wide regex pattern-contract error.
 */
export function createRegexBackendDialectRejectedError(
  toolName: string,
  pattern: string,
  caseSensitive: boolean,
  reason: string,
): RegexSearchPatternContractError {
  const flags = resolveSearchRegexFlags(caseSensitive);

  return createRegexSearchPatternContractError(
    toolName,
    formatRegexPatternSummary(pattern, flags),
    `Native regex backend rejected the pattern for the selected execution lane: ${reason}`,
  );
}

/**
 * Determines whether an unknown error is the canonical request-wide regex pattern-contract
 * rejection.
 *
 * @param error - Unknown failure surface.
 * @returns `true` when the error is a request-wide regex pattern-contract failure.
 */
export function isRegexSearchPatternContractError(
  error: unknown,
): error is RegexSearchPatternContractError {
  return error instanceof RegexSearchPatternContractError;
}

/**
 * Resets the stateful `lastIndex` pointer on a global regular expression before reuse.
 *
 * @param regex - Compiled regex instance that may have advanced during prior execution.
 * @returns Nothing. The function mutates `regex.lastIndex` in place.
 */
export function resetRegexLastIndex(regex: RegExp): void {
  regex.lastIndex = 0;
}

/**
 * Produces a bounded line excerpt while keeping the matched text visible whenever possible.
 *
 * @param lineContent - Full line text that contains the regex match.
 * @param matchText - Matched substring returned by regex execution.
 * @returns An excerpt no longer than the canonical regex excerpt cap.
 */
export function normalizeRegexMatchExcerpt(lineContent: string, matchText: string): string {
  if (lineContent.length <= REGEX_SEARCH_EXCERPT_MAX_CHARS) {
    return lineContent;
  }

  if (matchText.length === 0) {
    return lineContent.slice(0, REGEX_SEARCH_EXCERPT_MAX_CHARS);
  }

  const matchIndex = lineContent.indexOf(matchText);

  if (matchIndex < 0) {
    return lineContent.slice(0, REGEX_SEARCH_EXCERPT_MAX_CHARS);
  }

  if (matchText.length >= REGEX_SEARCH_EXCERPT_MAX_CHARS) {
    return lineContent.slice(matchIndex, matchIndex + REGEX_SEARCH_EXCERPT_MAX_CHARS);
  }

  const targetWidth = REGEX_SEARCH_EXCERPT_MAX_CHARS;
  const matchCenter = matchIndex + Math.floor(matchText.length / 2);

  let startIndex = Math.max(0, matchCenter - Math.floor(targetWidth / 2));
  let endIndex = startIndex + targetWidth;

  if (endIndex > lineContent.length) {
    endIndex = lineContent.length;
    startIndex = Math.max(0, endIndex - targetWidth);
  }

  return lineContent.slice(startIndex, endIndex);
}

/**
 * Enforces the runtime budget layer after structural regex validation has already succeeded.
 *
 * @param toolName - Exact MCP tool name requesting regex execution.
 * @param collectedLocations - Number of line-location results collected so far.
 * @param totalBytesScanned - Number of candidate bytes scanned so far.
 * @returns Nothing. Throws a canonical runtime-budget refusal when a cap is exceeded.
 */
export function assertRegexRuntimeBudget(
  toolName: string,
  collectedLocations: number,
  totalBytesScanned: number,
): void {
  if (collectedLocations > REGEX_SEARCH_MAX_RESULTS_HARD_CAP) {
    throw new Error(
      formatToolGuardrailFailureAsText(
        createRuntimeBudgetExceededFailure({
          toolName,
          budgetSurface: "regex match locations collected",
          measuredValue: collectedLocations,
          limitValue: REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
        }),
      ),
    );
  }

  if (totalBytesScanned > REGEX_SEARCH_MAX_CANDIDATE_BYTES) {
    throw new Error(
      formatToolGuardrailFailureAsText(
        createRuntimeBudgetExceededFailure({
          toolName,
          budgetSurface: "regex candidate bytes scanned",
          measuredValue: totalBytesScanned,
          limitValue: REGEX_SEARCH_MAX_CANDIDATE_BYTES,
        }),
      ),
    );
  }
}
