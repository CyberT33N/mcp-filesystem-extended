import type { SearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import type { PatternClassification } from "@domain/shared/search/pattern-classifier";
import { getRequiredUgrepExecutablePath } from "@infrastructure/runtime/ugrep-runtime-dependency";

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
   * Concrete candidate paths or scopes passed to the native search backend.
   *
   * @remarks
   * The shared native-search lane may execute against one validated file, one validated directory
   * root, or one ordered batch of validated file candidates that already survived family-local
   * traversal and eligibility checks.
   */
  candidatePaths?: string[];

  /**
   * Optional newline-delimited candidate-path manifest consumed by the native backend.
   *
   * @remarks
   * Large ordered candidate batches may be materialized into a temporary manifest file so the
   * shared native-search lane can execute one large batch without inflating the process argument
   * vector beyond platform-friendly bounds.
   */
  candidatePathListFile?: string;
  /**
   * Indicates whether literal search intentionally targets a hybrid-searchable surface.
   */
  hybridLiteralSearchLane?: boolean;

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
   * Indicates whether the command intentionally uses the hybrid literal-search lane.
   */
  hybridLiteralSearchLane: boolean;

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
  const hybridLiteralSearchLane =
    input.patternClassification.supportsLiteralFastPath
    && input.hybridLiteralSearchLane === true;
  const usesCandidatePathListFile = input.candidatePathListFile !== undefined;
  const candidatePaths = input.candidatePaths ?? [];

  if (usesCandidatePathListFile && candidatePaths.length > 0) {
    throw new Error(
      "buildUgrepCommand accepts either candidatePaths or candidatePathListFile, but not both.",
    );
  }

  if (!usesCandidatePathListFile && candidatePaths.length === 0) {
    throw new Error(
      "buildUgrepCommand requires at least one candidate path or one candidate-path manifest file.",
    );
  }

  const args = [
    `--binary-files=${hybridLiteralSearchLane ? "text" : "without-match"}`,
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

  args.push(input.patternClassification.originalPattern);

  if (usesCandidatePathListFile) {
    args.push(`--from=${input.candidatePathListFile}`);
  } else {
    args.push(...candidatePaths);
  }

  return {
    args,
    executable: getRequiredUgrepExecutablePath(),
    fixedStringMode: input.patternClassification.supportsLiteralFastPath,
    hybridLiteralSearchLane,
    requiresPcre2: input.patternClassification.requiresPcre2,
    syncCandidateBytesCap: input.patternClassification.supportsLiteralFastPath
      ? input.executionPolicy.fixedStringSyncCandidateBytesCap
      : input.executionPolicy.regexSyncCandidateBytesCap,
  };
}
