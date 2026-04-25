import { normalizeError } from "@shared/errors";

import { METADATA_RESPONSE_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import { calculateFileHash, type HashAlgorithm } from "@infrastructure/filesystem/checksum";
import { validatePath } from "@infrastructure/filesystem/path-guard";

import { validateHash } from "./helpers";

interface FileVerificationResult {
  path: string;
  expectedHash: string;
  actualHash: string;
  valid: boolean;
}

interface FileVerificationError {
  path: string;
  expectedHash: string;
  error: string;
}

export interface FileChecksumVerificationResult {
  entries: FileVerificationResult[];
  errors: FileVerificationError[];
  summary: {
    validCount: number;
    invalidCount: number;
    errorCount: number;
  };
}

/**
 * Computes structured checksum-verification results for a requested file batch.
 *
 * @remarks
 * This helper keeps path validation, checksum generation, and normalized hash
 * comparison inside the metadata family while preserving partial failures for
 * later formatting under the shared response budget.
 *
 * @param files - Requested file and expected-hash pairs in caller-supplied order.
 * @param algorithm - Hash algorithm selected by the request contract.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @returns Structured verification entries, failures, and aggregate summary counts.
 */
export async function getFileChecksumVerificationResult(
  files: Array<{ path: string; expectedHash: string }>,
  algorithm: HashAlgorithm,
  allowedDirectories: string[],
): Promise<FileChecksumVerificationResult> {
  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const validPath = await validatePath(file.path, allowedDirectories);
        const actualHash = await calculateFileHash(validPath, algorithm);
        const isValid = validateHash(actualHash, file.expectedHash);

        return {
          entry: {
            path: file.path,
            expectedHash: file.expectedHash,
            actualHash,
            valid: isValid,
          },
        };
      } catch (error) {
        const errorMessage = normalizeError(error).message;

        return {
          error: {
            path: file.path,
            expectedHash: file.expectedHash,
            error: errorMessage,
          },
        };
      }
    }),
  );

  const entries = results.flatMap((result) => (result.entry ? [result.entry] : []));
  const errors = results.flatMap((result) => (result.error ? [result.error] : []));
  const validCount = entries.filter((entry) => entry.valid).length;
  const invalidCount = entries.filter((entry) => !entry.valid).length;

  return {
    entries,
    errors,
    summary: {
      validCount,
      invalidCount,
      errorCount: errors.length,
    },
  };
}

/**
 * Formats checksum-verification results for the caller-visible text surface.
 *
 * @remarks
 * The verification endpoint stays in the metadata family, so the formatted
 * output emphasizes concise validity summaries while the final text surface is
 * still rejected if it would exceed the shared metadata response cap.
 *
 * @param files - Requested file and expected-hash pairs in caller-supplied order.
 * @param algorithm - Hash algorithm selected by the request contract.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @returns Human-readable verification output bounded by the metadata-family text budget.
 */
export async function handleChecksumFilesVerif(
  files: Array<{ path: string; expectedHash: string }>,
  algorithm: HashAlgorithm,
  allowedDirectories: string[]
): Promise<string> {
  const result = await getFileChecksumVerificationResult(
    files,
    algorithm,
    allowedDirectories,
  );

  // Format the results
  let output = `Checksum Verification Results (${algorithm}):\n`;
  output += `✅ Valid: ${result.summary.validCount}\n`;
  output += `❌ Invalid: ${result.summary.invalidCount}\n`;
  output += `⚠️ Errors: ${result.summary.errorCount}\n\n`;

  // Valid files
  if (result.summary.validCount > 0) {
    output += "Valid Files:\n";
    for (const entry of result.entries.filter((entry) => entry.valid)) {
      output += `✓ ${entry.path}\n`;
    }
    output += "\n";
  }

  // Invalid files
  if (result.summary.invalidCount > 0) {
    output += "Invalid Files:\n";
    for (const entry of result.entries.filter((entry) => !entry.valid)) {
      output += `✗ ${entry.path}\n`;
      output += `  Expected: ${entry.expectedHash}\n`;
      output += `  Actual:   ${entry.actualHash}\n`;
    }
    output += "\n";
  }

  // Errors
  if (result.summary.errorCount > 0) {
    output += "Errors:\n";
    for (const error of result.errors) {
      output += `! ${error.path}: ${error.error}\n`;
    }
  }

  assertActualTextBudget(
    "verify_file_checksums",
    output.length,
    METADATA_RESPONSE_CAP_CHARS,
    "formatted checksum verification output",
  );

  return output;
}
