import fs from "fs/promises";
import crypto from "crypto";

export type HashAlgorithm = "md5" | "sha1" | "sha256" | "sha512";

/**
 * Byte-region selector for region-scoped hashing.
 *
 * @remarks
 * `whole-file` selects every byte. `prefix-through-marker` selects the byte
 * prefix ending at the end of the first marker occurrence, including the
 * marker line terminator (CRLF or LF) when present. `byte-range` selects the
 * explicit window `[start, endExclusive)`.
 */
export type FileRegion =
  | {
      /** Selects the whole file. */
      readonly mode: "whole-file";
    }
  | {
      /** Selects the prefix through the first marker occurrence. */
      readonly mode: "prefix-through-marker";
      /** Marker matched as a UTF-8 byte sequence; the first occurrence wins. */
      readonly marker: string;
    }
  | {
      /** Selects the explicit byte window `[start, endExclusive)`. */
      readonly mode: "byte-range";
      /** Inclusive zero-based start offset. */
      readonly start: number;
      /** Exclusive end offset; must be greater than `start`. */
      readonly endExclusive: number;
    };

/**
 * Computes the whole-file hash of the given file.
 *
 * @param filePath - Path of the file to hash.
 * @param algorithm - Hash algorithm to use.
 * @returns The hex-encoded digest of the whole file.
 */
export async function calculateFileHash(
  filePath: string,
  algorithm: HashAlgorithm = "sha256"
): Promise<string> {
  const data = await fs.readFile(filePath);
  const hash = crypto.createHash(algorithm);
  hash.update(data);
  return hash.digest("hex");
}

/**
 * Computes the hash of the selected byte region of the given file.
 *
 * @remarks
 * Fails closed: an absent marker or an out-of-file byte range throws instead
 * of silently falling back to a wider region.
 *
 * @param filePath - Path of the file to hash.
 * @param region - Region selector binding the bytes to hash.
 * @param algorithm - Hash algorithm to use.
 * @returns The hex-encoded digest of the selected region.
 */
export async function calculateFileRegionHash(
  filePath: string,
  region: FileRegion,
  algorithm: HashAlgorithm = "sha256"
): Promise<string> {
  const data = await fs.readFile(filePath);
  const regionBytes = extractRegionBytes(data, region);
  const hash = crypto.createHash(algorithm);
  hash.update(regionBytes);
  return hash.digest("hex");
}

/**
 * Extracts the selected byte region from a fully read file buffer.
 *
 * @param data - The fully read file bytes.
 * @param region - Region selector binding the bytes to extract.
 * @returns The extracted region bytes.
 */
function extractRegionBytes(data: Buffer, region: FileRegion): Buffer {
  switch (region.mode) {
    case "whole-file": {
      return data;
    }
    case "byte-range": {
      if (region.start >= data.length) {
        throw new Error(`byte-range start ${region.start} is outside the file (size ${data.length} bytes)`);
      }
      if (region.endExclusive > data.length) {
        throw new Error(`byte-range end ${region.endExclusive} exceeds the file size ${data.length} bytes`);
      }
      return data.subarray(region.start, region.endExclusive);
    }
    case "prefix-through-marker": {
      const markerBytes = Buffer.from(region.marker, "utf8");
      const markerIndex = data.indexOf(markerBytes);
      if (markerIndex < 0) {
        throw new Error("marker not found");
      }

      const CARRIAGE_RETURN = 0x0d;
      const LINE_FEED = 0x0a;
      let end = markerIndex + markerBytes.length;
      if (data[end] === CARRIAGE_RETURN && data[end + 1] === LINE_FEED) {
        end += 2;
      } else if (data[end] === LINE_FEED) {
        end += 1;
      }
      return data.subarray(0, end);
    }
  }
}
