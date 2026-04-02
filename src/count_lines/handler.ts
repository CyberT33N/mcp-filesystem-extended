import fs from "fs/promises";
import path from "path";
import { validatePath } from "../helpers/path.js";
import { minimatch } from "minimatch";
import { formatBatchTextOperationResults } from "../helpers/batch.js";

interface FileLineCount {
  file: string;
  count: number;
  matchingCount?: number;
}

export async function handleCountLines(
  filePaths: string[],
  recursive: boolean,
  pattern: string | undefined,
  filePattern: string,
  excludePatterns: string[],
  ignoreEmptyLines: boolean,
  allowedDirectories: string[]
): Promise<string> {
  async function getFormattedCountLinesResult(filePath: string): Promise<string> {
    const validPath = await validatePath(filePath, allowedDirectories);

    let regex: RegExp | undefined;
    if (pattern) {
      try {
        regex = new RegExp(pattern);
      } catch (error) {
        throw new Error(`Invalid regular expression: ${pattern}`);
      }
    }

    const stats = await fs.stat(validPath);

    let files: FileLineCount[] = [];

    if (stats.isFile()) {
      const count = await countLinesInFile(validPath, regex, ignoreEmptyLines);
      files.push(count);
    } else if (stats.isDirectory() && recursive) {
      files = await countLinesInDirectory(
        validPath,
        filePattern,
        excludePatterns,
        regex,
        ignoreEmptyLines,
        allowedDirectories
      );
    } else if (stats.isDirectory() && !recursive) {
      throw new Error(`Path is a directory. Use recursive=true to count lines in all files.`);
    } else {
      throw new Error(`Path is neither a file nor a directory.`);
    }

    if (files.length === 0) {
      return `No files found matching the criteria.`;
    }

    let totalLines = 0;
    let totalMatchingLines = 0;

    let output = "Line counts:\n\n";
    files.sort((leftFile, rightFile) => rightFile.count - leftFile.count);

    for (const file of files) {
      totalLines += file.count;
      if (file.matchingCount !== undefined) {
        totalMatchingLines += file.matchingCount;
      }

      if (pattern) {
        output += `${file.file}: ${file.count} lines total, ${file.matchingCount} matching lines\n`;
      } else {
        output += `${file.file}: ${file.count} lines\n`;
      }
    }

    output += "\n";
    output += `Total: ${files.length} files, ${totalLines} lines`;

    if (pattern) {
      output += `, ${totalMatchingLines} matching lines`;
    }

    return output;
  }

  if (filePaths.length === 1) {
    return getFormattedCountLinesResult(filePaths[0]);
  }

  const results = await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        const output = await getFormattedCountLinesResult(filePath);
        return {
          label: filePath,
          output,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          label: filePath,
          error: errorMessage,
        };
      }
    })
  );

  return formatBatchTextOperationResults("count lines", results);
}

async function countLinesInFile(
  filePath: string,
  regex: RegExp | undefined,
  ignoreEmptyLines: boolean
): Promise<FileLineCount> {
  // Read file content
  const content = await fs.readFile(filePath, 'utf-8');
  
  // Split into lines
  const lines = content.split('\n');
  
  let count = lines.length;
  let matchingCount: number | undefined;
  
  // Handle empty lines if needed
  if (ignoreEmptyLines) {
    count = lines.filter(line => line.trim() !== '').length;
  }
  
  // Count matching lines if regex is provided
  if (regex) {
    matchingCount = lines.filter(line => {
      if (ignoreEmptyLines && line.trim() === '') {
        return false;
      }
      return regex.test(line);
    }).length;
  }
  
  return {
    file: filePath,
    count,
    matchingCount
  };
}

async function countLinesInDirectory(
  dirPath: string,
  filePattern: string,
  excludePatterns: string[],
  regex: RegExp | undefined,
  ignoreEmptyLines: boolean,
  allowedDirectories: string[]
): Promise<FileLineCount[]> {
  const results: FileLineCount[] = [];
  
  async function processDirectory(currentPath: string) {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        
        try {
          // Validate each path before processing
          await validatePath(fullPath, allowedDirectories);
          
          // Get relative path for glob matching
          const relativePath = path.relative(dirPath, fullPath);
          
          // Check if path should be excluded
          const shouldExclude = excludePatterns.some(excludePattern => {
            return minimatch(relativePath, excludePattern, { dot: true });
          });
          
          if (shouldExclude) {
            continue;
          }
          
          if (entry.isDirectory()) {
            // Recursively process subdirectories
            await processDirectory(fullPath);
          } else if (entry.isFile()) {
            // Check if file matches the file pattern
            if (minimatch(entry.name, filePattern, { dot: true }) ||
                minimatch(relativePath, filePattern, { dot: true })) {
              try {
                const count = await countLinesInFile(fullPath, regex, ignoreEmptyLines);
                results.push(count);
              } catch (error) {
                // Skip files that can't be read as text
                continue;
              }
            }
          }
        } catch (error) {
          // Skip invalid paths
          continue;
        }
      }
    } catch (error) {
      // Skip directories we can't read
      return;
    }
  }
  
  await processDirectory(dirPath);
  return results;
}
