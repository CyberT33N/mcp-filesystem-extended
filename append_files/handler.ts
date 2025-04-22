import fs from "fs/promises";
import path from "path";
import { validatePath } from "../helpers/path.js";

export async function handleAppendFiles(
  files: Array<{path: string, content: string}>, 
  allowedDirectories: string[]
): Promise<string> {
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
        const errorMessage = error instanceof Error ? error.message : String(error);
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
  
  return output;
}