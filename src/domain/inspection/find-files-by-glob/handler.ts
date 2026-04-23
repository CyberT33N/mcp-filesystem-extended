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
  createInlineResumeEnvelope,
  createPersistedResumeEnvelope,
  createResumeEnvelope,
  getResumeSessionNotFoundMessage,
  INSPECTION_PREVIEW_SUPPORTED_RESUME_MODES,
  INSPECTION_RESUME_ADMISSION_OUTCOMES,
  INSPECTION_RESUME_MODES,
  INSPECTION_RESUME_STATUSES,
  type InspectionResumeMode,
} from "@domain/shared/resume/inspection-resume-contract";
import type {
  InspectionResumeAdmission,
  InspectionResumeMetadata,
} from "@domain/shared/resume/inspection-resume-contract";
import {
  cloneInspectionResumeTraversalFrames,
  commitInspectionResumeTraversalEntry,
} from "@domain/shared/resume/inspection-resume-frontier";
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
import type { InspectionResumeSessionSqliteStore } from "@infrastructure/persistence/inspection-resume-session-sqlite-store";

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
  admission: InspectionResumeAdmission;
  resume: InspectionResumeMetadata;
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
const FIND_FILES_BY_GLOB_NEXT_CHUNK_GUIDANCE =
  "Resume the same glob-discovery request by sending only resumeToken with resumeMode='next-chunk' to the same endpoint to receive the next bounded chunk of matches.";
const FIND_FILES_BY_GLOB_COMPLETE_RESULT_GUIDANCE =
  "Resume the same glob-discovery request by sending only resumeToken with resumeMode='complete-result' to let the server continue the session toward a complete result without bypassing caps.";
const FIND_FILES_BY_GLOB_INLINE_RESPONSE_OVERHEAD_CHARS = 96;

function buildFindFilesByGlobScopeReductionGuidance(searchPaths: string[]): string | null {
  if (searchPaths.length === 1) {
    const searchPath = searchPaths[0];

    return searchPath === undefined ? null : buildTraversalNarrowingGuidance(searchPath);
  }

  return "Reduce the discovery scope by narrowing roots, tightening the glob, or limiting reopened descendants through includeExcludedGlobs.";
}

function formatFindFilesByGlobTextOutput(
  result: FindFilesByGlobResult,
  pattern: string,
  maxResults: number,
): string {
  const hasResumableResume =
    result.resume.resumable
    && result.resume.resumeToken !== null;

  if (result.admission.outcome === INSPECTION_RESUME_ADMISSION_OUTCOMES.INLINE) {
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
  const previewSummary =
    result.admission.outcome === INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED
      ? `Glob-discovery completion progress is available for ${result.roots.length} ${rootLabel} with ${totalMatches} matches in this bounded chunk.`
      : `Glob-discovery preview is available for ${result.roots.length} ${rootLabel} with ${totalMatches} matches in this bounded chunk.`;
  const structuredPayloadGuidance = "The authoritative match payload remains in structuredContent.";

  if (!hasResumableResume) {
    return [
      previewSummary,
      structuredPayloadGuidance,
      "This response is finalized and exposes no active resume token.",
    ].join("\n");
  }

  return [
    previewSummary,
    `Active resumeToken: ${result.resume.resumeToken}`,
    `Supported resume modes: ${result.resume.supportedResumeModes.join(", ")}`,
    result.admission.guidanceText ?? FIND_FILES_BY_GLOB_NEXT_CHUNK_GUIDANCE,
    structuredPayloadGuidance,
    result.admission.scopeReductionGuidanceText ?? "",
  ].join("\n");
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function cloneFindFilesByGlobTraversalFrames(
  traversalFrames: FindFilesByGlobTraversalFrame[],
): FindFilesByGlobTraversalFrame[] {
  return cloneInspectionResumeTraversalFrames(traversalFrames);
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
  activeResumeToken: string | null;
  activeResumeExpiresAt: string | null;
  requestedResumeMode: InspectionResumeMode | null;
}

function resolveFindFilesByGlobExecutionContext(
  resumeToken: string | undefined,
  resumeMode: InspectionResumeMode | undefined,
  searchPaths: string[],
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  inspectionResumeSessionStore: InspectionResumeSessionSqliteStore | undefined,
  now: Date,
): FindFilesByGlobExecutionContext {
  if (resumeToken === undefined) {
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
      activeResumeToken: null,
      activeResumeExpiresAt: null,
      requestedResumeMode: null,
    };
  }

  if (inspectionResumeSessionStore === undefined) {
    throw new Error("Resume-session storage is unavailable for find_files_by_glob resume requests.");
  }

  const resumeSession = inspectionResumeSessionStore.loadActiveSession<
    FindFilesByGlobRequestPayload,
    FindFilesByGlobContinuationState
  >(
    resumeToken,
    FIND_FILES_BY_GLOB_FAMILY_MEMBER,
    FIND_FILES_BY_GLOB_FAMILY_MEMBER,
    now,
  );

  if (resumeSession === null) {
    throw new Error(getResumeSessionNotFoundMessage(FIND_FILES_BY_GLOB_FAMILY_MEMBER));
  }

  return {
    requestPayload: resumeSession.requestPayload,
    continuationState: resumeSession.resumeState,
    activeResumeToken: resumeSession.resumeToken,
    activeResumeExpiresAt: resumeSession.expiresAt,
    requestedResumeMode: resumeMode ?? INSPECTION_RESUME_MODES.NEXT_CHUNK,
  };
}

function buildFindFilesByGlobResumeEnvelope(
  resumeToken: string | null,
  resumeExpiresAt: string | null,
  resumeMode: InspectionResumeMode | null,
  nextContinuationState: FindFilesByGlobContinuationState | null,
  inspectionResumeSessionStore: InspectionResumeSessionSqliteStore | undefined,
  requestPayload: FindFilesByGlobRequestPayload,
  rootResults: FindFilesByGlobRootExecutionResult[],
  now: Date,
): Pick<FindFilesByGlobResult, "admission" | "resume"> {
  const previewFirstActive = rootResults.some(
    (rootResult) =>
      rootResult.admissionOutcome === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST,
  );

  if (!previewFirstActive) {
    return createInlineResumeEnvelope();
  }

  const effectiveResumeMode = resumeMode ?? INSPECTION_RESUME_MODES.NEXT_CHUNK;
  const guidanceText = effectiveResumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT
    ? FIND_FILES_BY_GLOB_COMPLETE_RESULT_GUIDANCE
    : FIND_FILES_BY_GLOB_NEXT_CHUNK_GUIDANCE;
  const scopeReductionGuidanceText = buildFindFilesByGlobScopeReductionGuidance(
    requestPayload.searchPaths,
  );
  const admissionOutcome = effectiveResumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT
    ? INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED
    : INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST;

  if (nextContinuationState === null) {
    return createResumeEnvelope(
      admissionOutcome,
      null,
      scopeReductionGuidanceText,
      null,
    );
  }

  if (inspectionResumeSessionStore === undefined) {
    throw new Error("Resume-session storage is unavailable for preview-first glob discovery.");
  }

  if (resumeToken === null) {
    const resumeSession = inspectionResumeSessionStore.createSession(
      {
        endpointName: FIND_FILES_BY_GLOB_FAMILY_MEMBER,
        familyMember: FIND_FILES_BY_GLOB_FAMILY_MEMBER,
        requestPayload,
        resumeState: nextContinuationState,
        admissionOutcome,
        lastRequestedResumeMode: resumeMode,
      },
      now,
    );

    return createPersistedResumeEnvelope(
      resumeSession.resumeToken,
      resumeSession.status,
      resumeSession.expiresAt,
      INSPECTION_PREVIEW_SUPPORTED_RESUME_MODES,
      effectiveResumeMode,
      guidanceText,
      scopeReductionGuidanceText,
      admissionOutcome,
    );
  }

  if (resumeExpiresAt === null) {
    throw new Error("Active glob-discovery resume session is missing an expiration timestamp.");
  }

  inspectionResumeSessionStore.updateResumeState(
    resumeToken,
    nextContinuationState,
    now,
    effectiveResumeMode,
  );

  return createPersistedResumeEnvelope(
    resumeToken,
    INSPECTION_RESUME_STATUSES.ACTIVE,
    resumeExpiresAt,
    INSPECTION_PREVIEW_SUPPORTED_RESUME_MODES,
    effectiveResumeMode,
    guidanceText,
    scopeReductionGuidanceText,
    admissionOutcome,
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
  requestedResumeMode: InspectionResumeMode | null = null,
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
    === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED
  ) {
    throw new Error(
      traversalAdmissionDecision.guidanceText ?? buildTraversalNarrowingGuidance(searchPath),
    );
  }

  const completeResultRequested =
    traversalAdmissionDecision.outcome === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST
    && requestedResumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT;
  const validRootPath = traversalPreflightContext.rootEntry.validPath;
  const traversalScopePolicyResolution = traversalPreflightContext.traversalScopePolicyResolution;
  const traversalRuntimeBudgetState = createTraversalRuntimeBudgetState();
  const traversalNarrowingGuidance = buildTraversalNarrowingGuidance(searchPath);
  const previewExecutionRuntimeBudgetLimits =
    traversalAdmissionDecision.outcome === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST
    && !completeResultRequested
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
        commitInspectionResumeTraversalEntry(currentTraversalFrame);
        continue;
      }

      try {
        await validatePath(fullPath, allowedDirectories);
      } catch {
        commitInspectionResumeTraversalEntry(currentTraversalFrame);
        continue;
      }

      if (minimatch(relativePath, pattern, { dot: true })) {
        results.push(fullPath);
      }

      commitInspectionResumeTraversalEntry(currentTraversalFrame);

      if (results.length >= maxResults) {
        searchAborted = true;
        break;
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
    && !completeResultRequested
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
  resumeToken: string | undefined,
  resumeMode: InspectionResumeMode | undefined,
  searchPaths: string[],
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  allowedDirectories: string[],
  inspectionResumeSessionStore?: InspectionResumeSessionSqliteStore,
): Promise<FindFilesByGlobResult> {
  const now = new Date();
  const executionContext = resolveFindFilesByGlobExecutionContext(
    resumeToken,
    resumeMode,
    searchPaths,
    pattern,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    maxResults,
    inspectionResumeSessionStore,
    now,
  );
  const activeSearchPaths = executionContext.continuationState === null
    ? executionContext.requestPayload.searchPaths
    : executionContext.requestPayload.searchPaths.filter(
        (requestedSearchPath) =>
          executionContext.continuationState?.rootTraversalStates[requestedSearchPath] !== undefined,
      );

  if (activeSearchPaths.length === 0) {
    if (executionContext.activeResumeToken !== null && inspectionResumeSessionStore !== undefined) {
      inspectionResumeSessionStore.markSessionCompleted(executionContext.activeResumeToken, now);
    }

    return {
      roots: [],
      totalMatches: 0,
      truncated: false,
      ...createInlineResumeEnvelope(),
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
        executionContext.requestedResumeMode,
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
  const continuationEnvelope = buildFindFilesByGlobResumeEnvelope(
    executionContext.activeResumeToken,
    executionContext.activeResumeExpiresAt,
    executionContext.requestedResumeMode,
    nextContinuationState,
    inspectionResumeSessionStore,
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
  resumeToken: string | undefined,
  resumeMode: InspectionResumeMode | undefined,
  searchPaths: string[],
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  allowedDirectories: string[],
  inspectionResumeSessionStore?: InspectionResumeSessionSqliteStore,
): Promise<string> {
  const executionContext = resolveFindFilesByGlobExecutionContext(
    resumeToken,
    resumeMode,
    searchPaths,
    pattern,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    maxResults,
    inspectionResumeSessionStore,
    new Date(),
  );
  const result = await getFindFilesByGlobResult(
    resumeToken,
    resumeMode,
    searchPaths,
    pattern,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    maxResults,
    allowedDirectories,
    inspectionResumeSessionStore,
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
    "glob-discovery text output",
  );

  if (resumeToken !== undefined && !result.resume.resumable && result.resume.resumeToken === null) {
    inspectionResumeSessionStore?.markSessionCompleted(resumeToken, new Date());
  }

  return output;
}
