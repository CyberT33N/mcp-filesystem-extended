import type { Stats } from "fs";

import type { CreateSymbolicLinkEntry } from "./schema";

/**
 * Explicit Windows link-type hint of a creation entry.
 */
export type SymbolicLinkTypeHint = NonNullable<CreateSymbolicLinkEntry["type"]>;

/**
 * Evaluates whether an explicit link-type hint matches an existing target entry.
 *
 * @remarks
 * Windows materializes the declared flavor into the reparse point it creates:
 * a `dir` or `junction` link whose target is not a directory — and a `file`
 * link whose target is a directory — produces a non-functional link at access
 * time. The guard mirrors the runtime's own autodetection taxonomy (directory
 * versus non-directory) so the refusal is deterministic and portable instead
 * of OS-dependent. A missing target produces no mismatch: dangling creation
 * stays legal.
 *
 * @param type - Explicit link-type hint supplied by the caller.
 * @param targetStats - Target-following stats of the resolved existing target.
 * @returns The actual entry kind when the hint mismatches, otherwise `undefined`.
 */
export function findLinkTypeTargetMismatch(
  type: SymbolicLinkTypeHint,
  targetStats: Stats,
): "directory" | "non-directory" | undefined {
  const targetIsDirectory = targetStats.isDirectory();

  if (type === "file") {
    return targetIsDirectory ? "directory" : undefined;
  }

  return targetIsDirectory ? undefined : "non-directory";
}
