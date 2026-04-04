import { validatePath } from "@infrastructure/filesystem/path-guard";
import {
  applyFileLineRangeReplacements,
  ReplaceFileLineRangesOptions,
} from "./helpers";

export async function handleReplaceFileLineRanges(
  files: Array<{
    path: string;
    replacements: Array<{ startLine: number; endLine: number; newText: string }>;
  }>,
  dryRun: boolean,
  options: ReplaceFileLineRangesOptions,
  allowedDirectories: string[]
): Promise<string> {
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
