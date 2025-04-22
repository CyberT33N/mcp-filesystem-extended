import fs from "fs/promises";
import path from "path";
import { validatePath } from "../helpers/path.js";

export async function handleMoveFiles(
  items: Array<{source: string, destination: string}>,
  overwrite: boolean,
  allowedDirectories: string[]
): Promise<string> {
  const results: string[] = [];
  const errors: string[] = [];

  await Promise.all(
    items.map(async (item) => {
      try {
        // Validate both paths are within allowed directories
        const validSource = await validatePath(item.source, allowedDirectories);
        const validDestination = await validatePath(item.destination, allowedDirectories);
        
        // Check if source exists
        try {
          await fs.access(validSource);
        } catch (error) {
          throw new Error(`Source does not exist: ${item.source}`);
        }
        
        // Check if destination exists and handle based on overwrite flag
        try {
          await fs.access(validDestination);
          if (!overwrite) {
            throw new Error(`Destination already exists: ${item.destination}`);
          }
          
          // If overwrite is true and destination exists, remove the destination
          // to avoid issues with fs.rename operation
          const destStats = await fs.stat(validDestination);
          if (destStats.isDirectory()) {
            await fs.rm(validDestination, { recursive: true, force: true });
          } else {
            await fs.unlink(validDestination);
          }
        } catch (error) {
          // If the error is due to destination not existing, that's fine
          if (!(error instanceof Error && error.message.includes("does not exist"))) {
            throw error;
          }
        }
        
        // Create parent directory for destination if it doesn't exist
        const destDir = path.dirname(validDestination);
        await fs.mkdir(destDir, { recursive: true });
        
        // Move the file
        await fs.rename(validSource, validDestination);
        results.push(`Successfully moved ${item.source} to ${item.destination}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to move ${item.source} to ${item.destination}: ${errorMessage}`);
      }
    })
  );

  // Format the results
  const successCount = results.length;
  const errorCount = errors.length;
  
  let output = `Processed ${successCount + errorCount} move operations:\n`;
  output += `- ${successCount} items moved successfully\n`;
  
  if (errorCount > 0) {
    output += `- ${errorCount} operations failed\n\n`;
    output += "Errors:\n" + errors.join("\n");
  }
  
  return output;
}