import fs from "fs/promises";
import path from "path";
import {
  createMetadataPreflightRejectedFailure,
  formatToolGuardrailFailureAsText,
} from "@domain/shared/guardrails/tool-guardrail-error-contract";
import { normalizePath, validatePath } from "@infrastructure/filesystem/path-guard";

/**
 * Describes one caller-supplied copy operation before path validation.
 */
export interface CopyPathsOperation {
  /**
   * Source path requested by the caller.
   */
  source: string;

  /**
   * Destination path requested by the caller.
   */
  destination: string;

  /**
   * Whether recursive directory copy is allowed.
   */
  recursive: boolean;

  /**
   * Whether an existing destination may be replaced.
   */
  overwrite: boolean;
}

/**
 * Describes a copy operation after source and destination paths have been validated.
 */
export interface PreparedCopyPathsOperation extends CopyPathsOperation {
  /**
   * Validated source path inside the allowed filesystem surface.
   */
  validSourcePath: string;

  /**
   * Validated destination path inside the allowed filesystem surface.
   */
  validDestinationPath: string;
}

function normalizeConflictPath(targetPath: string): string {
  const normalized = normalizePath(targetPath);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function arePathsEqualOrNested(leftPath: string, rightPath: string): boolean {
  const normalizedLeft = normalizeConflictPath(leftPath);
  const normalizedRight = normalizeConflictPath(rightPath);

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(`${normalizedRight}${path.sep}`) ||
    normalizedRight.startsWith(`${normalizedLeft}${path.sep}`)
  );
}

function buildOperationLabel(operation: PreparedCopyPathsOperation): string {
  return `${operation.source} -> ${operation.destination}`;
}

function createParallelCopyConflictError(
  conflictingSurface: string,
  reason: string,
): Error {
  return new Error(
    formatToolGuardrailFailureAsText(
      createMetadataPreflightRejectedFailure({
        toolName: "copy_paths",
        preflightTarget: "copy_paths.parallel_copy_conflict",
        measuredValue: conflictingSurface,
        limitValue: "copy operations must remain non-overlapping across source and destination paths",
        reason,
        recommendedAction: "Split the request into non-overlapping copy batches or change the conflicting paths before retrying.",
      }),
    ),
  );
}

/**
 * Verifies that copy operations can run without overlapping destination paths or source-to-destination conflicts.
 *
 * @param operations - Validated copy operations scheduled for the current batch.
 * @returns Resolves when the batch can execute without overlapping copy hazards.
 */
export async function assertCopyOperationsAreSafeForParallelExecution(
  operations: PreparedCopyPathsOperation[]
): Promise<void> {
  for (const operation of operations) {
    const sourceStats = await fs.stat(operation.validSourcePath);
    if (
      sourceStats.isDirectory() &&
      normalizeConflictPath(operation.validDestinationPath).startsWith(
        `${normalizeConflictPath(operation.validSourcePath)}${path.sep}`
      )
    ) {
      throw createParallelCopyConflictError(
        buildOperationLabel(operation),
        "The copy request places a directory into its own destination subtree.",
      );
    }
  }

  for (let index = 0; index < operations.length; index++) {
    const current = operations[index];
    if (current === undefined) {
      continue;
    }

    for (let compareIndex = index + 1; compareIndex < operations.length; compareIndex++) {
      const comparison = operations[compareIndex];
      if (comparison === undefined) {
        continue;
      }

      if (arePathsEqualOrNested(current.validDestinationPath, comparison.validDestinationPath)) {
        throw createParallelCopyConflictError(
          `${buildOperationLabel(current)} | ${buildOperationLabel(comparison)}`,
          "Two copy operations target the same or overlapping destination paths.",
        );
      }

      if (arePathsEqualOrNested(current.validSourcePath, comparison.validDestinationPath)) {
        throw createParallelCopyConflictError(
          `${buildOperationLabel(current)} | ${buildOperationLabel(comparison)}`,
          "One copy operation writes to a path that overlaps the source of another operation.",
        );
      }

      if (arePathsEqualOrNested(comparison.validSourcePath, current.validDestinationPath)) {
        throw createParallelCopyConflictError(
          `${buildOperationLabel(current)} | ${buildOperationLabel(comparison)}`,
          "One copy operation writes to a path that overlaps the source of another operation.",
        );
      }
    }
  }
}

/**
 * Recursively copies a directory after validating each nested source and destination path.
 *
 * @param src - Validated source directory path.
 * @param dest - Validated destination directory path.
 * @param allowedDirectories - Allowed filesystem roots used by nested path validation.
 * @returns Resolves when the full directory subtree has been copied.
 */
export async function copyDir(src: string, dest: string, allowedDirectories: string[]) {
  await fs.mkdir(dest, { recursive: true });

  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    await validatePath(srcPath, allowedDirectories);
    await validatePath(destPath, allowedDirectories);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath, allowedDirectories);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
