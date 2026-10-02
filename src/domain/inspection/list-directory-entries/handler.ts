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
  aggregateTraversalAdmissionProjections,
  buildTraversalAdmissionProjection,
  type TraversalAdmissionProjection,
} from "@domain/shared/guardrails/traversal-admission-projection";
import {
  assertTraversalRuntimeBudget,
  COMPLETE_RESULT_TRAVERSAL_RUNTIME_BUDGET_LIMITS,
  createTraversalRuntimeBudgetState,
  isTraversalRuntimeBudgetExceededError,
  recordTraversalDirectoryVisit,
  recordTraversalEntryVisit,
  type TraversalRuntimeBudgetLimits,
} from "@domain/shared/guardrails/traversal-runtime-budget";
import {
  resolveTraversalScopeEntryPolicy,
  type TraversalScopePolicyResolution,
} from "@domain/shared/guardrails/traversal-scope-policy";
import {
  DISCOVERY_RESPONSE_CAP_CHARS,
  GLOBAL_RESPONSE_HARD_CAP_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import {
  DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
  type FileSystemEntryMetadata,
  type FileSystemEntryMetadataSelection,
} from "@domain/inspection/shared/filesystem-entry-metadata-contract";
import {
  createBaseSessionDeliverySummary,
  createContinuationSessionDeliverySummary,
  createInlineResumeEnvelope,
  createPersistedResumeEnvelope,
  createResumeEnvelope,
  formatInspectionTerminalCompletionTextBlock,
  getResumeSessionNotFoundMessage,
  INSPECTION_PREVIEW_SUPPORTED_RESUME_MODES,
  INSPECTION_RESUME_ADMISSION_OUTCOMES,
  INSPECTION_RESUME_MODES,
  INSPECTION_RESUME_STATUSES,
  type InspectionResumeMode,
  type InspectionSessionDeliverySummary,
} from "@domain/shared/resume/inspection-resume-contract";
import type {
  InspectionResumeAdmission,
  InspectionResumeMetadata,
} from "@domain/shared/resume/inspection-resume-contract";
import {
  cloneInspectionResumeTraversalFrames,
  commitInspectionResumeTraversalEntry,
} from "@domain/shared/resume/inspection-resume-frontier";
import {
  INSPECTION_RESUME_FRONTIER_RECONCILIATION_STATUSES,
  reconcileInspectionResumeFrontierTruthfulness,
  type InspectionResumeFrontierDiscard,
  type InspectionResumeFrontierReconciliationVerdict,
} from "@domain/shared/resume/inspection-resume-reconciliation";
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

  /**
   * Session-cumulative delivery truth for the current response.
   *
   * @remarks
   * On resume passes the per-root entry payloads stay frontier-scoped; this summary carries how
   * many entries the session already delivered and delivers in total, so no pass ever has to
   * present its delta as the absolute session result.
   */
  sessionDelivery: InspectionSessionDeliverySummary;

  /**
   * Fail-closed reconciliation verdict for the current delivery pass.
   *
   * @remarks
   * The verdict audits that the traversal frontier and the delivery accounting agree with the
   * payload this pass actually delivered. A diverged verdict always closes the session with a
   * truthful divergence framing — never with a false completion claim.
   */
  frontierReconciliation: InspectionResumeFrontierReconciliationVerdict;

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
  /**
   * Session-cumulative delivered entry total persisted across passes.
   *
   * @remarks
   * Optional because sessions persisted before this field existed carry no total; the
   * consumption boundary normalizes their absence to zero.
   */
  deliveredTotals?: ListDirectoryEntriesDeliveredTotals;
}

/**
 * Session-cumulative delivered-entry totals persisted inside a directory-listing continuation state.
 */
interface ListDirectoryEntriesDeliveredTotals {
  /**
   * Entries already delivered to the caller in prior passes of the session.
   */
  entryCount: number;
}

interface ListDirectoryEntriesRequestPayload {
  requestedPaths: string[];
  recursive: boolean;
  metadataSelection: FileSystemEntryMetadataSelection;
  excludePatterns: string[];
  includeExcludedGlobs: string[];
  respectGitIgnore: boolean;
}

/**
 * Describes the active persisted resume-session surface of one directory-listing execution.
 *
 * @remarks
 * Token and expiration timestamp are paired by construction: both originate from the same
 * persisted session record, so the expiration timestamp is guaranteed to be present whenever
 * a resume session is active.
 */
interface ListDirectoryEntriesActiveResumeSession {
  /**
   * Opaque persisted session handle of the active session.
   */
  resumeToken: string;

  /**
   * Expiration timestamp of the active persisted session.
   */
  expiresAt: string;
}

interface ListDirectoryEntriesExecutionContext {
  requestPayload: ListDirectoryEntriesRequestPayload;
  continuationState: ListDirectoryEntriesContinuationState | null;
  activeResumeSession: ListDirectoryEntriesActiveResumeSession | null;
  requestedResumeMode: InspectionResumeMode | null;
}

interface ListDirectoryEntriesRootExecutionResult extends ListedDirectoryRoot {
  admissionOutcome: typeof TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES[keyof typeof TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES];
  /**
   * Per-request workload projection derived from this root's bounded candidate-workload probe.
   *
   * @remarks
   * `artifact_projection_only` birth-admission evidence for the admission envelope; not part
   * of the public per-root result surface. Absent when the root was listed non-recursively,
   * because the probe only runs for recursive traversals.
   */
  admissionProjection: TraversalAdmissionProjection | null;
  nextContinuationState: ListDirectoryEntriesRootContinuationState | null;
  /**
   * Directory frames discarded without delivery during this root's current pass.
   */
  discardedDirectoryRelativePaths: string[];
}

const LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER = "list_directory_entries";
const logger = createModuleLogger(LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER);
const LIST_DIRECTORY_ENTRIES_NEXT_CHUNK_GUIDANCE =
  "Resume the same directory-listing request by sending only resumeToken with resumeMode='next-chunk' to the same endpoint to receive the next bounded chunk of entries.";
const LIST_DIRECTORY_ENTRIES_COMPLETE_RESULT_GUIDANCE =
  "Resume the same directory-listing request by sending only resumeToken with resumeMode='complete-result' to let the server continue the session toward a complete result without bypassing caps.";
const LIST_DIRECTORY_ENTRIES_CONTINUATION_ADDITIVE_GUIDANCE =
  "Continuation response. This payload contains directory entries from the persisted frontier position onward. Combine with the prior preview-chunk payload for the complete dataset.";
const LIST_DIRECTORY_ENTRIES_FRONTIER_DIVERGENCE_GUIDANCE =
  "Directory-listing session closed without completing: the traversal frontier diverged from the delivered payload, so the session cannot continue truthfully. Start a new request for the affected roots to rebuild a complete listing.";
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

/**
 * Formats the directory-listing result into the caller-visible text response surface.
 *
 * @remarks
 * Exported as an explicit white-box test seam, mirroring the search-family result modules.
 * Continuation passes are frontier-delta-scoped by contract: resumable passes emit the bounded
 * chunk block, and the terminal pass emits the delta payload plus the session-cumulative summary.
 * A pass whose frontier reconciliation diverged closes with the divergence evidence instead of a
 * completion claim — the terminal framing is fail-closed.
 *
 * @param result - Structured directory-listing result across all requested roots.
 * @returns Human-readable directory-listing output for the current delivery pass.
 */
export function formatListDirectoryEntriesTextOutput(
  result: ListDirectoryEntriesResult,
): string {
  const hasResumableResume =
    result.resume.resumable
    && result.resume.resumeToken !== null;
  const continuationPass = result.sessionDelivery.continuationPass;

  // Fail-closed truthfulness gate: a pass whose traversal frontier diverged from the delivered
  // payload (for example a directory frame discarded without delivery) never frames itself as a
  // completed listing — the session closes with the divergence evidence instead.
  if (
    result.frontierReconciliation.status
    === INSPECTION_RESUME_FRONTIER_RECONCILIATION_STATUSES.DIVERGED
  ) {
    const firstDiscard = result.frontierReconciliation.discardedDirectories[0];
    const firstDiscardText = firstDiscard === undefined
      ? ""
      : ` First discard: '${firstDiscard.directoryRelativePath}' beneath root '${firstDiscard.requestedPath}'.`;
    const divergenceSummary =
      `Directory-listing session closed without completing: ${result.frontierReconciliation.divergenceReason ?? "frontier divergence"}.${firstDiscardText} The delivered payload is incomplete. Start a new request for the affected roots to rebuild a complete listing.`;

    return [
      "Bounded directory-entry payload:",
      formatListDirectoryEntriesChunkPayload(result),
      formatInspectionTerminalCompletionTextBlock(result.admission, divergenceSummary),
    ].join("\n");
  }

  // Pure inline base responses keep the plain encoded result. Every continuation pass is
  // frontier-delta-scoped by contract and must never present its delta as the session result.
  if (!continuationPass && !hasResumableResume) {
    return encode(result);
  }

  const totalListedEntries = result.roots.reduce(
    (entryCount, root) => entryCount + root.entries.length,
    0,
  );
  const rootLabel = result.roots.length === 1 ? "root" : "roots";

  if (hasResumableResume) {
    const zeroEntriesClarification = totalListedEntries === 0
      ? " No entries collected in this chunk — more directories may still be pending in the remaining traversal frontier."
      : "";
    const previewSummary =
      result.admission.outcome === INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED
        ? `Directory listing completion progress is available for ${result.roots.length} ${rootLabel} with ${totalListedEntries} entries in this bounded chunk.${zeroEntriesClarification}`
        : `Directory listing preview is available for ${result.roots.length} ${rootLabel} with ${totalListedEntries} entries in this bounded chunk.${zeroEntriesClarification}`;
    const previewChunkPayload = formatListDirectoryEntriesChunkPayload(result);
    const activeResumeToken = result.resume.resumeToken;

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

  // Terminal continuation pass: the session is complete and no longer resumable, so the response
  // closes with the delta payload, the session-cumulative summary, and the additive guidance.
  const completionSummary = `Directory-listing completion finished for ${result.roots.length} ${rootLabel}: ${totalListedEntries} additional entries in this final pass; session total ${result.sessionDelivery.sessionTotalCount} entries (${result.sessionDelivery.previouslyDeliveredCount} already delivered in prior preview-chunk payloads).`;

  return [
    "Bounded directory-entry payload:",
    formatListDirectoryEntriesChunkPayload(result),
    formatInspectionTerminalCompletionTextBlock(result.admission, completionSummary),
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

  let estimatedEntryChars = 0;

  for (const entry of entries) {
    const relativePath = normalizeRelativePath(entry.name);
    const entryPolicy = await resolveTraversalScopeEntryPolicy(
      relativePath,
      entry.isDirectory(),
      traversalScopePolicyResolution,
    );

    if (entryPolicy.excluded) {
      continue;
    }

    estimatedEntryChars += estimateListDirectoryEntryInlineResponseChars(
      relativePath,
      entry.name,
      metadataSelection,
    );
  }

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
      activeResumeSession: null,
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
    activeResumeSession: {
      resumeToken: resumeSession.resumeToken,
      expiresAt: resumeSession.expiresAt,
    },
    requestedResumeMode: resumeMode ?? INSPECTION_RESUME_MODES.NEXT_CHUNK,
  };
}

function buildListDirectoryEntriesResumeEnvelope(
  activeResumeSession: ListDirectoryEntriesActiveResumeSession | null,
  resumeMode: InspectionResumeMode | null,
  nextContinuationState: ListDirectoryEntriesContinuationState | null,
  inspectionResumeSessionStore: InspectionResumeSessionSqliteStore | undefined,
  requestPayload: ListDirectoryEntriesRequestPayload,
  rootResults: ListDirectoryEntriesRootExecutionResult[],
  frontierReconciliation: InspectionResumeFrontierReconciliationVerdict,
  now: Date,
): Pick<ListDirectoryEntriesResult, "admission" | "resume"> {
  const previewFirstActive = rootResults.some(
    (rootResult) =>
      rootResult.admissionOutcome === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST,
  );
  const admissionProjection = aggregateTraversalAdmissionProjections(
    rootResults.map((rootResult) => rootResult.admissionProjection),
  );

  if (!previewFirstActive) {
    return createInlineResumeEnvelope(admissionProjection);
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

  // Fail-closed truthfulness gate: a diverged frontier never persists for continuation and never
  // frames itself as resumable — the session closes with a truthful divergence statement.
  if (
    frontierReconciliation.status
    === INSPECTION_RESUME_FRONTIER_RECONCILIATION_STATUSES.DIVERGED
  ) {
    return createResumeEnvelope(
      admissionOutcome,
      LIST_DIRECTORY_ENTRIES_FRONTIER_DIVERGENCE_GUIDANCE,
      scopeReductionGuidanceText,
      null,
      admissionProjection,
    );
  }

  if (nextContinuationState === null) {
    return createResumeEnvelope(
      admissionOutcome,
      LIST_DIRECTORY_ENTRIES_CONTINUATION_ADDITIVE_GUIDANCE,
      scopeReductionGuidanceText,
      null,
      admissionProjection,
    );
  }

  if (inspectionResumeSessionStore === undefined) {
    throw new Error("Resume-session storage is unavailable for directory-listing resume.");
  }

  if (activeResumeSession === null) {
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
      admissionProjection,
    );
  }

  inspectionResumeSessionStore.updateResumeState(
    activeResumeSession.resumeToken,
    nextContinuationState,
    now,
    effectiveResumeMode,
  );

  return createPersistedResumeEnvelope(
    activeResumeSession.resumeToken,
    INSPECTION_RESUME_STATUSES.ACTIVE,
    activeResumeSession.expiresAt,
    INSPECTION_PREVIEW_SUPPORTED_RESUME_MODES,
    effectiveResumeMode,
    guidanceText,
    scopeReductionGuidanceText,
    admissionOutcome,
    admissionProjection,
  );
}

async function collectDirectoryEntriesPreviewChunk(
  rootAbsolutePath: string,
  recursive: boolean,
  metadataSelection: FileSystemEntryMetadataSelection,
  traversalScopePolicyResolution: TraversalScopePolicyResolution,
  traversalRuntimeBudgetState: ReturnType<typeof createTraversalRuntimeBudgetState>,
  traversalNarrowingGuidance: string,
  previewExecutionRuntimeBudgetLimits: TraversalRuntimeBudgetLimits,
  maxPreviewTextResponseChars: number,
  continuationState: ListDirectoryEntriesRootContinuationState | null,
): Promise<{
  entries: ListedDirectoryEntry[];
  nextContinuationState: ListDirectoryEntriesRootContinuationState | null;
  discardedDirectoryRelativePaths: string[];
}> {
  const traversalFrames = continuationState === null
    ? createInitialListDirectoryEntriesTraversalFrames()
    : cloneListDirectoryEntriesTraversalFrames(continuationState.traversalFrames);
  const listedEntries: ListedDirectoryEntry[] = [];
  const discardedDirectoryRelativePaths: string[] = [];
  let estimatedResponseChars = LIST_DIRECTORY_ENTRIES_PREVIEW_TEXT_RESPONSE_OVERHEAD_CHARS;
  let previewAborted = false;

  for (
    let currentTraversalFrame = traversalFrames.at(-1);
    currentTraversalFrame !== undefined && !previewAborted;
    currentTraversalFrame = traversalFrames.at(-1)
  ) {
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
    } catch (error) {
      // Fail-closed truthfulness: a directory that cannot be read leaves the traversal frontier
      // only as recorded discard evidence — never silently. The result assembly closes the
      // session with a truthful divergence framing instead of a false completion claim.
      logger.warn(
        {
          rootAbsolutePath,
          directoryRelativePath: currentTraversalFrame.directoryRelativePath,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        "Directory frame discarded from the preview traversal frontier — the directory could not be read",
      );
      discardedDirectoryRelativePaths.push(
        normalizeRelativePath(currentTraversalFrame.directoryRelativePath),
      );
      traversalFrames.pop();
      continue;
    }

    let descendedIntoChildDirectory = false;

    for (
      let entry = entries[currentTraversalFrame.nextEntryIndex];
      entry !== undefined && !previewAborted;
      entry = entries[currentTraversalFrame.nextEntryIndex]
    ) {
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

      const entryAbsolutePath = path.join(currentPath, entry.name);
      const rawRelativePath = currentTraversalFrame.directoryRelativePath === ""
        ? entry.name
        : path.join(currentTraversalFrame.directoryRelativePath, entry.name);
      const relativePath = normalizeRelativePath(rawRelativePath);
      const entryPolicy = await resolveTraversalScopeEntryPolicy(
        relativePath,
        entry.isDirectory(),
        traversalScopePolicyResolution,
      );

      if (entryPolicy.excluded) {
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

      const listedEntry = await createListedDirectoryEntry(
        entryAbsolutePath,
        entry.name,
        rawRelativePath,
        metadataSelection,
      );
      listedEntries.push(listedEntry);
      estimatedResponseChars += estimatedEntryResponseChars;
      commitInspectionResumeTraversalEntry(currentTraversalFrame);

      if (recursive && entry.isDirectory() && entryPolicy.shouldTraverse) {
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
    discardedDirectoryRelativePaths,
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

    const entryPolicy = await resolveTraversalScopeEntryPolicy(
      relativePath,
      entry.isDirectory(),
      traversalScopePolicyResolution,
    );

    if (entryPolicy.excluded) {
      continue;
    }

    const listedEntry = await createListedDirectoryEntry(
      entryAbsolutePath,
      entry.name,
      rawRelativePath,
      metadataSelection,
    );

    if (recursive && entry.isDirectory() && entryPolicy.shouldTraverse) {
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

  const admissionProjection = candidateWorkloadEvidence === null
    ? null
    : buildTraversalAdmissionProjection({
        candidateWorkloadEvidence,
        executionCostModel: {
          executionTimeCostMultiplier:
            TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.DISCOVERY.executionTimeCostMultiplier,
          estimatedPerCandidateFileCostMs:
            TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.DISCOVERY.estimatedPerCandidateFileCostMs,
        },
      });

  const traversalRuntimeBudgetState = createTraversalRuntimeBudgetState();
  const traversalNarrowingGuidance = buildTraversalNarrowingGuidance(requestedPath);
  const previewExecutionRuntimeBudgetLimits = {
    maxVisitedEntries: executionPolicy.traversalPreviewExecutionEntryBudget,
    maxVisitedDirectories: executionPolicy.traversalPreviewExecutionDirectoryBudget,
    softTimeBudgetMs: executionPolicy.traversalPreviewExecutionTimeBudgetMs,
  };

  if (traversalAdmissionDecision.outcome === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST) {
    if (requestedResumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT) {
      // Continue from the persisted frontier position, not from the root.
      // Using collectDirectoryEntriesPreviewChunk with the continuationState ensures the
      // response is additive — it delivers only the entries not yet seen in the preview chunk.
      // The completion branch keeps only the deep breadth safeguards here; the local soft-time
      // timeout stays disabled so the caller-visible completion contract is owned by the global fuse.

      const continuationChunk = await collectDirectoryEntriesPreviewChunk(
        traversalPreflightContext.rootEntry.validPath,
        recursive,
        metadataSelection,
        traversalPreflightContext.traversalScopePolicyResolution,
        traversalRuntimeBudgetState,
        traversalNarrowingGuidance,
        COMPLETE_RESULT_TRAVERSAL_RUNTIME_BUDGET_LIMITS,
        GLOBAL_RESPONSE_HARD_CAP_CHARS,
        continuationState,
      );

      return {
        requestedPath,
        entries: continuationChunk.entries,
        admissionOutcome: traversalAdmissionDecision.outcome,
        admissionProjection,
        nextContinuationState: continuationChunk.nextContinuationState,
        discardedDirectoryRelativePaths: continuationChunk.discardedDirectoryRelativePaths,
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
      admissionProjection,
      nextContinuationState: previewChunk.nextContinuationState,
      discardedDirectoryRelativePaths: previewChunk.discardedDirectoryRelativePaths,
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
    admissionProjection,
    nextContinuationState: null,
    discardedDirectoryRelativePaths: [],
  };
}

/**
 * Returns the structured directory-listing result for one or more requested root paths.
 *
 * @remarks
 * This surface resolves the execution context (base request or resume session), drives
 * per-root traversal through the admission-aware execution path, and assembles the final
 * resume envelope. Callers that need machine-readable entry data while keeping the same
 * validated traversal, frontier-precision, and resume-session rules should use this
 * function instead of the formatted handler entrypoint.
 *
 * Resume-capable delivery operates through a server-owned SQLite session. The `resumeToken`
 * and `resumeMode` fields select between bounded chunk inspection (`next-chunk`) and
 * server-owned full completion (`complete-result`). Scope reduction is always a first-class
 * alternative to resuming.
 *
 * @see {@link conventions/resume-architecture/overview.md} for the resume-session model and delivery modes.
 * @see {@link conventions/resume-architecture/guardrail-interaction.md} for the mode-aware response cap rule.
 *
 * @param resumeToken - Opaque server-owned session handle from a prior preview-first or
 * completion-backed response. Absent on base requests.
 * @param resumeMode - Delivery intent for resume requests. `'next-chunk'` returns the next
 * bounded preview chunk; `'complete-result'` asks the server to continue toward a full result.
 * @param requestedPaths - Root directory paths to list in caller-supplied order.
 * @param recursive - Whether the listing descends into nested subdirectories.
 * @param metadataSelection - Which metadata fields to include for each returned entry.
 * @param excludePatterns - Glob patterns that remove candidate paths from traversal.
 * @param includeExcludedGlobs - Additive descendant re-include globs that reopen excluded subtrees.
 * @param respectGitIgnore - Whether optional directory-scoped hierarchical `.gitignore` enrichment participates in traversal.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @param inspectionResumeSessionStore - Server-owned SQLite session store for persisting and
 * loading resume state. Required for any request that may produce or consume a resume token.
 * @returns Structured listing roots with admission and resume metadata.
 */
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
  const previouslyDeliveredEntryCount =
    executionContext.continuationState?.deliveredTotals?.entryCount ?? 0;

  if (activeRequestedPaths.length === 0) {
    if (executionContext.activeResumeSession !== null && inspectionResumeSessionStore !== undefined) {
      inspectionResumeSessionStore.markSessionCompleted(executionContext.activeResumeSession.resumeToken, now);
    }

    return {
      roots: [],
      sessionDelivery: createContinuationSessionDeliverySummary(previouslyDeliveredEntryCount, 0),
      frontierReconciliation: reconcileInspectionResumeFrontierTruthfulness({
        previouslyDeliveredCount: previouslyDeliveredEntryCount,
        currentPassDeliveredCount: 0,
        sessionTotalCount: previouslyDeliveredEntryCount,
        discardedDirectories: [],
      }),
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
  const currentPassEntryCount = roots.reduce((total, root) => total + root.entries.length, 0);
  const discardedDirectories: InspectionResumeFrontierDiscard[] = roots.flatMap((root) =>
    root.discardedDirectoryRelativePaths.map((directoryRelativePath) => ({
      requestedPath: root.requestedPath,
      directoryRelativePath,
    }))
  );
  const sessionDelivery = executionContext.continuationState === null
    ? createBaseSessionDeliverySummary(currentPassEntryCount)
    : createContinuationSessionDeliverySummary(previouslyDeliveredEntryCount, currentPassEntryCount);
  const frontierReconciliation = reconcileInspectionResumeFrontierTruthfulness({
    previouslyDeliveredCount: previouslyDeliveredEntryCount,
    currentPassDeliveredCount: currentPassEntryCount,
    sessionTotalCount: sessionDelivery.sessionTotalCount,
    discardedDirectories,
  });
  const nextContinuationStateWithDeliveredTotals = nextContinuationState === null
    ? null
    : {
        ...nextContinuationState,
        deliveredTotals: {
          entryCount: previouslyDeliveredEntryCount + currentPassEntryCount,
        },
      };
  const continuationEnvelope = buildListDirectoryEntriesResumeEnvelope(
    executionContext.activeResumeSession,
    executionContext.requestedResumeMode,
    nextContinuationStateWithDeliveredTotals,
    inspectionResumeSessionStore,
    executionContext.requestPayload,
    roots,
    frontierReconciliation,
    now,
  );

  return {
    roots: roots.map(({ requestedPath, entries }) => ({
      requestedPath,
      entries,
    })),
    sessionDelivery,
    frontierReconciliation,
    ...continuationEnvelope,
  };
}

/**
 * Finalizes the caller-visible text response for an already-executed directory-listing result.
 *
 * @remarks
 * This is the single post-execution surface shared by the composed handler entrypoint and the
 * tool-registration callback: it formats the precomputed result, enforces the mode-aware response
 * cap, and closes terminal sessions truthfully. It never re-executes traversal — the registration
 * callback consumes exactly one execution per tool call through this seam, so the text surface and
 * the structured surface always derive from the same execution.
 *
 * @param result - Structured directory-listing result from the single execution of the current call.
 * @param requestedResumeMode - The resume intent of the current request, used for the mode-aware cap.
 * @param resumeToken - The opaque session handle of the current request, when present.
 * @param inspectionResumeSessionStore - Server-owned SQLite session store for terminal lifecycle marking.
 * @returns Formatted text output respecting the mode-appropriate response ceiling.
 */
export function finalizeListDirectoryEntriesTextOutput(
  result: ListDirectoryEntriesResult,
  requestedResumeMode: InspectionResumeMode | undefined,
  resumeToken: string | undefined,
  inspectionResumeSessionStore?: InspectionResumeSessionSqliteStore,
): string {
  const output = formatListDirectoryEntriesTextOutput(result);

  const isCompleteResultMode = requestedResumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT;
  const effectiveResponseCap = isCompleteResultMode
    ? GLOBAL_RESPONSE_HARD_CAP_CHARS
    : DISCOVERY_RESPONSE_CAP_CHARS;

  assertActualTextBudget(
    LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
    output.length,
    effectiveResponseCap,
    "directory-listing text output",
  );

  if (resumeToken !== undefined && !result.resume.resumable && result.resume.resumeToken === null) {
    if (
      result.frontierReconciliation.status
      === INSPECTION_RESUME_FRONTIER_RECONCILIATION_STATUSES.DIVERGED
    ) {
      // A diverged frontier closes as cancelled, never as completed: the session did not deliver
      // its full dataset and must not carry a successful terminal lifecycle state.
      inspectionResumeSessionStore?.markSessionCancelled(resumeToken, new Date());
    } else {
      inspectionResumeSessionStore?.markSessionCompleted(resumeToken, new Date());
    }
  }

  return output;
}

/**
 * Formats directory-listing results for the caller-visible text response surface.
 *
 * @remarks
 * This entrypoint coordinates execution context resolution, per-root traversal, resume-envelope
 * assembly, and text formatting. The response cap applied after formatting is mode-aware:
 *
 * - In `inline` and `next-chunk` modes the family-specific `DISCOVERY_RESPONSE_CAP_CHARS`
 *   (150,000 chars) limits text output to protect the caller's context window.
 * - In `complete-result` mode only the global response fuse (`GLOBAL_RESPONSE_HARD_CAP_CHARS`,
 *   600,000 chars) applies, because the caller has explicitly contracted for a complete result
 *   through the resume-session protocol.
 *
 * Applying the family cap unconditionally in `complete-result` mode is an architectural
 * legacy conflict. The mode-aware cap selection here is the correct target state.
 *
 * @see {@link conventions/resume-architecture/guardrail-interaction.md} for the full mode-aware cap rule.
 * @see {@link conventions/guardrails/overview.md} for all guardrail layers and their effective scopes.
 *
 * @param resumeToken - Opaque server-owned session handle from a prior preview-first or
 * completion-backed response. Absent on base requests.
 * @param resumeMode - Delivery intent for resume requests. `'next-chunk'` returns the next
 * bounded preview chunk; `'complete-result'` asks the server to continue toward a full result.
 * @param requestedPaths - Root directory paths to list in caller-supplied order.
 * @param recursive - Whether the listing descends into nested subdirectories.
 * @param metadataSelection - Which metadata fields to include for each returned entry.
 * @param excludePatterns - Glob patterns that remove candidate paths from traversal.
 * @param includeExcludedGlobs - Additive descendant re-include globs that reopen excluded subtrees.
 * @param respectGitIgnore - Whether optional directory-scoped hierarchical `.gitignore` enrichment participates in traversal.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @param inspectionResumeSessionStore - Server-owned SQLite session store for persisting and
 * loading resume state. Required for any request that may produce or consume a resume token.
 * @returns Formatted text output respecting the mode-appropriate response ceiling.
 */
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

  return finalizeListDirectoryEntriesTextOutput(
    result,
    resumeMode,
    resumeToken,
    inspectionResumeSessionStore,
  );
}

