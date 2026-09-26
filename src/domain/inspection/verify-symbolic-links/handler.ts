import fs from "fs/promises";
import path from "path";

import { isUndefined } from "es-toolkit/predicate";
import { isDefined } from "remeda";

import { normalizeError } from "@shared/errors";

import { METADATA_RESPONSE_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import { validatePathForCreation } from "@infrastructure/filesystem/path-guard";

import { symbolicLinkTargetsMatch } from "./helpers";
import type { VerifySymbolicLinkRequestEntry } from "./schema";

/**
 * One produced verification judgment for a requested symbolic link.
 */
export interface SymbolicLinkVerificationEntry {
  /**
   * Caller-requested link path, echoed exactly.
   */
  path: string;

  /**
   * Caller-supplied expected target text, echoed exactly when supplied.
   */
  expectedTarget?: string | undefined;

  /**
   * Verbatim target text stored in the link, or `null` when the path is not a link.
   */
  actualTarget: string | null;

  /**
   * Whether the link target currently resolves to an existing filesystem entry.
   */
  resolvable: boolean;

  /**
   * Whether the link passed every applicable verification dimension.
   */
  valid: boolean;
}

/**
 * One failed verification attempt that produced no judgment.
 */
export interface SymbolicLinkVerificationError {
  /**
   * Caller-requested link path, echoed exactly.
   */
  path: string;

  /**
   * Caller-supplied expected target text, echoed exactly when supplied.
   */
  expectedTarget?: string | undefined;

  /**
   * Normalized failure message describing why no judgment could be produced.
   */
  error: string;
}

/**
 * Structured partial-success result of one symbolic-link verification batch.
 */
export interface SymbolicLinkVerificationResult {
  /**
   * Produced verification judgments in request order.
   */
  entries: SymbolicLinkVerificationEntry[];

  /**
   * Failed verification attempts in request order.
   */
  errors: SymbolicLinkVerificationError[];

  /**
   * Aggregate verification counts.
   */
  summary: {
    /**
     * Links that passed every applicable verification dimension.
     */
    validCount: number;

    /**
     * Links that produced a negative judgment (mismatch, dangling, or not a link).
     */
    invalidCount: number;

    /**
     * Links that failed before a judgment could be produced.
     */
    errorCount: number;
  };
}

/**
 * Computes structured symbolic-link verification results for a requested batch.
 *
 * @remarks
 * The link path is scope-proven through the creation-style path guard so the
 * link identity itself is inspected: a target-following guard would resolve
 * the link away and report the target instead of the link. Verification then
 * reads the link with `lstat`, reads the stored target text with `readlink`,
 * scope-checks the resolved target against the allowed directories, and proves
 * resolvability with a non-throwing `stat`. A link whose target escapes the
 * allowed directories is a scope violation and surfaces as an error entry.
 *
 * A dangling link is a negative judgment (`resolvable: false`, `valid:
 * false`), never an error: the link exists and was inspected successfully.
 * Errors are reserved for attempts that failed before any judgment, such as
 * missing paths or scope violations.
 *
 * @param links - Requested link and optional expected-target pairs in caller-supplied order.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @returns Structured verification entries, failures, and aggregate summary counts.
 */
export async function getSymbolicLinkVerificationResult(
  links: readonly VerifySymbolicLinkRequestEntry[],
  allowedDirectories: string[],
): Promise<SymbolicLinkVerificationResult> {
  const results = await Promise.all(
    links.map(async (link) => {
      try {
        const expectedTarget = link.expectedTarget;
        const validLinkPath = await validatePathForCreation(link.path, allowedDirectories);
        const entryStats = await fs.lstat(validLinkPath);

        if (!entryStats.isSymbolicLink()) {
          return {
            entry: {
              path: link.path,
              expectedTarget,
              actualTarget: null,
              resolvable: false,
              valid: false,
            },
          };
        }

        const actualTarget = await fs.readlink(validLinkPath);
        const resolvedTarget = path.resolve(path.dirname(validLinkPath), actualTarget);
        await validatePathForCreation(resolvedTarget, allowedDirectories);

        const targetStats = await fs.stat(validLinkPath, { throwIfNoEntry: false });
        const resolvable = isDefined(targetStats);
        const targetsAreEqual = isUndefined(expectedTarget)
          || symbolicLinkTargetsMatch(actualTarget, expectedTarget);

        return {
          entry: {
            path: link.path,
            expectedTarget,
            actualTarget,
            resolvable,
            valid: resolvable && targetsAreEqual,
          },
        };
      } catch (error) {
        return {
          error: {
            path: link.path,
            expectedTarget: link.expectedTarget,
            error: normalizeError(error).message,
          },
        };
      }
    }),
  );

  const entries = results.flatMap((result) => (result.entry === undefined ? [] : [result.entry]));
  const errors = results.flatMap((result) => (result.error === undefined ? [] : [result.error]));
  const validCount = entries.filter((entry) => entry.valid).length;
  const invalidCount = entries.filter((entry) => !entry.valid).length;

  return {
    entries,
    errors,
    summary: {
      validCount,
      invalidCount,
      errorCount: errors.length,
    },
  };
}

/**
 * Formats symbolic-link verification results for the caller-visible text surface.
 *
 * @remarks
 * The verification endpoint stays in the metadata and integrity family, so the
 * formatted output emphasizes concise validity summaries while the final text
 * surface is still rejected if it would exceed the shared metadata response
 * cap.
 *
 * @param links - Requested link and optional expected-target pairs in caller-supplied order.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @returns Human-readable verification output bounded by the metadata-family text budget.
 */
export async function handleVerifySymbolicLinks(
  links: readonly VerifySymbolicLinkRequestEntry[],
  allowedDirectories: string[],
): Promise<string> {
  const result = await getSymbolicLinkVerificationResult(links, allowedDirectories);

  let output = "Symbolic Link Verification Results:\n";
  output += `✅ Valid: ${result.summary.validCount}\n`;
  output += `❌ Invalid: ${result.summary.invalidCount}\n`;
  output += `⚠️ Errors: ${result.summary.errorCount}\n\n`;

  if (result.summary.validCount > 0) {
    output += "Valid Links:\n";
    for (const entry of result.entries.filter((entry) => entry.valid)) {
      output += `✓ ${entry.path}\n`;
    }
    output += "\n";
  }

  if (result.summary.invalidCount > 0) {
    output += "Invalid Links:\n";
    for (const entry of result.entries.filter((entry) => !entry.valid)) {
      output += `✗ ${entry.path}\n`;
      output += `  Expected: ${entry.expectedTarget ?? "(not supplied)"}\n`;
      output += `  Actual:   ${entry.actualTarget ?? "(not a symbolic link)"}\n`;
      output += `  Resolvable: ${entry.resolvable ? "yes" : "no"}\n`;
    }
    output += "\n";
  }

  if (result.summary.errorCount > 0) {
    output += "Errors:\n";
    for (const error of result.errors) {
      output += `! ${error.path}: ${error.error}\n`;
    }
  }

  assertActualTextBudget(
    "verify_symbolic_links",
    output.length,
    METADATA_RESPONSE_CAP_CHARS,
    "formatted symbolic-link verification output",
  );

  return output;
}
