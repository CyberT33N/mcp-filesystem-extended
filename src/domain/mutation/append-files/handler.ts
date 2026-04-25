import fs from "fs/promises";
import path from "path";

import { normalizeError } from "@shared/errors";

import { PATH_MUTATION_SUMMARY_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import { assertContentMutationInputBudget } from "../shared/mutation-guardrails";
import { formatBatchMutationSummary } from "@infrastructure/formatting/batch-result-formatter";
import { validatePath } from "@infrastructure/filesystem/path-guard";

/**
 * Appends caller-supplied text to existing files while enforcing the cumulative content-bearing
 * mutation budget before filesystem writes begin.
 *
 * @remarks
 * Append operations are governed primarily by request-size safety rather than large response
 * output. The handler refuses oversize cumulative content before any append starts and keeps the
 * success summary concise so mutation responses do not echo large content bodies.
 *
 * @param files - File append requests that carry the target path and appended content.
 * @param allowedDirectories - Directory roots that bound every requested append path.
 * @returns A concise mutation summary covering successful appends and file-level failures.
 */
export async function handleAppendFiles(
  files: Array<{path: string, content: string}>, 
  allowedDirectories: string[]
): Promise<string> {
  assertContentMutationInputBudget("append_files", files);

  const results: string[] = [];
  const errors: string[] = [];

  await Promise.all(
    files.map(async (file) => {
      try {
        const validPath = await validatePath(file.path, allowedDirectories);
        
        // Ensure parent directory exists
        const directory = path.dirname(validPath);
        await fs.mkdir(directory, { recursive: true });
        
        // Append content to file (create if doesn't exist)
        await fs.appendFile(validPath, file.content, "utf-8");
        
        results.push(`Successfully appended to ${file.path}`);
      } catch (error) {
        const errorMessage = normalizeError(error).message;
        errors.push(`Failed to append to file ${file.path}: ${errorMessage}`);
      }
    })
  );
  
  const successCount = results.length;
  const output = formatBatchMutationSummary("files", successCount, errors);

  assertActualTextBudget(
    "append_files",
    output.length,
    PATH_MUTATION_SUMMARY_CAP_CHARS,
    "Append-files mutation summary",
  );

  return output;
}
