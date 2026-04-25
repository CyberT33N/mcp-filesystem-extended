import fs from "fs/promises";
import path from "path";

import { normalizeError } from "@shared/errors";

import { PATH_MUTATION_SUMMARY_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import { assertContentMutationInputBudget } from "../shared/mutation-guardrails";
import { formatBatchMutationSummary } from "@infrastructure/formatting/batch-result-formatter";
import { validatePathForCreation } from "@infrastructure/filesystem/path-guard";

/**
 * Creates new files while enforcing cumulative content-bearing mutation budgets before any write
 * begins.
 *
 * @remarks
 * Content-bearing mutation endpoints are governed primarily by request-size safety. This handler
 * refuses oversize cumulative content before touching the filesystem and keeps the success summary
 * small so mutation responses do not mirror large caller-supplied payloads.
 *
 * @param files - File creation requests containing the target path and full file content.
 * @param allowedDirectories - Directory roots that bound every requested creation path.
 * @returns A concise mutation summary covering successful creates and file-level failures.
 */
export async function handleCreateFiles(
  files: Array<{path: string, content: string}>, 
  allowedDirectories: string[]
): Promise<string> {
  assertContentMutationInputBudget("create_files", files);

  const results: string[] = [];
  const errors: string[] = [];
  
  await Promise.all(
    files.map(async (file) => {
      try {
        // Validate path for creation to allow writing into not-yet-existing directories
        const validPath = await validatePathForCreation(file.path, allowedDirectories);
        
        // Check if file already exists
        try {
          await fs.access(validPath);
          // If we get here, the file exists
          throw new Error(`File already exists. Use replace_file_line_ranges to modify existing files.`);
        } catch (accessError) {
          // File doesn't exist, which is what we want for this function
          if ((accessError as NodeJS.ErrnoException).code !== 'ENOENT') {
            // Some other error occurred during access check
            throw accessError;
          }
        }
        
        // Ensure parent directory exists
        const directory = path.dirname(validPath);
        await fs.mkdir(directory, { recursive: true });
        
        // Write file content
        await fs.writeFile(validPath, file.content, "utf-8");
        
        results.push(`Successfully created file: ${file.path}`);
      } catch (error) {
        const errorMessage = normalizeError(error).message;
        errors.push(`Failed to create file ${file.path}: ${errorMessage}`);
      }
    })
  );
  
  const successCount = results.length;
  const output = formatBatchMutationSummary("files", successCount, errors);

  assertActualTextBudget(
    "create_files",
    output.length,
    PATH_MUTATION_SUMMARY_CAP_CHARS,
    "Create-files mutation summary",
  );

  return output;
}
