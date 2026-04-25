import fs from "fs/promises";
import path from "path";

import { normalizeError } from "@shared/errors";

import {
  CONTENT_MUTATION_TOTAL_INPUT_CHARS,
  PATH_MUTATION_SUMMARY_CAP_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import {
  createRuntimeBudgetExceededFailure,
  formatToolGuardrailFailureAsText,
} from "@domain/shared/guardrails/tool-guardrail-error-contract";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
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
  const totalInputChars = files.reduce(
    (totalChars, file) => totalChars + file.content.length,
    0,
  );

  if (totalInputChars > CONTENT_MUTATION_TOTAL_INPUT_CHARS) {
    throw new Error(
      formatToolGuardrailFailureAsText(
        createRuntimeBudgetExceededFailure({
          toolName: "append_files",
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
  
  // Format the results
  const successCount = results.length;
  const errorCount = errors.length;
  
  let output = `Processed ${successCount + errorCount} files:\n`;
  output += `- ${successCount} files appended successfully\n`;
  
  if (errorCount > 0) {
    output += `- ${errorCount} files failed\n\n`;
    output += "Errors:\n" + errors.join("\n");
  }

  assertActualTextBudget(
    "append_files",
    output.length,
    PATH_MUTATION_SUMMARY_CAP_CHARS,
    "Append-files mutation summary",
  );
  
  return output;
}
