import { isDefined } from "remeda";

import { normalizeError } from "@shared/errors";

import { METADATA_RESPONSE_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import {
  calculateFileRegionHash,
  type HashAlgorithm,
} from "@infrastructure/filesystem/checksum";
import { validatePath } from "@infrastructure/filesystem/path-guard";

import { hashesMatch, toFileRegion, type FileRegionInput } from "./helpers";

/**
 * Reference-side result of a byte-identity verification request.
 */
export interface ByteIdentityReferenceResult {
  /** Echo of the caller-supplied reference path. */
  path: string;
  /** Hash of the reference region under the selected algorithm. */
  regionHash: string;
}

/**
 * Per-target verification entry produced when a comparison result exists.
 */
export interface ByteIdentityEntry {
  /** Echo of the caller-supplied target path. */
  path: string;
  /** Hash of the reference region used for the comparison. */
  referenceHash: string;
  /** Hash of the target region under the selected algorithm. */
  actualHash: string;
  /** Normalized comparison outcome. */
  valid: boolean;
}

/**
 * Per-target failure produced before a comparison result could exist.
 */
export interface ByteIdentityError {
  /** Echo of the caller-supplied target path. */
  path: string;
  /** Normalized failure message. */
  error: string;
}

/**
 * Structured byte-identity result across the requested target batch.
 */
export interface FileByteIdentityResult {
  /** Reference-side proof surface of the request. */
  reference: ByteIdentityReferenceResult;
  /** Successful comparison entries in request order. */
  entries: ByteIdentityEntry[];
  /** Per-target failures in request order. */
  errors: ByteIdentityError[];
  /** Aggregate verification counts. */
  summary: {
    /** Targets whose region hash matched the reference region hash. */
    validCount: number;
    /** Targets whose region hash did not match. */
    invalidCount: number;
    /** Targets that failed before a comparison result could be produced. */
    errorCount: number;
  };
}

/**
 * Reference input of a byte-identity request.
 */
export interface ByteIdentityReferenceInput {
  /** Path of the reference file. */
  path: string;
  /** Optional region binding; defaults to the whole file. */
  region?: FileRegionInput | undefined;
}

/**
 * Target input of a byte-identity request.
 */
export interface ByteIdentityTargetInput {
  /** Path of the target file. */
  path: string;
  /** Optional region binding; defaults to the whole file. */
  region?: FileRegionInput | undefined;
}

/**
 * Computes the structured byte-identity result for a reference and a target batch.
 *
 * @remarks
 * The reference is resolved once and fail-closed: a reference that cannot be
 * read or whose marker is absent fails the whole request, because no target
 * verdict could be produced without it. Target failures stay per-file.
 *
 * @param reference - Reference file and optional region binding.
 * @param targets - Target files with optional region bindings, in caller order.
 * @param algorithm - Hash algorithm selected by the request contract.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @returns Structured reference, per-target entries, failures, and summary counts.
 */
export async function getFileByteIdentityResult(
  reference: ByteIdentityReferenceInput,
  targets: ByteIdentityTargetInput[],
  algorithm: HashAlgorithm,
  allowedDirectories: string[],
): Promise<FileByteIdentityResult> {
  const referencePath = await validatePath(reference.path, allowedDirectories);
  const referenceHash = await calculateFileRegionHash(
    referencePath,
    toFileRegion(reference.region ?? { mode: "whole-file" }),
    algorithm,
  );

  const results = await Promise.all(
    targets.map(async (target) => {
      try {
        const validPath = await validatePath(target.path, allowedDirectories);
        const actualHash = await calculateFileRegionHash(
          validPath,
          toFileRegion(target.region ?? { mode: "whole-file" }),
          algorithm,
        );

        return {
          entry: {
            path: target.path,
            referenceHash,
            actualHash,
            valid: hashesMatch(actualHash, referenceHash),
          },
        };
      } catch (error) {
        const errorMessage = normalizeError(error).message;

        return {
          error: {
            path: target.path,
            error: errorMessage,
          },
        };
      }
    }),
  );

  const entries = results.flatMap((result) => (isDefined(result.entry) ? [result.entry] : []));
  const errors = results.flatMap((result) => (isDefined(result.error) ? [result.error] : []));
  const validCount = entries.filter((entry) => entry.valid).length;

  return {
    reference: {
      path: reference.path,
      regionHash: referenceHash,
    },
    entries,
    errors,
    summary: {
      validCount,
      invalidCount: entries.length - validCount,
      errorCount: errors.length,
    },
  };
}

/**
 * Formats byte-identity results for the caller-visible text response surface.
 *
 * @param reference - Reference file and optional region binding.
 * @param targets - Target files with optional region bindings, in caller order.
 * @param algorithm - Hash algorithm selected by the request contract.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @returns Human-readable verification output bounded by the metadata-family text budget.
 */
export async function handleVerifyFileByteIdentity(
  reference: ByteIdentityReferenceInput,
  targets: ByteIdentityTargetInput[],
  algorithm: HashAlgorithm,
  allowedDirectories: string[]
): Promise<string> {
  const result = await getFileByteIdentityResult(reference, targets, algorithm, allowedDirectories);

  let output = `Byte Identity Verification (${algorithm}):\n`;
  output += `Reference: ${result.reference.path}\n`;
  output += `Reference region hash: ${result.reference.regionHash}\n\n`;
  output += `✅ Identical: ${result.summary.validCount}\n`;
  output += `❌ Different: ${result.summary.invalidCount}\n`;
  output += `⚠️ Errors: ${result.summary.errorCount}\n\n`;

  if (result.summary.validCount > 0) {
    output += "Identical Files:\n";
    for (const entry of result.entries.filter((entry) => entry.valid)) {
      output += `✓ ${entry.path}\n`;
    }
    output += "\n";
  }

  if (result.summary.invalidCount > 0) {
    output += "Different Files:\n";
    for (const entry of result.entries.filter((entry) => !entry.valid)) {
      output += `✗ ${entry.path}\n`;
      output += `  Reference: ${entry.referenceHash}\n`;
      output += `  Actual:    ${entry.actualHash}\n`;
    }
    output += "\n";
  }

  if (result.summary.errorCount > 0) {
    output += "Errors:\n";
    for (const error of result.errors) {
      output += `! ${error.path}: ${error.error}\n`;
    }
  }

  assertActualTextBudget(
    "verify_file_byte_identity",
    output.length,
    METADATA_RESPONSE_CAP_CHARS,
    "formatted byte-identity verification output",
  );

  return output;
}
