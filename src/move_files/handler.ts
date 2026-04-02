import fs from "fs/promises";
import path from "path";
import { validatePath, validatePathForCreation } from "../helpers/path.js";
import { createModuleLogger } from "../utils/logger.js";

const log = createModuleLogger("move_files");

export async function handleMoveFiles(
  items: Array<{source: string, destination: string}>,
  overwrite: boolean,
  allowedDirectories: string[]
): Promise<string> {
  const results: string[] = [];
  const errors: string[] = [];

  log.debug({ items, overwrite, allowedDirectories }, "handleMoveFiles called");

  await Promise.all(
    items.map(async (item) => {
      const childLog = log.child({ source: item.source, destination: item.destination });
      try {
        childLog.debug("validating paths");
        // Validate both paths are within allowed directories
        const validSource = await validatePath(item.source, allowedDirectories);
        // Use creation-aware validation for destination to allow creating missing parent directories
        const validDestination = await validatePathForCreation(item.destination, allowedDirectories);
        childLog.debug({ validSource, validDestination }, "paths validated");
        
        // Check if source exists
        try {
          childLog.debug({ validSource }, "checking source existence with fs.access");
          await fs.access(validSource);
        } catch (error) {
          childLog.error({ err: error }, "source does not exist");
          throw new Error(`Source does not exist: ${item.source}`);
        }
        
        // Check if destination exists and handle based on overwrite flag
        try {
          childLog.debug({ validDestination }, "checking destination existence with fs.access");
          await fs.access(validDestination);
          if (!overwrite) {
            childLog.debug("destination exists and overwrite=false");
            throw new Error(`Destination already exists: ${item.destination}`);
          }
          
          // If overwrite is true and destination exists, remove the destination
          // to avoid issues with fs.rename operation
          childLog.debug("destination exists and overwrite=true, removing destination");
          const destStats = await fs.stat(validDestination);
          if (destStats.isDirectory()) {
            await fs.rm(validDestination, { recursive: true, force: true });
          } else {
            await fs.unlink(validDestination);
          }
        } catch (error) {
          // If the error is due to destination not existing (ENOENT), that's fine
          const code = (error as NodeJS.ErrnoException).code;
          if (code && code !== "ENOENT") {
            childLog.error({ err: error, code }, "unexpected error during destination access");
            throw error;
          }
          if (code === "ENOENT") {
            childLog.debug("destination does not exist (ENOENT), continuing");
          }
        }
        
        // Create parent directory for destination if it doesn't exist
        const destDir = path.dirname(validDestination);
        childLog.debug({ destDir }, "creating destination parent directory if needed");
        await fs.mkdir(destDir, { recursive: true });
        
        // Move the file
        childLog.debug("calling fs.rename to move");
        await fs.rename(validSource, validDestination);
        results.push(`Successfully moved ${item.source} to ${item.destination}`);
        childLog.info({ moved: true }, "move completed");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        childLog.error({ err: error }, "move failed");
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
  
  log.debug({ successCount, errorCount }, "handleMoveFiles completed");
  return output;
}