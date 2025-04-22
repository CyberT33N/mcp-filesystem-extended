import fs from "fs/promises";
import {copyDir} from "./helpers.js";
import {validatePath} from "../helpers/path.js";

export async function handleCopyFile(
  sourcePath: string,
  destinationPath: string,
  recursive: boolean,
  overwrite: boolean,
  allowedDirectories: string[]
): Promise<string> {
  const validSourcePath = await validatePath(sourcePath, allowedDirectories);
  const validDestPath = await validatePath(destinationPath, allowedDirectories);
  
  try {
    // Check if source exists
    const sourceStats = await fs.stat(validSourcePath);
    
    // Check if destination already exists
    try {
      await fs.access(validDestPath);
      if (!overwrite) {
        throw new Error(`Destination already exists: ${destinationPath}. Use overwrite=true to replace it.`);
      }
    } catch (error) {
      // This is expected for new destinations
      if (!(error instanceof Error) || !error.message.includes('ENOENT')) {
        throw error; // If error is something else, rethrow it
      }
    }
    
    if (sourceStats.isDirectory()) {
      if (!recursive) {
        throw new Error(`Source is a directory. Use recursive=true to copy directories.`);
      }
      
      // Create the destination directory if it doesn't exist
      await fs.mkdir(validDestPath, { recursive: true });
      
      // Copy directory recursively
      await copyDir(validSourcePath, validDestPath, allowedDirectories);
      return `Successfully copied directory ${sourcePath} to ${destinationPath}`;
    } else {
      // It's a file, copy it directly
      await fs.copyFile(validSourcePath, validDestPath);
      return `Successfully copied file ${sourcePath} to ${destinationPath}`;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Error copying ${sourcePath} to ${destinationPath}: ${errorMessage}`);
  }
}