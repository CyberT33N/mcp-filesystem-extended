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
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import { getFileSystemEntryMetadata } from "@infrastructure/filesystem/filesystem-entry-metadata";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";
import type { InspectionContinuationSqliteStore } from "@infrastructure/persistence/inspection-continuation-sqlite-store";

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

  admission: InspectionContinuationAdmission;

  continuation: InspectionContinuationMetadata;
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
  activeContinuationToken: string | null;
  activeContinuationExpiresAt: string | null;
}

interface ListDirectoryEntriesRootExecutionResult extends ListedDirectoryRoot {
  admissionOutcome: typeof TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES[keyof typeof TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES];
  nextContinuationState: ListDirectoryEntriesRootContinuationState | null;
}

const LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER = "list_directory_entries";
const LIST_DIRECTORY_ENTRIES_CONTINUATION_GUIDANCE =
  "Resume the same directory-listing request by sending only continuationToken to the same endpoint to receive the next bounded chunk of entries.";
const LIST_DIRECTORY_ENTRIES_INLINE_RESPONSE_OVERHEAD_CHARS = 256;
const LIST_DIRECTORY_ENTRIES_INLINE_ENTRY_BASE_CHARS = 96;
const LIST_DIRECTORY_ENTRIES_INLINE_TIMESTAMP_METADATA_CHARS = 96;
const LIST_DIRECTORY_ENTRIES_INLINE_PERMISSION_METADATA_CHARS = 32;

function formatListDirectoryEntriesTextOutput(
  result: ListDirectoryEntriesResult,
): string {
  const hasResumableContinuation =
    result.continuation.resumable
    && result.continuation.continuationToken !== null;

  if (result.admission.outcome !== INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST) {
    return encode(result);
  }

  const totalListedEntries = result.roots.reduce(
    (entryCount, root) => entryCount + root.entries.length,
    0,
  );
  const rootLabel = result.roots.length === 1 ? "root" : "roots";
  const previewSummary =
    `Directory listing preview is available for ${result.roots.length} ${rootLabel} with ${totalListedEntries} top-level entries in this bounded chunk.`;
  const structuredPayloadGuidance =
    "The authoritative directory-entry payload remains in structuredContent.";

  if (!hasResumableContinuation) {
    return [
      previewSummary,
      structuredPayloadGuidance,
      "This preview-first response is finalized and exposes no active continuation token.",
    ].join("\n");
  }

  return [
    previewSummary,
    result.admission.guidanceText ?? LIST_DIRECTORY_ENTRIES_CONTINUATION_GUIDANCE,
    structuredPayloadGuidance,
    "Resume the same request by sending only continuationToken on this endpoint.",
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
  return traversalFrames.map((traversalFrame) => ({ ...traversalFrame }));
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
  continuationToken: string | undefined,
  requestedPaths: string[],
  recursive: boolean,
  metadataSelection: FileSystemEntryMetadataSelection,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  inspectionContinuationStore: InspectionContinuationSqliteStore | undefined,
  now: Date,
): ListDirectoryEntriesExecutionContext {
  if (continuationToken === undefined) {
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
      activeContinuationToken: null,
      activeContinuationExpiresAt: null,
    };
  }

  if (inspectionContinuationStore === undefined) {
    throw new Error("Continuation storage is unavailable for list_directory_entries resume requests.");
  }

  const continuationSession = inspectionContinuationStore.loadActiveSession<
    ListDirectoryEntriesRequestPayload,
    ListDirectoryEntriesContinuationState
  >(
    continuationToken,
    LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
    LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
    now,
  );

  if (continuationSession === null) {
    throw new Error(getContinuationNotFoundMessage(LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER));
  }

  return {
    requestPayload: continuationSession.requestPayload,
    continuationState: continuationSession.continuationState,
    activeContinuationToken: continuationSession.continuationToken,
    activeContinuationExpiresAt: continuationSession.expiresAt,
  };
}

function buildListDirectoryEntriesContinuationEnvelope(
  continuationToken: string | null,
  continuationExpiresAt: string | null,
  nextContinuationState: ListDirectoryEntriesContinuationState | null,
  inspectionContinuationStore: InspectionContinuationSqliteStore | undefined,
  requestPayload: ListDirectoryEntriesRequestPayload,
  rootResults: ListDirectoryEntriesRootExecutionResult[],
  now: Date,
): Pick<ListDirectoryEntriesResult, "admission" | "continuation"> {
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
    throw new Error("Continuation storage is unavailable for preview-first directory listing.");
  }

  if (continuationToken === null) {
    const continuationSession = inspectionContinuationStore.createSession(
      {
        endpointName: LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
        familyMember: LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
        requestPayload,
        continuationState: nextContinuationState,
        admissionOutcome: INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      },
      now,
    );

    return createPersistedContinuationEnvelope(
      LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
      continuationSession.continuationToken,
      continuationSession.status,
      continuationSession.expiresAt,
      LIST_DIRECTORY_ENTRIES_CONTINUATION_GUIDANCE,
      INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
    );
  }

  if (continuationExpiresAt === null) {
    throw new Error("Active directory-listing continuation session is missing an expiration timestamp.");
  }

  inspectionContinuationStore.updateContinuationState(continuationToken, nextContinuationState, now);

  return createPersistedContinuationEnvelope(
    LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
    continuationToken,
    INSPECTION_CONTINUATION_STATUSES.ACTIVE,
    continuationExpiresAt,
    LIST_DIRECTORY_ENTRIES_CONTINUATION_GUIDANCE,
    INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
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
  continuationState: ListDirectoryEntriesRootContinuationState | null,
): Promise<{
  entries: ListedDirectoryEntry[];
  nextContinuationState: ListDirectoryEntriesRootContinuationState | null;
}> {
  const traversalFrames = continuationState === null
    ? createInitialListDirectoryEntriesTraversalFrames()
    : cloneListDirectoryEntriesTraversalFrames(continuationState.traversalFrames);
  const listedEntries: ListedDirectoryEntry[] = [];
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

      currentTraversalFrame.nextEntryIndex += 1;

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
        continue;
      }

      const listedEntry = await createListedDirectoryEntry(
        entryAbsolutePath,
        entry.name,
        rawRelativePath,
        metadataSelection,
      );
      listedEntries.push(listedEntry);

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
    === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.TASK_BACKED_REQUIRED
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
    const previewChunk = await collectDirectoryEntriesPreviewChunk(
      traversalPreflightContext.rootEntry.validPath,
      recursive,
      metadataSelection,
      traversalPreflightContext.traversalScopePolicyResolution,
      traversalRuntimeBudgetState,
      traversalNarrowingGuidance,
      previewExecutionRuntimeBudgetLimits,
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
  continuationToken: string | undefined,
  requestedPaths: string[],
  recursive: boolean,
  metadataSelection: FileSystemEntryMetadataSelection = DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  allowedDirectories: string[],
  inspectionContinuationStore?: InspectionContinuationSqliteStore,
): Promise<ListDirectoryEntriesResult> {
  const now = new Date();
  const executionContext = resolveListDirectoryEntriesExecutionContext(
    continuationToken,
    requestedPaths,
    recursive,
    metadataSelection,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    inspectionContinuationStore,
    now,
  );
  const activeRequestedPaths = executionContext.continuationState === null
    ? executionContext.requestPayload.requestedPaths
    : executionContext.requestPayload.requestedPaths.filter(
        (requestedRoot) =>
          executionContext.continuationState?.rootTraversalStates[requestedRoot] !== undefined,
      );

  if (activeRequestedPaths.length === 0) {
    if (executionContext.activeContinuationToken !== null && inspectionContinuationStore !== undefined) {
      inspectionContinuationStore.markSessionCompleted(executionContext.activeContinuationToken, now);
    }

    return {
      roots: [],
      ...createInlineContinuationEnvelope(),
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
  const continuationEnvelope = buildListDirectoryEntriesContinuationEnvelope(
    executionContext.activeContinuationToken,
    executionContext.activeContinuationExpiresAt,
    nextContinuationState,
    inspectionContinuationStore,
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
  continuationToken: string | undefined,
  requestedPaths: string[],
  recursive: boolean,
  metadataSelection: FileSystemEntryMetadataSelection = DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  allowedDirectories: string[],
  inspectionContinuationStore?: InspectionContinuationSqliteStore,
): Promise<string> {
  const result = await getListDirectoryEntriesResult(
    continuationToken,
    requestedPaths,
    recursive,
    metadataSelection,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    allowedDirectories,
    inspectionContinuationStore,
  );

  const output = formatListDirectoryEntriesTextOutput(result);

  assertActualTextBudget(
    LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
    output.length,
    DISCOVERY_RESPONSE_CAP_CHARS,
    "directory-listing text output",
  );

  return output;
}

