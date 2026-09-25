import fs from "fs/promises";
import path from "path";
import type { Stats } from "node:fs";

import { isErrnoException, normalizeError } from "@shared/errors";

import { assertPathMutationBatchBudget } from "../shared/mutation-guardrails";
import { formatBatchMutationSummary } from "@infrastructure/formatting/batch-result-formatter";
import {
  resolveRequestedPath,
  validatePath,
  validatePathForCreation,
} from "@infrastructure/filesystem/path-guard";
import { createModuleLogger } from "@infrastructure/logging/logger";

const log = createModuleLogger("move_paths");

/**
 * Probes a requested path without following symbolic links.
 *
 * @remarks
 * Returns `null` only for a genuinely missing entry (`ENOENT`); every other failure is
 * rethrown so permission or topology errors never masquerade as a missing path.
 *
 * @param targetPath - Absolute operation path to probe.
 * @returns The lstat result, or `null` when the entry does not exist.
 */
async function lstatExistingEntry(targetPath: string): Promise<Stats | null> {
  try {
    return await fs.lstat(targetPath);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * Moves filesystem entries after validating path scope and refusing oversized mutation batches
 * before any filesystem mutation begins.
 *
 * @remarks
 * Move operations combine destructive source removal with destination creation, so the handler
 * treats them as blast-radius-sensitive path mutations. Batch-size refusal, validated scope, and
 * explicit overwrite handling must complete before any rename occurs.
 *
 * Scope security stays realpath-based inside `validatePath`, but the move itself targets the
 * requested path: a symbolic link is relocated as a link and its target is never touched.
 *
 * @param items - Move operations already mapped into source and destination pairs.
 * @param overwrite - Whether existing destinations may be replaced.
 * @param allowedDirectories - Allowed filesystem roots used by path validation.
 * @returns A deterministic batch summary or a shared guardrail refusal message.
 */
export async function handleMovePaths(
  items: Array<{source: string, destination: string}>,
  overwrite: boolean,
  allowedDirectories: string[]
): Promise<string> {
  try {
    assertPathMutationBatchBudget("move_paths", items.length);
  } catch (guardError) {
    return normalizeError(guardError).message;
  }

  const results: string[] = [];
  const errors: string[] = [];

  log.debug({ items, overwrite, allowedDirectories }, "handleMovePaths called");

  await Promise.all(
    items.map(async (item) => {
      const childLog = log.child({ source: item.source, destination: item.destination });
      try {
        childLog.debug("validating paths");
        // Validate scope first; the returned realpath is a security proof, not the operation target.
        await validatePath(item.source, allowedDirectories);
        const operationSourcePath = resolveRequestedPath(item.source);
        // Use creation-aware validation for destination to allow creating missing parent directories
        const validDestination = await validatePathForCreation(item.destination, allowedDirectories);
        childLog.debug({ operationSourcePath, validDestination }, "paths validated");

        // The probe sees the requested source itself, so dangling links remain movable.
        const sourceStats = await lstatExistingEntry(operationSourcePath);
        if (sourceStats === null) {
          childLog.error({ source: item.source }, "source does not exist");
          throw new Error(`Source does not exist: ${item.source}`);
        }

        // The probe sees the requested destination itself, including dangling links.
        const destinationStats = await lstatExistingEntry(validDestination);

        if (destinationStats !== null && !overwrite) {
          childLog.debug("destination exists and overwrite=false");
          throw new Error(`Destination already exists: ${item.destination}`);
        }

        if (destinationStats !== null) {
          // Overwrite removal targets the destination path itself: an existing link is
          // removed as a link and never resolved into its target.
          childLog.debug("destination exists and overwrite=true, removing destination");
          if (destinationStats.isSymbolicLink()) {
            await fs.rm(validDestination);
          } else if (destinationStats.isDirectory()) {
            await fs.rm(validDestination, { recursive: true, force: true });
          } else {
            await fs.unlink(validDestination);
          }
        }

        // Create parent directory for destination if it doesn't exist
        const destDir = path.dirname(validDestination);
        childLog.debug({ destDir }, "creating destination parent directory if needed");
        await fs.mkdir(destDir, { recursive: true });

        // Move the requested path itself (a link moves as a link)
        childLog.debug("calling fs.rename to move");
        await fs.rename(operationSourcePath, validDestination);
        results.push(`Successfully moved ${item.source} to ${item.destination}`);
        childLog.info({ moved: true }, "move completed");
      } catch (error) {
        const errorMessage = normalizeError(error).message;
        childLog.error({ err: error }, "move failed");
        errors.push(`Failed to move ${item.source} to ${item.destination}: ${errorMessage}`);
      }
    })
  );

  const successCount = results.length;
  log.debug({ successCount, errorCount: errors.length }, "handleMovePaths completed");
  return formatBatchMutationSummary("move operations", successCount, errors);
}
