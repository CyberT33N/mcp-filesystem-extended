import {
  assertExpectedFileTypes,
  collectValidatedFilesystemPreflightEntries,
} from "@domain/shared/guardrails/filesystem-preflight";
import { READ_FILES_RESPONSE_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";
import {
  assertActualTextBudget,
  assertProjectedTextBudget,
} from "@domain/shared/guardrails/text-response-budget";
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import { readValidatedFullTextFile } from "@infrastructure/filesystem/text-read-core";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";
import {
  readFileContentByteRange,
  readFileContentChunkCursor,
  readFileContentLineRange,
} from "@infrastructure/filesystem/streaming-file-content-reader";

import {
  type ReadFileContentArgs,
  type ReadFileContentResult,
  READ_FILE_CONTENT_FULL_INLINE_HARD_MAX_BYTES,
  READ_FILE_CONTENT_TOOL_NAME,
} from "./schema";

function formatReadFileContentResult(result: ReadFileContentResult): string {
  switch (result.mode) {
    case "full":
      return [
        `path: ${result.path}`,
        `mode: ${result.mode}`,
        `encoding: ${result.encoding}`,
        `totalFileBytes: ${result.totalFileBytes}`,
        `returnedByteCount: ${result.returnedByteCount}`,
        `hasMore: ${result.hasMore}`,
        "content:",
        result.content,
      ].join("\n");
    case "line_range":
      return [
        `path: ${result.path}`,
        `mode: ${result.mode}`,
        `startLine: ${result.startLine}`,
        `endLine: ${result.endLine}`,
        `returnedLineCount: ${result.returnedLineCount}`,
        `nextLine: ${result.nextLine ?? "null"}`,
        `totalFileBytes: ${result.totalFileBytes}`,
        `returnedByteCount: ${result.returnedByteCount}`,
        `hasMore: ${result.hasMore}`,
        "content:",
        result.content,
      ].join("\n");
    case "byte_range":
      return [
        `path: ${result.path}`,
        `mode: ${result.mode}`,
        `startByte: ${result.startByte}`,
        `endByteExclusive: ${result.endByteExclusive}`,
        `nextByteOffset: ${result.nextByteOffset ?? "null"}`,
        `totalFileBytes: ${result.totalFileBytes}`,
        `returnedByteCount: ${result.returnedByteCount}`,
        `hasMore: ${result.hasMore}`,
        "content:",
        result.content,
      ].join("\n");
    case "chunk_cursor":
      return [
        `path: ${result.path}`,
        `mode: ${result.mode}`,
        `cursor: ${result.cursor ?? "null"}`,
        `nextCursor: ${result.nextCursor ?? "null"}`,
        `startByte: ${result.startByte}`,
        `endByteExclusive: ${result.endByteExclusive}`,
        `totalFileBytes: ${result.totalFileBytes}`,
        `returnedByteCount: ${result.returnedByteCount}`,
        `hasMore: ${result.hasMore}`,
        "content:",
        result.content,
      ].join("\n");
  }
}

function assertProjectedInlineFullReadBudget(totalFileBytes: number): void {
  const executionPolicy = resolveSearchExecutionPolicy(detectIoCapabilityProfile());
  const projectedInlineFullReadCapBytes = Math.min(
    READ_FILE_CONTENT_FULL_INLINE_HARD_MAX_BYTES,
    READ_FILES_RESPONSE_CAP_CHARS,
  );

  assertProjectedTextBudget(
    READ_FILE_CONTENT_TOOL_NAME,
    totalFileBytes,
    projectedInlineFullReadCapBytes,
    "Projected inline full content read exceeds the bounded full-read ceiling.",
    "Switch to `line_range`, `byte_range`, or `chunk_cursor` for larger files.",
  );

  const estimatedSourceReadBytesPerSecond =
    detectIoCapabilityProfile().estimatedSourceReadBytesPerSecond;

  if (
    estimatedSourceReadBytesPerSecond !== null
    && estimatedSourceReadBytesPerSecond > 0
    && totalFileBytes / estimatedSourceReadBytesPerSecond
      > executionPolicy.syncComfortWindowSeconds
  ) {
    throw new Error(
      "Inline `full` mode is not allowed because the projected synchronous read window exceeds the shared runtime comfort budget.",
    );
  }
}

async function getValidatedSingleFileEntry(
  path: string,
  allowedDirectories: string[],
) {
  const entries = await collectValidatedFilesystemPreflightEntries(
    READ_FILE_CONTENT_TOOL_NAME,
    [path],
    allowedDirectories,
  );

  assertExpectedFileTypes(READ_FILE_CONTENT_TOOL_NAME, entries, ["file"]);

  const entry = entries[0];

  if (entry === undefined) {
    throw new Error("Expected one validated file entry for the single-file content read endpoint.");
  }

  return entry;
}

/**
 * Resolves the structured result contract for the `read_file_content` endpoint.
 *
 * @param args - Validated request contract with one explicit read mode.
 * @param allowedDirectories - Allowed directory roots enforced by the shared path guard.
 * @returns Structured content-read result with explicit continuation metadata.
 */
export async function getReadFileContentResult(
  args: ReadFileContentArgs,
  allowedDirectories: string[],
): Promise<ReadFileContentResult> {
  const entry = await getValidatedSingleFileEntry(args.path, allowedDirectories);

  switch (args.mode) {
    case "full": {
      assertProjectedInlineFullReadBudget(entry.size);
      const { content, returnedByteCount } = await readValidatedFullTextFile(
        {
          requestedPath: entry.requestedPath,
          validPath: entry.validPath,
          totalFileBytes: entry.size,
        },
        READ_FILE_CONTENT_TOOL_NAME,
      );

      return {
        mode: "full",
        path: entry.requestedPath,
        content,
        encoding: "utf-8",
        totalFileBytes: entry.size,
        returnedByteCount,
        hasMore: false,
      };
    }
    case "line_range": {
      const lineRangeResult = await readFileContentLineRange({
        validPath: entry.validPath,
        startLine: args.startLine,
        lineCount: args.lineCount,
      });

      return {
        mode: "line_range",
        path: entry.requestedPath,
        totalFileBytes: entry.size,
        ...lineRangeResult,
      };
    }
    case "byte_range": {
      const byteRangeResult = await readFileContentByteRange({
        validPath: entry.validPath,
        totalFileBytes: entry.size,
        startByte: args.startByte,
        byteCount: args.byteCount,
      });

      return {
        mode: "byte_range",
        path: entry.requestedPath,
        totalFileBytes: entry.size,
        ...byteRangeResult,
      };
    }
    case "chunk_cursor": {
      const chunkCursorResult = await readFileContentChunkCursor({
        validPath: entry.validPath,
        totalFileBytes: entry.size,
        cursor: args.cursor,
        byteCount: args.byteCount,
      });

      return {
        mode: "chunk_cursor",
        path: entry.requestedPath,
        totalFileBytes: entry.size,
        ...chunkCursorResult,
      };
    }
  }
}

/**
 * Resolves the formatted text response for the `read_file_content` endpoint.
 *
 * @param args - Validated request contract with one explicit read mode.
 * @param allowedDirectories - Allowed directory roots enforced by the shared path guard.
 * @returns Formatted text output that stays within the shared text-response budget.
 */
export async function handleReadFileContent(
  args: ReadFileContentArgs,
  allowedDirectories: string[],
): Promise<string> {
  const result = await getReadFileContentResult(args, allowedDirectories);
  const formattedResult = formatReadFileContentResult(result);

  assertActualTextBudget(
    READ_FILE_CONTENT_TOOL_NAME,
    formattedResult.length,
    READ_FILES_RESPONSE_CAP_CHARS,
    "Actual content-read response exceeds the direct-read family cap.",
  );

  return formattedResult;
}
