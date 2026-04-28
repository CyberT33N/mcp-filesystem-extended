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

const lineRangeStartSchema = z
  .number()
  .int()
  .min(1)
  .describe("1-based line number at which the bounded line-range read begins.");

const byteRangeStartSchema = z
  .number()
  .int()
  .min(0)
  .describe("Zero-based byte offset at which the bounded byte-range read begins.");

const chunkCursorSchema = z
  .string()
  .min(1)
  .max(READ_FILE_CONTENT_CURSOR_MAX_CHARS)
  .nullable()
  .optional()
  .default(null)
  .describe(
    "Opaque continuation cursor returned by a previous `chunk_cursor` response. Omit or pass null to start from the beginning of the file."
  );

const ReadFileContentCanonicalFullRequestSchema = z.object({
  path: readFileContentPathSchema,
  mode: z.literal("full"),
});

const ReadFileContentCanonicalLineRangeRequestSchema = z.object({
  path: readFileContentPathSchema,
  mode: z.literal("line_range"),
  startLine: lineRangeStartSchema.optional().default(1),
  lineCount: lineCountSchema.optional().default(READ_FILE_CONTENT_LINE_RANGE_DEFAULT_LINES),
});

const ReadFileContentCanonicalByteRangeRequestSchema = z.object({
  path: readFileContentPathSchema,
  mode: z.literal("byte_range"),
  startByte: byteRangeStartSchema.optional().default(0),
  byteCount: byteCountSchema.optional().default(READ_FILE_CONTENT_BYTE_RANGE_DEFAULT_BYTES),
});

const ReadFileContentCanonicalChunkCursorRequestSchema = z.object({
  path: readFileContentPathSchema,
  mode: z.literal("chunk_cursor"),
  cursor: chunkCursorSchema,
  byteCount: byteCountSchema.optional().default(READ_FILE_CONTENT_BYTE_RANGE_DEFAULT_BYTES),
});

const ReadFileContentPublicLineRangeWindowSchema = z
  .object({
    start: lineRangeStartSchema.optional().default(1),
    end: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "Inclusive 1-based line number at which the public `line-range` window ends. When omitted, the default line window is used."
      ),
  })
  .superRefine((value, ctx) => {
    if (value.end === undefined) {
      return;
    }

    if (value.end < value.start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "`line_range.end` must be greater than or equal to `line_range.start`.",
        path: ["end"],
      });
      return;
    }

    if (value.end - value.start + 1 > READ_FILE_CONTENT_LINE_RANGE_MAX_LINES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "The inclusive public `line_range` window exceeds the hard maximum line window.",
        path: ["end"],
      });
    }
  });

const ReadFileContentPublicByteRangeWindowSchema = z
  .object({
    start: byteRangeStartSchema.optional().default(0),
    endExclusive: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "Zero-based exclusive byte offset at which the public `byte-range` window ends. When omitted, the bounded byte-count window is used."
      ),
    byteCount: byteCountSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.endExclusive !== undefined && value.byteCount !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Specify either `byte_range.endExclusive` or `byte_range.byteCount`, not both.",
        path: ["byteCount"],
      });
    }

    if (value.endExclusive === undefined) {
      return;
    }

    if (value.endExclusive <= value.start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "`byte_range.endExclusive` must be greater than `byte_range.start`.",
        path: ["endExclusive"],
      });
      return;
    }

    if (value.endExclusive - value.start > READ_FILE_CONTENT_BYTE_RANGE_MAX_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "The public `byte_range` window exceeds the hard maximum byte window.",
        path: ["endExclusive"],
      });
    }
  });

const ReadFileContentPublicChunkCursorWindowSchema = z.object({
  cursor: chunkCursorSchema,
  byteCount: byteCountSchema.optional().default(READ_FILE_CONTENT_BYTE_RANGE_DEFAULT_BYTES),
});

const ReadFileContentPublicFullRequestSchema = ReadFileContentCanonicalFullRequestSchema;

const ReadFileContentPublicLineRangeRequestSchema = z.object({
  path: readFileContentPathSchema,
  mode: z.literal("line-range"),
  line_range: ReadFileContentPublicLineRangeWindowSchema.optional().default({ start: 1 }),
});

const ReadFileContentPublicByteRangeRequestSchema = z.object({
  path: readFileContentPathSchema,
  mode: z.literal("byte-range"),
  byte_range: ReadFileContentPublicByteRangeWindowSchema.optional().default({ start: 0 }),
});

const ReadFileContentPublicChunkCursorRequestSchema = z.object({
  path: readFileContentPathSchema,
  mode: z.literal("chunk-cursor"),
  chunk_cursor: ReadFileContentPublicChunkCursorWindowSchema.optional().default({
    byteCount: READ_FILE_CONTENT_BYTE_RANGE_DEFAULT_BYTES,
    cursor: null,
  }),
});

const ReadFileContentCanonicalArgsSchema = z.discriminatedUnion("mode", [
  ReadFileContentCanonicalFullRequestSchema,
  ReadFileContentCanonicalLineRangeRequestSchema,
  ReadFileContentCanonicalByteRangeRequestSchema,
  ReadFileContentCanonicalChunkCursorRequestSchema,
]);

/**
 * Public request contract for single-file content reads.
 *
 * @remarks
 * The public MCP boundary accepts explicit mode-specific option blocks for
 * ranged and cursor reads so callers can use the visible `line-range`,
 * `byte-range`, and `chunk-cursor` tool surface without leaking the internal
 * canonical field topology into transport-facing requests.
 */
export const ReadFileContentArgsSchema = z.discriminatedUnion("mode", [
  ReadFileContentPublicFullRequestSchema,
  ReadFileContentPublicLineRangeRequestSchema,
  ReadFileContentPublicByteRangeRequestSchema,
  ReadFileContentPublicChunkCursorRequestSchema,
]);

/**
 * Flat MCP registration contract for single-file content reads.
 *
 * @remarks
 * The MCP SDK serializes `z.discriminatedUnion` and `z.union` into a JSON-Schema
 * `anyOf` surface that lacks a top-level `properties` block. Because MCP clients
 * discover parameters from `inputSchema.properties`, no options would be visible
 * when the discriminated-union schema is passed directly as `inputSchema`.
 *
 * This flat schema exposes every parameter that can appear across all read modes
 * as optional fields on one `z.object()` so the SDK produces a single
 * `properties` map. The mode-specific option blocks (`line_range`, `byte_range`,
 * `chunk_cursor`) remain optional and are only validated when the corresponding
 * `mode` value is provided. Internal normalization via `normalizeReadFileContentArgs`
 * routes each flat request into the correct canonical bounded-read contract.
 */
export const ReadFileContentFlatArgsSchema = z.object({
  path: readFileContentPathSchema,
  mode: z
    .enum(["full", "line-range", "byte-range", "chunk-cursor"])
    .describe(
      "Read mode that determines which bounded-read contract is applied. Use `full` for small files, `line-range` for line-windowed access, `byte-range` for byte-offset access, and `chunk-cursor` for cursor-based streaming."
    ),
  line_range: ReadFileContentPublicLineRangeWindowSchema.optional().describe(
    "Mode-specific option block accepted only when `mode = 'line-range'`. Defines the inclusive start and optional end line for the bounded line-window read."
  ),
  byte_range: ReadFileContentPublicByteRangeWindowSchema.optional().describe(
    "Mode-specific option block accepted only when `mode = 'byte-range'`. Defines the start byte offset and either an exclusive end offset or a byte-count window."
  ),
  chunk_cursor: ReadFileContentPublicChunkCursorWindowSchema.optional().describe(
    "Mode-specific option block accepted only when `mode = 'chunk-cursor'`. Carries the opaque continuation cursor and the requested byte-count window."
  ),
});

/**
 * Type-level normalized request contract used internally after MCP-boundary
 * normalization.
 */
export type ReadFileContentArgs = z.infer<typeof ReadFileContentCanonicalArgsSchema>;

/**
 * Normalizes the flat MCP request surface into the canonical internal
 * bounded-read contract.
 *
 * @param args - Flat `read_file_content` request accepted at the MCP
 * boundary via `ReadFileContentFlatArgsSchema`.
 * @returns Canonical internal request contract with stable underscore mode
 * names and flat bounded-range fields.
 */
export function normalizeReadFileContentArgs(
  args: z.infer<typeof ReadFileContentFlatArgsSchema>,
): ReadFileContentArgs {
  switch (args.mode) {
    case "full":
      return ReadFileContentCanonicalArgsSchema.parse({ mode: "full", path: args.path });
    case "line-range": {
      const lineRange = args.line_range ?? { start: 1 };
      const startLine = lineRange.start;
      const lineCount =
        lineRange.end === undefined
          ? READ_FILE_CONTENT_LINE_RANGE_DEFAULT_LINES
          : lineRange.end - startLine + 1;

      return ReadFileContentCanonicalArgsSchema.parse({
        lineCount,
        mode: "line_range",
        path: args.path,
        startLine,
      });
    }
    case "byte-range": {
      const byteRange = args.byte_range ?? { start: 0 };
      const startByte = byteRange.start;
      const byteCount =
        byteRange.endExclusive === undefined
          ? byteRange.byteCount ?? READ_FILE_CONTENT_BYTE_RANGE_DEFAULT_BYTES
          : byteRange.endExclusive - startByte;

      return ReadFileContentCanonicalArgsSchema.parse({
        byteCount,
        mode: "byte_range",
        path: args.path,
        startByte,
      });
    }
    case "chunk-cursor": {
      const chunkCursor = args.chunk_cursor ?? {
        byteCount: READ_FILE_CONTENT_BYTE_RANGE_DEFAULT_BYTES,
        cursor: null,
      };

      return ReadFileContentCanonicalArgsSchema.parse({
        byteCount: chunkCursor.byteCount,
        cursor: chunkCursor.cursor,
        mode: "chunk_cursor",
        path: args.path,
      });
    }
  }
}

const ReadFileContentCommonResultSchema = z.object({
  path: z.string(),
  content: z.string(),
  totalFileBytes: z.number().int().min(0),
  returnedByteCount: z.number().int().min(0),
  hasMore: z.boolean(),
});

const ReadFileContentFullResultSchema = ReadFileContentCommonResultSchema.extend({
  mode: z.literal("full"),
  encoding: z.enum(["utf16le", "utf8"]),
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

const ReadFileContentModeSpecificResultSchema = z.discriminatedUnion("mode", [
  ReadFileContentFullResultSchema,
  ReadFileContentLineRangeResultSchema,
  ReadFileContentByteRangeResultSchema,
  ReadFileContentChunkCursorResultSchema,
]);

/**
 * Structured result contract for explicit full, line-range, byte-range, and cursor reads.
 *
 * @remarks
 * The public output schema intentionally stays on one object surface because the current MCP SDK
 * validates output schemas through object normalization before parsing structured content. The
 * mode-specific TypeScript union stays separate so the handler can still return a strongly typed
 * discriminated result while MCP output validation receives an object-compatible schema.
 */
export const ReadFileContentResultSchema = ReadFileContentCommonResultSchema.extend({
  mode: z.enum(["full", "line_range", "byte_range", "chunk_cursor"]),
  encoding: z.enum(["utf16le", "utf8"]).optional(),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(0).optional(),
  returnedLineCount: z.number().int().min(0).optional(),
  nextLine: z.number().int().min(1).nullable().optional(),
  startByte: z.number().int().min(0).optional(),
  endByteExclusive: z.number().int().min(0).optional(),
  nextByteOffset: z.number().int().min(0).nullable().optional(),
  cursor: z.string().max(READ_FILE_CONTENT_CURSOR_MAX_CHARS).nullable().optional(),
  nextCursor: z.string().max(READ_FILE_CONTENT_CURSOR_MAX_CHARS).nullable().optional(),
});

/**
 * Type-level structured result contract inferred from the canonical schema surface.
 */
export type ReadFileContentResult = z.infer<typeof ReadFileContentModeSpecificResultSchema>;
