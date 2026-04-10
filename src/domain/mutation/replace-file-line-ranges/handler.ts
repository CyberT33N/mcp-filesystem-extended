import { LINE_REPLACEMENT_TOTAL_INPUT_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";
import {
  createRuntimeBudgetExceededFailure,
  formatToolGuardrailFailureAsText,
} from "@domain/shared/guardrails/tool-guardrail-error-contract";
import { validatePath } from "@infrastructure/filesystem/path-guard";
import {
  applyFileLineRangeReplacements,
} from "./helpers";
import type { ReplaceFileLineRangesOptions } from "./helpers";

/**
 * Applies line-range replacements across one or more files after rejecting oversize cumulative
 * replacement payloads at the request boundary.
 *
 * @remarks
 * Line-range replacement is the content-bearing mutation surface that preserves the canonical
 * `replacementText` contract from schema to runtime. The handler refuses oversize cumulative
 * replacement input before applying edits and keeps previews tied to the same same-concept property
 * surface instead of drifting back to alternative names.
 *
 * @param files - File replacement requests using the canonical `replacementText` payload surface.
 * @param dryRun - When true, computes previews without writing files.
 * @param options - Controls indentation-preserving replacement behavior.
 * @param allowedDirectories - Directory roots that bound every requested file path.
 * @returns A human-readable summary of successful replacements or previews plus file-level failures.
 */
export async function handleReplaceFileLineRanges(
  files: Array<{
    path: string;
    replacements: Array<{ startLine: number; endLine: number; replacementText: string }>;
  }>,
  dryRun: boolean,
  options: ReplaceFileLineRangesOptions,
  allowedDirectories: string[]
): Promise<string> {
  const totalReplacementTextChars = files.reduce(
    (fileTotal, file) =>
      fileTotal +
      file.replacements.reduce(
        (replacementTotal, replacement) => replacementTotal + replacement.replacementText.length,
        0,
      ),
    0,
  );

  if (totalReplacementTextChars > LINE_REPLACEMENT_TOTAL_INPUT_CHARS) {
    const failure = createRuntimeBudgetExceededFailure({
      toolName: "replace_file_line_ranges",
      budgetSurface: "Cumulative replacementText request budget",
      measuredValue: totalReplacementTextChars,
      limitValue: LINE_REPLACEMENT_TOTAL_INPUT_CHARS,
    });

    throw new Error(formatToolGuardrailFailureAsText(failure));
  }

  const results: string[] = [];
  const errors: string[] = [];

  await Promise.all(
    files.map(async (file) => {
      try {
        // Validate path is within allowed directories
        const validPath = await validatePath(file.path, allowedDirectories);
        
        // Apply line-range replacements to the file
        const result = await applyFileLineRangeReplacements(
          validPath,
          file.replacements,
          dryRun,
          options,
        );
        
        results.push(`File: ${file.path}\n${result}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to replace line ranges in ${file.path}: ${errorMessage}`);
      }
    })
  );

  // Format the results
  const successCount = results.length;
  const errorCount = errors.length;
  
  let output = `Processed ${successCount + errorCount} files:\n`;
  output += `- ${successCount} files updated successfully\n`;
  
  if (errorCount > 0) {
    output += `- ${errorCount} files failed\n\n`;
    output += "Errors:\n" + errors.join("\n\n");
  }
  
  // Add line-range replacement results for successful updates
  if (successCount > 0) {
    output += "\n\nReplacement Results:\n" + "=".repeat(40) + "\n";
    output += results.join("\n" + "=".repeat(40) + "\n");
  }
  
  return output;
}
