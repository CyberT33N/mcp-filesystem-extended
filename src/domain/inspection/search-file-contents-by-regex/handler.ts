import fs from "fs/promises";
import path from "path";
import { validatePath } from "@infrastructure/filesystem/path-guard.js";
import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter.js";

import { minimatch } from "minimatch";

interface SearchResult {
  file: string;
  line: number;
  content: string;
  match: string;
}

export interface SearchRegexPathResult {
  root: string;
  matches: SearchResult[];
  filesSearched: number;
  totalMatches: number;
  truncated: boolean;
}

export interface SearchRegexResult {
  roots: SearchRegexPathResult[];
  totalLocations: number;
  totalMatches: number;
  truncated: boolean;
}

async function getSearchRegexPathResult(
  searchPath: string,
  pattern: string,
  filePatterns: string[],
  excludePatterns: string[],
  maxResults: number,
  caseSensitive: boolean,
  allowedDirectories: string[]
): Promise<SearchRegexPathResult> {
  const validRootPath = await validatePath(searchPath, allowedDirectories);

  const results: SearchResult[] = [];
  let filesSearched = 0;
  let matchesFound = 0;
  let searchAborted = false;

  const regexFlags = caseSensitive ? "mg" : "img";
  let regex: RegExp;

  try {
    regex = new RegExp(pattern, regexFlags);
  } catch {
    throw new Error(`Invalid regular expression: ${pattern}`);
  }

  async function searchDirectory(dirPath: string) {
    if (searchAborted) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (searchAborted) break;

        const fullPath = path.join(dirPath, entry.name);

        try {
          await validatePath(fullPath, allowedDirectories);

          const relativePath = path.relative(validRootPath, fullPath);
          const shouldExclude = excludePatterns.some((excludePattern) => {
            const globPattern = excludePattern.includes("*") ? excludePattern : `**/${excludePattern}/**`;
            return minimatch(relativePath, globPattern, { dot: true });
          });

          if (shouldExclude) {
            continue;
          }

          if (entry.isDirectory()) {
            await searchDirectory(fullPath);
          } else if (entry.isFile()) {
            const shouldInclude = filePatterns.length === 0 ||
              filePatterns.some((filePattern) => {
                return minimatch(entry.name, filePattern, { nocase: true });
              });

            if (shouldInclude) {
              filesSearched++;

              try {
                const content = await fs.readFile(fullPath, "utf-8");
                const lines = content.split("\n");

                let match: RegExpExecArray | null;
                regex.lastIndex = 0;

                while ((match = regex.exec(content)) !== null) {
                  matchesFound++;

                  const matchPosition = match.index;
                  let lineNumber = 0;
                  let charCount = 0;

                  for (let index = 0; index < lines.length; index++) {
                    charCount += lines[index].length + 1;
                    if (charCount > matchPosition) {
                      lineNumber = index + 1;
                      break;
                    }
                  }

                  const lineContent = lines[lineNumber - 1]?.trim() ?? "";

                  results.push({
                    file: fullPath,
                    line: lineNumber,
                    content: lineContent,
                    match: match[0],
                  });

                  if (results.length >= maxResults) {
                    searchAborted = true;
                    break;
                  }
                }
              } catch {
                continue;
              }
            }
          }
        } catch {
          continue;
        }
      }
    } catch {
      return;
    }
  }

  await searchDirectory(validRootPath);

  return {
    root: searchPath,
    matches: results,
    filesSearched,
    totalMatches: matchesFound,
    truncated: searchAborted,
  };
}

export async function handleSearchRegex(
  searchPaths: string[],
  pattern: string,
  filePatterns: string[],
  excludePatterns: string[],
  maxResults: number,
  caseSensitive: boolean,
  allowedDirectories: string[]
): Promise<string> {
  async function getFormattedSearchRegexResult(searchPath: string): Promise<string> {
    const result = await getSearchRegexPathResult(
      searchPath,
      pattern,
      filePatterns,
      excludePatterns,
      maxResults,
      caseSensitive,
      allowedDirectories
    );

    if (result.matches.length === 0) {
      return `No matches found for regex: ${pattern}\nSearched ${result.filesSearched} files`;
    }

    let output = `Found ${result.totalMatches} matches in ${result.matches.length} locations`;
    if (result.truncated) {
      output += ` (limited to ${maxResults} results)`;
    }
    output += "\n\n";

    const fileGroups = new Map<string, SearchResult[]>();

    for (const match of result.matches) {
      if (!fileGroups.has(match.file)) {
        fileGroups.set(match.file, []);
      }
      fileGroups.get(match.file)?.push(match);
    }

    for (const [file, fileResults] of fileGroups.entries()) {
      output += `File: ${file}\n`;

      for (const result of fileResults) {
        output += `  Line ${result.line}: ${result.content}\n`;
      }

      output += "\n";
    }

    return output.trimEnd();
  }

  if (searchPaths.length === 1) {
    const firstSearchPath = searchPaths[0];

    if (firstSearchPath === undefined) {
      throw new Error("Expected one root path for regex content search.");
    }

    return getFormattedSearchRegexResult(firstSearchPath);
  }

  const results = await Promise.all(
    searchPaths.map(async (searchPath) => {
      try {
        const output = await getFormattedSearchRegexResult(searchPath);
        return {
          label: searchPath,
          output,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          label: searchPath,
          error: errorMessage,
        };
      }
    })
  );

  return formatBatchTextOperationResults("search regex", results);
}

export async function getSearchRegexResult(
  searchPaths: string[],
  pattern: string,
  filePatterns: string[],
  excludePatterns: string[],
  maxResults: number,
  caseSensitive: boolean,
  allowedDirectories: string[]
): Promise<SearchRegexResult> {
  const roots = await Promise.all(
    searchPaths.map((searchPath) =>
      getSearchRegexPathResult(
        searchPath,
        pattern,
        filePatterns,
        excludePatterns,
        maxResults,
        caseSensitive,
        allowedDirectories
      )
    )
  );

  return {
    roots,
    totalLocations: roots.reduce((total, root) => total + root.matches.length, 0),
    totalMatches: roots.reduce((total, root) => total + root.totalMatches, 0),
    truncated: roots.some((root) => root.truncated),
  };
}
