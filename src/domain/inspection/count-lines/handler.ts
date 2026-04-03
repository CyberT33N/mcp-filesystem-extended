import fs from "fs/promises";
import path from "path";
import { validatePath } from "@infrastructure/filesystem/path-guard.js";
import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter.js";

import { minimatch } from "minimatch";

interface FileLineCount {
  file: string;
  count: number;
  matchingCount?: number | undefined;
}

export interface CountLinesPathResult {
  path: string;
  files: FileLineCount[];
  totalLines: number;
  totalMatchingLines: number;
}

export interface CountLinesResult {
  paths: CountLinesPathResult[];
  totalFiles: number;
  totalLines: number;
  totalMatchingLines: number;
}

async function getCountLinesPathResult(
  filePath: string,
  recursive: boolean,
  pattern: string | undefined,
  filePattern: string,
  excludePatterns: string[],
  ignoreEmptyLines: boolean,
  allowedDirectories: string[]
): Promise<CountLinesPathResult> {
  const validPath = await validatePath(filePath, allowedDirectories);

  let regex: RegExp | undefined;
  if (pattern) {
    try {
      regex = new RegExp(pattern);
    } catch {
      throw new Error(`Invalid regular expression: ${pattern}`);
    }
  }

  const stats = await fs.stat(validPath);

  let files: FileLineCount[] = [];

  if (stats.isFile()) {
    files.push(await countLinesInFile(validPath, regex, ignoreEmptyLines));
  } else if (stats.isDirectory() && recursive) {
    files = await countLinesInDirectory(
      validPath,
      filePattern,
      excludePatterns,
      regex,
      ignoreEmptyLines,
      allowedDirectories
    );
  } else if (stats.isDirectory()) {
    throw new Error(`Path is a directory. Use recursive=true to count lines in all files.`);
  } else {
    throw new Error(`Path is neither a file nor a directory.`);
  }

  const totalLines = files.reduce((total, file) => total + file.count, 0);
  const totalMatchingLines = files.reduce(
    (total, file) => total + (file.matchingCount ?? 0),
    0
  );

  return {
    path: filePath,
    files,
    totalLines,
    totalMatchingLines,
  };
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
    const result = await getCountLinesPathResult(
      filePath,
      recursive,
      pattern,
      filePattern,
      excludePatterns,
      ignoreEmptyLines,
      allowedDirectories
    );

    if (result.files.length === 0) {
      return `No files found matching the criteria.`;
    }

    let output = "Line counts:\n\n";
    result.files.sort((leftFile, rightFile) => rightFile.count - leftFile.count);

    for (const file of result.files) {
      if (pattern) {
        output += `${file.file}: ${file.count} lines total, ${file.matchingCount} matching lines\n`;
      } else {
        output += `${file.file}: ${file.count} lines\n`;
      }
    }

    output += "\n";
    output += `Total: ${result.files.length} files, ${result.totalLines} lines`;

    if (pattern) {
      output += `, ${result.totalMatchingLines} matching lines`;
    }

    return output;
  }

  if (filePaths.length === 1) {
    const firstPath = filePaths[0];

    if (firstPath === undefined) {
      throw new Error("Expected one path for count-lines execution.");
    }

    return getFormattedCountLinesResult(firstPath);
  }

  const pathResults = await Promise.all(
    filePaths.map((filePath) =>
      getCountLinesPathResult(
        filePath,
        recursive,
        pattern,
        filePattern,
        excludePatterns,
        ignoreEmptyLines,
        allowedDirectories
      )
    )
  );

  const structuredResult: CountLinesResult = {
    paths: pathResults,
    totalFiles: pathResults.reduce((total, result) => total + result.files.length, 0),
    totalLines: pathResults.reduce((total, result) => total + result.totalLines, 0),
    totalMatchingLines: pathResults.reduce(
      (total, result) => total + result.totalMatchingLines,
      0
    ),
  };

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

export async function getCountLinesResult(
  filePaths: string[],
  recursive: boolean,
  pattern: string | undefined,
  filePattern: string,
  excludePatterns: string[],
  ignoreEmptyLines: boolean,
  allowedDirectories: string[]
): Promise<CountLinesResult> {
  const paths = await Promise.all(
    filePaths.map((filePath) =>
      getCountLinesPathResult(
        filePath,
        recursive,
        pattern,
        filePattern,
        excludePatterns,
        ignoreEmptyLines,
        allowedDirectories
      )
    )
  );

  return {
    paths,
    totalFiles: paths.reduce((total, result) => total + result.files.length, 0),
    totalLines: paths.reduce((total, result) => total + result.totalLines, 0),
    totalMatchingLines: paths.reduce(
      (total, result) => total + result.totalMatchingLines,
      0
    ),
  };
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
