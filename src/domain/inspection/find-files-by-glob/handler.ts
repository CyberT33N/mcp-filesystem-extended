import fs from "fs/promises";
import path from "path";
import {
  buildTraversalNarrowingGuidance,
  resolveTraversalPreflightContext,
} from "@domain/shared/guardrails/filesystem-preflight";
import {
  TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS,
  resolveTraversalWorkloadAdmissionDecision,
  TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES,
} from "@domain/shared/guardrails/traversal-workload-admission";
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
import { collectTraversalCandidateWorkloadEvidence } from "@domain/shared/guardrails/traversal-candidate-workload";
import {
  assertTraversalRuntimeBudget,
  createTraversalRuntimeBudgetState,
  isTraversalRuntimeBudgetExceededError,
  recordTraversalDirectoryVisit,
  recordTraversalEntryVisit,
} from "@domain/shared/guardrails/traversal-runtime-budget";
import {
  shouldExcludeTraversalScopePath,
  shouldTraverseTraversalScopeDirectoryPath,
} from "@domain/shared/guardrails/traversal-scope-policy";
import { DISCOVERY_RESPONSE_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import { validatePath } from "@infrastructure/filesystem/path-guard";
import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";
import type { InspectionContinuationSqliteStore } from "@infrastructure/persistence/inspection-continuation-sqlite-store";

import { minimatch } from "minimatch";

/**
 * Describes the structured glob-search result for one requested root.
 *
 * @remarks
 * This contract preserves root-local matches and truncation state so discovery
 * callers can distinguish normal completion from family-budget cutoffs.
 */
export interface FindFilesByGlobRootResult {
  root: string;
  matches: string[];
  truncated: boolean;
}

interface FindFilesByGlobTraversalFrame {
  directoryRelativePath: string;
  nextEntryIndex: number;
}

interface FindFilesByGlobRootContinuationState {
  traversalFrames: FindFilesByGlobTraversalFrame[];
}

/**
 * Describes the structured glob-search result across the full request batch.
 *
 * @remarks
 * The batch result aggregates per-root discovery output while keeping one
 * shared truncation signal for callers that need machine-readable breadth data.
 */
export interface FindFilesByGlobResult {
  roots: FindFilesByGlobRootResult[];
  totalMatches: number;
  truncated: boolean;
  admission: InspectionContinuationAdmission;
  continuation: InspectionContinuationMetadata;
}

interface FindFilesByGlobRequestPayload {
  searchPaths: string[];
  pattern: string;
  excludePatterns: string[];
  includeExcludedGlobs: string[];
  respectGitIgnore: boolean;
  maxResults: number;
}

interface FindFilesByGlobContinuationState {
  rootTraversalStates: Record<string, FindFilesByGlobRootContinuationState>;
}

interface FindFilesByGlobRootExecutionResult extends FindFilesByGlobRootResult {
  admissionOutcome: typeof TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES[keyof typeof TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES];
  nextContinuationState: FindFilesByGlobRootContinuationState | null;
}

const FIND_FILES_BY_GLOB_FAMILY_MEMBER = "find_files_by_glob";
const FIND_FILES_BY_GLOB_CONTINUATION_GUIDANCE =
  "Resume the same glob-discovery request by sending only continuationToken to the same endpoint to receive the next bounded chunk of matches.";
const FIND_FILES_BY_GLOB_INLINE_RESPONSE_OVERHEAD_CHARS = 96;

function formatFindFilesByGlobTextOutput(
  result: FindFilesByGlobResult,
  pattern: string,
  maxResults: number,
): string {
  if (result.admission.outcome !== INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST) {
    return result.roots.length === 1
      ? formatFindFilesByGlobRootOutput(result.roots[0]!, pattern, maxResults)
      : formatBatchTextOperationResults(
          "search glob",
          result.roots.map((rootResult) => ({
            label: rootResult.root,
            output: formatFindFilesByGlobRootOutput(rootResult, pattern, maxResults),
          })),
        );
  }

  const totalMatches = result.totalMatches;
  const rootLabel = result.roots.length === 1 ? "root" : "roots";

  return [
    `Glob-discovery preview is available for ${result.roots.length} ${rootLabel} with ${totalMatches} matches in this bounded chunk.`,
    result.admission.guidanceText ?? FIND_FILES_BY_GLOB_CONTINUATION_GUIDANCE,
    "The authoritative match payload remains in structuredContent.",
    "Resume the same request by sending only continuationToken on this endpoint.",
  ].join("\n");
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function cloneFindFilesByGlobTraversalFrames(
  traversalFrames: FindFilesByGlobTraversalFrame[],
): FindFilesByGlobTraversalFrame[] {
  return traversalFrames.map((traversalFrame) => ({ ...traversalFrame }));
}

function createInitialFindFilesByGlobTraversalFrames(): FindFilesByGlobTraversalFrame[] {
  return [{ directoryRelativePath: "", nextEntryIndex: 0 }];
}

async function readSortedDirectoryEntries(currentPath: string): Promise<import("fs").Dirent<string>[]> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  return entries.sort((leftEntry, rightEntry) => leftEntry.name.localeCompare(rightEntry.name));
}

interface FindFilesByGlobExecutionContext {
  requestPayload: FindFilesByGlobRequestPayload;
  continuationState: FindFilesByGlobContinuationState | null;
  activeContinuationToken: string | null;
  activeContinuationExpiresAt: string | null;
}

function resolveFindFilesByGlobExecutionContext(
  continuationToken: string | undefined,
  searchPaths: string[],
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  inspectionContinuationStore: InspectionContinuationSqliteStore | undefined,
  now: Date,
): FindFilesByGlobExecutionContext {
  if (continuationToken === undefined) {
    return {
      requestPayload: {
        searchPaths,
        pattern,
        excludePatterns,
        includeExcludedGlobs,
        respectGitIgnore,
        maxResults,
      },
      continuationState: null,
      activeContinuationToken: null,
      activeContinuationExpiresAt: null,
    };
  }

  if (inspectionContinuationStore === undefined) {
    throw new Error("Continuation storage is unavailable for find_files_by_glob resume requests.");
  }

  const continuationSession = inspectionContinuationStore.loadActiveSession<
    FindFilesByGlobRequestPayload,
    FindFilesByGlobContinuationState
  >(
    continuationToken,
    FIND_FILES_BY_GLOB_FAMILY_MEMBER,
    FIND_FILES_BY_GLOB_FAMILY_MEMBER,
    now,
  );

  if (continuationSession === null) {
    throw new Error(getContinuationNotFoundMessage(FIND_FILES_BY_GLOB_FAMILY_MEMBER));
  }

  return {
    requestPayload: continuationSession.requestPayload,
    continuationState: continuationSession.continuationState,
    activeContinuationToken: continuationSession.continuationToken,
    activeContinuationExpiresAt: continuationSession.expiresAt,
  };
}

function buildFindFilesByGlobContinuationEnvelope(
  continuationToken: string | null,
  continuationExpiresAt: string | null,
  nextContinuationState: FindFilesByGlobContinuationState | null,
  inspectionContinuationStore: InspectionContinuationSqliteStore | undefined,
  requestPayload: FindFilesByGlobRequestPayload,
  rootResults: FindFilesByGlobRootExecutionResult[],
  now: Date,
): Pick<FindFilesByGlobResult, "admission" | "continuation"> {
  const previewFirstActive = rootResults.some(
    (rootResult) =>
      rootResult.admissionOutcome === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST,
  );

  if (!previewFirstActive) {
    return createInlineContinuationEnvelope();
  }

  if (nextContinuationState === null) {
    if (continuationToken !== null && inspectionContinuationStore !== undefined) {
      inspectionContinuationStore.markSessionCompleted(continuationToken, now);
    }

    return createContinuationEnvelope(
      INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      null,
      null,
    );
  }

  if (inspectionContinuationStore === undefined) {
    throw new Error("Continuation storage is unavailable for preview-first glob discovery.");
  }

  if (continuationToken === null) {
    const continuationSession = inspectionContinuationStore.createSession(
      {
        endpointName: FIND_FILES_BY_GLOB_FAMILY_MEMBER,
        familyMember: FIND_FILES_BY_GLOB_FAMILY_MEMBER,
        requestPayload,
        continuationState: nextContinuationState,
        admissionOutcome: INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      },
      now,
    );

    return createPersistedContinuationEnvelope(
      FIND_FILES_BY_GLOB_FAMILY_MEMBER,
      continuationSession.continuationToken,
      continuationSession.status,
      continuationSession.expiresAt,
      FIND_FILES_BY_GLOB_CONTINUATION_GUIDANCE,
      INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
    );
  }

  if (continuationExpiresAt === null) {
    throw new Error("Active glob-discovery continuation session is missing an expiration timestamp.");
  }

  inspectionContinuationStore.updateContinuationState(continuationToken, nextContinuationState, now);

  return createPersistedContinuationEnvelope(
    FIND_FILES_BY_GLOB_FAMILY_MEMBER,
    continuationToken,
    INSPECTION_CONTINUATION_STATUSES.ACTIVE,
    continuationExpiresAt,
    FIND_FILES_BY_GLOB_CONTINUATION_GUIDANCE,
    INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
  );
}

function formatFindFilesByGlobRootOutput(
  rootResult: FindFilesByGlobRootResult,
  pattern: string,
  maxResults: number,
): string {
  if (rootResult.matches.length === 0) {
    if (rootResult.truncated) {
      return `Traversal scope exceeded the bounded preview-first lane before matching files could be collected. ${buildTraversalNarrowingGuidance(rootResult.root)}`;
    }

    return `No files matching pattern: ${pattern}`;
  }

  const sortedMatches = [...rootResult.matches].sort();
  let output = `Found ${sortedMatches.length} files matching pattern: ${pattern}`;

  if (rootResult.truncated) {
    output += ` (limited to ${maxResults} results)`;
  }

  output += "\n\n";

  for (const match of sortedMatches) {
    output += `${match}\n`;
  }

  return output.trimEnd();
}

async function getFindFilesByGlobRootResult(
  searchPath: string,
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  allowedDirectories: string[],
  batchRootCount: number,
  continuationState: FindFilesByGlobRootContinuationState | null = null,
): Promise<FindFilesByGlobRootExecutionResult> {
  const traversalPreflightContext = await resolveTraversalPreflightContext(
    "find_files_by_glob",
    searchPath,
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
    fileMatcher: (candidateRelativePath) => minimatch(candidateRelativePath, pattern, { dot: true }),
    responseSurfaceEstimator: {
      shouldCountEntry: (candidateRelativePath, entry) =>
        entry.isFile() && minimatch(candidateRelativePath, pattern, { dot: true }),
      estimateEntryResponseChars: (candidateRelativePath) =>
        traversalPreflightContext.rootEntry.validPath.length + candidateRelativePath.length + 3,
    },
  });
  const projectedInlineTextChars = candidateWorkloadEvidence.estimatedResponseChars === null
    ? null
    : FIND_FILES_BY_GLOB_INLINE_RESPONSE_OVERHEAD_CHARS
      + candidateWorkloadEvidence.estimatedResponseChars;
  const inlineTextResponseCapChars = Math.max(
    1,
    Math.floor(DISCOVERY_RESPONSE_CAP_CHARS / Math.max(1, batchRootCount)),
  );
  const traversalAdmissionDecision = resolveTraversalWorkloadAdmissionDecision({
    requestedRoot: searchPath,
    rootEntry: traversalPreflightContext.rootEntry,
    admissionEvidence: traversalPreflightContext.traversalPreflightAdmissionEvidence,
    candidateWorkloadEvidence,
    projectedInlineTextChars,
    executionPolicy,
    consumerCapabilities: {
      toolName: "find_files_by_glob",
      previewFirstSupported: true,
      inlineCandidateFileBudget: executionPolicy.traversalInlineCandidateFileBudget,
      inlineTextResponseCapChars,
      executionTimeCostMultiplier:
        TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.DISCOVERY.executionTimeCostMultiplier,
      estimatedPerCandidateFileCostMs:
        TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.DISCOVERY.estimatedPerCandidateFileCostMs,
      taskBackedExecutionSupported: false,
    },
  });

  if (
    traversalAdmissionDecision.outcome
    === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.NARROWING_REQUIRED
    || traversalAdmissionDecision.outcome
    === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.TASK_BACKED_REQUIRED
  ) {
    throw new Error(
      traversalAdmissionDecision.guidanceText ?? buildTraversalNarrowingGuidance(searchPath),
    );
  }

  const validRootPath = traversalPreflightContext.rootEntry.validPath;
  const traversalScopePolicyResolution = traversalPreflightContext.traversalScopePolicyResolution;
  const traversalRuntimeBudgetState = createTraversalRuntimeBudgetState();
  const traversalNarrowingGuidance = buildTraversalNarrowingGuidance(searchPath);
  const previewExecutionRuntimeBudgetLimits =
    traversalAdmissionDecision.outcome === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST
      ? {
          maxVisitedEntries: executionPolicy.traversalPreviewExecutionEntryBudget,
          maxVisitedDirectories: executionPolicy.traversalPreviewExecutionDirectoryBudget,
          softTimeBudgetMs: executionPolicy.traversalPreviewExecutionTimeBudgetMs,
        }
      : undefined;

  const results: string[] = [];
  let searchAborted = false;
  const traversalFrames = continuationState === null
    ? createInitialFindFilesByGlobTraversalFrames()
    : cloneFindFilesByGlobTraversalFrames(continuationState.traversalFrames);

  while (traversalFrames.length > 0 && !searchAborted) {
    const currentTraversalFrame = traversalFrames[traversalFrames.length - 1];

    if (currentTraversalFrame === undefined) {
      break;
    }

    const currentPath = currentTraversalFrame.directoryRelativePath === ""
      ? validRootPath
      : path.join(validRootPath, currentTraversalFrame.directoryRelativePath);

    if (currentTraversalFrame.nextEntryIndex === 0) {
      try {
        recordTraversalDirectoryVisit(traversalRuntimeBudgetState);
        assertTraversalRuntimeBudget(
          "find_files_by_glob",
          traversalRuntimeBudgetState,
          Date.now(),
          traversalNarrowingGuidance,
          previewExecutionRuntimeBudgetLimits,
        );
      } catch (error) {
        if (isTraversalRuntimeBudgetExceededError(error)) {
          searchAborted = true;
          break;
        }

        throw error;
      }
    }

    let entries: import("fs").Dirent<string>[];

    try {
      entries = await readSortedDirectoryEntries(currentPath);
    } catch {
      traversalFrames.pop();
      continue;
    }

    let descendedIntoChildDirectory = false;

    while (currentTraversalFrame.nextEntryIndex < entries.length && !searchAborted) {
      try {
        recordTraversalEntryVisit(traversalRuntimeBudgetState);
        assertTraversalRuntimeBudget(
          "find_files_by_glob",
          traversalRuntimeBudgetState,
          Date.now(),
          traversalNarrowingGuidance,
          previewExecutionRuntimeBudgetLimits,
        );
      } catch (error) {
        if (isTraversalRuntimeBudgetExceededError(error)) {
          searchAborted = true;
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
      const rawRelativePath = currentTraversalFrame.directoryRelativePath === ""
        ? entry.name
        : path.join(currentTraversalFrame.directoryRelativePath, entry.name);
      const relativePath = normalizeRelativePath(rawRelativePath);
      const shouldTraverseExcludedDirectory =
        entry.isDirectory()
        && shouldTraverseTraversalScopeDirectoryPath(
          relativePath,
          traversalScopePolicyResolution,
        );

      if (
        shouldExcludeTraversalScopePath(relativePath, traversalScopePolicyResolution)
        && !shouldTraverseExcludedDirectory
      ) {
        continue;
      }

      try {
        await validatePath(fullPath, allowedDirectories);
      } catch {
        continue;
      }

      if (minimatch(relativePath, pattern, { dot: true })) {
        results.push(fullPath);

        if (results.length >= maxResults) {
          searchAborted = true;
          break;
        }
      }

      if (entry.isDirectory()) {
        traversalFrames.push({
          directoryRelativePath: rawRelativePath,
          nextEntryIndex: 0,
        });
        descendedIntoChildDirectory = true;
        break;
      }
    }

    if (!descendedIntoChildDirectory && currentTraversalFrame.nextEntryIndex >= entries.length) {
      traversalFrames.pop();
    }
  }

  const nextContinuationState =
    traversalAdmissionDecision.outcome === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST
    && traversalFrames.length > 0
      ? {
          traversalFrames: cloneFindFilesByGlobTraversalFrames(traversalFrames),
        }
      : null;

  return {
    root: searchPath,
    matches: [...results].sort(),
    truncated: searchAborted || nextContinuationState !== null,
    admissionOutcome: traversalAdmissionDecision.outcome,
    nextContinuationState,
  };
}

/**
 * Returns the structured glob-search result for one or more requested roots.
 *
 * @remarks
 * Use this surface when callers need machine-readable discovery output while
 * still inheriting path validation, root-local truncation, and family-level
 * response-budget protection in downstream formatting layers.
 *
 * @param searchPaths - Requested root directories in caller-supplied order.
 * @param pattern - Glob expression applied to relative paths beneath each root.
 * @param excludePatterns - Glob patterns removed from traversal before result collection.
 * @param includeExcludedGlobs - Additive descendant re-include globs that reopen excluded subtrees.
 * @param respectGitIgnore - Whether optional root-local `.gitignore` enrichment participates.
 * @param maxResults - Maximum number of matches retained per root before truncation.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @returns Structured per-root glob-search results and aggregate totals.
 */
export async function getFindFilesByGlobResult(
  continuationToken: string | undefined,
  searchPaths: string[],
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  allowedDirectories: string[],
  inspectionContinuationStore?: InspectionContinuationSqliteStore,
): Promise<FindFilesByGlobResult> {
  const now = new Date();
  const executionContext = resolveFindFilesByGlobExecutionContext(
    continuationToken,
    searchPaths,
    pattern,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    maxResults,
    inspectionContinuationStore,
    now,
  );
  const activeSearchPaths = executionContext.continuationState === null
    ? executionContext.requestPayload.searchPaths
    : executionContext.requestPayload.searchPaths.filter(
        (requestedSearchPath) =>
          executionContext.continuationState?.rootTraversalStates[requestedSearchPath] !== undefined,
      );

  if (activeSearchPaths.length === 0) {
    if (executionContext.activeContinuationToken !== null && inspectionContinuationStore !== undefined) {
      inspectionContinuationStore.markSessionCompleted(executionContext.activeContinuationToken, now);
    }

    return {
      roots: [],
      totalMatches: 0,
      truncated: false,
      ...createInlineContinuationEnvelope(),
    };
  }

  const roots = await Promise.all(
    activeSearchPaths.map((requestedSearchPath) =>
      getFindFilesByGlobRootResult(
        requestedSearchPath,
        executionContext.requestPayload.pattern,
        executionContext.requestPayload.excludePatterns,
        executionContext.requestPayload.includeExcludedGlobs,
        executionContext.requestPayload.respectGitIgnore,
        executionContext.requestPayload.maxResults,
        allowedDirectories,
        activeSearchPaths.length,
        executionContext.continuationState?.rootTraversalStates[requestedSearchPath] ?? null,
      ),
    ),
  );
  const nextContinuationState = roots.reduce<FindFilesByGlobContinuationState | null>(
    (accumulatedState, rootResult) => {
      if (rootResult.nextContinuationState === null) {
        return accumulatedState;
      }

      return {
        rootTraversalStates: {
          ...(accumulatedState?.rootTraversalStates ?? {}),
          [rootResult.root]: rootResult.nextContinuationState,
        },
      };
    },
    null,
  );
  const continuationEnvelope = buildFindFilesByGlobContinuationEnvelope(
    executionContext.activeContinuationToken,
    executionContext.activeContinuationExpiresAt,
    nextContinuationState,
    inspectionContinuationStore,
    executionContext.requestPayload,
    roots,
    now,
  );

  return {
    roots: roots.map(({ root, matches, truncated }) => ({
      root,
      matches,
      truncated,
    })),
    totalMatches: roots.reduce((total, root) => total + root.matches.length, 0),
    truncated: roots.some((root) => root.truncated),
    ...continuationEnvelope,
  };
}

/**
 * Formats glob-search results for the caller-visible text response surface.
 *
 * @remarks
 * This discovery entrypoint keeps file enumeration broad enough for caller use
 * but still enforces a bounded match ceiling and rejects oversize formatted
 * output through the shared discovery response budget.
 *
 * @param searchPaths - Requested root directories in caller-supplied order.
 * @param pattern - Glob expression applied to relative paths beneath each root.
 * @param excludePatterns - Glob patterns removed from traversal before result collection.
 * @param includeExcludedGlobs - Additive descendant re-include globs that reopen excluded subtrees.
 * @param respectGitIgnore - Whether optional root-local `.gitignore` enrichment participates.
 * @param maxResults - Maximum number of matches retained per root before truncation.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @returns Human-readable glob-search output bounded by the discovery-family text budget.
 */
export async function handleSearchGlob(
  continuationToken: string | undefined,
  searchPaths: string[],
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  allowedDirectories: string[],
  inspectionContinuationStore?: InspectionContinuationSqliteStore,
): Promise<string> {
  const executionContext = resolveFindFilesByGlobExecutionContext(
    continuationToken,
    searchPaths,
    pattern,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    maxResults,
    inspectionContinuationStore,
    new Date(),
  );
  const result = await getFindFilesByGlobResult(
    continuationToken,
    searchPaths,
    pattern,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    maxResults,
    allowedDirectories,
    inspectionContinuationStore,
  );
  const effectivePattern = executionContext.requestPayload.pattern;
  const effectiveMaxResults = executionContext.requestPayload.maxResults;
  const output = formatFindFilesByGlobTextOutput(
    result,
    effectivePattern,
    effectiveMaxResults,
  );

  assertActualTextBudget(
    "find_files_by_glob",
    output.length,
    DISCOVERY_RESPONSE_CAP_CHARS,
    "formatted batched glob search results",
  );

  return output;
}
