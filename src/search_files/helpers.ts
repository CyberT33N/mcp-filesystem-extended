import fs from "fs/promises";
import path from "path";
import { minimatch } from 'minimatch';
import { validatePath } from "../helpers/path.js";

export async function searchFiles(
  rootPath: string,
  pattern: string,
  excludePatterns: string[] = [],
  allowedDirectories: string[]
): Promise<string[]> {
  const results: string[] = [];

  async function search(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      try {
        // Validate each path before processing
        await validatePath(fullPath, allowedDirectories);

        // Check if path matches any exclude pattern
        const relativePath = path.relative(rootPath, fullPath);
        const shouldExclude = excludePatterns.some(pattern => {
          // Handle different pattern formats
          // 1. If pattern already contains glob characters, use as is
          // 2. If pattern is a simple name, match anywhere in path
          // 3. If pattern is a path segment, match that segment
          let globPattern = pattern;
          
          if (!pattern.includes('*') && !pattern.includes('?')) {
            // For simple string patterns without glob characters
            if (pattern.includes('/')) {
              // If it includes path separators, it's a path segment
              globPattern = `**/${pattern}/**`;
            } else {
              // Otherwise it's a simple name to match anywhere
              globPattern = `**/*${pattern}*/**`;
            }
          }
          
          return minimatch(relativePath, globPattern, { 
            dot: true,           // Include dotfiles
            nocase: true,        // Case insensitive matching
            matchBase: true      // Match basename of path
          });
        });

        if (shouldExclude) {
          continue;
        }

        // Case-insensitive filename matching
        if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
          results.push(fullPath);
        }

        if (entry.isDirectory()) {
          await search(fullPath);
        }
      } catch (error) {
        // Skip invalid paths during search
        continue;
      }
    }
  }

  await search(rootPath);
  return results;
}