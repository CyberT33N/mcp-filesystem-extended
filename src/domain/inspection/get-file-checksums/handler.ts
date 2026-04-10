import { METADATA_RESPONSE_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import { calculateFileHash, type HashAlgorithm } from "@infrastructure/filesystem/checksum";
import { validatePath } from "@infrastructure/filesystem/path-guard";

export interface FileChecksumEntry {
  path: string;
  hash: string;
}

export interface FileChecksumError {
  path: string;
  error: string;
}

/**
 * Describes the structured checksum result across the requested file batch.
 *
 * @remarks
 * This contract preserves successful hashes and per-file failures together so
 * metadata-family callers can inspect partial success without losing deterministic
 * output budgeting or guardrail error visibility.
 */
export interface FileChecksumsResult {
  entries: FileChecksumEntry[];
  errors: FileChecksumError[];
}

/**
 * Computes structured checksums for one or more validated file paths.
 *
 * @remarks
 * This helper keeps path validation and checksum generation inside the handler
 * layer while preserving a machine-readable result surface that can later be
 * formatted under the metadata response budget.
 *
 * @param filePaths - Requested file paths in caller-supplied order.
 * @param algorithm - Hash algorithm selected by the request contract.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @returns Structured checksum entries and per-file failures for the request batch.
 */
export async function getFileChecksumsResult(
  filePaths: string[],
  algorithm: HashAlgorithm,
  allowedDirectories: string[],
): Promise<FileChecksumsResult> {
  const results = await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        const validPath = await validatePath(filePath, allowedDirectories);
        const hash = await calculateFileHash(validPath, algorithm);

        return {
          entry: {
            path: filePath,
            hash,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        return {
          error: {
            path: filePath,
            error: errorMessage,
          },
        };
      }
    }),
  );

  return {
    entries: results.flatMap((result) => (result.entry ? [result.entry] : [])),
    errors: results.flatMap((result) => (result.error ? [result.error] : [])),
  };
}

/**
 * Formats checksum results for the caller-visible text response surface.
 *
 * @remarks
 * The checksum endpoint stays in the metadata family, so formatted output must
 * remain concise and is rejected once the final text surface would exceed the
 * shared metadata response cap.
 *
 * @param filePaths - Requested file paths in caller-supplied order.
 * @param algorithm - Hash algorithm selected by the request contract.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @returns Human-readable checksum output bounded by the metadata-family text budget.
 */
export async function handleChecksumFiles(
  filePaths: string[],
  algorithm: HashAlgorithm,
  allowedDirectories: string[]
): Promise<string> {
  const result = await getFileChecksumsResult(filePaths, algorithm, allowedDirectories);

  // Format the results
  let output = `Checksums (${algorithm}):\n\n`;

  if (result.entries.length > 0) {
    for (const entry of result.entries) {
      output += `${entry.hash}  ${entry.path}\n`;
    }
  }

  if (result.errors.length > 0) {
    output += "\nErrors:\n";
    for (const error of result.errors) {
      output += `${error.path}: ${error.error}\n`;
    }
  }

  assertActualTextBudget(
    "get_file_checksums",
    output.length,
    METADATA_RESPONSE_CAP_CHARS,
    "formatted checksum output",
  );

  return output;
}
