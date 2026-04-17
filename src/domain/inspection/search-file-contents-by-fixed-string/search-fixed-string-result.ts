import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import { REGEX_SEARCH_RESPONSE_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";

/**
 * Describes one collected fixed-string match location.
 */
export interface FixedStringSearchMatch {
  /**
   * Validated file path that produced the reported match.
   */
  file: string;

  /**
   * 1-based line number associated with the emitted excerpt.
   */
  line: number;

  /**
   * Normalized line excerpt that keeps the matched literal visible whenever possible.
   */
  content: string;

  /**
   * Exact substring matched by the fixed-string search engine.
   */
  match: string;
}

/**
 * Describes the structured fixed-string result for one validated search scope.
 */
export interface SearchFixedStringPathResult {
  /**
   * Original search scope path supplied by the caller.
   */
  root: string;

  /**
   * Collected match locations that survived runtime guardrail enforcement.
   */
  matches: FixedStringSearchMatch[];

  /**
   * Number of candidate files examined under the root while budgets permitted scanning.
   */
  filesSearched: number;

  /**
   * Number of fixed-string matches encountered before truncation or traversal completion.
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
 * Describes the structured fixed-string result across all requested roots.
 */
export interface SearchFixedStringResult {
  /**
   * Per-root structured results in caller-supplied order.
   */
  roots: SearchFixedStringPathResult[];

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
}

/**
 * Formats one root-local fixed-string result into the public text response surface.
 *
 * @param result - Structured fixed-string result for one validated search scope.
 * @param fixedString - Exact literal string supplied by the caller.
 * @param effectiveMaxResults - Effective hard-capped result limit applied by the handler.
 * @returns Human-readable text output for the current root.
 */
export function formatSearchFixedStringPathOutput(
  result: SearchFixedStringPathResult,
  fixedString: string,
  effectiveMaxResults: number,
): string {
  if (result.error !== null) {
    return `Fixed-string search failed for root ${result.root}: ${result.error}`;
  }

  if (result.matches.length === 0) {
    return `No matches found for fixed string: ${fixedString}\nSearched ${result.filesSearched} files`;
  }

  let output = `Found ${result.totalMatches} matches in ${result.matches.length} locations`;

  if (result.truncated) {
    output += ` (limited to ${effectiveMaxResults} results)`;
  }

  output += "\n\n";

  const fileGroups = new Map<string, FixedStringSearchMatch[]>();

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
 * Enforces the formatted text-response budget for the fixed-string search family surface.
 *
 * @param toolName - Exact MCP tool name that owns the formatted response.
 * @param formattedOutput - Final serialized text output for the fixed-string response surface.
 * @returns The unchanged formatted output when the family budget is respected.
 */
export function assertFormattedFixedStringResponseBudget(
  toolName: string,
  formattedOutput: string,
): string {
  assertActualTextBudget(
    toolName,
    formattedOutput.length,
    REGEX_SEARCH_RESPONSE_CAP_CHARS,
    "Fixed-string search response exceeds the shared search-family cap.",
  );

  return formattedOutput;
}
