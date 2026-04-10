import fs from "fs/promises";
import path from "path";
import { minimatch } from 'minimatch';
import { validatePath } from "@infrastructure/filesystem/path-guard";

/**
 * Describes the helper-level result for one name-search traversal.
 *
 * @remarks
 * This contract preserves collected matches and truncation state so callers can
 * build structured or formatted discovery output without recomputing traversal
 * breadth decisions.
 */
export interface SearchFilesResult {
  matches: string[];
  truncated: boolean;
}

/**
 * Traverses one validated root and collects case-insensitive name matches.
 *
 * @remarks
 * The helper normalizes exclude-pattern handling, enforces path validation on
 * every visited entry, and stops traversal once the effective result ceiling is
 * reached so discovery output cannot grow without a bounded truncation signal.
 *
 * @param rootPath - Validated root path used as the traversal anchor.
 * @param pattern - Case-insensitive substring matched against entry names.
 * @param excludePatterns - Glob-like exclusion patterns applied to relative paths.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @param maxResults - Maximum number of collected matches before truncation.
 * @returns Helper-level matches and truncation state for the traversal.
 */
export async function searchFiles(
  rootPath: string,
  pattern: string,
  excludePatterns: string[] = [],
  allowedDirectories: string[],
  maxResults: number,
): Promise<SearchFilesResult> {
  const results: string[] = [];
  let truncated = false;

  async function search(currentPath: string) {
    if (truncated) {
      return;
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (truncated) {
        break;
      }

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

          if (results.length >= maxResults) {
            truncated = true;
            break;
          }
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
  return {
    matches: results,
    truncated,
  };
}
