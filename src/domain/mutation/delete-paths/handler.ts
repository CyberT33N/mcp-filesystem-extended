import fs from "fs/promises";

import { normalizeError } from "@shared/errors";

import { assertPathMutationBatchBudget } from "../shared/mutation-guardrails";
import { formatBatchMutationSummary } from "@infrastructure/formatting/batch-result-formatter";
import { resolveRequestedPath, validatePath } from "@infrastructure/filesystem/path-guard";

/**
 * Deletes files or directories after validating request scope and refusing oversized mutation batches
 * before any filesystem mutation begins.
 *
 * @remarks
 * Deletion is one of the most destructive path-mutation surfaces in the server. The handler keeps
 * safety centered on bounded batch size, validated scope, and explicit recursive intent rather than
 * on verbose result output.
 *
 * Scope security stays realpath-based inside `validatePath`, but the deletion itself targets the
 * requested path: a symbolic link is removed as a link and its target is never touched.
 *
 * @param paths - Filesystem paths requested by the caller.
 * @param recursive - Whether directory deletion is allowed recursively.
 * @param allowedDirectories - Allowed filesystem roots used by path validation.
 * @returns A deterministic batch summary or a shared guardrail refusal message.
 */
export async function handleDeletePaths(
  paths: string[],
  recursive: boolean,
  allowedDirectories: string[]
): Promise<string> {
  try {
    assertPathMutationBatchBudget("delete_paths", paths.length);
  } catch (guardError) {
    return normalizeError(guardError).message;
  }

  const results: string[] = [];
  const errors: string[] = [];

  await Promise.all(
    paths.map(async (targetPath) => {
      try {
        // Validate scope first; the returned realpath is a security proof, not the operation target.
        await validatePath(targetPath, allowedDirectories);
        const operationPath = resolveRequestedPath(targetPath);

        // lstat classifies the requested path itself, never its resolved target.
        const stats = await fs.lstat(operationPath);

        if (stats.isSymbolicLink()) {
          // Remove the link itself; the canonical target stays untouched.
          await fs.rm(operationPath);
          results.push(`Successfully deleted symlink: ${targetPath}`);
        } else if (stats.isDirectory()) {
          if (!recursive) {
            throw new Error("Cannot delete directory without recursive flag");
          }
          await fs.rm(operationPath, { recursive: true, force: true });
          results.push(`Successfully deleted directory: ${targetPath}`);
        } else {
          // Delete the file
          await fs.unlink(operationPath);
          results.push(`Successfully deleted file: ${targetPath}`);
        }
      } catch (error) {
        const errorMessage = normalizeError(error).message;
        errors.push(`Failed to delete ${targetPath}: ${errorMessage}`);
      }
    })
  );

  const successCount = results.length;
  return formatBatchMutationSummary("paths", successCount, errors);
}
