import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import {
  INSPECTION_CONTINUATION_ADMISSION_OUTCOMES,
  type InspectionContinuationAdmission,
  type InspectionContinuationMetadata,
} from "@domain/shared/continuation/inspection-continuation-contract";
import { REGEX_SEARCH_RESPONSE_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";

/**
 * Describes one collected regex match location.
 *
 * @remarks
 * The regex endpoint emits one structured match payload per collected location so text and
 * structured result surfaces can share the same normalized excerpt model.
 */
export interface RegexSearchMatch {
  /**
   * Validated file path that produced the reported match.
   */
  file: string;

  /**
   * 1-based line number associated with the emitted excerpt.
   */
  line: number;

  /**
   * Normalized line excerpt that keeps the match visible whenever possible.
   */
  content: string;

  /**
   * Exact substring matched by the regex engine.
   */
  match: string;
}

/**
 * Describes the structured regex-search result for one validated search scope.
 *
 * @remarks
 * This result stays endpoint-specific because it preserves the regex tool contract for one
 * caller-supplied root while exposing match locations, file counts, and truncation state.
 */
export interface SearchRegexPathResult {
  /**
   * Original search scope path supplied by the caller.
   */
  root: string;

  /**
   * Collected match locations that survived runtime guardrail enforcement.
   */
  matches: RegexSearchMatch[];

  /**
   * Number of candidate files examined under the root while budgets permitted scanning.
   */
  filesSearched: number;

  /**
   * Number of regex matches encountered before truncation or traversal completion.
   */
  totalMatches: number;

  /**
   * Indicates whether result collection stopped early because the effective result limit was reached.
   */
  truncated: boolean;

  /**
   * Root-local refusal or operational failure captured without collapsing the whole batch surface.
   */
  error: string | null;
}

/**
 * Describes the structured regex-search result across all requested roots.
 *
 * @remarks
 * The batch result preserves per-root runtime fuse outcomes so callers can inspect direct-file
 * and guarded-directory search behavior through one structured surface.
 */
export interface SearchRegexResult {
  /**
   * Per-root structured results in caller-supplied order.
   */
  roots: SearchRegexPathResult[];

  /**
   * Total number of collected match locations across all roots.
   */
  totalLocations: number;

  /**
   * Total number of matches encountered across all roots.
   */
  totalMatches: number;

  /**
   * Indicates whether any root result stopped early because the effective result limit was reached.
   */
  truncated: boolean;

  admission: InspectionContinuationAdmission;
  continuation: InspectionContinuationMetadata;
}

/**
 * Formats one root-local regex result into the public text response surface.
 *
 * @param result - Structured regex result for one validated search scope.
 * @param pattern - Raw regex pattern supplied by the caller.
 * @param effectiveMaxResults - Effective hard-capped result limit applied by the handler.
 * @returns Human-readable text output for the current root.
 */
export function formatSearchRegexPathOutput(
  result: SearchRegexPathResult,
  pattern: string,
  effectiveMaxResults: number,
): string {
  if (result.error !== null) {
    if (result.error.startsWith("Preview-first traversal for root ")) {
      return result.error;
    }

    return `Regex search failed for root ${result.root}: ${result.error}`;
  }

  if (result.matches.length === 0) {
    return `No matches found for regex: ${pattern}\nSearched ${result.filesSearched} files`;
  }

  let output = `Found ${result.totalMatches} matches in ${result.matches.length} locations`;

  if (result.truncated) {
    output += ` (limited to ${effectiveMaxResults} results)`;
  }

  output += "\n\n";

  const fileGroups = new Map<string, RegexSearchMatch[]>();

  for (const match of result.matches) {
    if (!fileGroups.has(match.file)) {
      fileGroups.set(match.file, []);
    }

    fileGroups.get(match.file)?.push(match);
  }

  for (const [file, fileResults] of fileGroups.entries()) {
    output += `File: ${file}\n`;

    for (const fileResult of fileResults) {
      output += `  Line ${fileResult.line}: ${fileResult.content}\n`;
    }

    output += "\n";
  }

  return output.trimEnd();
}

/**
 * Formats the structured regex-search result into the public text response surface.
 *
 * @param result - Structured regex-search result across all requested roots.
 * @param pattern - Raw regex pattern supplied by the caller.
 * @param effectiveMaxResults - Effective hard-capped result limit applied by the handler.
 * @returns Human-readable text output for the full regex request.
 */
export function formatSearchRegexResultOutput(
  result: SearchRegexResult,
  pattern: string,
  effectiveMaxResults: number,
): string {
  if (result.roots.length === 1) {
    const firstRootResult = result.roots[0];

    if (firstRootResult === undefined) {
      throw new Error("Expected one root result for regex-search formatting.");
    }

    return formatSearchRegexPathOutput(firstRootResult, pattern, effectiveMaxResults);
  }

  return result.roots
    .map((rootResult) => formatSearchRegexPathOutput(rootResult, pattern, effectiveMaxResults))
    .join("\n\n");
}

/**
 * Formats the regex-search result into a continuation-aware caller-visible text surface.
 *
 * @param result - Structured regex-search result across all requested roots.
 * @param pattern - Raw regex pattern supplied by the caller.
 * @param effectiveMaxResults - Effective hard-capped result limit applied by the handler.
 * @returns Compact guidance when continuation remains active; otherwise the normal formatted output.
 */
export function formatSearchRegexContinuationAwareTextOutput(
  result: SearchRegexResult,
  pattern: string,
  effectiveMaxResults: number,
): string {
  if (result.admission.outcome !== INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST) {
    return formatSearchRegexResultOutput(result, pattern, effectiveMaxResults);
  }

  const rootLabel = result.roots.length === 1 ? "root" : "roots";

  return [
    `Regex-search preview is available for ${result.roots.length} ${rootLabel} with ${result.totalMatches} matches in this bounded chunk.`,
    result.admission.guidanceText
      ?? "Resume the same regex-search request by sending only continuationToken to the same endpoint to receive the next bounded chunk of matches.",
    "The authoritative match payload remains in structuredContent.",
    "Resume the same request by sending only continuationToken on this endpoint.",
  ].join("\n");
}

/**
 * Enforces the formatted text-response budget for the regex-search family.
 *
 * @param toolName - Exact MCP tool name that owns the formatted response.
 * @param formattedOutput - Final serialized text output for the regex response surface.
 * @returns The unchanged formatted output when the family budget is respected.
 */
export function assertFormattedRegexResponseBudget(
  toolName: string,
  formattedOutput: string,
): string {
  assertActualTextBudget(
    toolName,
    formattedOutput.length,
    REGEX_SEARCH_RESPONSE_CAP_CHARS,
    "Regex search response exceeds the regex-search family cap.",
  );

  return formattedOutput;
}
