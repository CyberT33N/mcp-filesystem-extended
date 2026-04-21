import fs from "fs/promises";
import path from "path";
import {
  DISCOVERY_RESPONSE_CAP_CHARS,
  INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import {
  createContinuationEnvelope,
  createInlineContinuationEnvelope,
  createPersistedContinuationEnvelope,
  getContinuationNotFoundMessage,
  INSPECTION_CONTINUATION_ADMISSION_OUTCOMES,
  INSPECTION_CONTINUATION_STATUSES,
} from "@domain/shared/continuation/inspection-continuation-contract";
import type {
  InspectionContinuationAdmission,
  InspectionContinuationMetadata,
} from "@domain/shared/continuation/inspection-continuation-contract";
import {
  buildTraversalNarrowingGuidance,
  resolveTraversalPreflightContext,
} from "@domain/shared/guardrails/filesystem-preflight";
import {
  TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS,
  type TraversalWorkloadAdmissionOutcome,
  resolveTraversalWorkloadAdmissionDecision,
  TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES,
} from "@domain/shared/guardrails/traversal-workload-admission";
import { collectTraversalCandidateWorkloadEvidence } from "@domain/shared/guardrails/traversal-candidate-workload";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import {
  assertTraversalRuntimeBudget,
  createTraversalRuntimeBudgetState,
  isTraversalRuntimeBudgetExceededError,
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
import type { InspectionContinuationSqliteStore } from "@infrastructure/persistence/inspection-continuation-sqlite-store";
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
  admission: InspectionContinuationAdmission;
  continuation: InspectionContinuationMetadata;
}

interface CountLinesTraversalFrame {
  directoryRelativePath: string;
  nextEntryIndex: number;
}

interface CountLinesPathContinuationState {
  traversalFrames: CountLinesTraversalFrame[];
  files: FileLineCount[];
  totalLines: number;
  totalMatchingLines: number;
  completed: boolean;
}

interface CountLinesContinuationState {
  pathStates: Record<string, CountLinesPathContinuationState>;
}

interface CountLinesRequestPayload {
  filePaths: string[];
  recursive: boolean;
  pattern: string | null;
  filePatterns: string[];
  excludePatterns: string[];
  includeExcludedGlobs: string[];
  respectGitIgnore: boolean;
  ignoreEmptyLines: boolean;
}

interface CountLinesExecutionContext {
  requestPayload: CountLinesRequestPayload;
  continuationState: CountLinesContinuationState | null;
  activeContinuationToken: string | null;
  activeContinuationExpiresAt: string | null;
}

interface CountLinesPathExecutionResult extends CountLinesPathResult {
  admissionOutcome: TraversalWorkloadAdmissionOutcome;
  nextContinuationState: CountLinesPathContinuationState | null;
}

const COUNT_LINES_FAMILY_MEMBER = "count_lines";
const COUNT_LINES_CONTINUATION_GUIDANCE =
  "Resume the same count-lines request by sending only continuationToken to the same endpoint to continue task-backed execution without resending the original query.";

function cloneCountLinesTraversalFrames(
  traversalFrames: CountLinesTraversalFrame[],
): CountLinesTraversalFrame[] {
  return traversalFrames.map((traversalFrame) => ({ ...traversalFrame }));
}

function createInitialCountLinesTraversalFrames(): CountLinesTraversalFrame[] {
  return [{ directoryRelativePath: "", nextEntryIndex: 0 }];
}

function createCompletedCountLinesPathContinuationState(
  result: CountLinesPathResult,
): CountLinesPathContinuationState {
  return {
    traversalFrames: [],
    files: result.files,
    totalLines: result.totalLines,
    totalMatchingLines: result.totalMatchingLines,
    completed: true,
  };
}

function toCountLinesPathResult(
  requestedPath: string,
  continuationState: CountLinesPathContinuationState,
): CountLinesPathResult {
  return {
    path: requestedPath,
    files: continuationState.files,
    totalLines: continuationState.totalLines,
    totalMatchingLines: continuationState.totalMatchingLines,
  };
}

function resolveCountLinesExecutionContext(
  continuationToken: string | undefined,
  filePaths: string[],
  recursive: boolean,
  pattern: string | undefined,
  filePatterns: string[],
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  ignoreEmptyLines: boolean,
  inspectionContinuationStore: InspectionContinuationSqliteStore | undefined,
  now: Date,
): CountLinesExecutionContext {
  if (continuationToken === undefined) {
    return {
      requestPayload: {
        filePaths,
        recursive,
        pattern: pattern ?? null,
        filePatterns,
        excludePatterns,
        includeExcludedGlobs,
        respectGitIgnore,
        ignoreEmptyLines,
      },
      continuationState: null,
      activeContinuationToken: null,
      activeContinuationExpiresAt: null,
    };
  }

  if (inspectionContinuationStore === undefined) {
    throw new Error("Continuation storage is unavailable for count_lines resume requests.");
  }

  const continuationSession = inspectionContinuationStore.loadActiveSession<
    CountLinesRequestPayload,
    CountLinesContinuationState
  >(
    continuationToken,
    COUNT_LINES_FAMILY_MEMBER,
    COUNT_LINES_FAMILY_MEMBER,
    now,
  );

  if (continuationSession === null) {
    throw new Error(getContinuationNotFoundMessage(COUNT_LINES_FAMILY_MEMBER));
  }

  return {
    requestPayload: continuationSession.requestPayload,
    continuationState: continuationSession.continuationState,
    activeContinuationToken: continuationSession.continuationToken,
    activeContinuationExpiresAt: continuationSession.expiresAt,
  };
}

function buildCountLinesContinuationEnvelope(
  continuationToken: string | null,
  continuationExpiresAt: string | null,
  nextContinuationState: CountLinesContinuationState | null,
  inspectionContinuationStore: InspectionContinuationSqliteStore | undefined,
  requestPayload: CountLinesRequestPayload,
  pathResults: CountLinesPathExecutionResult[],
  now: Date,
): Pick<CountLinesResult, "admission" | "continuation"> {
  const taskBackedActive =
    continuationToken !== null
    || pathResults.some(
      (pathResult) =>
        pathResult.admissionOutcome === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.TASK_BACKED_REQUIRED,
    );

  if (!taskBackedActive) {
    return createInlineContinuationEnvelope();
  }

  if (nextContinuationState === null) {
    if (continuationToken !== null && inspectionContinuationStore !== undefined) {
      inspectionContinuationStore.markSessionCompleted(continuationToken, now);
    }

    return createContinuationEnvelope(
      INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.TASK_BACKED_REQUIRED,
      null,
      null,
    );
  }

  if (inspectionContinuationStore === undefined) {
    throw new Error("Continuation storage is unavailable for task-backed count_lines execution.");
  }

  if (continuationToken === null) {
    const continuationSession = inspectionContinuationStore.createSession(
      {
        endpointName: COUNT_LINES_FAMILY_MEMBER,
        familyMember: COUNT_LINES_FAMILY_MEMBER,
        requestPayload,
        continuationState: nextContinuationState,
        admissionOutcome: INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.TASK_BACKED_REQUIRED,
      },
      now,
    );

    return createPersistedContinuationEnvelope(
      COUNT_LINES_FAMILY_MEMBER,
      continuationSession.continuationToken,
      continuationSession.status,
      continuationSession.expiresAt,
      COUNT_LINES_CONTINUATION_GUIDANCE,
      INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.TASK_BACKED_REQUIRED,
    );
  }

  if (continuationExpiresAt === null) {
    throw new Error("Active count-lines continuation session is missing an expiration timestamp.");
  }

  inspectionContinuationStore.updateContinuationState(continuationToken, nextContinuationState, now);

  return createPersistedContinuationEnvelope(
    COUNT_LINES_FAMILY_MEMBER,
    continuationToken,
    INSPECTION_CONTINUATION_STATUSES.ACTIVE,
    continuationExpiresAt,
    COUNT_LINES_CONTINUATION_GUIDANCE,
    INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.TASK_BACKED_REQUIRED,
  );
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
  if (
    result.admission.outcome === INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.TASK_BACKED_REQUIRED
    && result.continuation.resumable
    && result.paths.length === 0
  ) {
    return result.admission.guidanceText ?? COUNT_LINES_CONTINUATION_GUIDANCE;
  }

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
  allowedDirectories: string[],
  continuationState: CountLinesPathContinuationState | null = null,
): Promise<CountLinesPathExecutionResult> {
  const validPath = await validatePath(filePath, allowedDirectories);
  const classifiedPattern = pattern === undefined ? undefined : classifyPattern(pattern);

  const stats = await fs.stat(validPath);

  let result: CountLinesPathResult;
  let admissionOutcome: TraversalWorkloadAdmissionOutcome = TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.INLINE;
  let nextContinuationState: CountLinesPathContinuationState | null = null;

  if (stats.isFile()) {
    const fileCount = await countLinesInFile(validPath, pattern, classifiedPattern, ignoreEmptyLines);
    result = {
      path: filePath,
      files: [fileCount],
      totalLines: fileCount.count,
      totalMatchingLines: fileCount.matchingCount ?? 0,
    };
    nextContinuationState = createCompletedCountLinesPathContinuationState(result);
  } else if (stats.isDirectory() && recursive) {
    const executionPolicy = resolveSearchExecutionPolicy(detectIoCapabilityProfile());
    const candidateWorkloadEvidence = await collectTraversalCandidateWorkloadEvidence({
      validRootPath: validPath,
      traversalScopePolicyResolution: (
        await resolveTraversalPreflightContext(
          COUNT_LINES_FAMILY_MEMBER,
          filePath,
          excludePatterns,
          includeExcludedGlobs,
          respectGitIgnore,
          allowedDirectories,
          ["directory"],
        )
      ).traversalScopePolicyResolution,
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
      requestedRoot: filePath,
      rootEntry: {
        requestedPath: filePath,
        validPath,
        type: "directory",
        size: stats.size,
      },
      admissionEvidence: (
        await resolveTraversalPreflightContext(
          COUNT_LINES_FAMILY_MEMBER,
          filePath,
          excludePatterns,
          includeExcludedGlobs,
          respectGitIgnore,
          allowedDirectories,
          ["directory"],
        )
      ).traversalPreflightAdmissionEvidence,
      candidateWorkloadEvidence,
      executionPolicy,
      consumerCapabilities: {
        toolName: COUNT_LINES_FAMILY_MEMBER,
        previewFirstSupported: false,
        inlineCandidateFileBudget: executionPolicy.traversalInlineCandidateFileBudget,
        executionTimeCostMultiplier: pattern === undefined
          ? TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.COUNT_STREAMING.executionTimeCostMultiplier
          : TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.COUNT_PATTERN_AWARE.executionTimeCostMultiplier,
        estimatedPerCandidateFileCostMs: pattern === undefined
          ? TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.COUNT_STREAMING.estimatedPerCandidateFileCostMs
          : TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.COUNT_PATTERN_AWARE.estimatedPerCandidateFileCostMs,
        taskBackedExecutionSupported: true,
      },
    });

    admissionOutcome = traversalAdmissionDecision.outcome;

    if (traversalAdmissionDecision.outcome === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.TASK_BACKED_REQUIRED) {
      const taskBackedResult = await countLinesInDirectoryTaskBacked(
        filePath,
        filePatterns,
        excludePatterns,
        includeExcludedGlobs,
        respectGitIgnore,
        pattern,
        classifiedPattern,
        ignoreEmptyLines,
        allowedDirectories,
        continuationState,
      );
      result = {
        path: filePath,
        files: taskBackedResult.files,
        totalLines: taskBackedResult.totalLines,
        totalMatchingLines: taskBackedResult.totalMatchingLines,
      };
      nextContinuationState = taskBackedResult.nextContinuationState;
    } else {
      const files = await countLinesInDirectory(
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
      const totalLines = files.reduce((total, file) => total + file.count, 0);
      const totalMatchingLines = files.reduce(
        (total, file) => total + (file.matchingCount ?? 0),
        0,
      );
      result = {
        path: filePath,
        files,
        totalLines,
        totalMatchingLines,
      };
      nextContinuationState = createCompletedCountLinesPathContinuationState(result);
    }
  } else if (stats.isDirectory()) {
    throw new Error(`Path is a directory. Use recursive=true to count lines in all files.`);
  } else {
    throw new Error(`Path is neither a file nor a directory.`);
  }

  return {
    ...result,
    admissionOutcome,
    nextContinuationState,
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
  continuationToken: string | undefined,
  filePaths: string[],
  recursive: boolean,
  pattern: string | undefined,
  filePatterns: string[],
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  ignoreEmptyLines: boolean,
  inspectionContinuationStore: InspectionContinuationSqliteStore | undefined,
  allowedDirectories: string[]
): Promise<string> {
  const structuredResult = await getCountLinesResult(
    continuationToken,
    filePaths,
    recursive,
    pattern,
    filePatterns,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    ignoreEmptyLines,
    inspectionContinuationStore,
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
  continuationToken: string | undefined,
  filePaths: string[],
  recursive: boolean,
  pattern: string | undefined,
  filePatterns: string[],
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  ignoreEmptyLines: boolean,
  inspectionContinuationStore: InspectionContinuationSqliteStore | undefined,
  allowedDirectories: string[],
): Promise<CountLinesResult> {
  const now = new Date();
  const executionContext = resolveCountLinesExecutionContext(
    continuationToken,
    filePaths,
    recursive,
    pattern,
    filePatterns,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    ignoreEmptyLines,
    inspectionContinuationStore,
    now,
  );
  const persistedPathStates: Record<string, CountLinesPathContinuationState> = {};

  for (const [requestedPath, pathState] of Object.entries(
    executionContext.continuationState?.pathStates ?? {},
  )) {
    if (pathState.completed) {
      persistedPathStates[requestedPath] = pathState;
    }
  }

  const activeFilePaths = executionContext.continuationState === null
    ? executionContext.requestPayload.filePaths
    : executionContext.requestPayload.filePaths.filter((requestedPath) => {
        const pathState = executionContext.continuationState?.pathStates[requestedPath];

        return pathState === undefined || !pathState.completed;
      });

  const pathResults = await Promise.all(
    activeFilePaths.map((filePath) =>
      getCountLinesPathResult(
        filePath,
        executionContext.requestPayload.recursive,
        executionContext.requestPayload.pattern ?? undefined,
        executionContext.requestPayload.filePatterns,
        executionContext.requestPayload.excludePatterns,
        executionContext.requestPayload.includeExcludedGlobs,
        executionContext.requestPayload.respectGitIgnore,
        executionContext.requestPayload.ignoreEmptyLines,
        allowedDirectories,
        executionContext.continuationState?.pathStates[filePath] ?? null,
      )
    )
  );

  for (const pathResult of pathResults) {
    if (pathResult.nextContinuationState !== null) {
      persistedPathStates[pathResult.path] = pathResult.nextContinuationState;
    }
  }

  const hasPendingContinuation = Object.values(persistedPathStates).some(
    (pathState) => !pathState.completed,
  );
  const nextContinuationState = hasPendingContinuation
    ? { pathStates: persistedPathStates }
    : null;
  const continuationEnvelope = buildCountLinesContinuationEnvelope(
    executionContext.activeContinuationToken,
    executionContext.activeContinuationExpiresAt,
    nextContinuationState,
    inspectionContinuationStore,
    executionContext.requestPayload,
    pathResults,
    now,
  );

  if (hasPendingContinuation) {
    return {
      paths: [],
      totalFiles: 0,
      totalLines: 0,
      totalMatchingLines: 0,
      ...continuationEnvelope,
    };
  }

  const finalizedPaths = executionContext.requestPayload.filePaths
    .map((requestedPath) => {
      const pathState = persistedPathStates[requestedPath];

      return pathState === undefined ? null : toCountLinesPathResult(requestedPath, pathState);
    })
    .filter((pathResult): pathResult is CountLinesPathResult => pathResult !== null);

  return {
    paths: finalizedPaths,
    totalFiles: finalizedPaths.reduce((total, result) => total + result.files.length, 0),
    totalLines: finalizedPaths.reduce((total, result) => total + result.totalLines, 0),
    totalMatchingLines: finalizedPaths.reduce(
      (total, result) => total + result.totalMatchingLines,
      0,
    ),
    ...continuationEnvelope,
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

function createInProgressCountLinesPathContinuationState(
  traversalFrames: CountLinesTraversalFrame[],
  files: FileLineCount[],
  totalLines: number,
  totalMatchingLines: number,
): CountLinesPathContinuationState {
  return {
    traversalFrames: cloneCountLinesTraversalFrames(traversalFrames),
    files,
    totalLines,
    totalMatchingLines,
    completed: false,
  };
}

async function countLinesInDirectoryTaskBacked(
  requestedRootPath: string,
  filePatterns: string[],
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  pattern: string | undefined,
  patternClassification: PatternClassification | undefined,
  ignoreEmptyLines: boolean,
  allowedDirectories: string[],
  continuationState: CountLinesPathContinuationState | null = null,
): Promise<{
  files: FileLineCount[];
  totalLines: number;
  totalMatchingLines: number;
  nextContinuationState: CountLinesPathContinuationState | null;
}> {
  const traversalPreflightContext = await resolveTraversalPreflightContext(
    COUNT_LINES_FAMILY_MEMBER,
    requestedRootPath,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    allowedDirectories,
    ["directory"],
  );
  const executionPolicy = resolveSearchExecutionPolicy(detectIoCapabilityProfile());
  const validatedRootPath = traversalPreflightContext.rootEntry.validPath;
  const traversalScopePolicyResolution = traversalPreflightContext.traversalScopePolicyResolution;
  const traversalRuntimeBudgetState = createTraversalRuntimeBudgetState();
  const traversalNarrowingGuidance = buildTraversalNarrowingGuidance(requestedRootPath);
  const runtimeBudgetLimits = {
    maxVisitedEntries: executionPolicy.traversalPreviewExecutionEntryBudget,
    maxVisitedDirectories: executionPolicy.traversalPreviewExecutionDirectoryBudget,
    softTimeBudgetMs: executionPolicy.traversalPreviewExecutionTimeBudgetMs,
  };
  const traversalFrames = continuationState === null
    ? createInitialCountLinesTraversalFrames()
    : cloneCountLinesTraversalFrames(continuationState.traversalFrames);
  const files = continuationState === null ? [] : [...continuationState.files];
  let totalLines = continuationState?.totalLines ?? 0;
  let totalMatchingLines = continuationState?.totalMatchingLines ?? 0;
  let taskBackedChunkExhausted = false;

  while (traversalFrames.length > 0 && !taskBackedChunkExhausted) {
    const currentTraversalFrame = traversalFrames[traversalFrames.length - 1];

    if (currentTraversalFrame === undefined) {
      break;
    }

    const currentPath = currentTraversalFrame.directoryRelativePath === ""
      ? validatedRootPath
      : path.join(validatedRootPath, currentTraversalFrame.directoryRelativePath);

    if (currentTraversalFrame.nextEntryIndex === 0) {
      try {
        recordTraversalDirectoryVisit(traversalRuntimeBudgetState);
        assertTraversalRuntimeBudget(
          COUNT_LINES_FAMILY_MEMBER,
          traversalRuntimeBudgetState,
          Date.now(),
          traversalNarrowingGuidance,
          runtimeBudgetLimits,
        );
      } catch (error) {
        if (isTraversalRuntimeBudgetExceededError(error)) {
          taskBackedChunkExhausted = true;
          break;
        }

        throw error;
      }
    }

    let entries: import("fs").Dirent<string>[];

    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      traversalFrames.pop();
      continue;
    }

    let descendedIntoChildDirectory = false;

    while (currentTraversalFrame.nextEntryIndex < entries.length && !taskBackedChunkExhausted) {
      try {
        recordTraversalEntryVisit(traversalRuntimeBudgetState);
        assertTraversalRuntimeBudget(
          COUNT_LINES_FAMILY_MEMBER,
          traversalRuntimeBudgetState,
          Date.now(),
          traversalNarrowingGuidance,
          runtimeBudgetLimits,
        );
      } catch (error) {
        if (isTraversalRuntimeBudgetExceededError(error)) {
          taskBackedChunkExhausted = true;
          break;
        }

        throw error;
      }

      const entry = entries[currentTraversalFrame.nextEntryIndex];

      if (entry === undefined) {
        break;
      }

      currentTraversalFrame.nextEntryIndex += 1;

      const fullPath = path.join(currentPath, entry.name);
      const relativePath = normalizeRelativePath(path.relative(validatedRootPath, fullPath));
      const shouldTraverseExcludedDirectory =
        entry.isDirectory()
        && shouldTraverseTraversalScopeDirectoryPath(relativePath, traversalScopePolicyResolution);

      if (
        shouldExcludeTraversalScopePath(relativePath, traversalScopePolicyResolution)
        && !shouldTraverseExcludedDirectory
      ) {
        continue;
      }

      try {
        await validatePath(fullPath, allowedDirectories);

        if (entry.isDirectory()) {
          traversalFrames.push({
            directoryRelativePath: path.relative(validatedRootPath, fullPath),
            nextEntryIndex: 0,
          });
          descendedIntoChildDirectory = true;
          break;
        }

        if (entry.isFile() && matchesIncludedFilePatterns(relativePath, filePatterns)) {
          const count = await countLinesInFile(
            fullPath,
            pattern,
            patternClassification,
            ignoreEmptyLines,
          );
          files.push(count);
          totalLines += count.count;
          totalMatchingLines += count.matchingCount ?? 0;
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

        continue;
      }
    }

    if (!descendedIntoChildDirectory && currentTraversalFrame.nextEntryIndex >= entries.length) {
      traversalFrames.pop();
    }
  }

  return {
    files,
    totalLines,
    totalMatchingLines,
    nextContinuationState: traversalFrames.length === 0
      ? createCompletedCountLinesPathContinuationState({
          path: requestedRootPath,
          files,
          totalLines,
          totalMatchingLines,
        })
      : createInProgressCountLinesPathContinuationState(
          traversalFrames,
          files,
          totalLines,
          totalMatchingLines,
        ),
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
      executionTimeCostMultiplier: pattern === undefined
        ? TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.COUNT_STREAMING.executionTimeCostMultiplier
        : TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.COUNT_PATTERN_AWARE.executionTimeCostMultiplier,
      estimatedPerCandidateFileCostMs: pattern === undefined
        ? TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.COUNT_STREAMING.estimatedPerCandidateFileCostMs
        : TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.COUNT_PATTERN_AWARE.estimatedPerCandidateFileCostMs,
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
