import fs from "fs/promises";
import { validatePath } from "../helpers/path.js";

export async function handleCreateDirectories(
  paths: string[],
  allowedDirectories: string[]
): Promise<string> {
  const results: string[] = [];
  const errors: string[] = [];

  await Promise.all(
    paths.map(async (dirPath) => {
      try {
        // Validate path is within allowed directories
        const validPath = await validatePath(dirPath, allowedDirectories);
        
        // Create directory (and parent directories if needed)
        await fs.mkdir(validPath, { recursive: true });
        
        results.push(`Successfully created directory: ${dirPath}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to create directory ${dirPath}: ${errorMessage}`);
      }
    })
  );

  // Format the results
  const successCount = results.length;
  const errorCount = errors.length;
  
  let output = `Processed ${successCount + errorCount} directories:\n`;
  output += `- ${successCount} directories created successfully\n`;
  
  if (errorCount > 0) {
    output += `- ${errorCount} directories failed\n\n`;
    output += "Errors:\n" + errors.join("\n");
  }
  
  return output;
}