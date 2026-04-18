import type { SearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import type { PatternClassification } from "@domain/shared/search/pattern-classifier";

/**
 * Input contract for deterministic `ugrep` command construction.
 */
export interface BuildUgrepCommandInput {
  /**
   * Shared pattern-classification output for the caller-supplied pattern.
   */
  patternClassification: PatternClassification;

  /**
   * Shared runtime policy snapshot that the command plan must preserve.
   */
  executionPolicy: SearchExecutionPolicy;

  /**
   * Concrete candidate path or scope passed to the native search backend.
   */
  candidatePath: string;

  /**
   * Whether matching should remain case-sensitive.
   */
  caseSensitive?: boolean;

  /**
   * Optional maximum number of emitted matches.
   */
  maxCount?: number;

  /**
   * Optional number of leading context lines per match.
   */
  beforeContextLines?: number;

  /**
   * Optional number of trailing context lines per match.
   */
  afterContextLines?: number;
}

/**
 * Canonical structured command plan for one `ugrep` execution.
 */
export interface UgrepCommand {
  /**
   * Resolved executable that later runner code must invoke.
   */
  executable: string;

  /**
   * Ordered argument vector passed directly to the native backend without a shell.
   */
  args: string[];

  /**
   * Indicates whether the command uses the fixed-string fast path.
   */
  fixedStringMode: boolean;

  /**
   * Indicates whether the command requires a PCRE2-capable execution lane.
   */
  requiresPcre2: boolean;

  /**
   * Policy-derived synchronous candidate-byte cap associated with this command plan.
   */
  syncCandidateBytesCap: number;
}

/**
 * Builds one deterministic `ugrep` command plan from shared classification and policy surfaces.
 *
 * @remarks
 * Endpoint handlers should consume this builder instead of assembling backend-specific arguments
 * locally. The returned plan stays shell-free and preserves enough metadata for later sync,
 * preview-first, and task-backed routing without re-running classification.
 *
 * @param input - Shared classification, policy, and caller search options.
 * @returns One structured native-search command plan.
 */
export function buildUgrepCommand(input: BuildUgrepCommandInput): UgrepCommand {
  const args = [
    "--binary-files=without-match",
    "--color=never",
    "--line-number",
    "--with-filename",
  ];

  if (!input.caseSensitive) {
    args.push("--ignore-case");
  }

  if (input.beforeContextLines !== undefined && input.beforeContextLines > 0) {
    args.push(`--before-context=${input.beforeContextLines}`);
  }

  if (input.afterContextLines !== undefined && input.afterContextLines > 0) {
    args.push(`--after-context=${input.afterContextLines}`);
  }

  if (input.maxCount !== undefined && input.maxCount > 0) {
    args.push(`--max-count=${input.maxCount}`);
  }

  if (input.patternClassification.supportsLiteralFastPath) {
    args.push("--fixed-strings");
  }

  if (input.patternClassification.requiresPcre2) {
    args.push("--perl-regexp");
  }

  args.push(input.patternClassification.originalPattern, input.candidatePath);

  return {
    args,
    executable: "ugrep",
    fixedStringMode: input.patternClassification.supportsLiteralFastPath,
    requiresPcre2: input.patternClassification.requiresPcre2,
    syncCandidateBytesCap: input.patternClassification.supportsLiteralFastPath
      ? input.executionPolicy.fixedStringSyncCandidateBytesCap
      : input.executionPolicy.regexSyncCandidateBytesCap,
  };
}
