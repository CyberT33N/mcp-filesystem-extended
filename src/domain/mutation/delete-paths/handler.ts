import fs from "fs/promises";
import { assertPathMutationBatchBudget } from "../shared/mutation-guardrails";
import { formatBatchMutationSummary } from "@infrastructure/formatting/batch-result-formatter";
import { validatePath } from "@infrastructure/filesystem/path-guard";

/**
 * Deletes files or directories after validating request scope and refusing oversized mutation batches
 * before any filesystem mutation begins.
 *
 * @remarks
 * Deletion is one of the most destructive path-mutation surfaces in the server. The handler keeps
 * safety centered on bounded batch size, validated scope, and explicit recursive intent rather than
 * on verbose result output.
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
    return guardError instanceof Error ? guardError.message : String(guardError);
  }

  const results: string[] = [];
  const errors: string[] = [];

  await Promise.all(
    paths.map(async (targetPath) => {
      try {
        // Validate path is within allowed directories
        const validPath = await validatePath(targetPath, allowedDirectories);
        
        // Get file stats to determine if it's a file or directory
        const stats = await fs.stat(validPath);
        
        if (stats.isDirectory()) {
          if (recursive) {
            await fs.rm(validPath, { recursive: true, force: true });
            results.push(`Successfully deleted directory: ${targetPath}`);
          } else {
            throw new Error("Cannot delete directory without recursive flag");
          }
        } else {
          // Delete the file
          await fs.unlink(validPath);
          results.push(`Successfully deleted file: ${targetPath}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to delete ${targetPath}: ${errorMessage}`);
      }
    })
  );

  const successCount = results.length;
  return formatBatchMutationSummary("paths", successCount, errors);
}
