import { isUndefined } from "es-toolkit/predicate";

import type { FileRegion } from "@infrastructure/filesystem/checksum";

/**
 * Parsed region request shape as accepted by the public schema.
 */
export interface FileRegionInput {
  /** Region mode selected by the request. */
  readonly mode: "whole-file" | "prefix-through-marker" | "byte-range";
  /** Marker text for `prefix-through-marker` mode. */
  readonly marker?: string | undefined;
  /** Inclusive start offset for `byte-range` mode. */
  readonly start?: number | undefined;
  /** Exclusive end offset for `byte-range` mode. */
  readonly endExclusive?: number | undefined;
}

/**
 * Narrows a parsed region request into the domain region type, fail-closed.
 *
 * @param input - Parsed region request from the public schema.
 * @returns The narrowed domain region.
 */
export function toFileRegion(input: FileRegionInput): FileRegion {
  switch (input.mode) {
    case "whole-file": {
      return { mode: "whole-file" };
    }
    case "prefix-through-marker": {
      if (isUndefined(input.marker)) {
        throw new Error("marker is required when mode is prefix-through-marker");
      }
      return { mode: "prefix-through-marker", marker: input.marker };
    }
    case "byte-range": {
      if (isUndefined(input.start) || isUndefined(input.endExclusive)) {
        throw new Error("start and endExclusive are required when mode is byte-range");
      }
      if (input.endExclusive <= input.start) {
        throw new Error("endExclusive must be greater than start");
      }
      return { mode: "byte-range", start: input.start, endExclusive: input.endExclusive };
    }
  }
}

/**
 * Compares two hash strings with lowercase-and-trim normalization.
 *
 * @param actualHash - Hash computed from the target region.
 * @param expectedHash - Hash computed from the reference region.
 * @returns Whether the normalized hashes are equal.
 */
export function hashesMatch(
  actualHash: string,
  expectedHash: string
): boolean {
  return actualHash.toLowerCase().trim() === expectedHash.toLowerCase().trim();
}
