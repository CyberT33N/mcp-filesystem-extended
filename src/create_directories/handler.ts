import fs from "fs/promises";
import { validatePathForCreation } from "../helpers/path.js";
import { createModuleLogger } from "../utils/logger.js";

const log = createModuleLogger("create_directories");

export async function handleCreateDirectories(
  paths: string[],
  allowedDirectories: string[]
): Promise<string> {
  const results: string[] = [];
  const errors: string[] = [];

  log.debug({ paths, allowedDirectories }, "handleCreateDirectories called");

  await Promise.all(
    paths.map(async (dirPath) => {
      const childLog = log.child({ dirPath });
      try {
        childLog.debug("validating path for creation");
        // Validate path is within allowed directories and safe for creation
        const validPath = await validatePathForCreation(dirPath, allowedDirectories);
        childLog.debug({ validPath }, "validated path");
        
        // Create directory (and parent directories if needed)
        childLog.debug("calling fs.mkdir with recursive:true");
        await fs.mkdir(validPath, { recursive: true });
        childLog.info({ created: validPath }, "directory created");
        
        results.push(`Successfully created directory: ${dirPath}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        childLog.error({ err: error }, "failed to create directory");
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
  
  log.debug({ successCount, errorCount }, "handleCreateDirectories completed");
  return output;
}