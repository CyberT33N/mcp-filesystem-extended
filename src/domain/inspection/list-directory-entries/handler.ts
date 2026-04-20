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
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import { getFileSystemEntryMetadata } from "@infrastructure/filesystem/filesystem-entry-metadata";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";

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
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
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
      "list_directory_entries",
      traversalRuntimeBudgetState,
      Date.now(),
      traversalNarrowingGuidance,
    );
  }

  const entries = await fs.readdir(currentPath, { withFileTypes: true });
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
        "list_directory_entries",
        traversalRuntimeBudgetState,
        Date.now(),
        traversalNarrowingGuidance,
      );
    }

    const shouldTraverseExcludedDirectory =
      recursive &&
      entry.isDirectory() &&
      shouldTraverseTraversalScopeDirectoryPath(relativePath, traversalScopePolicyResolution);

    if (
      shouldExcludeTraversalScopePath(relativePath, traversalScopePolicyResolution) &&
      !shouldTraverseExcludedDirectory
    ) {
      continue;
    }

    const metadata = await getFileSystemEntryMetadata(
      entryAbsolutePath,
      metadataSelection
    );

    let listedEntry: ListedDirectoryEntry = {
      name: entry.name,
      path: relativePath,
      ...metadata,
    };

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
  allowedDirectories: string[]
): Promise<ListedDirectoryRoot> {
  const traversalPreflightContext = await resolveTraversalPreflightContext(
    "list_directory_entries",
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
      })
    : null;
  const traversalAdmissionDecision = resolveTraversalWorkloadAdmissionDecision({
    requestedRoot: requestedPath,
    rootEntry: traversalPreflightContext.rootEntry,
    admissionEvidence: traversalPreflightContext.traversalPreflightAdmissionEvidence,
    candidateWorkloadEvidence,
    executionPolicy,
    consumerCapabilities: {
      toolName: "list_directory_entries",
      previewFirstSupported: false,
      inlineCandidateFileBudget: executionPolicy.traversalInlineCandidateFileBudget,
      executionTimeCostMultiplier:
        TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.DISCOVERY.executionTimeCostMultiplier,
      estimatedPerCandidateFileCostMs:
        TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.DISCOVERY.estimatedPerCandidateFileCostMs,
      taskBackedExecutionSupported: false,
    },
  });

  if (
    traversalAdmissionDecision.outcome
    !== TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.INLINE
  ) {
    throw new Error(
      traversalAdmissionDecision.guidanceText ?? buildTraversalNarrowingGuidance(requestedPath),
    );
  }
  const traversalRuntimeBudgetState = createTraversalRuntimeBudgetState();
  const traversalNarrowingGuidance = buildTraversalNarrowingGuidance(requestedPath);

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
  };
}

/**
 * Builds the structured directory listing result used by the directory-entry surface.
 *
 * @remarks
 * This surface reuses the grouped metadata contract defined in
 * `@domain/inspection/shared/filesystem-entry-metadata-contract` so
 * `get_path_metadata` and `list_directory_entries` stay aligned on the same
 * metadata selection behavior.
 *
 * @param requestedPaths - Directory paths to list.
 * @param recursive - Whether nested directory content should be traversed.
 * @param metadataSelection - Grouped optional metadata flags. `size` and `type` remain required defaults.
 * @param excludePatterns - Optional glob-like exclude patterns.
 * @param includeExcludedGlobs - Optional additive descendant re-include globs.
 * @param respectGitIgnore - Whether optional root-local `.gitignore` enrichment should participate.
 * @param allowedDirectories - Allowed directory roots used during path validation.
 * @returns Structured directory listing result.
 */
export async function getListDirectoryEntriesResult(
  requestedPaths: string[],
  recursive: boolean,
  metadataSelection: FileSystemEntryMetadataSelection = DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  allowedDirectories: string[]
): Promise<ListDirectoryEntriesResult> {
  const roots = await Promise.all(
    requestedPaths.map((requestedPath) =>
      buildListedDirectoryRoot(
        requestedPath,
        recursive,
        metadataSelection,
        excludePatterns,
        includeExcludedGlobs,
        respectGitIgnore,
        allowedDirectories
      )
    )
  );

  const result: ListDirectoryEntriesResult = {
    roots,
  };

  return result;
}

/**
 * Lists directory entries as a TOON-encoded structured payload.
 *
 * @param requestedPaths - Directory paths to list.
 * @param recursive - Whether nested directory content should be traversed.
 * @param metadataSelection - Grouped optional metadata flags. `size` and `type` remain required defaults.
 * @param excludePatterns - Optional glob-like exclude patterns.
 * @param includeExcludedGlobs - Optional additive descendant re-include globs.
 * @param respectGitIgnore - Whether optional root-local `.gitignore` enrichment should participate.
 * @param allowedDirectories - Allowed directory roots used during path validation.
 * @returns TOON-encoded structured directory listing output.
 */
export async function handleListDirectoryEntries(
  requestedPaths: string[],
  recursive: boolean,
  metadataSelection: FileSystemEntryMetadataSelection = DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  allowedDirectories: string[]
): Promise<string> {
  const result = await getListDirectoryEntriesResult(
    requestedPaths,
    recursive,
    metadataSelection,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    allowedDirectories
  );

  const output = encode(result);

  assertActualTextBudget(
    "list_directory_entries",
    output.length,
    DISCOVERY_RESPONSE_CAP_CHARS,
    "encoded structured directory listing output",
  );

  return output;
}
