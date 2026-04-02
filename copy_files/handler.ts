import fs from "fs/promises";
import {
  assertCopyOperationsAreSafeForParallelExecution,
  copyDir,
  type CopyFileOperation,
  type PreparedCopyFileOperation,
} from "./helpers.js";
import { validatePath } from "../helpers/path.js";
import { formatBatchTextOperationResults } from "../helpers/batch.js";

async function prepareCopyOperation(
  operation: CopyFileOperation,
  allowedDirectories: string[]
): Promise<PreparedCopyFileOperation> {
  const validSourcePath = await validatePath(operation.source, allowedDirectories);
  const validDestinationPath = await validatePath(operation.destination, allowedDirectories);

  return {
    ...operation,
    validSourcePath,
    validDestinationPath,
  };
}

async function copySingleOperation(
  operation: PreparedCopyFileOperation,
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

export async function handleCopyFile(
  operations: CopyFileOperation[],
  allowedDirectories: string[]
): Promise<string> {
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

  return formatBatchTextOperationResults("copy", results);
}
