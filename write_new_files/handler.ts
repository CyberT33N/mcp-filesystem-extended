import fs from "fs/promises";
import path from "path";
import { validatePathForCreation } from "../helpers/path.js";

export async function handleWriteNewFiles(
  files: Array<{path: string, content: string}>, 
  allowedDirectories: string[]
): Promise<string> {
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
          throw new Error(`File already exists. Use patch_files to modify existing files.`);
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
        
        results.push(`Successfully wrote to ${file.path}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to write file ${file.path}: ${errorMessage}`);
      }
    })
  );
  
  // Format the results
  const successCount = results.length;
  const errorCount = errors.length;
  
  let output = `Processed ${successCount + errorCount} files:\n`;
  output += `- ${successCount} files written successfully\n`;
  
  if (errorCount > 0) {
    output += `- ${errorCount} files failed\n\n`;
    output += "Errors:\n" + errors.join("\n");
  }
  
  return output;
}