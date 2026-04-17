import { z } from "zod";

import {
  PATH_MAX_CHARS,
  SHORT_TEXT_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

/**
 * Canonical public tool name for single-file content reads.
 *
 * @remarks
 * Keep this literal stable across schema, handler, and registration surfaces so
 * callers see one exact public endpoint name.
 */
export const READ_FILE_CONTENT_TOOL_NAME = "read_file_content";

/**
 * Hard inline full-read ceiling for the explicit `full` mode.
 *
 * @remarks
 * The handler must apply this byte ceiling together with projected response
 * budgeting so the `full` mode never degrades into an unbounded giant-file
 * surface.
 */
export const READ_FILE_CONTENT_FULL_INLINE_HARD_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Default line window for the explicit `line_range` mode.
 */
export const READ_FILE_CONTENT_LINE_RANGE_DEFAULT_LINES = 500;

/**
 * Hard maximum line window for the explicit `line_range` mode.
 */
export const READ_FILE_CONTENT_LINE_RANGE_MAX_LINES = 2_000;

/**
 * Default byte window for the explicit `byte_range` and `chunk_cursor` modes.
 */
export const READ_FILE_CONTENT_BYTE_RANGE_DEFAULT_BYTES = 256 * 1024;

/**
 * Hard maximum byte window for the explicit `byte_range` and `chunk_cursor` modes.
 */
export const READ_FILE_CONTENT_BYTE_RANGE_MAX_BYTES = 1 * 1024 * 1024;

/**
 * Opaque cursor-string ceiling for cursor-based continuation.
 */
export const READ_FILE_CONTENT_CURSOR_MAX_CHARS = SHORT_TEXT_MAX_CHARS;

const readFileContentPathSchema = z
  .string()
  .max(PATH_MAX_CHARS)
  .describe(
    "Single file path to read. This endpoint accepts exactly one file target and does not behave as a multi-file batch read."
  );

const lineCountSchema = z
  .number()
  .int()
  .min(1)
  .max(READ_FILE_CONTENT_LINE_RANGE_MAX_LINES)
  .describe(
    "Maximum number of lines to return for `line_range` mode. Defaults to 500 lines and is hard-capped at 2000 lines."
  );

const byteCountSchema = z
  .number()
  .int()
  .min(1)
  .max(READ_FILE_CONTENT_BYTE_RANGE_MAX_BYTES)
  .describe(
    "Maximum number of bytes to return for `byte_range` or `chunk_cursor` mode. Defaults to 256 KiB and is hard-capped at 1 MiB."
  );

const ReadFileContentFullRequestSchema = z.object({
  path: readFileContentPathSchema,
  mode: z.literal("full"),
});

const ReadFileContentLineRangeRequestSchema = z.object({
  path: readFileContentPathSchema,
  mode: z.literal("line_range"),
  startLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe("1-based line number at which the bounded line-range read begins."),
  lineCount: lineCountSchema.optional().default(READ_FILE_CONTENT_LINE_RANGE_DEFAULT_LINES),
});

const ReadFileContentByteRangeRequestSchema = z.object({
  path: readFileContentPathSchema,
  mode: z.literal("byte_range"),
  startByte: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Zero-based byte offset at which the bounded byte-range read begins."),
  byteCount: byteCountSchema.optional().default(READ_FILE_CONTENT_BYTE_RANGE_DEFAULT_BYTES),
});

const ReadFileContentChunkCursorRequestSchema = z.object({
  path: readFileContentPathSchema,
  mode: z.literal("chunk_cursor"),
  cursor: z
    .string()
    .min(1)
    .max(READ_FILE_CONTENT_CURSOR_MAX_CHARS)
    .nullable()
    .optional()
    .default(null)
    .describe(
      "Opaque continuation cursor returned by a previous `chunk_cursor` response. Omit or pass null to start from the beginning of the file."
    ),
  byteCount: byteCountSchema.optional().default(READ_FILE_CONTENT_BYTE_RANGE_DEFAULT_BYTES),
});

/**
 * Public request contract for single-file content reads.
 *
 * @remarks
 * The request surface is an explicit four-mode discriminated union so callers
 * cannot accidentally trigger an implicit unbounded read path.
 */
export const ReadFileContentArgsSchema = z.discriminatedUnion("mode", [
  ReadFileContentFullRequestSchema,
  ReadFileContentLineRangeRequestSchema,
  ReadFileContentByteRangeRequestSchema,
  ReadFileContentChunkCursorRequestSchema,
]);

/**
 * Type-level request contract inferred from the canonical schema surface.
 */
export type ReadFileContentArgs = z.infer<typeof ReadFileContentArgsSchema>;

const ReadFileContentCommonResultSchema = z.object({
  path: z.string(),
  content: z.string(),
  totalFileBytes: z.number().int().min(0),
  returnedByteCount: z.number().int().min(0),
  hasMore: z.boolean(),
});

const ReadFileContentFullResultSchema = ReadFileContentCommonResultSchema.extend({
  mode: z.literal("full"),
  encoding: z.literal("utf-8"),
});

const ReadFileContentLineRangeResultSchema = ReadFileContentCommonResultSchema.extend({
  mode: z.literal("line_range"),
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
  returnedLineCount: z.number().int().min(0),
  nextLine: z.number().int().min(1).nullable(),
});

const ReadFileContentByteRangeResultSchema = ReadFileContentCommonResultSchema.extend({
  mode: z.literal("byte_range"),
  startByte: z.number().int().min(0),
  endByteExclusive: z.number().int().min(0),
  nextByteOffset: z.number().int().min(0).nullable(),
});

const ReadFileContentChunkCursorResultSchema = ReadFileContentCommonResultSchema.extend({
  mode: z.literal("chunk_cursor"),
  cursor: z.string().max(READ_FILE_CONTENT_CURSOR_MAX_CHARS).nullable(),
  nextCursor: z.string().max(READ_FILE_CONTENT_CURSOR_MAX_CHARS).nullable(),
  startByte: z.number().int().min(0),
  endByteExclusive: z.number().int().min(0),
});

/**
 * Structured result contract for explicit full, line-range, byte-range, and cursor reads.
 *
 * @remarks
 * The result surface carries explicit continuation metadata so callers do not
 * need to reconstruct hidden state between range or cursor reads.
 */
export const ReadFileContentResultSchema = z.discriminatedUnion("mode", [
  ReadFileContentFullResultSchema,
  ReadFileContentLineRangeResultSchema,
  ReadFileContentByteRangeResultSchema,
  ReadFileContentChunkCursorResultSchema,
]);

/**
 * Type-level structured result contract inferred from the canonical schema surface.
 */
export type ReadFileContentResult = z.infer<typeof ReadFileContentResultSchema>;
