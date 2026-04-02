import { validatePath } from "../helpers/path.js";
import { applyFilePatches, PatchOptions } from "./helpers.js";

export async function handlePatchFiles(
  files: Array<{
    path: string;
    patches: Array<{ startLine: number; endLine: number; newText: string }>;
  }>,
  dryRun: boolean,
  options: PatchOptions,
  allowedDirectories: string[]
): Promise<string> {
  const results: string[] = [];
  const errors: string[] = [];

  await Promise.all(
    files.map(async (file) => {
      try {
        // Validate path is within allowed directories
        const validPath = await validatePath(file.path, allowedDirectories);
        
        // Apply patches to the file
        const result = await applyFilePatches(validPath, file.patches, dryRun, options);
        
        results.push(`File: ${file.path}\n${result}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to patch ${file.path}: ${errorMessage}`);
      }
    })
  );

  // Format the results
  const successCount = results.length;
  const errorCount = errors.length;
  
  let output = `Processed ${successCount + errorCount} files:\n`;
  output += `- ${successCount} files patched successfully\n`;
  
  if (errorCount > 0) {
    output += `- ${errorCount} files failed\n\n`;
    output += "Errors:\n" + errors.join("\n\n");
  }
  
  // Add patch results for successful patches
  if (successCount > 0) {
    output += "\n\nPatch Results:\n" + "=".repeat(40) + "\n";
    output += results.join("\n" + "=".repeat(40) + "\n");
  }
  
  return output;
}