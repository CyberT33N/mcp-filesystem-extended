import fs from "fs/promises";
import { validatePath } from "../helpers/path.js";

export async function handleDeleteFiles(
  paths: string[],
  recursive: boolean,
  allowedDirectories: string[]
): Promise<string> {
  const results: string[] = [];
  const errors: string[] = [];

  await Promise.all(
    paths.map(async (filePath) => {
      try {
        // Validate path is within allowed directories
        const validPath = await validatePath(filePath, allowedDirectories);
        
        // Get file stats to determine if it's a file or directory
        const stats = await fs.stat(validPath);
        
        if (stats.isDirectory()) {
          if (recursive) {
            await fs.rm(validPath, { recursive: true, force: true });
            results.push(`Successfully deleted directory: ${filePath}`);
          } else {
            throw new Error("Cannot delete directory without recursive flag");
          }
        } else {
          // Delete the file
          await fs.unlink(validPath);
          results.push(`Successfully deleted file: ${filePath}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to delete ${filePath}: ${errorMessage}`);
      }
    })
  );

  // Format the results
  const successCount = results.length;
  const errorCount = errors.length;
  
  let output = `Processed ${successCount + errorCount} paths:\n`;
  output += `- ${successCount} items deleted successfully\n`;
  
  if (errorCount > 0) {
    output += `- ${errorCount} items failed\n\n`;
    output += "Errors:\n" + errors.join("\n");
  }
  
  return output;
}