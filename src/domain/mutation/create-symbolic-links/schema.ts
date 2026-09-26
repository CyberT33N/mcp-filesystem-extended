import { z } from "zod";

import {
  MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST,
  PATH_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

/**
 * One symbolic-link creation entry of a batch request.
 */
export const SymbolicLinkCreationSchema = z.object({
  /**
   * Link path to create.
   *
   * @remarks
   * This property identifies the symbolic link entry that should be
   * materialized by the creation operation. The path must not exist yet.
   *
   * @example
   * ```ts
   * {
   *   linkPath: "consumers/shortcut.md"
   * }
   * ```
   */
  linkPath: z.string().max(PATH_MAX_CHARS).describe(`Path of the symbolic link to create. Each path is capped at ${PATH_MAX_CHARS} characters.`),
  /**
   * Target path stored in the link.
   *
   * @remarks
   * The target text is stored verbatim: a relative target stays relative and
   * resolves against the link's own directory at access time, which keeps the
   * link portable across checkouts and machines. An absolute target stays
   * stable when the link moves, but remains machine-dependent. The stored
   * target is never normalized before creation.
   *
   * @example
   * ```ts
   * {
   *   target: "../canonical/shared.md"
   * }
   * ```
   */
  target: z.string().max(PATH_MAX_CHARS).describe(`Target path to store in the link. Relative targets are stored verbatim and resolve against the link's directory at access time; absolute targets are stored as-is. Each target is capped at ${PATH_MAX_CHARS} characters.`),
  /**
   * Link type selection.
   *
   * @remarks
   * The type hint is only effective on Windows: `file` or `dir` force the
   * portable symbolic-link type, while `junction` creates a Windows NTFS
   * junction instead of a portable symbolic link — directory targets only,
   * absolute target path, no Developer Mode or elevation required, and not
   * portable across operating systems. When omitted, the runtime autodetects
   * `file` or `dir` from the target and creates a portable symbolic link.
   *
   * @example
   * ```ts
   * {
   *   type: "junction"
   * }
   * ```
   */
  type: z.enum(["file", "dir", "junction"]).optional().describe("Link type hint used on Windows only: `file` or `dir` force the portable symbolic-link type, while `junction` creates a Windows NTFS junction instead — directory targets only, absolute target path, no Developer Mode or elevation required, and not portable across operating systems. When omitted, the runtime autodetects the portable link type."),
});

/**
 * Inferred TypeScript type for one symbolic-link creation entry.
 */
export type CreateSymbolicLinkEntry = z.infer<typeof SymbolicLinkCreationSchema>;

/**
 * Public request schema for the `create_symbolic_links` endpoint.
 */
export const CreateSymbolicLinksArgsSchema = z.object({
  /**
   * Symbolic link creation entries.
   *
   * @remarks
   * Use this property to provide the link paths and targets that should be
   * created inside one guarded path-mutation request.
   *
   * @example
   * ```ts
   * {
   *   links: [{ linkPath: "consumers/shortcut.md", target: "../canonical/shared.md" }]
   * }
   * ```
   */
  links: z
    .array(SymbolicLinkCreationSchema)
    .min(1)
    .max(MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST)
    .describe(`Symbolic links to create. Pass one link for a single creation or multiple links for a batch creation. The request accepts at most ${MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST} link entries.`),
});

/**
 * Inferred TypeScript type for the `create_symbolic_links` request.
 */
export type CreateSymbolicLinksArgs = z.infer<typeof CreateSymbolicLinksArgsSchema>;
