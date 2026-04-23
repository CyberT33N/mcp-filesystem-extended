import fs from "fs/promises";
import path from "path";
import { encode } from "@toon-format/toon";
import {
  buildTraversalNarrowingGuidance,
  resolveTraversalPreflightContext,
} from "@domain/shared/guardrails/filesystem-preflight";
import {
  TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS,
  resolveTraversalWorkloadAdmissionDecision,
  TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES,
} from "@domain/shared/guardrails/traversal-workload-admission";
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
  type TraversalScopePolicyResolution,
} from "@domain/shared/guardrails/traversal-scope-policy";
import { DISCOVERY_RESPONSE_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import {
  DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
  type FileSystemEntryMetadata,
  type FileSystemEntryMetadataSelection,
} from "@domain/inspection/shared/filesystem-entry-metadata-contract";
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
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import { getFileSystemEntryMetadata } from "@infrastructure/filesystem/filesystem-entry-metadata";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";
import type { InspectionResumeSessionSqliteStore } from "@infrastructure/persistence/inspection-resume-session-sqlite-store";
import { createModuleLogger } from "@infrastructure/logging/logger";

/**
 * Structured directory entry returned by the `list_directory_entries` tool.
 */
export interface ListedDirectoryEntry extends FileSystemEntryMetadata {
  /**
   * Leaf entry name.
   */
  name: string;

  /**
   * Entry path relative to the requested root path.
   */
  path: string;

  /**
   * Nested child entries when recursive traversal is enabled.
   */
  children?: ListedDirectoryEntry[];
}

/**
 * Structured listing root returned for one requested directory path.
 */
export interface ListedDirectoryRoot {
  /**
   * Directory path exactly as requested by the caller.
   */
  requestedPath: string;

  /**
   * Structured entries rooted beneath the requested path.
   */
  entries: ListedDirectoryEntry[];
}

/**
 * TOON-encoded response payload for the consolidated directory listing tool.
 */
export interface ListDirectoryEntriesResult {
  /**
   * Listing roots in request order.
   */
  roots: ListedDirectoryRoot[];

  admission: InspectionResumeAdmission;

  resume: InspectionResumeMetadata;
}

interface ListDirectoryEntriesTraversalFrame {
  directoryRelativePath: string;
  nextEntryIndex: number;
}

interface ListDirectoryEntriesRootContinuationState {
  traversalFrames: ListDirectoryEntriesTraversalFrame[];
}

interface ListDirectoryEntriesContinuationState {
  rootTraversalStates: Record<string, ListDirectoryEntriesRootContinuationState>;
}

interface ListDirectoryEntriesRequestPayload {
  requestedPaths: string[];
  recursive: boolean;
  metadataSelection: FileSystemEntryMetadataSelection;
  excludePatterns: string[];
  includeExcludedGlobs: string[];
  respectGitIgnore: boolean;
}

interface ListDirectoryEntriesExecutionContext {
  requestPayload: ListDirectoryEntriesRequestPayload;
  continuationState: ListDirectoryEntriesContinuationState | null;
  activeResumeToken: string | null;
  activeResumeExpiresAt: string | null;
  requestedResumeMode: InspectionResumeMode | null;
}

interface ListDirectoryEntriesRootExecutionResult extends ListedDirectoryRoot {
  admissionOutcome: typeof TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES[keyof typeof TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES];
  nextContinuationState: ListDirectoryEntriesRootContinuationState | null;
}

const LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER = "list_directory_entries";
const logger = createModuleLogger(LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER);
const LIST_DIRECTORY_ENTRIES_NEXT_CHUNK_GUIDANCE =
  "Resume the same directory-listing request by sending only resumeToken with resumeMode='next-chunk' to the same endpoint to receive the next bounded chunk of entries.";
const LIST_DIRECTORY_ENTRIES_COMPLETE_RESULT_GUIDANCE =
  "Resume the same directory-listing request by sending only resumeToken with resumeMode='complete-result' to let the server continue the session toward a complete result without bypassing caps.";
const LIST_DIRECTORY_ENTRIES_INLINE_RESPONSE_OVERHEAD_CHARS = 256;
const LIST_DIRECTORY_ENTRIES_INLINE_ENTRY_BASE_CHARS = 96;
const LIST_DIRECTORY_ENTRIES_INLINE_TIMESTAMP_METADATA_CHARS = 96;
const LIST_DIRECTORY_ENTRIES_INLINE_PERMISSION_METADATA_CHARS = 32;
const LIST_DIRECTORY_ENTRIES_PREVIEW_TEXT_RESPONSE_OVERHEAD_CHARS = 512;

function buildListDirectoryEntriesScopeReductionGuidance(
  requestedPaths: string[],
): string | null {
  if (requestedPaths.length === 1) {
    const requestedPath = requestedPaths[0];

    return requestedPath === undefined ? null : buildTraversalNarrowingGuidance(requestedPath);
  }

  return "Reduce the listing scope by narrowing roots, choosing a deeper root, or setting recursive = false when a shallow listing is sufficient.";
}

function formatListDirectoryEntriesChunkPayload(
  result: ListDirectoryEntriesResult,
): string {
  return encode({
    roots: result.roots,
  });
}

function formatListDirectoryEntriesTextOutput(
  result: ListDirectoryEntriesResult,
): string {
  const hasResumableResume =
    result.resume.resumable
    && result.resume.resumeToken !== null;

  if (result.admission.outcome === INSPECTION_RESUME_ADMISSION_OUTCOMES.INLINE) {
    return encode(result);
  }

  const totalListedEntries = result.roots.reduce(
    (entryCount, root) => entryCount + root.entries.length,
    0,
  );
  const rootLabel = result.roots.length === 1 ? "root" : "roots";
  const previewSummary =
    result.admission.outcome === INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED
      ? `Directory listing completion progress is available for ${result.roots.length} ${rootLabel} with ${totalListedEntries} entries in this bounded chunk.`
      : `Directory listing preview is available for ${result.roots.length} ${rootLabel} with ${totalListedEntries} entries in this bounded chunk.`;
  const previewChunkPayload = formatListDirectoryEntriesChunkPayload(result);

  if (!hasResumableResume) {
    return [
      previewSummary,
      "Final bounded directory-entry payload:",
      previewChunkPayload,
    ].join("\n");
  }

  const activeResumeToken = result.resume.resumeToken;

  if (activeResumeToken === null) {
    return [
      previewSummary,
      "Bounded directory-entry payload:",
      previewChunkPayload,
    ].join("\n");
  }

  return [
    previewSummary,
    "Bounded directory-entry payload:",
    previewChunkPayload,
    `Active resumeToken: ${activeResumeToken}`,
    `Supported resume modes: ${result.resume.supportedResumeModes.join(", ")}`,
    result.admission.guidanceText ?? LIST_DIRECTORY_ENTRIES_NEXT_CHUNK_GUIDANCE,
    result.admission.scopeReductionGuidanceText ?? "",
  ].join("\n");
}

function estimateListDirectoryEntryInlineResponseChars(
  candidateRelativePath: string,
  entryName: string,
  metadataSelection: FileSystemEntryMetadataSelection,
): number {
  return (
    LIST_DIRECTORY_ENTRIES_INLINE_ENTRY_BASE_CHARS
    + candidateRelativePath.length
    + entryName.length
    + (metadataSelection.timestamps ? LIST_DIRECTORY_ENTRIES_INLINE_TIMESTAMP_METADATA_CHARS : 0)
    + (metadataSelection.permissions ? LIST_DIRECTORY_ENTRIES_INLINE_PERMISSION_METADATA_CHARS : 0)
  );
}

function createListDirectoryEntriesResponseSurfaceEstimator(
  metadataSelection: FileSystemEntryMetadataSelection,
): NonNullable<Parameters<typeof collectTraversalCandidateWorkloadEvidence>[0]["responseSurfaceEstimator"]> {
  return {
    shouldCountEntry: () => true,
    estimateEntryResponseChars: (candidateRelativePath, entry) =>
      estimateListDirectoryEntryInlineResponseChars(
        candidateRelativePath,
        entry.name,
        metadataSelection,
      ),
  };
}

async function estimateNonRecursiveListDirectoryEntriesInlineTextChars(
  rootAbsolutePath: string,
  metadataSelection: FileSystemEntryMetadataSelection,
  traversalScopePolicyResolution: TraversalScopePolicyResolution,
): Promise<number> {
  const entries = await readSortedDirectoryEntries(rootAbsolutePath);

  const estimatedEntryChars = entries.reduce((totalChars, entry) => {
    const relativePath = normalizeRelativePath(entry.name);

    if (
      shouldExcludeTraversalScopePath(relativePath, traversalScopePolicyResolution)
      && !shouldTraverseTraversalScopeDirectoryPath(relativePath, traversalScopePolicyResolution)
    ) {
      return totalChars;
    }

    return totalChars
      + estimateListDirectoryEntryInlineResponseChars(relativePath, entry.name, metadataSelection);
  }, 0);

  return LIST_DIRECTORY_ENTRIES_INLINE_RESPONSE_OVERHEAD_CHARS + estimatedEntryChars;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function cloneListDirectoryEntriesTraversalFrames(
  traversalFrames: ListDirectoryEntriesTraversalFrame[],
): ListDirectoryEntriesTraversalFrame[] {
  return cloneInspectionResumeTraversalFrames(traversalFrames);
}

function createInitialListDirectoryEntriesTraversalFrames(): ListDirectoryEntriesTraversalFrame[] {
  return [{ directoryRelativePath: "", nextEntryIndex: 0 }];
}

async function readSortedDirectoryEntries(currentPath: string): Promise<import("fs").Dirent<string>[]> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  return entries.sort((leftEntry, rightEntry) => leftEntry.name.localeCompare(rightEntry.name));
}

async function createListedDirectoryEntry(
  entryAbsolutePath: string,
  entryName: string,
  relativePath: string,
  metadataSelection: FileSystemEntryMetadataSelection,
): Promise<ListedDirectoryEntry> {
  const metadata = await getFileSystemEntryMetadata(entryAbsolutePath, metadataSelection);

  return {
    name: entryName,
    path: normalizeRelativePath(relativePath),
    ...metadata,
  };
}

function resolveListDirectoryEntriesExecutionContext(
  resumeToken: string | undefined,
  resumeMode: InspectionResumeMode | undefined,
  requestedPaths: string[],
  recursive: boolean,
  metadataSelection: FileSystemEntryMetadataSelection,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  inspectionResumeSessionStore: InspectionResumeSessionSqliteStore | undefined,
  now: Date,
): ListDirectoryEntriesExecutionContext {
  if (resumeToken === undefined) {
    logger.info(
      { requestedPaths, recursive, resumeMode },
      "list_directory_entries base request — no resume token present",
    );
    return {
      requestPayload: {
        requestedPaths,
        recursive,
        metadataSelection,
        excludePatterns,
        includeExcludedGlobs,
        respectGitIgnore,
      },
      continuationState: null,
      activeResumeToken: null,
      activeResumeExpiresAt: null,
      requestedResumeMode: null,
    };
  }

  logger.info(
    { resumeToken, resumeMode },
    "list_directory_entries resume request — attempting session lookup",
  );

  if (inspectionResumeSessionStore === undefined) {
    logger.error(
      { resumeToken, resumeMode },
      "Resume-session storage is unavailable for list_directory_entries resume requests",
    );
    throw new Error("Resume-session storage is unavailable for list_directory_entries resume requests.");
  }

  const resumeSession = inspectionResumeSessionStore.loadActiveSession<
    ListDirectoryEntriesRequestPayload,
    ListDirectoryEntriesContinuationState
  >(
    resumeToken,
    LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
    LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
    now,
  );

  if (resumeSession === null) {
    logger.error(
      { resumeToken, resumeMode, familyMember: LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER },
      "list_directory_entries resume session not found — token does not resolve to an active server-owned session",
    );
    throw new Error(getResumeSessionNotFoundMessage(LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER));
  }

  logger.info(
    {
      resumeToken,
      resumeMode,
      resolvedResumeMode: resumeMode ?? INSPECTION_RESUME_MODES.NEXT_CHUNK,
      sessionStatus: resumeSession.status,
      sessionExpiresAt: resumeSession.expiresAt,
      sessionAdmissionOutcome: resumeSession.admissionOutcome,
    },
    "list_directory_entries resume session resolved — continuing with persisted request payload",
  );

  return {
    requestPayload: resumeSession.requestPayload,
    continuationState: resumeSession.resumeState,
    activeResumeToken: resumeSession.resumeToken,
    activeResumeExpiresAt: resumeSession.expiresAt,
    requestedResumeMode: resumeMode ?? INSPECTION_RESUME_MODES.NEXT_CHUNK,
  };
}

function buildListDirectoryEntriesResumeEnvelope(
  resumeToken: string | null,
  resumeExpiresAt: string | null,
  resumeMode: InspectionResumeMode | null,
  nextContinuationState: ListDirectoryEntriesContinuationState | null,
  inspectionResumeSessionStore: InspectionResumeSessionSqliteStore | undefined,
  requestPayload: ListDirectoryEntriesRequestPayload,
  rootResults: ListDirectoryEntriesRootExecutionResult[],
  now: Date,
): Pick<ListDirectoryEntriesResult, "admission" | "resume"> {
  const previewFirstActive = rootResults.some(
    (rootResult) =>
      rootResult.admissionOutcome === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST,
  );

  if (!previewFirstActive) {
    return createInlineResumeEnvelope();
  }

  const effectiveResumeMode = resumeMode ?? INSPECTION_RESUME_MODES.NEXT_CHUNK;
  const guidanceText = effectiveResumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT
    ? LIST_DIRECTORY_ENTRIES_COMPLETE_RESULT_GUIDANCE
    : LIST_DIRECTORY_ENTRIES_NEXT_CHUNK_GUIDANCE;
  const scopeReductionGuidanceText = buildListDirectoryEntriesScopeReductionGuidance(
    requestPayload.requestedPaths,
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
    throw new Error("Resume-session storage is unavailable for directory-listing resume.");
  }

  if (resumeToken === null) {
    const resumeSession = inspectionResumeSessionStore.createSession(
      {
        endpointName: LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
        familyMember: LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
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
      INSPECTION_RESUME_MODES.NEXT_CHUNK,
      guidanceText,
      scopeReductionGuidanceText,
      admissionOutcome,
    );
  }

  if (resumeExpiresAt === null) {
    throw new Error("Active directory-listing resume session is missing an expiration timestamp.");
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

async function collectDirectoryEntriesPreviewChunk(
  rootAbsolutePath: string,
  recursive: boolean,
  metadataSelection: FileSystemEntryMetadataSelection,
  traversalScopePolicyResolution: TraversalScopePolicyResolution,
  traversalRuntimeBudgetState: ReturnType<typeof createTraversalRuntimeBudgetState>,
  traversalNarrowingGuidance: string,
  previewExecutionRuntimeBudgetLimits: {
    maxVisitedEntries: number;
    maxVisitedDirectories: number;
    softTimeBudgetMs: number;
  },
  maxPreviewTextResponseChars: number,
  continuationState: ListDirectoryEntriesRootContinuationState | null,
): Promise<{
  entries: ListedDirectoryEntry[];
  nextContinuationState: ListDirectoryEntriesRootContinuationState | null;
}> {
  const traversalFrames = continuationState === null
    ? createInitialListDirectoryEntriesTraversalFrames()
    : cloneListDirectoryEntriesTraversalFrames(continuationState.traversalFrames);
  const listedEntries: ListedDirectoryEntry[] = [];
  let estimatedResponseChars = LIST_DIRECTORY_ENTRIES_PREVIEW_TEXT_RESPONSE_OVERHEAD_CHARS;
  let previewAborted = false;

  while (traversalFrames.length > 0 && !previewAborted) {
    const currentTraversalFrame = traversalFrames[traversalFrames.length - 1];

    if (currentTraversalFrame === undefined) {
      break;
    }

    const currentPath = currentTraversalFrame.directoryRelativePath === ""
      ? rootAbsolutePath
      : path.join(rootAbsolutePath, currentTraversalFrame.directoryRelativePath);

    if (recursive && currentTraversalFrame.nextEntryIndex === 0) {
      try {
        recordTraversalDirectoryVisit(traversalRuntimeBudgetState);
        assertTraversalRuntimeBudget(
          LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
          traversalRuntimeBudgetState,
          Date.now(),
          traversalNarrowingGuidance,
          previewExecutionRuntimeBudgetLimits,
        );
      } catch (error) {
        if (isTraversalRuntimeBudgetExceededError(error)) {
          previewAborted = true;
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

    while (currentTraversalFrame.nextEntryIndex < entries.length && !previewAborted) {
      if (recursive) {
        try {
          recordTraversalEntryVisit(traversalRuntimeBudgetState);
          assertTraversalRuntimeBudget(
            LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
            traversalRuntimeBudgetState,
            Date.now(),
            traversalNarrowingGuidance,
            previewExecutionRuntimeBudgetLimits,
          );
        } catch (error) {
          if (isTraversalRuntimeBudgetExceededError(error)) {
            previewAborted = true;
            break;
          }

          throw error;
        }
      }

      const entry = entries[currentTraversalFrame.nextEntryIndex];

      if (entry === undefined) {
        break;
      }

      const entryAbsolutePath = path.join(currentPath, entry.name);
      const rawRelativePath = currentTraversalFrame.directoryRelativePath === ""
        ? entry.name
        : path.join(currentTraversalFrame.directoryRelativePath, entry.name);
      const relativePath = normalizeRelativePath(rawRelativePath);
      const shouldTraverseExcludedDirectory =
        recursive
        && entry.isDirectory()
        && shouldTraverseTraversalScopeDirectoryPath(relativePath, traversalScopePolicyResolution);

      if (
        shouldExcludeTraversalScopePath(relativePath, traversalScopePolicyResolution)
        && !shouldTraverseExcludedDirectory
      ) {
        commitInspectionResumeTraversalEntry(currentTraversalFrame);
        continue;
      }

      const estimatedEntryResponseChars = estimateListDirectoryEntryInlineResponseChars(
        relativePath,
        entry.name,
        metadataSelection,
      );

      if (
        listedEntries.length > 0
        && estimatedResponseChars + estimatedEntryResponseChars > maxPreviewTextResponseChars
      ) {
        previewAborted = true;
        break;
      }

      if (
        shouldExcludeTraversalScopePath(relativePath, traversalScopePolicyResolution)
        && !shouldTraverseExcludedDirectory
      ) {
        continue;
      }

      const listedEntry = await createListedDirectoryEntry(
        entryAbsolutePath,
        entry.name,
        rawRelativePath,
        metadataSelection,
      );
      listedEntries.push(listedEntry);
      estimatedResponseChars += estimatedEntryResponseChars;
      commitInspectionResumeTraversalEntry(currentTraversalFrame);

      if (recursive && entry.isDirectory()) {
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

  return {
    entries: listedEntries,
    nextContinuationState: traversalFrames.length === 0
      ? null
      : {
          traversalFrames: cloneListDirectoryEntriesTraversalFrames(traversalFrames),
        },
  };
}

async function collectDirectoryEntries(
  currentPath: string,
  currentRelativePath: string,
  recursive: boolean,
  metadataSelection: FileSystemEntryMetadataSelection,
  traversalScopePolicyResolution: TraversalScopePolicyResolution,
  traversalRuntimeBudgetState: ReturnType<typeof createTraversalRuntimeBudgetState>,
  traversalNarrowingGuidance: string,
): Promise<ListedDirectoryEntry[]> {
  if (recursive) {
    recordTraversalDirectoryVisit(traversalRuntimeBudgetState);
    assertTraversalRuntimeBudget(
      LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
      traversalRuntimeBudgetState,
      Date.now(),
      traversalNarrowingGuidance,
    );
  }

  const entries = await readSortedDirectoryEntries(currentPath);
  const listedEntries: ListedDirectoryEntry[] = [];

  for (const entry of entries) {
    const entryAbsolutePath = path.join(currentPath, entry.name);
    const rawRelativePath =
      currentRelativePath === ""
        ? entry.name
        : path.join(currentRelativePath, entry.name);
    const relativePath = normalizeRelativePath(rawRelativePath);

    if (recursive) {
      recordTraversalEntryVisit(traversalRuntimeBudgetState);
      assertTraversalRuntimeBudget(
        LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
        traversalRuntimeBudgetState,
        Date.now(),
        traversalNarrowingGuidance,
      );
    }

    const shouldTraverseExcludedDirectory =
      recursive
      && entry.isDirectory()
      && shouldTraverseTraversalScopeDirectoryPath(relativePath, traversalScopePolicyResolution);

    if (
      shouldExcludeTraversalScopePath(relativePath, traversalScopePolicyResolution)
      && !shouldTraverseExcludedDirectory
    ) {
      continue;
    }

    const listedEntry = await createListedDirectoryEntry(
      entryAbsolutePath,
      entry.name,
      rawRelativePath,
      metadataSelection,
    );

    if (recursive && entry.isDirectory()) {
      listedEntry.children = await collectDirectoryEntries(
        entryAbsolutePath,
        rawRelativePath,
        recursive,
        metadataSelection,
        traversalScopePolicyResolution,
        traversalRuntimeBudgetState,
        traversalNarrowingGuidance,
      );
    }

    listedEntries.push(listedEntry);
  }

  return listedEntries;
}

async function buildListedDirectoryRoot(
  requestedPath: string,
  recursive: boolean,
  metadataSelection: FileSystemEntryMetadataSelection,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  allowedDirectories: string[],
  batchRootCount: number,
  continuationState: ListDirectoryEntriesRootContinuationState | null = null,
  requestedResumeMode: InspectionResumeMode | null = null,
): Promise<ListDirectoryEntriesRootExecutionResult> {
  const traversalPreflightContext = await resolveTraversalPreflightContext(
    LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
    requestedPath,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    allowedDirectories,
    ["directory"],
    recursive,
  );
  const executionPolicy = resolveSearchExecutionPolicy(detectIoCapabilityProfile());
  const candidateWorkloadEvidence = recursive
    ? await collectTraversalCandidateWorkloadEvidence({
        validRootPath: traversalPreflightContext.rootEntry.validPath,
        traversalScopePolicyResolution: traversalPreflightContext.traversalScopePolicyResolution,
        runtimeBudgetLimits: {
          maxVisitedEntries: executionPolicy.traversalPreviewExecutionEntryBudget,
          maxVisitedDirectories: executionPolicy.traversalPreviewExecutionDirectoryBudget,
          softTimeBudgetMs: executionPolicy.traversalPreviewExecutionTimeBudgetMs,
        },
        inlineCandidateByteBudget: null,
        fileMatcher: () => true,
        responseSurfaceEstimator: createListDirectoryEntriesResponseSurfaceEstimator(
          metadataSelection,
        ),
      })
    : null;
  const projectedInlineTextChars = recursive
    ? candidateWorkloadEvidence?.estimatedResponseChars === null
      ? null
      : LIST_DIRECTORY_ENTRIES_INLINE_RESPONSE_OVERHEAD_CHARS
        + (candidateWorkloadEvidence?.estimatedResponseChars ?? 0)
    : await estimateNonRecursiveListDirectoryEntriesInlineTextChars(
        traversalPreflightContext.rootEntry.validPath,
        metadataSelection,
        traversalPreflightContext.traversalScopePolicyResolution,
      );
  const inlineTextResponseCapChars = Math.max(
    1,
    Math.floor(DISCOVERY_RESPONSE_CAP_CHARS / Math.max(1, batchRootCount)),
  );
  const traversalAdmissionDecision = resolveTraversalWorkloadAdmissionDecision({
    requestedRoot: requestedPath,
    rootEntry: traversalPreflightContext.rootEntry,
    admissionEvidence: traversalPreflightContext.traversalPreflightAdmissionEvidence,
    candidateWorkloadEvidence,
    projectedInlineTextChars,
    executionPolicy,
    consumerCapabilities: {
      toolName: LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
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
      traversalAdmissionDecision.guidanceText ?? buildTraversalNarrowingGuidance(requestedPath),
    );
  }

  const traversalRuntimeBudgetState = createTraversalRuntimeBudgetState();
  const traversalNarrowingGuidance = buildTraversalNarrowingGuidance(requestedPath);
  const previewExecutionRuntimeBudgetLimits = {
    maxVisitedEntries: executionPolicy.traversalPreviewExecutionEntryBudget,
    maxVisitedDirectories: executionPolicy.traversalPreviewExecutionDirectoryBudget,
    softTimeBudgetMs: executionPolicy.traversalPreviewExecutionTimeBudgetMs,
  };

  if (traversalAdmissionDecision.outcome === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST) {
    if (requestedResumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT) {
      const fullEntries = await collectDirectoryEntries(
        traversalPreflightContext.rootEntry.validPath,
        "",
        recursive,
        metadataSelection,
        traversalPreflightContext.traversalScopePolicyResolution,
        traversalRuntimeBudgetState,
        traversalNarrowingGuidance,
      );

      return {
        requestedPath,
        entries: fullEntries,
        admissionOutcome: traversalAdmissionDecision.outcome,
        nextContinuationState: null,
      };
    }

    const previewChunk = await collectDirectoryEntriesPreviewChunk(
      traversalPreflightContext.rootEntry.validPath,
      recursive,
      metadataSelection,
      traversalPreflightContext.traversalScopePolicyResolution,
      traversalRuntimeBudgetState,
      traversalNarrowingGuidance,
      previewExecutionRuntimeBudgetLimits,
      inlineTextResponseCapChars,
      continuationState,
    );

    return {
      requestedPath,
      entries: previewChunk.entries,
      admissionOutcome: traversalAdmissionDecision.outcome,
      nextContinuationState: previewChunk.nextContinuationState,
    };
  }

  return {
    requestedPath,
    entries: await collectDirectoryEntries(
      traversalPreflightContext.rootEntry.validPath,
      "",
      recursive,
      metadataSelection,
      traversalPreflightContext.traversalScopePolicyResolution,
      traversalRuntimeBudgetState,
      traversalNarrowingGuidance,
    ),
    admissionOutcome: traversalAdmissionDecision.outcome,
    nextContinuationState: null,
  };
}

export async function getListDirectoryEntriesResult(
  resumeToken: string | undefined,
  resumeMode: InspectionResumeMode | undefined,
  requestedPaths: string[],
  recursive: boolean,
  metadataSelection: FileSystemEntryMetadataSelection = DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  allowedDirectories: string[],
  inspectionResumeSessionStore?: InspectionResumeSessionSqliteStore,
): Promise<ListDirectoryEntriesResult> {
  const now = new Date();
  const executionContext = resolveListDirectoryEntriesExecutionContext(
    resumeToken,
    resumeMode,
    requestedPaths,
    recursive,
    metadataSelection,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    inspectionResumeSessionStore,
    now,
  );
  const activeRequestedPaths = executionContext.continuationState === null
    ? executionContext.requestPayload.requestedPaths
    : executionContext.requestPayload.requestedPaths.filter(
        (requestedRoot) =>
          executionContext.continuationState?.rootTraversalStates[requestedRoot] !== undefined,
      );

  if (activeRequestedPaths.length === 0) {
    if (executionContext.activeResumeToken !== null && inspectionResumeSessionStore !== undefined) {
      inspectionResumeSessionStore.markSessionCompleted(executionContext.activeResumeToken, now);
    }

    return {
      roots: [],
      ...createInlineResumeEnvelope(),
    };
  }

  const roots = await Promise.all(
    activeRequestedPaths.map((requestedPath) =>
      buildListedDirectoryRoot(
        requestedPath,
        executionContext.requestPayload.recursive,
        executionContext.requestPayload.metadataSelection,
        executionContext.requestPayload.excludePatterns,
        executionContext.requestPayload.includeExcludedGlobs,
        executionContext.requestPayload.respectGitIgnore,
        allowedDirectories,
        activeRequestedPaths.length,
        executionContext.continuationState?.rootTraversalStates[requestedPath] ?? null,
        executionContext.requestedResumeMode,
      ),
    ),
  );
  const nextContinuationState = roots.reduce<ListDirectoryEntriesContinuationState | null>(
    (accumulatedState, rootResult) => {
      if (rootResult.nextContinuationState === null) {
        return accumulatedState;
      }

      return {
        rootTraversalStates: {
          ...(accumulatedState?.rootTraversalStates ?? {}),
          [rootResult.requestedPath]: rootResult.nextContinuationState,
        },
      };
    },
    null,
  );
  const continuationEnvelope = buildListDirectoryEntriesResumeEnvelope(
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
    roots: roots.map(({ requestedPath, entries }) => ({
      requestedPath,
      entries,
    })),
    ...continuationEnvelope,
  };
}

export async function handleListDirectoryEntries(
  resumeToken: string | undefined,
  resumeMode: InspectionResumeMode | undefined,
  requestedPaths: string[],
  recursive: boolean,
  metadataSelection: FileSystemEntryMetadataSelection = DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  allowedDirectories: string[],
  inspectionResumeSessionStore?: InspectionResumeSessionSqliteStore,
): Promise<string> {
  const result = await getListDirectoryEntriesResult(
    resumeToken,
    resumeMode,
    requestedPaths,
    recursive,
    metadataSelection,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    allowedDirectories,
    inspectionResumeSessionStore,
  );

  const output = formatListDirectoryEntriesTextOutput(result);

  assertActualTextBudget(
    LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
    output.length,
    DISCOVERY_RESPONSE_CAP_CHARS,
    "directory-listing text output",
  );

  if (resumeToken !== undefined && !result.resume.resumable && result.resume.resumeToken === null) {
    inspectionResumeSessionStore?.markSessionCompleted(resumeToken, new Date());
  }

  return output;
}

