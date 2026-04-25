import fs from "fs/promises";

import { normalizeError } from "@shared/errors";

import { FILE_DIFF_RESPONSE_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import { validatePath } from "@infrastructure/filesystem/path-guard";
import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter";
import { createUnifiedDiff, wrapDiffInSafeFencedBlock } from "@infrastructure/formatting/unified-diff";

interface DiffFilesPair {
  file1: string;
  file2: string;
}

async function getFormattedFileDiff(
  operation: DiffFilesPair,
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

  return wrapDiffInSafeFencedBlock(diff);
}

/**
 * Formats one or more file-backed unified diffs for the caller-visible text surface.
 *
 * @remarks
 * This entrypoint handles the lower-risk comparison family surface where the
 * server reads validated files from disk instead of accepting arbitrary raw text.
 * The diff payload is still bounded by the dedicated file-diff response cap so
 * large textual differences are rejected before they escape the comparison family.
 *
 * @param operations - File pairs that should be diffed in caller-supplied order.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @returns Unified diff output bounded by the file-diff family response budget.
 */
export async function handleFileDiff(
  operations: DiffFilesPair[],
  allowedDirectories: string[]
): Promise<string> {
  if (operations.length === 1) {
    const output = await getFormattedFileDiff(operations[0]!, allowedDirectories);

    assertActualTextBudget(
      "diff_files",
      output.length,
      FILE_DIFF_RESPONSE_CAP_CHARS,
      "File diff output exceeds the file-diff family cap.",
    );

    return output;
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
        const errorMessage = normalizeError(error).message;
        return {
          label: `${operation.file1} ↔ ${operation.file2}`,
          error: `Error comparing files: ${errorMessage}`,
        };
      }
    })
  );

  const output = formatBatchTextOperationResults("diff files", results);

  assertActualTextBudget(
    "diff_files",
    output.length,
    FILE_DIFF_RESPONSE_CAP_CHARS,
    "File diff output exceeds the file-diff family cap.",
  );

  return output;
}
