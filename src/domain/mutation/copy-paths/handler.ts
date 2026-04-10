import fs from "fs/promises";
import {
  createRuntimeBudgetExceededFailure,
  formatToolGuardrailFailureAsText,
} from "@domain/shared/guardrails/tool-guardrail-error-contract";
import { MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST } from "@domain/shared/guardrails/tool-guardrail-limits";
import { validatePath } from "@infrastructure/filesystem/path-guard";
import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter";

import {
  assertCopyOperationsAreSafeForParallelExecution,
  copyDir,
  type CopyPathsOperation,
  type PreparedCopyPathsOperation,
} from "./helpers";

async function prepareCopyOperation(
  operation: CopyPathsOperation,
  allowedDirectories: string[]
): Promise<PreparedCopyPathsOperation> {
  const validSourcePath = await validatePath(operation.source, allowedDirectories);
  const validDestinationPath = await validatePath(operation.destination, allowedDirectories);

  return {
    ...operation,
    validSourcePath,
    validDestinationPath,
  };
}

async function copySingleOperation(
  operation: PreparedCopyPathsOperation,
  allowedDirectories: string[]
): Promise<string> {
  try {
    const sourceStats = await fs.stat(operation.validSourcePath);

    try {
      await fs.access(operation.validDestinationPath);
      if (!operation.overwrite) {
        throw new Error(
          `Destination already exists: ${operation.destination}. Use overwrite=true to replace it.`
        );
      }
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("ENOENT")) {
        throw error;
      }
    }

    if (sourceStats.isDirectory()) {
      if (!operation.recursive) {
        throw new Error(`Source is a directory. Use recursive=true to copy directories.`);
      }

      await fs.mkdir(operation.validDestinationPath, { recursive: true });
      await copyDir(operation.validSourcePath, operation.validDestinationPath, allowedDirectories);
      return `Successfully copied directory ${operation.source} to ${operation.destination}`;
    }

    await fs.copyFile(operation.validSourcePath, operation.validDestinationPath);
    return `Successfully copied file ${operation.source} to ${operation.destination}`;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Error copying ${operation.source} to ${operation.destination}: ${errorMessage}`);
  }
}

/**
 * Copies files or directories after validating path scope and refusing oversized mutation batches
 * before any filesystem mutation begins.
 *
 * @remarks
 * Path-mutation endpoints are governed primarily by blast radius and batch breadth instead of
 * large response bodies. This handler therefore rejects oversize operation sets before copying and
 * uses shared overlap checks to prevent unsafe parallel copy plans.
 *
 * @param operations - Copy operations requested by the caller.
 * @param allowedDirectories - Allowed filesystem roots used by path validation.
 * @returns A deterministic batch summary or a shared guardrail refusal message.
 */
export async function handleCopyPaths(
  operations: CopyPathsOperation[],
  allowedDirectories: string[]
): Promise<string> {
  if (operations.length > MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST) {
    return formatToolGuardrailFailureAsText(
      createRuntimeBudgetExceededFailure({
        toolName: "copy_paths",
        budgetSurface: "copy_paths.operations",
        measuredValue: operations.length,
        limitValue: MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST,
      })
    );
  }

  const preparedOperations = await Promise.all(
    operations.map((operation) => prepareCopyOperation(operation, allowedDirectories))
  );

  await assertCopyOperationsAreSafeForParallelExecution(preparedOperations);

  const results = await Promise.all(
    preparedOperations.map(async (operation) => {
      try {
        const output = await copySingleOperation(operation, allowedDirectories);
        return {
          label: `${operation.source} -> ${operation.destination}`,
          output,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          label: `${operation.source} -> ${operation.destination}`,
          error: errorMessage,
        };
      }
    })
  );

  return formatBatchTextOperationResults("copy paths", results);
}
