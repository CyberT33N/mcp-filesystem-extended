import fs from "fs/promises";
import { assertPathMutationBatchBudget } from "../shared/mutation-guardrails";
import { formatBatchMutationSummary } from "@infrastructure/formatting/batch-result-formatter";
import { validatePathForCreation } from "@infrastructure/filesystem/path-guard";
import { createModuleLogger } from "@infrastructure/logging/logger";

const log = createModuleLogger("create_directories");

/**
 * Creates directories after validating each requested path and refusing oversized mutation batches
 * before any filesystem mutation begins.
 *
 * @remarks
 * Directory creation is a path-mutation surface, so the primary safeguard is blast-radius control
 * through bounded batch size and path validation rather than response-size shaping.
 *
 * @param paths - Directory paths requested by the caller.
 * @param allowedDirectories - Allowed filesystem roots used by path validation.
 * @returns A deterministic batch summary or a shared guardrail refusal message.
 */
export async function handleCreateDirectories(
  paths: string[],
  allowedDirectories: string[]
): Promise<string> {
  try {
    assertPathMutationBatchBudget("create_directories", paths.length);
  } catch (guardError) {
    return guardError instanceof Error ? guardError.message : String(guardError);
  }

  const results: string[] = [];
  const errors: string[] = [];

  log.debug({ paths, allowedDirectories }, "handleCreateDirectories called");

  await Promise.all(
    paths.map(async (dirPath) => {
      const childLog = log.child({ dirPath });
      try {
        childLog.debug("validating path for creation");
        // Validate path is within allowed directories and safe for creation
        const validPath = await validatePathForCreation(dirPath, allowedDirectories);
        childLog.debug({ validPath }, "validated path");
        
        // Create directory (and parent directories if needed)
        childLog.debug("calling fs.mkdir with recursive:true");
        await fs.mkdir(validPath, { recursive: true });
        childLog.info({ created: validPath }, "directory created");
        
        results.push(`Successfully created directory: ${dirPath}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        childLog.error({ err: error }, "failed to create directory");
        errors.push(`Failed to create directory ${dirPath}: ${errorMessage}`);
      }
    })
  );

  const successCount = results.length;
  log.debug({ successCount, errorCount: errors.length }, "handleCreateDirectories completed");
  return formatBatchMutationSummary("directories", successCount, errors);
}
