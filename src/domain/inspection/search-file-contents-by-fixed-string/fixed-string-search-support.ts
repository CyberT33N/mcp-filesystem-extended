import fs from "fs/promises";
import path from "path";

import {
  assertExpectedFileTypes,
  collectValidatedFilesystemPreflightEntries,
  type FilesystemPreflightEntry,
} from "@domain/shared/guardrails/filesystem-preflight";
import { normalizeRegexMatchExcerpt } from "@domain/shared/guardrails/regex-search-safety";
import {
  PATTERN_CLASSIFICATION_LITERALS,
  type PatternClassification,
} from "@domain/shared/search/pattern-classifier";
import {
  classifyTextBinarySurface,
  type TextBinaryClassification,
} from "@domain/shared/search/text-binary-classifier";
import { minimatch } from "minimatch";

import { type SearchFixedStringPathResult } from "./search-fixed-string-result";

const SEARCH_FIXED_STRING_TOOL_NAME = "search_file_contents_by_fixed_string";
const TEXT_BINARY_PROBE_SAMPLE_BYTES = 4_096;

/**
 * Creates the canonical literal pattern classification for fixed-string search.
 *
 * @param fixedString - Exact literal string supplied by the caller.
 * @returns Fixed-string-oriented shared pattern classification output.
 */
export function createFixedStringPatternClassification(fixedString: string): PatternClassification {
  return {
    classification: PATTERN_CLASSIFICATION_LITERALS.literal,
    originalPattern: fixedString,
    requiresPcre2: false,
    supportsLiteralFastPath: true,
  };
}

/**
 * Checks whether one candidate path remains inside the requested include-glob surface.
 *
 * @param candidateRelativePath - Candidate path relative to the validated search root.
 * @param filePatterns - Include globs applied before fixed-string content scanning.
 * @returns `true` when the candidate path should remain eligible for scanning.
 */
export function matchesIncludedFilePatterns(candidateRelativePath: string, filePatterns: string[]): boolean {
  if (filePatterns.length === 0) {
    return true;
  }

  const normalizedCandidateRelativePath = candidateRelativePath.split(path.sep).join("/");
  const fileName = path.basename(normalizedCandidateRelativePath);

  return filePatterns.some((filePattern) => {
    const normalizedFilePattern = filePattern.split(path.sep).join("/");

    if (normalizedFilePattern.includes("/")) {
      return minimatch(normalizedCandidateRelativePath, normalizedFilePattern, {
        dot: true,
        nocase: true,
      });
    }

    return minimatch(fileName, normalizedFilePattern, { dot: true, nocase: true });
  });
}

async function readTextBinaryProbeSample(candidatePath: string): Promise<Uint8Array | null> {
  let fileHandle;

  try {
    fileHandle = await fs.open(candidatePath, "r");
  } catch {
    return null;
  }

  try {
    const probeBuffer = Buffer.alloc(TEXT_BINARY_PROBE_SAMPLE_BYTES);
    const { bytesRead } = await fileHandle.read(probeBuffer, 0, probeBuffer.length, 0);

    return probeBuffer.subarray(0, bytesRead);
  } finally {
    await fileHandle.close();
  }
}

/**
 * Resolves the shared text-eligibility classification for one concrete file surface.
 *
 * @param candidatePath - Concrete candidate file path passed to the fixed-string search lane.
 * @param candidateFileBytes - Total file size used for the shared content-state classifier.
 * @returns Shared text-versus-binary classification enriched with sampled evidence when available.
 */
export async function resolveTextEligibility(
  candidatePath: string,
  candidateFileBytes: number,
): Promise<TextBinaryClassification> {
  const initialClassification = classifyTextBinarySurface({
    candidatePath,
    candidateFileBytes,
  });
  const contentSample = await readTextBinaryProbeSample(candidatePath);

  if (contentSample === null) {
    return initialClassification;
  }

  return classifyTextBinarySurface({
    candidatePath,
    candidateFileBytes,
    contentSample,
  });
}

/**
 * Parses one raw `ugrep` output line into file, line, and content components.
 *
 * @param outputLine - One raw line emitted by the native search backend.
 * @returns Parsed line metadata when the backend output stayed structurally valid.
 */
export function parseUgrepMatchLine(outputLine: string): {
  file: string;
  line: number;
  lineContent: string;
} | null {
  const parsedLine = /^(.*):(\d+):(.*)$/.exec(outputLine);

  if (parsedLine === null) {
    return null;
  }

  const file = parsedLine[1] ?? "";
  const lineNumberText = parsedLine[2] ?? "0";
  const lineContent = parsedLine[3] ?? "";
  const line = Number.parseInt(lineNumberText, 10);

  if (!Number.isInteger(line) || line <= 0) {
    return null;
  }

  return {
    file,
    line,
    lineContent,
  };
}

/**
 * Collects every fixed-string hit from one backend line while preserving caller casing.
 *
 * @param lineContent - One matched line emitted by the native backend.
 * @param fixedString - Exact literal string supplied by the caller.
 * @param caseSensitive - Whether fixed-string matching should preserve caller case.
 * @returns All matched literal slices in caller-visible form.
 */
export function collectFixedStringLineMatches(
  lineContent: string,
  fixedString: string,
  caseSensitive: boolean,
): string[] {
  if (fixedString.length === 0) {
    return [];
  }

  const normalizedLine = caseSensitive ? lineContent : lineContent.toLowerCase();
  const normalizedNeedle = caseSensitive ? fixedString : fixedString.toLowerCase();
  const matches: string[] = [];
  let searchFromIndex = 0;

  while (searchFromIndex <= normalizedLine.length - normalizedNeedle.length) {
    const matchIndex = normalizedLine.indexOf(normalizedNeedle, searchFromIndex);

    if (matchIndex < 0) {
      break;
    }

    matches.push(lineContent.slice(matchIndex, matchIndex + fixedString.length));
    searchFromIndex = matchIndex + fixedString.length;
  }

  return matches;
}

function replaceUnsupportedControlCharacters(text: string): string {
  let sanitized = "";

  for (const character of text) {
    const codePoint = character.codePointAt(0);

    if (codePoint === undefined) {
      continue;
    }

    const isAllowedWhitespace = codePoint === 9 || codePoint === 10 || codePoint === 13;
    const isControlCharacter = codePoint < 32 || codePoint === 127;

    sanitized += isControlCharacter && !isAllowedWhitespace ? "�" : character;
  }

  return sanitized;
}

/**
 * Sanitizes one caller-visible fixed-string match excerpt.
 *
 * @param lineContent - Full backend-emitted match line.
 * @param matchedText - Caller-visible literal match substring.
 * @param hybridLiteralSearchLane - Whether the match came from the hybrid literal-search lane.
 * @returns One caller-safe excerpt string.
 */
export function sanitizeFixedStringMatchContent(
  lineContent: string,
  matchedText: string,
  hybridLiteralSearchLane: boolean,
): string {
  const normalizedExcerpt = normalizeRegexMatchExcerpt(lineContent, matchedText);

  return hybridLiteralSearchLane
    ? replaceUnsupportedControlCharacters(normalizedExcerpt)
    : normalizedExcerpt;
}

/**
 * Creates the canonical per-root error result for fixed-string search.
 *
 * @param searchPath - Root path that failed to resolve or execute cleanly.
 * @param errorMessage - Caller-visible error message for the failing root.
 * @returns Structured per-root error surface.
 */
export function createFixedStringRootErrorResult(
  searchPath: string,
  errorMessage: string,
): SearchFixedStringPathResult {
  return {
    root: searchPath,
    matches: [],
    filesSearched: 0,
    totalMatches: 0,
    truncated: false,
    error: errorMessage,
  };
}

/**
 * Resolves one validated filesystem-preflight entry for a requested path.
 *
 * @param requestedPath - File or directory path supplied by the caller.
 * @param allowedDirectories - Allowed directory roots enforced by the shared path guard.
 * @returns The single validated preflight entry for the requested path.
 */
export async function getValidatedPreflightEntry(
  requestedPath: string,
  allowedDirectories: string[],
): Promise<FilesystemPreflightEntry> {
  const entries = await collectValidatedFilesystemPreflightEntries(
    SEARCH_FIXED_STRING_TOOL_NAME,
    [requestedPath],
    allowedDirectories,
  );
  const firstEntry = entries[0];

  if (firstEntry === undefined) {
    throw new Error(`Expected one validated preflight entry for path: ${requestedPath}`);
  }

  return firstEntry;
}

/**
 * Resolves one validated fixed-string search scope entry and constrains it to file or directory types.
 *
 * @param searchPath - File or directory path supplied by the caller.
 * @param allowedDirectories - Allowed directory roots enforced by the shared path guard.
 * @returns One validated file-or-directory preflight entry for the requested search scope.
 */
export async function getValidatedSearchScopeEntry(
  searchPath: string,
  allowedDirectories: string[],
): Promise<FilesystemPreflightEntry> {
  const rootEntry = await getValidatedPreflightEntry(searchPath, allowedDirectories);

  assertExpectedFileTypes(
    SEARCH_FIXED_STRING_TOOL_NAME,
    [rootEntry],
    ["file", "directory"],
  );

  return rootEntry;
}
