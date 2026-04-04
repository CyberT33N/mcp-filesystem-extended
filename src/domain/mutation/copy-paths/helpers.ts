import fs from "fs/promises";
import path from "path";
import { normalizePath, validatePath } from "@infrastructure/filesystem/path-guard";

export interface CopyPathsOperation {
  source: string;
  destination: string;
  recursive: boolean;
  overwrite: boolean;
}

export interface PreparedCopyPathsOperation extends CopyPathsOperation {
  validSourcePath: string;
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
      throw new Error(
        `Parallel copy conflict detected: ${buildOperationLabel(operation)} copies a directory into its own destination subtree.`
      );
    }
  }

  for (let index = 0; index < operations.length; index++) {
    const current = operations[index];

    for (let compareIndex = index + 1; compareIndex < operations.length; compareIndex++) {
      const comparison = operations[compareIndex];

      if (arePathsEqualOrNested(current.validDestinationPath, comparison.validDestinationPath)) {
        throw new Error(
          `Parallel copy conflict detected: ${buildOperationLabel(current)} and ${buildOperationLabel(comparison)} target the same or overlapping destination paths.`
        );
      }

      if (arePathsEqualOrNested(current.validSourcePath, comparison.validDestinationPath)) {
        throw new Error(
          `Parallel copy conflict detected: ${buildOperationLabel(comparison)} writes to a path that overlaps the source of ${buildOperationLabel(current)}.`
        );
      }

      if (arePathsEqualOrNested(comparison.validSourcePath, current.validDestinationPath)) {
        throw new Error(
          `Parallel copy conflict detected: ${buildOperationLabel(current)} writes to a path that overlaps the source of ${buildOperationLabel(comparison)}.`
        );
      }
    }
  }
}

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
