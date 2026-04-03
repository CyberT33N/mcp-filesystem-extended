import fs from "fs/promises";
import { validatePath } from "@infrastructure/filesystem/path-guard.js";
import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter.js";
import { createUnifiedDiff } from "@infrastructure/formatting/unified-diff.js";

interface FileDiffOperation {
  file1: string;
  file2: string;
}

async function getFormattedFileDiff(
  operation: FileDiffOperation,
  allowedDirectories: string[]
): Promise<string> {
  const validFile1Path = await validatePath(operation.file1, allowedDirectories);
  const validFile2Path = await validatePath(operation.file2, allowedDirectories);

  const file1Content = await fs.readFile(validFile1Path, "utf-8");
  const file2Content = await fs.readFile(validFile2Path, "utf-8");

  const diff = createUnifiedDiff(file1Content, file2Content, operation.file1, operation.file2);

  if (diff.trim() === "") {
    return "Files are identical.";
  }

  let numBackticks = 3;
  while (diff.includes("`".repeat(numBackticks))) {
    numBackticks++;
  }

  return `${"`".repeat(numBackticks)}diff\n${diff}${"`".repeat(numBackticks)}`;
}

export async function handleFileDiff(
  operations: FileDiffOperation[],
  allowedDirectories: string[]
): Promise<string> {
  if (operations.length === 1) {
    return getFormattedFileDiff(operations[0], allowedDirectories);
  }

  const results = await Promise.all(
    operations.map(async (operation) => {
      try {
        const output = await getFormattedFileDiff(operation, allowedDirectories);
        return {
          label: `${operation.file1} ↔ ${operation.file2}`,
          output,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          label: `${operation.file1} ↔ ${operation.file2}`,
          error: `Error comparing files: ${errorMessage}`,
        };
      }
    })
  );

  return formatBatchTextOperationResults("file diff", results);
}
