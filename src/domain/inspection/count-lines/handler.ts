import fs from "fs/promises";
import path from "path";
import {
  DISCOVERY_RESPONSE_CAP_CHARS,
  INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import {
  buildTraversalNarrowingGuidance,
  resolveTraversalPreflightContext,
} from "@domain/shared/guardrails/filesystem-preflight";
import {
  resolveTraversalWorkloadAdmissionDecision,
  TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES,
} from "@domain/shared/guardrails/traversal-workload-admission";
import { collectTraversalCandidateWorkloadEvidence } from "@domain/shared/guardrails/traversal-candidate-workload";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import {
  assertTraversalRuntimeBudget,
  createTraversalRuntimeBudgetState,
  recordTraversalDirectoryVisit,
  recordTraversalEntryVisit,
} from "@domain/shared/guardrails/traversal-runtime-budget";
import {
  CountQueryExecutionLane,
  buildPatternAwareCountCommand,
  resolveCountQueryPolicy,
} from "@domain/shared/search/count-query-policy";
import { classifyInspectionContentState } from "@domain/shared/search/inspection-content-state";
import {
  classifyPattern,
  type PatternClassification,
} from "@domain/shared/search/pattern-classifier";
import {
  shouldExcludeTraversalScopePath,
  shouldTraverseTraversalScopeDirectoryPath,
} from "@domain/shared/guardrails/traversal-scope-policy";
import { countTotalLinesInFile } from "@infrastructure/filesystem/streaming-line-counter";
import { validatePath } from "@infrastructure/filesystem/path-guard";
import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";
import { runUgrepSearch } from "@infrastructure/search/ugrep-runner";

import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";

import { minimatch } from "minimatch";

interface FileLineCount {
  file: string;
  count: number;
  matchingCount?: number | undefined;
}

/**
 * Describes the structured count-lines result for one requested path.
 *
 * @remarks
 * This contract preserves per-path aggregation so recursive breadth and
 * matching-line totals remain inspectable before the final formatted text
 * output is subjected to the discovery response budget.
 */
export interface CountLinesPathResult {
  path: string;
  files: FileLineCount[];
  totalLines: number;
  totalMatchingLines: number;
}

/**
 * Describes the structured count-lines result across the entire request batch.
 *
 * @remarks
 * The batch result keeps aggregate totals available for structured consumers
 * while the human-readable surface stays bounded by the shared text budget and
 * the global response fuse.
 */
export interface CountLinesResult {
  paths: CountLinesPathResult[];
  totalFiles: number;
  totalLines: number;
  totalMatchingLines: number;
}

async function readInspectionContentSample(filePath: string): Promise<Uint8Array | null> {
  let fileHandle;

  try {
    fileHandle = await fs.open(filePath, "r");
  } catch {
    return null;
  }

  try {
    const probeBuffer = Buffer.alloc(INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES);
    const { bytesRead } = await fileHandle.read(probeBuffer, 0, probeBuffer.length, 0);

    return probeBuffer.subarray(0, bytesRead);
  } finally {
    await fileHandle.close();
  }
}

function formatUnsupportedCountQueryMessage(
  unsupportedStateReason: string,
  rerouteGuidance: string | null,
): string {
  if (rerouteGuidance === null) {
    return unsupportedStateReason;
  }

  return `${unsupportedStateReason} ${rerouteGuidance}`;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function formatCountLinesPathOutput(
  result: CountLinesPathResult,
  pattern: string | undefined,
): string {
  if (result.files.length === 0) {
    return "No files found matching the criteria.";
  }

  let output = "Line counts:\n\n";
  const sortedFiles = [...result.files].sort((leftFile, rightFile) => rightFile.count - leftFile.count);

  for (const file of sortedFiles) {
    if (pattern !== undefined) {
      output += `${file.file}: ${file.count} lines total, ${file.matchingCount} matching lines\n`;
    } else {
      output += `${file.file}: ${file.count} lines\n`;
    }
  }

  output += "\n";
  output += `Total: ${result.files.length} files, ${result.totalLines} lines`;

  if (pattern !== undefined) {
    output += `, ${result.totalMatchingLines} matching lines`;
  }

  return output;
}

/**
 * Formats the structured count-lines result into the public text response surface.
 *
 * @param result - Structured per-path and aggregate line-count totals.
 * @param pattern - Optional regex used to count matching lines in addition to total lines.
 * @returns Human-readable count-lines output that respects the discovery-family text budget.
 */
export function formatCountLinesResultOutput(
  result: CountLinesResult,
  pattern: string | undefined,
): string {
  if (result.paths.length === 1) {
    const firstPathResult = result.paths[0];

    if (firstPathResult === undefined) {
      throw new Error("Expected one path result for count-lines formatting.");
    }

    const output = formatCountLinesPathOutput(firstPathResult, pattern);

    assertActualTextBudget(
      "count_lines",
      output.length,
      DISCOVERY_RESPONSE_CAP_CHARS,
      "formatted count-lines output",
    );

    return output;
  }

  const output = formatBatchTextOperationResults(
    "count lines",
    result.paths.map((pathResult) => ({
      label: pathResult.path,
      output: formatCountLinesPathOutput(pathResult, pattern),
    })),
  );

  assertActualTextBudget(
    "count_lines",
    output.length,
    DISCOVERY_RESPONSE_CAP_CHARS,
    "formatted batched count-lines output",
  );

  return output;
}

function matchesIncludedFilePatterns(relativePath: string, filePatterns: string[]): boolean {
  if (filePatterns.length === 0) {
    return true;
  }

  const normalizedRelativePath = normalizeRelativePath(relativePath);
  const fileName = path.basename(normalizedRelativePath);

  return filePatterns.some((filePattern) => {
    const normalizedFilePattern = normalizeRelativePath(filePattern);

    if (normalizedFilePattern.includes("/")) {
      return minimatch(normalizedRelativePath, normalizedFilePattern, { dot: true });
    }

    return minimatch(fileName, normalizedFilePattern, { dot: true });
  });
}

async function getCountLinesPathResult(
  filePath: string,
  recursive: boolean,
  pattern: string | undefined,
  filePatterns: string[],
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  ignoreEmptyLines: boolean,
  allowedDirectories: string[]
): Promise<CountLinesPathResult> {
  const validPath = await validatePath(filePath, allowedDirectories);
  const classifiedPattern = pattern === undefined ? undefined : classifyPattern(pattern);

  const stats = await fs.stat(validPath);

  let files: FileLineCount[] = [];

  if (stats.isFile()) {
    files.push(await countLinesInFile(validPath, pattern, classifiedPattern, ignoreEmptyLines));
  } else if (stats.isDirectory() && recursive) {
    files = await countLinesInDirectory(
      validPath,
      filePath,
      filePatterns,
      excludePatterns,
      includeExcludedGlobs,
      respectGitIgnore,
      pattern,
      classifiedPattern,
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

/**
 * Formats count-lines output for one or more requested paths.
 *
 * @remarks
 * This handler keeps statically expressible request limits in schema, routes
 * total-only counting through the streaming line counter, routes
 * pattern-aware counting through the shared native-search lane, and finally
 * enforces response-size protection at formatting time so recursive discovery
 * output is refused instead of silently escaping the family budget.
 *
 * @param filePaths - Requested file or directory scopes in caller-supplied order.
 * @param recursive - Whether directory inputs may traverse nested files.
 * @param pattern - Optional regex used to count matching lines in addition to total lines.
 * @param filePatterns - Glob-like file filters applied during recursive traversal.
 * @param excludePatterns - Glob-like exclusions removed before counting proceeds.
 * @param includeExcludedGlobs - Additive descendant re-include globs that reopen excluded subtrees.
 * @param respectGitIgnore - Whether optional root-local `.gitignore` enrichment participates in traversal.
 * @param ignoreEmptyLines - Whether blank lines should be excluded from totals.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @returns Human-readable count-lines output that respects the discovery-family text budget while preserving the split counting architecture.
 */
export async function handleCountLines(
  filePaths: string[],
  recursive: boolean,
  pattern: string | undefined,
  filePatterns: string[],
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  ignoreEmptyLines: boolean,
  allowedDirectories: string[]
): Promise<string> {
  const structuredResult = await getCountLinesResult(
    filePaths,
    recursive,
    pattern,
    filePatterns,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    ignoreEmptyLines,
    allowedDirectories,
  );

  return formatCountLinesResultOutput(structuredResult, pattern);
}

/**
 * Returns the structured count-lines result for one or more requested paths.
 *
 * @remarks
 * Use this surface when callers need machine-readable aggregation while keeping
 * the same validated traversal rules as the formatted handler entrypoint.
 *
 * @param filePaths - Requested file or directory scopes in caller-supplied order.
 * @param recursive - Whether directory inputs may traverse nested files.
 * @param pattern - Optional regex used to count matching lines in addition to total lines.
 * @param filePatterns - Glob-like file filters applied during recursive traversal.
 * @param excludePatterns - Glob-like exclusions removed before counting proceeds.
 * @param includeExcludedGlobs - Additive descendant re-include globs that reopen excluded subtrees.
 * @param respectGitIgnore - Whether optional root-local `.gitignore` enrichment participates in traversal.
 * @param ignoreEmptyLines - Whether blank lines should be excluded from totals.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @returns Structured per-path and aggregate line-count totals.
 */
export async function getCountLinesResult(
  filePaths: string[],
  recursive: boolean,
  pattern: string | undefined,
  filePatterns: string[],
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  ignoreEmptyLines: boolean,
  allowedDirectories: string[]
): Promise<CountLinesResult> {
  const paths = await Promise.all(
    filePaths.map((filePath) =>
      getCountLinesPathResult(
        filePath,
        recursive,
        pattern,
        filePatterns,
        excludePatterns,
        includeExcludedGlobs,
        respectGitIgnore,
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
  pattern: string | undefined,
  patternClassification: PatternClassification | undefined,
  ignoreEmptyLines: boolean
): Promise<FileLineCount> {
  const fileStats = await fs.stat(filePath);
  const contentSample = await readInspectionContentSample(filePath);
  const ioCapabilityProfile = detectIoCapabilityProfile();
  const inspectionContentState = classifyInspectionContentState(
    contentSample === null
      ? {
          candidatePath: filePath,
          candidateFileBytes: fileStats.size,
        }
      : {
          candidatePath: filePath,
          candidateFileBytes: fileStats.size,
          contentSample,
        },
  );
  const countQueryPolicy = resolveCountQueryPolicy({
    ioCapabilityProfile,
    inspectionContentState: inspectionContentState.resolvedState,
    pattern,
  });

  if (countQueryPolicy.executionLane === CountQueryExecutionLane.UNSUPPORTED_STATE) {
    throw new Error(
      `count_lines unsupported state: ${formatUnsupportedCountQueryMessage(
        countQueryPolicy.unsupportedStateReason
          ?? "The resolved inspection state is unsupported for count_lines.",
        countQueryPolicy.rerouteGuidance,
      )}`,
    );
  }

  const totalLineCount = await countTotalLinesInFile(filePath, { ignoreEmptyLines });

  if (pattern === undefined) {
    return {
      file: filePath,
      count: totalLineCount,
    };
  }

  if (patternClassification === undefined) {
    throw new Error("Pattern-aware line counting requires a shared pattern classification.");
  }

  if (countQueryPolicy.executionLane !== CountQueryExecutionLane.NATIVE_PATTERN_AWARE) {
    throw new Error(
      countQueryPolicy.unsupportedStateReason
      ?? "Pattern-aware line counting must stay on the shared native-search lane.",
    );
  }

  if (countQueryPolicy.patternClassification?.classification !== patternClassification.classification) {
    throw new Error("Pattern-aware line counting resolved an inconsistent classification surface.");
  }

  const command = buildPatternAwareCountCommand({
    candidatePath: filePath,
    caseSensitive: true,
    ioCapabilityProfile,
    pattern,
  });
  const result = await runUgrepSearch(command);

  if (result.spawnErrorMessage !== null) {
    throw new Error(`Failed to start native pattern-aware line counting: ${result.spawnErrorMessage}`);
  }

  if (result.timedOut) {
    throw new Error("Native pattern-aware line counting timed out before completion.");
  }

  if (result.exitCode !== 0 && result.exitCode !== 1) {
    const failureReason = result.stderr.trim();

    throw new Error(
      failureReason === ""
        ? "Native pattern-aware line counting failed unexpectedly."
        : failureReason,
    );
  }

  const matchingCount = (() => {
    const trimmedOutput = result.stdout.trim();

    if (trimmedOutput === "") {
      return 0;
    }

    const trailingCountMatch = trimmedOutput.match(/:(\d+)\s*$/);

    if (trailingCountMatch === null) {
      throw new Error("Native pattern-aware line counting returned an unreadable count surface.");
    }

    return Number(trailingCountMatch[1]);
  })();

  return {
    file: filePath,
    count: totalLineCount,
    matchingCount,
  };
}

async function countLinesInDirectory(
  dirPath: string,
  requestedRootPath: string,
  filePatterns: string[],
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  pattern: string | undefined,
  patternClassification: PatternClassification | undefined,
  ignoreEmptyLines: boolean,
  allowedDirectories: string[]
): Promise<FileLineCount[]> {
  const results: FileLineCount[] = [];
  const traversalPreflightContext = await resolveTraversalPreflightContext(
    "count_lines",
    requestedRootPath,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    allowedDirectories,
    ["directory"],
  );
  const executionPolicy = resolveSearchExecutionPolicy(detectIoCapabilityProfile());
  const candidateWorkloadEvidence = await collectTraversalCandidateWorkloadEvidence({
    validRootPath: traversalPreflightContext.rootEntry.validPath,
    traversalScopePolicyResolution: traversalPreflightContext.traversalScopePolicyResolution,
    runtimeBudgetLimits: {
      maxVisitedEntries: executionPolicy.traversalPreviewExecutionEntryBudget,
      maxVisitedDirectories: executionPolicy.traversalPreviewExecutionDirectoryBudget,
      softTimeBudgetMs: executionPolicy.traversalPreviewExecutionTimeBudgetMs,
    },
    inlineCandidateByteBudget: null,
    fileMatcher: (candidateRelativePath) =>
      matchesIncludedFilePatterns(candidateRelativePath, filePatterns),
  });
  const traversalAdmissionDecision = resolveTraversalWorkloadAdmissionDecision({
    requestedRoot: requestedRootPath,
    rootEntry: traversalPreflightContext.rootEntry,
    admissionEvidence: traversalPreflightContext.traversalPreflightAdmissionEvidence,
    candidateWorkloadEvidence,
    executionPolicy,
    consumerCapabilities: {
      toolName: "count_lines",
      previewFirstSupported: false,
      inlineCandidateFileBudget: executionPolicy.traversalInlineCandidateFileBudget,
      taskBackedExecutionSupported: false,
    },
  });

  if (
    traversalAdmissionDecision.outcome
    !== TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.INLINE
  ) {
    throw new Error(
      traversalAdmissionDecision.guidanceText ?? buildTraversalNarrowingGuidance(requestedRootPath),
    );
  }
  const validatedRootPath = traversalPreflightContext.rootEntry.validPath;
  const traversalScopePolicyResolution = traversalPreflightContext.traversalScopePolicyResolution;
  const traversalRuntimeBudgetState = createTraversalRuntimeBudgetState();
  const traversalNarrowingGuidance = buildTraversalNarrowingGuidance(requestedRootPath);
  
  async function processDirectory(currentPath: string) {
    recordTraversalDirectoryVisit(traversalRuntimeBudgetState);
    assertTraversalRuntimeBudget(
      "count_lines",
      traversalRuntimeBudgetState,
      Date.now(),
      traversalNarrowingGuidance,
    );

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        recordTraversalEntryVisit(traversalRuntimeBudgetState);
        assertTraversalRuntimeBudget(
          "count_lines",
          traversalRuntimeBudgetState,
          Date.now(),
          traversalNarrowingGuidance,
        );

        const fullPath = path.join(currentPath, entry.name);
        const relativePath = normalizeRelativePath(path.relative(validatedRootPath, fullPath));
        const shouldTraverseExcludedDirectory =
          entry.isDirectory() &&
          shouldTraverseTraversalScopeDirectoryPath(
            relativePath,
            traversalScopePolicyResolution,
          );

        if (
          shouldExcludeTraversalScopePath(relativePath, traversalScopePolicyResolution) &&
          !shouldTraverseExcludedDirectory
        ) {
          continue;
        }
        
        try {
          // Validate each path before processing
          await validatePath(fullPath, allowedDirectories);
          
          if (entry.isDirectory()) {
            // Recursively process subdirectories
            await processDirectory(fullPath);
          } else if (entry.isFile()) {
            if (matchesIncludedFilePatterns(relativePath, filePatterns)) {
              try {
                const count = await countLinesInFile(
                  fullPath,
                  pattern,
                  patternClassification,
                  ignoreEmptyLines,
                );
                results.push(count);
              } catch (error) {
                if (
                  error instanceof Error
                  && error.message.startsWith("count_lines unsupported state:")
                ) {
                  throw error;
                }

                if (pattern !== undefined) {
                  throw error;
                }

                // Skip files that can't be read as text
                continue;
              }
            }
          }
        } catch (error) {
          if (
            error instanceof Error
            && error.message.startsWith("count_lines unsupported state:")
          ) {
            throw error;
          }

          if (pattern !== undefined) {
            throw error;
          }

          // Skip invalid paths.
          continue;
        }
      }
    } catch (error) {
      // Skip directories we can't read
      return;
    }
  }
  
  await processDirectory(validatedRootPath);
  return results;
}
