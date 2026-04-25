import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import {
  formatInspectionPreviewChunkTextBlock,
  INSPECTION_RESUME_ADMISSION_OUTCOMES,
  type InspectionResumeAdmission,
  type InspectionResumeMetadata,
} from "@domain/shared/resume/inspection-resume-contract";
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

  admission: InspectionResumeAdmission;
  resume: InspectionResumeMetadata;
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
    if (result.error.startsWith("Preview-first traversal for root ")) {
      return result.error;
    }

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
 * Formats the structured fixed-string search result into the public text response surface.
 *
 * @param result - Structured fixed-string search result across all requested roots.
 * @param fixedString - Exact literal string supplied by the caller.
 * @param effectiveMaxResults - Effective hard-capped result limit applied by the handler.
 * @returns Human-readable text output for the full fixed-string request.
 */
export function formatSearchFixedStringResultOutput(
  result: SearchFixedStringResult,
  fixedString: string,
  effectiveMaxResults: number,
): string {
  if (result.roots.length === 1) {
    const firstRootResult = result.roots[0];

    if (firstRootResult === undefined) {
      throw new Error("Expected one root result for fixed-string formatting.");
    }

    return formatSearchFixedStringPathOutput(firstRootResult, fixedString, effectiveMaxResults);
  }

  return result.roots
    .map((rootResult) => formatSearchFixedStringPathOutput(rootResult, fixedString, effectiveMaxResults))
    .join("\n\n");
}

/**
 * Formats the fixed-string search result into a continuation-aware caller-visible text surface.
 *
 * @param result - Structured fixed-string search result across all requested roots.
 * @param fixedString - Exact literal string supplied by the caller.
 * @param effectiveMaxResults - Effective hard-capped result limit applied by the handler.
 * @returns Compact guidance when continuation remains active; otherwise the normal formatted output.
 */
export function formatSearchFixedStringContinuationAwareTextOutput(
  result: SearchFixedStringResult,
  fixedString: string,
  effectiveMaxResults: number,
): string {
  const hasResumableContinuation =
    result.resume.resumable
    && result.resume.resumeToken !== null;

  if (result.admission.outcome === INSPECTION_RESUME_ADMISSION_OUTCOMES.INLINE || !hasResumableContinuation) {
    return formatSearchFixedStringResultOutput(result, fixedString, effectiveMaxResults);
  }

  const rootLabel = result.roots.length === 1 ? "root" : "roots";
  const zeroMatchesClarification = result.totalMatches === 0
    ? " No matches found in this chunk — more files may still be pending in the remaining traversal frontier."
    : "";
  const previewSummary =
    result.admission.outcome === INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED
      ? `Fixed-string-search completion progress is available for ${result.roots.length} ${rootLabel} with ${result.totalMatches} matches in this bounded chunk.${zeroMatchesClarification}`
      : `Fixed-string-search preview is available for ${result.roots.length} ${rootLabel} with ${result.totalMatches} matches in this bounded chunk.${zeroMatchesClarification}`;

  return formatInspectionPreviewChunkTextBlock(
    result.admission,
    result.resume,
    previewSummary,
    "Resume the same fixed-string-search request by sending only resumeToken with resumeMode='next-chunk' to the same endpoint to receive the next bounded chunk of matches.",
  );
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
