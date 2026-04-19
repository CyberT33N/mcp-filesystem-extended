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

import { readGitIgnoreTraversalEnrichmentForRoot } from "./gitignore-traversal-enrichment";
import {
  resolveTraversalScopePolicy,
  type TraversalScopePolicyResolution,
} from "./traversal-scope-policy";

import {
  createToolGuardrailMetricValue,
  createMetadataPreflightRejectedFailure,
  formatToolGuardrailFailureAsText,
} from "./tool-guardrail-error-contract";
import { MAX_GENERIC_PATHS_PER_REQUEST, PATH_MAX_CHARS } from "./tool-guardrail-limits";

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
}

/**
 * Builds canonical narrowing guidance for traversal-heavy requests.
 *
 * @param requestedRoot - Caller-supplied root path that should be narrowed before retry.
 * @returns Deterministic English guidance for broad-root traversal pressure.
 */
export function buildTraversalNarrowingGuidance(requestedRoot: string): string {
  return `Narrow the requested root '${requestedRoot}', add exclude globs, or target a more specific descendant before retrying broad recursive traversal.`;
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
      const reason = error instanceof Error ? error.message : String(error);

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
 * @param respectGitIgnore - Whether optional root-local `.gitignore` enrichment participates.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @param allowedTypes - Filesystem entry types that the current traversal surface accepts.
 * @returns Validated root metadata plus the effective traversal-scope policy.
 */
export async function resolveTraversalPreflightContext(
  toolName: string,
  requestedRoot: string,
  excludePatterns: readonly string[],
  includeExcludedGlobs: readonly string[],
  respectGitIgnore: boolean,
  allowedDirectories: string[],
  allowedTypes: Array<"file" | "directory"> = ["file", "directory"],
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

  const gitIgnoreTraversalEnrichment =
    rootEntry.type === "directory" && respectGitIgnore
      ? await readGitIgnoreTraversalEnrichmentForRoot(rootEntry.validPath)
      : null;

  return {
    rootEntry,
    traversalScopePolicyResolution: resolveTraversalScopePolicy(
      requestedRoot,
      [...excludePatterns],
      {
        includeExcludedGlobs: [...includeExcludedGlobs],
        respectGitIgnore,
        gitIgnoreTraversalEnrichment,
      },
    ),
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
