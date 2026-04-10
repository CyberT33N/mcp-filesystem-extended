import fs from "fs/promises";
import path from "path";

import {
  CONTENT_MUTATION_TOTAL_INPUT_CHARS,
  PATH_MUTATION_SUMMARY_CAP_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import {
  createRuntimeBudgetExceededFailure,
  formatToolGuardrailFailureAsText,
} from "@domain/shared/guardrails/tool-guardrail-error-contract";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
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
  const totalInputChars = files.reduce(
    (totalChars, file) => totalChars + file.content.length,
    0,
  );

  if (totalInputChars > CONTENT_MUTATION_TOTAL_INPUT_CHARS) {
    throw new Error(
      formatToolGuardrailFailureAsText(
        createRuntimeBudgetExceededFailure({
          toolName: "create_files",
          budgetSurface: "Cumulative content-bearing mutation input characters",
          measuredValue: totalInputChars,
          limitValue: CONTENT_MUTATION_TOTAL_INPUT_CHARS,
        }),
      ),
    );
  }

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
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to create file ${file.path}: ${errorMessage}`);
      }
    })
  );
  
  // Format the results
  const successCount = results.length;
  const errorCount = errors.length;
  
  let output = `Processed ${successCount + errorCount} files:\n`;
  output += `- ${successCount} files created successfully\n`;
  
  if (errorCount > 0) {
    output += `- ${errorCount} files failed\n\n`;
    output += "Errors:\n" + errors.join("\n");
  }

  assertActualTextBudget(
    "create_files",
    output.length,
    PATH_MUTATION_SUMMARY_CAP_CHARS,
    "Create-files mutation summary",
  );
  
  return output;
}
