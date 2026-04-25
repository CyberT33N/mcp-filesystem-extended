import { z } from "zod";
import {
  BatchOperationErrorBaseSchema,
  DefaultedFileSystemEntryMetadataSelectionSchema,
  FileSystemEntryMetadataSchema,
} from "@domain/inspection/shared/filesystem-entry-metadata-contract";
import {
  MAX_GENERIC_PATHS_PER_REQUEST,
  PATH_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

/**
 * Input schema for the `get_path_metadata` tool.
 */
export const GetPathMetadataArgsSchema = z.object({
  /**
   * Requested path list.
   *
   * @remarks
   * Use this property to provide the file or directory paths whose metadata
   * should be collected within the request batch ceiling.
   *
   * @example
   * ```ts
   * {
   *   paths: ["src", "package.json"]
   * }
   * ```
   */
  paths: z
    .array(z.string().max(PATH_MAX_CHARS))
    .min(1)
    .max(MAX_GENERIC_PATHS_PER_REQUEST)
    .describe(
      "Array of file or directory paths. Pass one path for a single lookup or multiple paths for batch metadata retrieval."
    ),
  /**
   * Metadata selection.
   *
   * @remarks
   * This property narrows which optional metadata groups should be added on top
   * of the always-present size and type fields.
   *
   * @example
   * ```ts
   * {
   *   metadata: { timestamps: true, permissions: false }
   * }
   * ```
   */
  metadata: DefaultedFileSystemEntryMetadataSelectionSchema.describe(
    "Optional grouped metadata selectors. `size` and `type` are always returned. Set `timestamps` and/or `permissions` to true to include those groups."
  ),
});

/**
 * Structured result schema for the `get_path_metadata` tool.
 */
export const GetPathMetadataResultSchema = z.object({
  /**
   * Successful metadata entries.
   *
   * @remarks
   * This property contains the structured metadata payload for each path that
   * could be inspected successfully.
   *
   * @example
   * ```ts
   * {
   *   entries: [{ path: "src", size: 0, type: "directory" }]
   * }
   * ```
   */
  entries: z.array(
    FileSystemEntryMetadataSchema.extend({
      /**
       * Path echo.
       *
       * @remarks
       * This property identifies which requested path the metadata entry
       * represents.
       *
       * @example
       * ```ts
       * {
       *   path: "src"
       * }
       * ```
       */
      path: z.string(),
    })
  ),
  /**
   * Failed metadata lookups.
   *
   * @remarks
   * This property captures per-path failures without discarding successful
   * metadata entries from the same request.
   *
   * @example
   * ```ts
   * {
   *   errors: [{ path: "missing.txt", error: "ENOENT" }]
   * }
   * ```
   */
  errors: z.array(BatchOperationErrorBaseSchema),
});
