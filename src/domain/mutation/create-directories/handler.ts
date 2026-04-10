import fs from "fs/promises";
import {
  createRuntimeBudgetExceededFailure,
  formatToolGuardrailFailureAsText,
} from "@domain/shared/guardrails/tool-guardrail-error-contract";
import { MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST } from "@domain/shared/guardrails/tool-guardrail-limits";
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
  if (paths.length > MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST) {
    return formatToolGuardrailFailureAsText(
      createRuntimeBudgetExceededFailure({
        toolName: "create_directories",
        budgetSurface: "create_directories.paths",
        measuredValue: paths.length,
        limitValue: MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST,
      })
    );
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

  // Format the results
  const successCount = results.length;
  const errorCount = errors.length;
  
  let output = `Processed ${successCount + errorCount} directories:\n`;
  output += `- ${successCount} directories created successfully\n`;
  
  if (errorCount > 0) {
    output += `- ${errorCount} directories failed\n\n`;
    output += "Errors:\n" + errors.join("\n");
  }
  
  log.debug({ successCount, errorCount }, "handleCreateDirectories completed");
  return output;
}
