import fs from "fs/promises";
import path from "path";
import type { Stats } from "fs";

import { isDefined } from "remeda";

import { isErrnoException, normalizeError } from "@shared/errors";

import { PATH_MUTATION_SUMMARY_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import { assertPathMutationBatchBudget } from "../shared/mutation-guardrails";
import { formatBatchMutationSummary } from "@infrastructure/formatting/batch-result-formatter";
import { validatePathForCreation } from "@infrastructure/filesystem/path-guard";

import type { CreateSymbolicLinkEntry } from "./schema";

const SYMLINK_PRIVILEGE_MISSING_REMEDIATION =
  "enable Windows Developer Mode OR run the server process elevated OR retry directory links with type='junction' (privilege-free, not portable)";

/**
 * Reads the link-identity stats of a candidate path without following links.
 *
 * @remarks
 * The existence check for link creation must see the directory entry itself,
 * including a dangling symbolic link: a target-following `stat` would report a
 * dangling link as missing and let the creation collide later with `EEXIST`.
 *
 * @param candidatePath - Absolute, scope-validated candidate link path.
 * @returns The entry stats when any filesystem entry exists, otherwise `undefined`.
 */
async function readLinkEntryStatsOrUndefined(candidatePath: string): Promise<Stats | undefined> {
  try {
    return await fs.lstat(candidatePath);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

/**
 * Creates new symbolic links while enforcing the shared path-mutation batch budget.
 *
 * @remarks
 * Every entry stores its target verbatim: relative targets stay portable and
 * resolve against the link's directory at access time, while absolute targets
 * are stored as-is. The resolved target form is still scope-checked against the
 * allowed directories before any link is created, so a relative target cannot
 * escape the server scope through `..` segments.
 *
 * Existing link paths are refused instead of being overwritten, and per-entry
 * failures are collected so one failed link never discards successful sibling
 * creations. On Windows, a host without Developer Mode and without elevation
 * answers with the deterministic `symlink_privilege_missing` failure family and
 * its next valid action.
 *
 * @param links - Symbolic-link creation entries in caller-supplied order.
 * @param allowedDirectories - Directory roots that bound every link path and every resolved target.
 * @returns A concise mutation summary covering successful creates and link-level failures.
 */
export async function handleCreateSymbolicLinks(
  links: readonly CreateSymbolicLinkEntry[],
  allowedDirectories: string[],
): Promise<string> {
  assertPathMutationBatchBudget("create_symbolic_links", links.length);

  const results: string[] = [];
  const errors: string[] = [];

  await Promise.all(
    links.map(async (link) => {
      try {
        const validLinkPath = await validatePathForCreation(link.linkPath, allowedDirectories);

        const existingEntryStats = await readLinkEntryStatsOrUndefined(validLinkPath);

        if (isDefined(existingEntryStats)) {
          throw new Error("Link path already exists. Use delete_paths to remove the existing entry before recreating it.");
        }

        const resolvedTarget = path.resolve(path.dirname(validLinkPath), link.target);
        await validatePathForCreation(resolvedTarget, allowedDirectories);

        const linkParentDirectory = path.dirname(validLinkPath);
        await fs.mkdir(linkParentDirectory, { recursive: true });

        await fs.symlink(link.target, validLinkPath, link.type);

        results.push(`Successfully created symbolic link: ${link.linkPath}`);
      } catch (error) {
        if (isErrnoException(error) && error.code === "EPERM") {
          errors.push(`Failed to create symbolic link ${link.linkPath}: symlink_privilege_missing (blocking layer: OS policy) — the host denied symbolic-link creation. Next valid action: ${SYMLINK_PRIVILEGE_MISSING_REMEDIATION}. Cause: ${normalizeError(error).message}`);
          return;
        }

        errors.push(`Failed to create symbolic link ${link.linkPath}: ${normalizeError(error).message}`);
      }
    }),
  );

  const output = formatBatchMutationSummary("symbolic links", results.length, errors);

  assertActualTextBudget(
    "create_symbolic_links",
    output.length,
    PATH_MUTATION_SUMMARY_CAP_CHARS,
    "Create-symbolic-links mutation summary",
  );

  return output;
}
