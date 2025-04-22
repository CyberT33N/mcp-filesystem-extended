import fs from "fs/promises";
import path from "path";
import { validatePath } from "../helpers/path.js";

export async function copyDir(src: string, dest: string, allowedDirectories: string[]) {
  // Create destination if it doesn't exist
  await fs.mkdir(dest, { recursive: true });
  
  // Get all files in the source directory
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    // Make sure paths are validated
    await validatePath(srcPath, allowedDirectories);
    await validatePath(destPath, allowedDirectories);
    
    if (entry.isDirectory()) {
      // Recursively copy subdirectories
      await copyDir(srcPath, destPath, allowedDirectories);
    } else {
      // Copy files
      await fs.copyFile(srcPath, destPath);
    }
  }
}