import fs from "fs/promises";
import path from "path";
import { validatePath } from "../helpers/path.js";
import { minimatch } from "minimatch";

export async function handleSearchGlob(
  searchPath: string,
  pattern: string,
  excludePatterns: string[],
  maxResults: number,
  allowedDirectories: string[]
): Promise<string> {
  // Validate root path
  const validRootPath = await validatePath(searchPath, allowedDirectories);
  
  const results: string[] = [];
  let searchAborted = false;
  
  async function findMatches(currentPath: string) {
    if (searchAborted) return;
    
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (searchAborted) break;
        
        const fullPath = path.join(currentPath, entry.name);
        
        try {
          // Validate each path before processing
          await validatePath(fullPath, allowedDirectories);
          
          // Get relative path for glob matching
          const relativePath = path.relative(validRootPath, fullPath);
          
          // Check if path should be excluded
          const shouldExclude = excludePatterns.some(excludePattern => {
            return minimatch(relativePath, excludePattern, { dot: true });
          });
          
          if (shouldExclude) {
            continue;
          }
          
          // Check if the path matches the provided pattern
          if (minimatch(relativePath, pattern, { dot: true })) {
            results.push(fullPath);
            
            if (results.length >= maxResults) {
              searchAborted = true;
              break;
            }
          }
          
          // Recursively search directories
          if (entry.isDirectory()) {
            await findMatches(fullPath);
          }
        } catch (error) {
          // Skip invalid paths during search
          continue;
        }
      }
    } catch (error) {
      // Skip directories we can't read
      return;
    }
  }
  
  await findMatches(validRootPath);
  
  // Format the results
  let output = '';
  
  if (results.length === 0) {
    output = `No files matching pattern: ${pattern}\n`;
  } else {
    output = `Found ${results.length} files matching pattern: ${pattern}`;
    if (searchAborted) {
      output += ` (limited to ${maxResults} results)`;
    }
    output += "\n\n";
    
    // Sort results by path
    results.sort();
    
    for (const result of results) {
      output += `${result}\n`;
    }
  }
  
  return output;
}