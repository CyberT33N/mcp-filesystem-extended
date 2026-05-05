import { assertCandidateByteBudget, type FilesystemPreflightEntry } from "@domain/shared/guardrails/filesystem-preflight";
import { REGEX_SEARCH_MAX_RESULTS_HARD_CAP } from "@domain/shared/guardrails/tool-guardrail-limits";
import {
  INSPECTION_CONTENT_OPERATION_LITERALS,
  resolveInspectionContentOperationCapability,
} from "@domain/shared/search/inspection-content-state";
import { type SearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import { readDecodedInspectionTextFile } from "@infrastructure/filesystem/text-read-core";
import { buildUgrepCommand } from "@infrastructure/search/ugrep-command-builder";
import { formatUgrepSpawnFailure, runUgrepSearch } from "@infrastructure/search/ugrep-runner";

import { type FixedStringSearchAggregateBudgetState } from "./fixed-string-search-aggregate-budget-state";
import {
  collectFixedStringLineMatches,
  createFixedStringPatternClassification,
  matchesIncludedFilePatterns,
  parseUgrepMatchLine,
  resolveTextEligibility,
  sanitizeFixedStringMatchContent,
} from "./fixed-string-search-support";
import { SEARCH_FILE_CONTENTS_BY_FIXED_STRING_TOOL_NAME } from "./schema";
import { type FixedStringSearchMatch } from "./search-fixed-string-result";

function collectFixedStringMatchesFromDecodedText(
  candidateEntry: FilesystemPreflightEntry,
  fixedString: string,
  caseSensitive: boolean,
  content: string,
  maxAdditionalResults: number,
  matchesToSkipBeforeCollecting: number,
): {
  matches: FixedStringSearchMatch[];
  totalMatches: number;
  truncated: boolean;
} {
  const matches: FixedStringSearchMatch[] = [];
  let totalMatches = 0;
  let truncated = false;
  let remainingMatchesToSkip = matchesToSkipBeforeCollecting;
  const lines = content.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const lineContent = lines[index] ?? "";

    for (const matchedText of collectFixedStringLineMatches(
      lineContent,
      fixedString,
      caseSensitive,
    )) {
      if (remainingMatchesToSkip > 0) {
        remainingMatchesToSkip -= 1;
        continue;
      }

      totalMatches += 1;
      matches.push({
        content: sanitizeFixedStringMatchContent(
          lineContent,
          matchedText,
          true,
        ),
        file: candidateEntry.requestedPath,
        line: index + 1,
        match: matchedText,
      });

      if (matches.length >= maxAdditionalResults) {
        truncated = true;
        break;
      }
    }

    if (truncated) {
      break;
    }
  }

  return {
    matches,
    totalMatches,
    truncated,
  };
}

/**
 * Collects fixed-string matches from one validated file entry while preserving aggregate budgets,
 * hybrid-lane routing, and caller-safe excerpt shaping.
 *
 * @param candidateEntry - Validated preflight entry for the current file candidate.
 * @param candidateRelativePath - Candidate path relative to the requested root surface.
 * @param fixedString - Exact literal string supplied by the caller.
 * @param filePatterns - Include globs that narrow candidate file names before content scanning.
 * @param caseSensitive - Whether literal matching should preserve caller case sensitivity.
 * @param executionPolicy - Shared runtime execution policy for the current request.
 * @param aggregateBudgetState - Request-level aggregate candidate-byte accounting surface.
 * @param enforceAggregateCandidateByteBudget - Whether recursive aggregate candidate-byte governance applies to this file search call.
 * @param refuseUnsupportedFileScope - Whether unsupported file scopes should raise instead of skipping.
 * @param maxAdditionalResults - Remaining location budget for the current root.
 * @param totalBytesScannedBeforeRead - Root-local candidate-byte accounting before this file is processed.
 * @returns Structured fixed-string match data for the current validated file candidate.
 */
export async function collectFixedStringMatchesFromFileEntry(
  candidateEntry: FilesystemPreflightEntry,
  candidateRelativePath: string,
  fixedString: string,
  filePatterns: string[],
  caseSensitive: boolean,
  executionPolicy: SearchExecutionPolicy,
  aggregateBudgetState: FixedStringSearchAggregateBudgetState,
  enforceAggregateCandidateByteBudget: boolean,
  refuseUnsupportedFileScope: boolean,
  maxAdditionalResults: number,
  matchesToSkipBeforeCollecting: number,
  totalBytesScannedBeforeRead: number,
): Promise<{
  matches: FixedStringSearchMatch[];
  fileSearched: boolean;
  totalMatches: number;
  totalBytesScanned: number;
  truncated: boolean;
}> {
  if (!matchesIncludedFilePatterns(candidateRelativePath, filePatterns)) {
    return {
      matches: [],
      fileSearched: false,
      totalMatches: 0,
      totalBytesScanned: totalBytesScannedBeforeRead,
      truncated: false,
    };
  }

  const nextTotalBytesScanned = totalBytesScannedBeforeRead + candidateEntry.size;
  const nextAggregateBytesScanned = aggregateBudgetState.totalCandidateBytesScanned + candidateEntry.size;

  if (enforceAggregateCandidateByteBudget) {
    assertCandidateByteBudget(
      SEARCH_FILE_CONTENTS_BY_FIXED_STRING_TOOL_NAME,
      nextAggregateBytesScanned,
      executionPolicy.fixedStringServiceHardGapBytes,
      `fixed-string aggregate candidate bytes before reading ${candidateEntry.requestedPath}`,
    );

    aggregateBudgetState.totalCandidateBytesScanned = nextAggregateBytesScanned;
  }

  const textEligibility = await resolveTextEligibility(candidateEntry.validPath, candidateEntry.size);
  const searchCapability = resolveInspectionContentOperationCapability(
    textEligibility,
    INSPECTION_CONTENT_OPERATION_LITERALS.SEARCH_TEXT,
  );

  if (!searchCapability.isAllowed) {
    if (refuseUnsupportedFileScope) {
      throw new Error(searchCapability.reason);
    }

    return {
      matches: [],
      fileSearched: false,
      totalMatches: 0,
      totalBytesScanned: nextTotalBytesScanned,
      truncated: false,
    };
  }

  if (maxAdditionalResults <= 0) {
    return {
      matches: [],
      fileSearched: true,
      totalMatches: 0,
      totalBytesScanned: nextTotalBytesScanned,
      truncated: true,
    };
  }

  const previewFirstTriggered = nextAggregateBytesScanned > executionPolicy.fixedStringSyncCandidateBytesCap;
  const effectiveLocationCap = previewFirstTriggered
    ? Math.max(
        1,
        Math.min(
          maxAdditionalResults,
          Math.floor(
            REGEX_SEARCH_MAX_RESULTS_HARD_CAP * executionPolicy.previewFirstResponseCapFraction,
          ),
        ),
      )
    : maxAdditionalResults;

  if (searchCapability.requiresDecodedTextFallback) {
    const decodedTextFile = await readDecodedInspectionTextFile(
      candidateEntry.validPath,
      textEligibility.resolvedTextEncoding,
    );
    const decodedTextSearchResult = collectFixedStringMatchesFromDecodedText(
      candidateEntry,
      fixedString,
      caseSensitive,
      decodedTextFile.content,
      effectiveLocationCap,
      matchesToSkipBeforeCollecting,
    );

    return {
      matches: decodedTextSearchResult.matches,
      fileSearched: true,
      totalMatches: decodedTextSearchResult.totalMatches,
      totalBytesScanned: nextTotalBytesScanned,
      truncated: decodedTextSearchResult.truncated,
    };
  }
  const command = buildUgrepCommand({
    patternClassification: createFixedStringPatternClassification(fixedString),
    executionPolicy,
    candidatePath: candidateEntry.validPath,
    caseSensitive,
    maxCount: effectiveLocationCap,
  });
  const executionResult = await runUgrepSearch(command);

  if (executionResult.spawnErrorMessage !== null) {
    throw new Error(formatUgrepSpawnFailure(executionResult));
  }

  if (executionResult.timedOut) {
    throw new Error("Native search runner timed out before completion.");
  }

  if (executionResult.exitCode !== null && executionResult.exitCode > 1) {
    const runtimeError = executionResult.stderr.trim();

    throw new Error(
      runtimeError === ""
        ? `Native search backend exited with code ${executionResult.exitCode}.`
        : runtimeError,
    );
  }

  if (executionResult.exitCode === 1 || executionResult.stdout.trim() === "") {
    return {
      matches: [],
      fileSearched: true,
      totalMatches: 0,
      totalBytesScanned: nextTotalBytesScanned,
      truncated: false,
    };
  }

  const matches: FixedStringSearchMatch[] = [];
  let totalMatches = 0;
  let truncated = false;
  let remainingMatchesToSkip = matchesToSkipBeforeCollecting;
  const matchedLines = executionResult.stdout
    .split(/\r?\n/u)
    .filter((outputLine) => outputLine.trim() !== "");

  for (const matchedLine of matchedLines) {
    const parsedLine = parseUgrepMatchLine(matchedLine);

    if (parsedLine === null) {
      continue;
    }

    for (const matchedText of collectFixedStringLineMatches(
      parsedLine.lineContent,
      fixedString,
      caseSensitive,
    )) {
      if (remainingMatchesToSkip > 0) {
        remainingMatchesToSkip -= 1;
        continue;
      }

      totalMatches += 1;
        matches.push({
          file: parsedLine.file,
          line: parsedLine.line,
          content: sanitizeFixedStringMatchContent(
            parsedLine.lineContent,
            matchedText,
            false,
          ),
          match: matchedText,
        });

      if (matches.length >= effectiveLocationCap) {
        truncated = true;
        break;
      }
    }

    if (truncated) {
      break;
    }
  }

  return {
    matches,
    fileSearched: true,
    totalMatches,
    totalBytesScanned: nextTotalBytesScanned,
    truncated,
  };
}
