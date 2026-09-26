import { isUndefined } from "es-toolkit/predicate";
import { z } from "zod";

import {
  BatchOperationErrorBaseSchema,
} from "@domain/inspection/shared/filesystem-entry-metadata-contract";
import {
  MARKER_MAX_CHARS,
  MAX_GENERIC_PATHS_PER_REQUEST,
  PATH_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

/**
 * Byte-region selector shared by the reference and every target.
 */
export const FileRegionSchema = z
  .object({
    /**
     * Region mode.
     *
     * @remarks
     * `whole-file` hashes every byte. `prefix-through-marker` hashes the byte
     * prefix that ends at the end of the first marker occurrence including its
     * line terminator when present. `byte-range` hashes the explicit byte
     * window `[start, endExclusive)`.
     *
     * @example
     * ```ts
     * { mode: "prefix-through-marker", marker: "# -- project additions below this line --" }
     * ```
     */
    mode: z
      .enum(["whole-file", "prefix-through-marker", "byte-range"])
      .default("whole-file")
      .describe("Region mode to hash. Defaults to `whole-file`."),
    /**
     * Marker text for `prefix-through-marker`.
     *
     * @remarks
     * The marker is matched as a UTF-8 byte sequence; the first occurrence
     * wins. Required iff `mode` is `prefix-through-marker`.
     */
    marker: z
      .string()
      .min(1)
      .max(MARKER_MAX_CHARS)
      .optional()
      .describe(`Marker text for \`prefix-through-marker\` mode. The marker string is capped at ${MARKER_MAX_CHARS} characters.`),
    /**
     * Inclusive zero-based start offset for `byte-range` mode.
     */
    start: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Inclusive zero-based start byte offset for `byte-range` mode."),
    /**
     * Exclusive end offset for `byte-range` mode; must be greater than `start`.
     */
    endExclusive: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Exclusive end byte offset for `byte-range` mode. Must be greater than `start`."),
  })
  .superRefine((region, ctx) => {
    if (region.mode === "prefix-through-marker" && isUndefined(region.marker)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "marker is required when mode is prefix-through-marker.",
        path: ["marker"],
      });
    }

    if (region.mode === "byte-range") {
      if (isUndefined(region.start) || isUndefined(region.endExclusive)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "start and endExclusive are required when mode is byte-range.",
          path: ["start"],
        });
      } else if (region.endExclusive <= region.start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "endExclusive must be greater than start.",
          path: ["endExclusive"],
        });
      }
    }
  });

/**
 * Reference or target file binding of a byte-identity request.
 */
const FileSideSchema = z.object({
  /**
   * File path of this side.
   */
  path: z
    .string()
    .max(PATH_MAX_CHARS)
    .describe(`Path to the file. Each path is capped at ${PATH_MAX_CHARS} characters.`),
  /**
   * Optional region binding; defaults to the whole file.
   */
  region: FileRegionSchema.optional()
    .describe("Optional region binding. When omitted, the whole file is hashed."),
});

export const VerifyFileByteIdentityArgsSchema = z.object({
  /**
   * Reference file whose bytes define the expectation.
   */
  reference: FileSideSchema.describe(
    "Reference file whose bytes define the expectation. Its region hash is computed once and reused for every target comparison.",
  ),
  /**
   * Target files to verify against the reference.
   */
  targets: z
    .array(FileSideSchema)
    .min(1)
    .max(MAX_GENERIC_PATHS_PER_REQUEST)
    .describe(`Target files to verify against the reference. Pass one target for a single verification or multiple targets for a batch verification. The request accepts at most ${MAX_GENERIC_PATHS_PER_REQUEST} target entries.`),
  /**
   * Hash algorithm selection.
   */
  algorithm: z
    .enum(["md5", "sha1", "sha256", "sha512"])
    .default("sha256")
    .describe("Hash algorithm to use. Defaults to `sha256`."),
});

export const VerifyFileByteIdentityResultSchema = z.object({
  /**
   * Reference-side proof surface.
   */
  reference: z.object({
    /** Reference path echo. */
    path: z.string(),
    /** Hash of the reference region under the selected algorithm. */
    regionHash: z.string(),
  }),
  /**
   * Successful per-target comparison entries in request order.
   */
  entries: z.array(
    z.object({
      /** Target path echo. */
      path: z.string(),
      /** Reference region hash used for the comparison. */
      referenceHash: z.string(),
      /** Target region hash. */
      actualHash: z.string(),
      /** Normalized comparison outcome. */
      valid: z.boolean(),
    }),
  ),
  /**
   * Per-target failures that prevented a comparison result.
   */
  errors: z.array(BatchOperationErrorBaseSchema),
  /**
   * Aggregate verification counts.
   */
  summary: z.object({
    /** Targets whose region hash matched. */
    validCount: z.number(),
    /** Targets whose region hash did not match. */
    invalidCount: z.number(),
    /** Targets that failed before a comparison result could be produced. */
    errorCount: z.number(),
  }),
});
