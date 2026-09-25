import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import {
  formatInspectionPreviewChunkTextBlock,
  formatInspectionTerminalCompletionTextBlock,
  INSPECTION_RESUME_ADMISSION_OUTCOMES,
  INSPECTION_RESUME_MODES,
  type InspectionResumeAdmission,
  type InspectionResumeMetadata,
  type InspectionResumeMode,
} from "@domain/shared/resume/inspection-resume-contract";
import {
  GLOBAL_RESPONSE_HARD_CAP_CHARS,
  REGEX_SEARCH_RESPONSE_CAP_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

import {
  formatSearchStopStateLine,
  isSearchMaxResultsLimitReached,
  type SearchStopReason,
} from "../search-stop-state";
import {
  collectSearchAliasFileGroupAttributions,
  formatSearchAliasReferenceEvents,
  type SearchAliasReferenceEvent,
} from "../search-alias-attribution";
import {
  formatSearchCompletionSummaryLine,
  type SearchSessionDeliverySummary,
} from "../search-session-delivery";

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

  /**
   * Alias display paths accumulated for the canonical file that produced this match.
   *
   * @remarks
   * Present only when the session already registered symbolic links that reference the
   * canonical file. The match itself is delivered exactly once; aliases never re-deliver it.
   */
  attributedAliases?: string[];
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

  /**
   * Canonical bounded-stop reason when the current root stopped early without becoming a failure.
   */
  stopReason: SearchStopReason | null;

  /**
   * Caller-visible explanation for the current bounded-stop state.
   */
  stopMessage: string | null;

  /**
   * Alias-reference events fired while traversing the root during the current pass.
   *
   * @remarks
   * Absent when no alias event fired. Symbolic links are never followed into content, but
   * their references stay visible as first-class session information.
   */
  aliasReferences?: SearchAliasReferenceEvent[];
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

  /**
   * Session-cumulative delivery truth for the current response.
   *
   * @remarks
   * On resume passes the per-root payloads stay frontier-scoped; this summary carries how many
   * matches and locations the session already delivered and delivers in total, so no pass ever
   * has to present its delta as the absolute session result.
   */
  sessionDelivery: SearchSessionDeliverySummary;

  admission: InspectionResumeAdmission;
  resume: InspectionResumeMetadata;
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
    let output = `No matches found for regex: ${pattern}\nSearched ${result.filesSearched} files`;
    const stopStateLine = formatSearchStopStateLine(result);

    if (stopStateLine !== null) {
      output += `\n${stopStateLine}`;
    }

    const aliasReferenceBlock = formatSearchAliasReferenceEvents(result.aliasReferences ?? []);

    if (aliasReferenceBlock !== null) {
      output += `\n${aliasReferenceBlock}`;
    }

    return output;
  }

  let output = `Found ${result.totalMatches} matches in ${result.matches.length} locations`;

  if (result.truncated && isSearchMaxResultsLimitReached(result.stopReason)) {
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

    const fileGroupAttributions = collectSearchAliasFileGroupAttributions(fileResults);

    if (fileGroupAttributions.length > 0) {
      output += `  Also referenced by aliases: ${fileGroupAttributions.join(", ")}\n`;
    }

    output += "\n";
  }

  const aliasReferenceBlock = formatSearchAliasReferenceEvents(result.aliasReferences ?? []);

  if (aliasReferenceBlock !== null) {
    output += `${aliasReferenceBlock}\n`;
  }

  const stopStateLine = formatSearchStopStateLine(result);

  if (stopStateLine !== null) {
    output += `${stopStateLine}\n`;
  }

  return output.trimEnd();
}

function formatSearchRegexPreviewPathOutput(
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
    const aliasReferenceBlock = formatSearchAliasReferenceEvents(result.aliasReferences ?? []);

    return [
      `No matches reached yet for regex: ${pattern} in this bounded preview slice`,
      `Searched ${result.filesSearched} files in this bounded preview slice`,
      ...(aliasReferenceBlock === null ? [] : [aliasReferenceBlock]),
    ].join("\n");
  }

  let output = `Found ${result.totalMatches} matches in ${result.matches.length} locations`;

  if (result.truncated && isSearchMaxResultsLimitReached(result.stopReason)) {
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

    const fileGroupAttributions = collectSearchAliasFileGroupAttributions(fileResults);

    if (fileGroupAttributions.length > 0) {
      output += `  Also referenced by aliases: ${fileGroupAttributions.join(", ")}\n`;
    }

    output += "\n";
  }

  const aliasReferenceBlock = formatSearchAliasReferenceEvents(result.aliasReferences ?? []);

  if (aliasReferenceBlock !== null) {
    output += `${aliasReferenceBlock}\n`;
  }

  return output.trimEnd();
}

/**
 * Formats one root-local regex delta of a continuation pass into the public text response surface.
 *
 * @remarks
 * Continuation passes deliver only the frontier delta of a persisted preview-first session. This
 * formatter keeps the wording completion-scoped so the delta is never presented as the absolute
 * session result — the defect class behind the reported false negative.
 *
 * @param result - Structured regex delta for one continued search scope.
 * @param pattern - Raw regex pattern restored from the persisted request context.
 * @param effectiveMaxResults - Effective hard-capped result limit applied by the handler.
 * @returns Human-readable text output for the current root delta.
 */
export function formatSearchRegexCompletionDeltaPathOutput(
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
    let output = `No additional matches found for regex: ${pattern} in this completion pass\nSearched ${result.filesSearched} files in this completion pass`;
    const stopStateLine = formatSearchStopStateLine(result);

    if (stopStateLine !== null) {
      output += `\n${stopStateLine}`;
    }

    const aliasReferenceBlock = formatSearchAliasReferenceEvents(result.aliasReferences ?? []);

    if (aliasReferenceBlock !== null) {
      output += `\n${aliasReferenceBlock}`;
    }

    return output;
  }

  let output = `Found ${result.totalMatches} additional matches in ${result.matches.length} locations in this completion pass`;

  if (result.truncated && isSearchMaxResultsLimitReached(result.stopReason)) {
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

    const fileGroupAttributions = collectSearchAliasFileGroupAttributions(fileResults);

    if (fileGroupAttributions.length > 0) {
      output += `  Also referenced by aliases: ${fileGroupAttributions.join(", ")}\n`;
    }

    output += "\n";
  }

  const aliasReferenceBlock = formatSearchAliasReferenceEvents(result.aliasReferences ?? []);

  if (aliasReferenceBlock !== null) {
    output += `${aliasReferenceBlock}\n`;
  }

  const stopStateLine = formatSearchStopStateLine(result);

  if (stopStateLine !== null) {
    output += `${stopStateLine}\n`;
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
  const hasResumableContinuation =
    result.resume.resumable
    && result.resume.resumeToken !== null;
  const continuationPass = result.sessionDelivery.continuationPass;
  const previewSliceIsActive =
    result.admission.outcome === INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST
    && hasResumableContinuation;

  // Pure inline base responses keep the absolute verdict wording. Every continuation pass is
  // frontier-delta-scoped by contract and must never present its delta as the session result.
  if (!continuationPass && !hasResumableContinuation) {
    return formatSearchRegexResultOutput(result, pattern, effectiveMaxResults);
  }

  // Always emit the full match data first — content.text must be the complete primary information
  // carrier regardless of delivery mode. Text-only consumers must never depend on structuredContent
  // to obtain result data. See conventions/mcp-response-contract/structured-content-contract.md.
  const emptyRootResult: SearchRegexPathResult = {
    root: "",
    matches: [],
    filesSearched: 0,
    totalMatches: 0,
    truncated: false,
    error: null,
    stopReason: null,
    stopMessage: null,
  };
  const fullOutput = previewSliceIsActive
    ? (
        result.roots.length === 1
          ? formatSearchRegexPreviewPathOutput(
              result.roots[0] ?? emptyRootResult,
              pattern,
              effectiveMaxResults,
            )
          : result.roots
              .map((rootResult) =>
                formatSearchRegexPreviewPathOutput(rootResult, pattern, effectiveMaxResults)
              )
              .join("\n\n")
      )
    : (
        result.roots.length === 1
          ? formatSearchRegexCompletionDeltaPathOutput(
              result.roots[0] ?? emptyRootResult,
              pattern,
              effectiveMaxResults,
            )
          : result.roots
              .map((rootResult) =>
                formatSearchRegexCompletionDeltaPathOutput(rootResult, pattern, effectiveMaxResults)
              )
              .join("\n\n")
      );

  if (hasResumableContinuation) {
    // Append the continuation guidance block after the full match data so text-only consumers
    // receive both the complete result and the resume instructions in one content.text surface.
    const rootLabel = result.roots.length === 1 ? "root" : "roots";
    const zeroMatchesClarification = result.totalMatches === 0
      ? " No matches found in this chunk — more files may still be pending in the remaining traversal frontier."
      : "";
    const previewSummary =
      result.admission.outcome === INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED
        ? `Regex-search completion progress is available for ${result.roots.length} ${rootLabel} with ${result.totalMatches} matches in this bounded chunk.${zeroMatchesClarification}`
        : `Regex-search preview is available for ${result.roots.length} ${rootLabel} with ${result.totalMatches} matches already reached in this bounded preview slice.${zeroMatchesClarification}`;

    const continuationBlock = formatInspectionPreviewChunkTextBlock(
      result.admission,
      result.resume,
      previewSummary,
      "Resume the same regex-search request by sending only resumeToken with resumeMode='next-chunk' to the same endpoint to receive the next bounded chunk of matches.",
    );

    return `${fullOutput}\n\n${continuationBlock}`;
  }

  // Terminal continuation pass: the session is complete and no longer resumable, so the response
  // closes with the session-cumulative summary and the additive continuation guidance. A terminal
  // pass carrying a permanent root failure closes the session truthfully instead — never framed
  // as a completed traversal.
  const firstFailedRootError = result.roots.find(
    (root) => root !== undefined && root.error !== null,
  )?.error ?? null;
  const completionSummary = firstFailedRootError === null
    ? formatSearchCompletionSummaryLine(
        "Regex-search",
        result.roots.length,
        {
          matchCount: result.totalMatches,
          locationCount: result.totalLocations,
        },
        result.sessionDelivery,
      )
    : `Regex-search session closed without completing: a permanent root failure ended the session and the persisted frontier cannot continue. First failure: ${firstFailedRootError} Start a new request to search the same scope again.`;

  return `${fullOutput}\n\n${formatInspectionTerminalCompletionTextBlock(result.admission, completionSummary)}`;
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
  requestedResumeMode: InspectionResumeMode | null,
): string {
  // In complete-result mode the caller has explicitly contracted for a full server-owned completion
  // attempt via the resume-session protocol. Applying the family cap in this mode would block a
  // valid completion response. The global fuse at GLOBAL_RESPONSE_HARD_CAP_CHARS is the only
  // correct ceiling for complete-result responses. See conventions/guardrails/overview.md Layer 5.
  const isCompleteResultMode = requestedResumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT;
  const effectiveCap = isCompleteResultMode
    ? GLOBAL_RESPONSE_HARD_CAP_CHARS
    : REGEX_SEARCH_RESPONSE_CAP_CHARS;

  assertActualTextBudget(
    toolName,
    formattedOutput.length,
    effectiveCap,
    "Regex search response exceeds the effective search-family cap.",
  );

  return formattedOutput;
}
