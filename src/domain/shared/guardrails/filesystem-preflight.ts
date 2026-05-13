import fs from "fs/promises";
import path from "path";

import { normalizeError } from "@shared/errors";

/**
 * Shared handler-preflight helpers that resolve real filesystem metadata before content-oriented
 * endpoints start expensive reads, traversal fan-out, or diff preparation.
 *
 * @remarks
 * Schema caps remain the primary contract layer for static request-shape limits. This module owns
 * the metadata-first preflight layer that rejects dynamic byte, path, and file-type risk once real
 * paths have been validated and resolved, so oversized or invalid candidate sets fail before any
 * broader execution begins.
 */
import type { FileSystemEntryType } from "@domain/inspection/shared/filesystem-entry-metadata-contract";
import { getFileSystemEntryMetadata } from "@infrastructure/filesystem/filesystem-entry-metadata";
import { validatePath } from "@infrastructure/filesystem/path-guard";
import { createModuleLogger } from "@infrastructure/logging/logger";

import {
  createGitIgnoreTraversalHierarchy,
  ROOT_LOCAL_GITIGNORE_TRAVERSAL_SOURCE_PATH,
} from "./gitignore-traversal-enrichment";
import {
  normalizeTraversalScopePath,
  resolveTraversalScopeEntryPolicy,
  resolveTraversalScopePolicy,
  type TraversalScopePolicyResolution,
} from "./traversal-scope-policy";

import {
  createToolGuardrailMetricValue,
  createMetadataPreflightRejectedFailure,
  formatToolGuardrailFailureAsText,
} from "./tool-guardrail-error-contract";
import {
  MAX_GENERIC_PATHS_PER_REQUEST,
  PATH_MAX_CHARS,
  TRAVERSAL_PREFLIGHT_MAX_VISITED_DIRECTORIES,
  TRAVERSAL_PREFLIGHT_MAX_VISITED_ENTRIES,
  TRAVERSAL_PREFLIGHT_SOFT_TIME_BUDGET_MS,
} from "./tool-guardrail-limits";

/**
 * Canonical validated metadata entry shared by filesystem preflight helpers.
 */
export interface FilesystemPreflightEntry {
  /**
   * Original path string received from the caller before validation resolves it.
   */
  requestedPath: string;

  /**
   * Absolute validated filesystem path returned by the path guard.
   */
  validPath: string;

  /**
   * Resolved filesystem entry type returned by the shared metadata reader.
   */
  type: FileSystemEntryType;

  /**
   * Resolved filesystem entry size in bytes.
   */
  size: number;
}

/**
 * Shared root-level traversal preflight context used before broad recursive traversal begins.
 */
export interface TraversalPreflightContext {
  /**
   * Validated root entry resolved before traversal starts.
   */
  rootEntry: FilesystemPreflightEntry;

  /**
   * Effective traversal-scope policy resolved for the requested root.
   */
  traversalScopePolicyResolution: TraversalScopePolicyResolution;

  /**
   * Whether a traversal-root-local `.gitignore` file is available as an optional refinement hint.
   */
  rootLocalGitIgnoreAvailable: boolean;

  /**
   * Breadth evidence gathered before recursive traversal begins.
   */
  traversalPreflightAdmissionEvidence: TraversalPreflightAdmissionEvidence | null;
}

/**
 * Optional workload-aware policy used by traversal preflight before recursive execution begins.
 *
 * @remarks
 * Include-glob-heavy search requests may use this surface to avoid spending preflight entry budget
 * on obviously irrelevant file entries while still preserving the server-owned baseline traversal
 * contract and explicit access to excluded roots.
 */
export interface TraversalPreflightWorkloadPolicy {
  /**
   * Indicates whether one file entry should count toward the preflight entry budget.
   */
  shouldCountFileEntryTowardBudget?: (
    candidateRelativePath: string,
    entry: import("fs").Dirent<string>,
  ) => boolean;
}

/**
 * Breadth evidence gathered during root-level traversal admission before recursive execution begins.
 */
export interface TraversalPreflightAdmissionEvidence {
  /**
   * Caller-supplied root path that owns the current admission decision.
   */
  requestedRoot: string;

  /**
   * Number of filesystem entries observed during the bounded preflight probe.
   */
  visitedEntries: number;

  /**
   * Number of directories observed during the bounded preflight probe.
   */
  visitedDirectories: number;

  /**
   * Elapsed wall-clock time spent by the bounded preflight probe.
   */
  elapsedMs: number;

  /**
   * Indicates whether the bounded preflight probe stopped early after reaching its own budget.
   */
  probeTruncated: boolean;

  /**
   * Canonical stop surface when the bounded preflight probe stopped early.
   */
  stopReason: "directories" | "entries" | "time" | null;

  /**
   * Relative path of the last directory or candidate surface observed before the bounded probe stopped.
   */
  stopRelativePath: string | null;
}

interface TraversalScopePreflightProbeState {
  readonly startedAtMs: number;
  visitedEntries: number;
  visitedDirectories: number;
}

interface TraversalScopePreflightProbeDirectory {
  readonly absolutePath: string;
  readonly relativePath: string;
}

const logger = createModuleLogger("shared/guardrails/filesystem-preflight");

/**
 * Builds canonical narrowing guidance for traversal-heavy requests.
 *
 * @param requestedRoot - Caller-supplied root path that should be narrowed before retry.
 * @returns Deterministic English guidance for broad-root traversal pressure.
 */
export function buildTraversalNarrowingGuidance(requestedRoot: string): string {
  return `Narrow the requested root '${requestedRoot}', add exclude globs, or target a more specific descendant before retrying broad recursive traversal.`;
}

function throwTraversalScopePreflightRejectedFailure(
  toolName: string,
  requestedRoot: string,
  measuredValue: number,
  limitValue: number,
  unit: string,
  reason: string,
): never {
  throwMetadataPreflightRejectedFailure(
    toolName,
    `recursive traversal preflight for root '${requestedRoot}'`,
    createToolGuardrailMetricValue(measuredValue, unit),
    createToolGuardrailMetricValue(limitValue, unit),
    reason,
  );
}

function buildOptionalTraversalGitIgnoreRefinementHint(
  rootLocalGitIgnoreAvailable: boolean,
  traversalScopePolicyResolution: TraversalScopePolicyResolution,
): string {
  if (
    !rootLocalGitIgnoreAvailable
    || traversalScopePolicyResolution.gitIgnoreEnrichmentApplied
  ) {
    return "";
  }

  return " Optional narrowing refinement: repository-local .gitignore rules are available for this root but currently inactive. Retry with respectGitIgnore=true to layer directory-scoped .gitignore exclusions on top of the server-owned default traversal baseline.";
}

function getTraversalScopePreflightBudgetStop(
  state: TraversalScopePreflightProbeState,
  nowMs: number = Date.now(),
): {
  limitValue: number;
  measuredValue: number;
  reason: string;
  stopReason: "directories" | "entries" | "time";
  unit: string;
} | null {
  if (state.visitedEntries > TRAVERSAL_PREFLIGHT_MAX_VISITED_ENTRIES) {
    return {
      stopReason: "entries",
      measuredValue: state.visitedEntries,
      limitValue: TRAVERSAL_PREFLIGHT_MAX_VISITED_ENTRIES,
      unit: "entries",
      reason:
        "Projected traversal entry breadth exceeds the shared preflight ceiling before recursive execution begins.",
    };
  }

  if (state.visitedDirectories > TRAVERSAL_PREFLIGHT_MAX_VISITED_DIRECTORIES) {
    return {
      stopReason: "directories",
      measuredValue: state.visitedDirectories,
      limitValue: TRAVERSAL_PREFLIGHT_MAX_VISITED_DIRECTORIES,
      unit: "directories",
      reason:
        "Projected traversal directory breadth exceeds the shared preflight ceiling before recursive execution begins.",
    };
  }

  const elapsedMs = nowMs - state.startedAtMs;

  if (elapsedMs > TRAVERSAL_PREFLIGHT_SOFT_TIME_BUDGET_MS) {
    return {
      stopReason: "time",
      measuredValue: elapsedMs,
      limitValue: TRAVERSAL_PREFLIGHT_SOFT_TIME_BUDGET_MS,
      unit: "milliseconds",
      reason:
        "Traversal-scope admission exceeded the shared preflight time budget before recursive execution began.",
    };
  }

  return null;
}

function shouldCountTraversalPreflightFileEntryTowardBudget(
  relativePath: string,
  entry: import("fs").Dirent<string>,
  workloadPolicy: TraversalPreflightWorkloadPolicy,
): boolean {
  if (!entry.isFile()) {
    return true;
  }

  return workloadPolicy.shouldCountFileEntryTowardBudget?.(relativePath, entry) ?? true;
}

function rankTraversalPreflightEntry(
  candidateRelativePath: string,
  entry: import("fs").Dirent<string>,
  workloadPolicy: TraversalPreflightWorkloadPolicy,
): number {
  if (entry.isDirectory()) {
    return 2;
  }

  return shouldCountTraversalPreflightFileEntryTowardBudget(
    candidateRelativePath,
    entry,
    workloadPolicy,
  )
    ? 1
    : 0;
}

async function assertTraversalScopePreflightAdmission(
  toolName: string,
  requestedRoot: string,
  validRootPath: string,
  traversalScopePolicyResolution: TraversalScopePolicyResolution,
  rootLocalGitIgnoreAvailable: boolean,
  workloadPolicy: TraversalPreflightWorkloadPolicy = {},
): Promise<TraversalPreflightAdmissionEvidence> {
  logger.info(
    {
      requestedRoot,
      validRootPath,
      explicitExcludedRoot: traversalScopePolicyResolution.explicitExcludedRoot,
      applyDefaultExcludedClasses:
        traversalScopePolicyResolution.applyDefaultExcludedClasses,
      gitIgnoreEnrichmentApplied:
        traversalScopePolicyResolution.gitIgnoreEnrichmentApplied,
      rootLocalGitIgnoreAvailable,
      effectiveExcludeGlobCount:
        traversalScopePolicyResolution.effectiveExcludeGlobs.length,
      effectiveIncludeExcludedGlobCount:
        traversalScopePolicyResolution.effectiveIncludeExcludedGlobs.length,
    },
    "Traversal-scope preflight started",
  );

  const state: TraversalScopePreflightProbeState = {
    startedAtMs: Date.now(),
    visitedEntries: 0,
    visitedDirectories: 0,
  };
  const pendingDirectories: TraversalScopePreflightProbeDirectory[] = [{
    absolutePath: validRootPath,
    relativePath: "",
  }];

  while (pendingDirectories.length > 0) {
    const currentDirectory = pendingDirectories.shift();

    if (currentDirectory === undefined) {
      break;
    }

    state.visitedDirectories += 1;

    const directoryBudgetStop = getTraversalScopePreflightBudgetStop(state);

    if (directoryBudgetStop !== null) {
      logger.warn(
        {
          requestedRoot,
          currentDirectoryRelativePath: currentDirectory.relativePath,
          currentDirectoryAbsolutePath: currentDirectory.absolutePath,
          visitedEntries: state.visitedEntries,
          visitedDirectories: state.visitedDirectories,
          elapsedMs: Date.now() - state.startedAtMs,
          stopReason: directoryBudgetStop.stopReason,
        },
        "Traversal-scope preflight stopped at directory-budget checkpoint",
      );

      throwTraversalScopePreflightRejectedFailure(
        toolName,
        requestedRoot,
        directoryBudgetStop.measuredValue,
        directoryBudgetStop.limitValue,
        directoryBudgetStop.unit,
        `${directoryBudgetStop.reason} Preflight stopped near '${currentDirectory.relativePath === "" ? requestedRoot : currentDirectory.relativePath}'.${buildOptionalTraversalGitIgnoreRefinementHint(
          rootLocalGitIgnoreAvailable,
          traversalScopePolicyResolution,
        )}`,
      );
    }

    let entries: import("fs").Dirent<string>[];

    try {
      entries = await fs.readdir(currentDirectory.absolutePath, { withFileTypes: true });
    } catch (error) {
      if (currentDirectory.relativePath === "") {
        const reason = error instanceof Error
          ? error.message
          : "Traversal root could not be read during preflight admission.";

        throwMetadataPreflightRejectedFailure(
          toolName,
          `recursive traversal preflight for root '${requestedRoot}'`,
          "unresolved",
          "readable traversal root directory",
          reason,
        );
      }

      continue;
    }

    const sortedEntries = [...entries].sort((leftEntry, rightEntry) => {
      const leftRawRelativePath = currentDirectory.relativePath === ""
        ? leftEntry.name
        : path.join(currentDirectory.relativePath, leftEntry.name);
      const rightRawRelativePath = currentDirectory.relativePath === ""
        ? rightEntry.name
        : path.join(currentDirectory.relativePath, rightEntry.name);
      const leftRank = rankTraversalPreflightEntry(
        normalizeTraversalScopePath(leftRawRelativePath),
        leftEntry,
        workloadPolicy,
      );
      const rightRank = rankTraversalPreflightEntry(
        normalizeTraversalScopePath(rightRawRelativePath),
        rightEntry,
        workloadPolicy,
      );

      if (leftRank !== rightRank) {
        return rightRank - leftRank;
      }

      return leftEntry.name.localeCompare(rightEntry.name);
    });

    for (const entry of sortedEntries) {
      const rawRelativePath = currentDirectory.relativePath === ""
        ? entry.name
        : path.join(currentDirectory.relativePath, entry.name);
      const relativePath = normalizeTraversalScopePath(rawRelativePath);
      const entryPolicy = await resolveTraversalScopeEntryPolicy(
        relativePath,
        entry.isDirectory(),
        traversalScopePolicyResolution,
      );

      if (entryPolicy.excluded) {
        continue;
      }

      const countTowardBudget = shouldCountTraversalPreflightFileEntryTowardBudget(
        relativePath,
        entry,
        workloadPolicy,
      );

      if (countTowardBudget) {
        state.visitedEntries += 1;

        const entryBudgetStop = getTraversalScopePreflightBudgetStop(state);

        if (entryBudgetStop !== null) {
          logger.warn(
            {
              requestedRoot,
              currentDirectoryRelativePath: currentDirectory.relativePath,
              currentDirectoryAbsolutePath: currentDirectory.absolutePath,
              candidateRelativePath: relativePath,
              visitedEntries: state.visitedEntries,
              visitedDirectories: state.visitedDirectories,
              elapsedMs: Date.now() - state.startedAtMs,
              stopReason: entryBudgetStop.stopReason,
            },
            "Traversal-scope preflight stopped at entry-budget checkpoint",
          );

          throwTraversalScopePreflightRejectedFailure(
            toolName,
            requestedRoot,
            entryBudgetStop.measuredValue,
            entryBudgetStop.limitValue,
            entryBudgetStop.unit,
            `${entryBudgetStop.reason} Preflight stopped near '${relativePath}'.${buildOptionalTraversalGitIgnoreRefinementHint(
              rootLocalGitIgnoreAvailable,
              traversalScopePolicyResolution,
            )}`,
          );
        }
      }

      if (entry.isDirectory() && entryPolicy.shouldTraverse) {
        pendingDirectories.push({
          absolutePath: path.join(currentDirectory.absolutePath, entry.name),
          relativePath: rawRelativePath,
        });
      }
    }
  }

  const finishedAtMs = Date.now();
  const result: TraversalPreflightAdmissionEvidence = {
    requestedRoot,
    visitedEntries: state.visitedEntries,
    visitedDirectories: state.visitedDirectories,
    elapsedMs: finishedAtMs - state.startedAtMs,
    probeTruncated: false,
    stopReason: null,
    stopRelativePath: null,
  };

  logger.info(result, "Traversal-scope preflight completed");

  return result;
}

function throwMetadataPreflightRejectedFailure(
  toolName: string,
  preflightTarget: string,
  measuredValue: string | number | { value: number; unit: string },
  limitValue: string | number | { value: number; unit: string },
  reason: string,
): never {
  const failure = createMetadataPreflightRejectedFailure({
    toolName,
    preflightTarget,
    measuredValue:
      typeof measuredValue === "number"
        ? createToolGuardrailMetricValue(measuredValue, "paths")
        : measuredValue,
    limitValue:
      typeof limitValue === "number"
        ? createToolGuardrailMetricValue(limitValue, "paths")
        : limitValue,
    reason,
  });

  throw new Error(formatToolGuardrailFailureAsText(failure));
}

/**
 * Collects validated filesystem metadata entries for the metadata-first preflight layer before
 * any file-content read, diff preparation, or wide traversal begins.
 *
 * @param toolName - Exact tool name that owns the preflight request and any resulting refusal.
 * @param requestedPaths - Caller-supplied filesystem targets that must be validated and resolved.
 * @param allowedDirectories - Allowed root directories used by the path guard.
 * @returns Ordered validated metadata entries preserving the caller's original path order.
 */
export async function collectValidatedFilesystemPreflightEntries(
  toolName: string,
  requestedPaths: string[],
  allowedDirectories: string[],
): Promise<FilesystemPreflightEntry[]> {
  if (requestedPaths.length > MAX_GENERIC_PATHS_PER_REQUEST) {
    throwMetadataPreflightRejectedFailure(
      toolName,
      "requestedPaths",
      requestedPaths.length,
      MAX_GENERIC_PATHS_PER_REQUEST,
      "Requested path count exceeds the shared metadata preflight ceiling.",
    );
  }

  const entries: FilesystemPreflightEntry[] = [];

  for (const requestedPath of requestedPaths) {
    if (requestedPath.length > PATH_MAX_CHARS) {
      throwMetadataPreflightRejectedFailure(
        toolName,
        requestedPath,
        createToolGuardrailMetricValue(requestedPath.length, "characters"),
        createToolGuardrailMetricValue(PATH_MAX_CHARS, "characters"),
        "Requested path length exceeds the shared metadata preflight ceiling.",
      );
    }

    try {
      const validPath = await validatePath(requestedPath, allowedDirectories);
      const metadata = await getFileSystemEntryMetadata(validPath);

      entries.push({
        requestedPath,
        validPath,
        type: metadata.type,
        size: metadata.size,
      });
    } catch (error) {
      const reason = normalizeError(error).message;

      throwMetadataPreflightRejectedFailure(
        toolName,
        requestedPath,
        "unresolved",
        "validated existing path inside allowed directories",
        reason,
      );
    }
  }

  return entries;
}

/**
 * Resolves the canonical root-level traversal preflight context before recursive traversal begins.
 *
 * @param toolName - Exact tool name that owns the traversal request.
 * @param requestedRoot - Caller-supplied root path that anchors the traversal.
 * @param excludePatterns - Caller-supplied exclude globs used by the traversal policy.
 * @param includeExcludedGlobs - Additive re-include globs that reopen excluded descendants.
 * @param respectGitIgnore - Whether optional directory-scoped hierarchical `.gitignore` enrichment participates.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @param allowedTypes - Filesystem entry types that the current traversal surface accepts.
 * @returns Validated root metadata plus the effective traversal-scope policy.
 */
async function hasRootLocalGitIgnoreFile(rootAbsolutePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(rootAbsolutePath, ROOT_LOCAL_GITIGNORE_TRAVERSAL_SOURCE_PATH));
    return true;
  } catch {
    return false;
  }
}

export async function resolveTraversalPreflightContext(
  toolName: string,
  requestedRoot: string,
  excludePatterns: readonly string[],
  includeExcludedGlobs: readonly string[],
  respectGitIgnore: boolean,
  allowedDirectories: string[],
  allowedTypes: Array<"file" | "directory"> = ["file", "directory"],
  recursiveTraversal: boolean = true,
  workloadPolicy: TraversalPreflightWorkloadPolicy = {},
): Promise<TraversalPreflightContext> {
  const entries = await collectValidatedFilesystemPreflightEntries(
    toolName,
    [requestedRoot],
    allowedDirectories,
  );
  const rootEntry = entries[0];

  if (rootEntry === undefined) {
    throw new Error(`Expected one validated traversal root for path: ${requestedRoot}`);
  }

  assertExpectedFileTypes(toolName, [rootEntry], allowedTypes);

  const rootLocalGitIgnoreAvailable =
    rootEntry.type === "directory"
      ? await hasRootLocalGitIgnoreFile(rootEntry.validPath)
      : false;
  const gitIgnoreTraversalHierarchy =
    rootEntry.type === "directory" && respectGitIgnore
      ? createGitIgnoreTraversalHierarchy(rootEntry.validPath)
      : null;
  const traversalScopePolicyResolution = resolveTraversalScopePolicy(
    requestedRoot,
    [...excludePatterns],
    {
      includeExcludedGlobs: [...includeExcludedGlobs],
      respectGitIgnore,
      gitIgnoreTraversalHierarchy,
    },
  );

  const traversalPreflightAdmissionEvidence =
    rootEntry.type === "directory" && recursiveTraversal
      ? await assertTraversalScopePreflightAdmission(
          toolName,
          requestedRoot,
          rootEntry.validPath,
          traversalScopePolicyResolution,
          rootLocalGitIgnoreAvailable,
          workloadPolicy,
        )
      : null;

  return {
    rootEntry,
    traversalScopePolicyResolution,
    rootLocalGitIgnoreAvailable,
    traversalPreflightAdmissionEvidence,
  };
}

/**
 * Sums the total byte footprint of validated preflight entries.
 *
 * @param entries - Validated preflight entries gathered before content execution.
 * @returns The aggregate byte count across all validated entries.
 */
export function sumPreflightBytes(entries: FilesystemPreflightEntry[]): number {
  return entries.reduce((totalBytes, entry) => totalBytes + entry.size, 0);
}

/**
 * Rejects validated candidate sets whose aggregate byte load exceeds a hard preflight budget.
 *
 * @param toolName - Exact tool name that owns the preflight request.
 * @param totalBytes - Aggregate byte count across the validated candidate set.
 * @param hardCapBytes - Hard byte ceiling that must not be exceeded.
 * @param summary - Concise English summary of the guarded candidate set.
 * @returns Nothing when the candidate byte budget remains within the hard cap and execution may continue.
 */
export function assertCandidateByteBudget(
  toolName: string,
  totalBytes: number,
  hardCapBytes: number,
  summary: string,
): void {
  if (totalBytes <= hardCapBytes) {
    return;
  }

  throwMetadataPreflightRejectedFailure(
    toolName,
    summary,
    createToolGuardrailMetricValue(totalBytes, "bytes"),
    createToolGuardrailMetricValue(hardCapBytes, "bytes"),
    "Candidate byte budget exceeds the preflight ceiling before content execution begins.",
  );
}

/**
 * Rejects validated entries whose resolved filesystem types are not permitted for the current
 * operation after path validation but before the wider handler workflow begins.
 *
 * @param toolName - Exact tool name that owns the preflight request.
 * @param entries - Validated entries whose resolved types must be checked.
 * @param allowedTypes - Filesystem entry types that the current operation accepts.
 * @returns Nothing when every entry type is permitted for the operation.
 */
export function assertExpectedFileTypes(
  toolName: string,
  entries: FilesystemPreflightEntry[],
  allowedTypes: Array<"file" | "directory">,
): void {
  for (const entry of entries) {
    const isAllowedType = allowedTypes.some((allowedType) => allowedType === entry.type);

    if (isAllowedType) {
      continue;
    }

    throwMetadataPreflightRejectedFailure(
      toolName,
      entry.requestedPath,
      entry.type,
      allowedTypes.join(", "),
      "Resolved filesystem entry type is not permitted for this operation.",
    );
  }
}
