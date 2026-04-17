import type { IoCapabilityProfile } from "@domain/shared/runtime/io-capability-profile";
import {
  resolveSearchExecutionPolicy,
  type SearchExecutionPolicy,
} from "@domain/shared/search/search-execution-policy";
import {
  buildUgrepCommand,
  type UgrepCommand,
} from "@infrastructure/search/ugrep-command-builder";

import {
  classifyPattern,
  type PatternClassification,
} from "./pattern-classifier";

/**
 * Declares the canonical execution lanes for `count_lines` queries.
 *
 * @remarks
 * Total-only counting stays on the streaming reader path, while pattern-aware
 * counting reuses the shared native-search lane instead of rebuilding
 * endpoint-local regex execution logic.
 */
export enum CountQueryExecutionLane {
  NATIVE_PATTERN_AWARE = "NATIVE_PATTERN_AWARE",
  STREAMING_TOTAL_ONLY = "STREAMING_TOTAL_ONLY",
}

/**
 * Shared policy contract for one `count_lines` request shape.
 *
 * @remarks
 * The policy makes the total-only versus pattern-aware split explicit while
 * carrying forward the shared preview-first and task-escalation vocabulary from
 * the runtime-governed search execution policy.
 */
export interface CountQueryPolicy {
  /**
   * Selected execution lane for the current request.
   */
  executionLane: CountQueryExecutionLane;

  /**
   * Shared pattern-classification output when a pattern is present.
   */
  patternClassification: PatternClassification | null;

  /**
   * Shared runtime-governed search execution policy snapshot.
   */
  searchExecutionPolicy: SearchExecutionPolicy;

  /**
   * Preview-first trigger fraction inherited from the shared search policy.
   */
  previewFirstResponseCapFraction: number;

  /**
   * Sync comfort window in seconds inherited from the shared search policy.
   */
  syncComfortWindowSeconds: number;

  /**
   * Task-escalation threshold in seconds inherited from the shared search policy.
   */
  taskRecommendedAfterSeconds: number;

  /**
   * Candidate-byte cap associated with the selected pattern-aware lane.
   */
  syncCandidateBytesCap: number | null;

  /**
   * Absolute candidate-byte hard gap associated with the selected pattern-aware lane.
   */
  serviceHardGapBytes: number | null;
}

/**
 * Input contract for count-query policy resolution.
 */
export interface ResolveCountQueryPolicyInput {
  /**
   * Shared runtime capability profile used to derive the underlying search policy.
   */
  ioCapabilityProfile: IoCapabilityProfile;

  /**
   * Optional pattern that activates the native-search lane when present.
   */
  pattern: string | undefined;
}

/**
 * Input contract for building the native-search command used by pattern-aware line counting.
 */
export interface BuildPatternAwareCountCommandInput {
  /**
   * Concrete candidate path passed to the native search backend.
   */
  candidatePath: string;

  /**
   * Shared runtime capability profile used to derive the execution policy snapshot.
   */
  ioCapabilityProfile: IoCapabilityProfile;

  /**
   * Raw caller-supplied pattern used for matching-line counting.
   */
  pattern: string;

  /**
   * Whether pattern evaluation must remain case-sensitive.
   */
  caseSensitive: boolean;
}

function resolvePatternAwareCaps(
  patternClassification: PatternClassification,
  searchExecutionPolicy: SearchExecutionPolicy,
): {
  serviceHardGapBytes: number;
  syncCandidateBytesCap: number;
} {
  if (patternClassification.supportsLiteralFastPath) {
    return {
      serviceHardGapBytes: searchExecutionPolicy.fixedStringServiceHardGapBytes,
      syncCandidateBytesCap: searchExecutionPolicy.fixedStringSyncCandidateBytesCap,
    };
  }

  return {
    serviceHardGapBytes: searchExecutionPolicy.regexServiceHardGapBytes,
    syncCandidateBytesCap: searchExecutionPolicy.regexSyncCandidateBytesCap,
  };
}

function withoutLineNumberFlag(args: string[]): string[] {
  return args.filter((argument) => argument !== "--line-number");
}

/**
 * Resolves the shared count-query policy for one `count_lines` request.
 *
 * @param input - Runtime capability profile and optional pattern surface.
 * @returns Shared policy data that keeps the execution split explicit.
 */
export function resolveCountQueryPolicy(
  input: ResolveCountQueryPolicyInput,
): CountQueryPolicy {
  const searchExecutionPolicy = resolveSearchExecutionPolicy(input.ioCapabilityProfile);

  if (input.pattern === undefined) {
    return {
      executionLane: CountQueryExecutionLane.STREAMING_TOTAL_ONLY,
      patternClassification: null,
      previewFirstResponseCapFraction: searchExecutionPolicy.previewFirstResponseCapFraction,
      searchExecutionPolicy,
      serviceHardGapBytes: null,
      syncCandidateBytesCap: null,
      syncComfortWindowSeconds: searchExecutionPolicy.syncComfortWindowSeconds,
      taskRecommendedAfterSeconds: searchExecutionPolicy.taskRecommendedAfterSeconds,
    };
  }

  const patternClassification = classifyPattern(input.pattern);
  const { serviceHardGapBytes, syncCandidateBytesCap } = resolvePatternAwareCaps(
    patternClassification,
    searchExecutionPolicy,
  );

  return {
    executionLane: CountQueryExecutionLane.NATIVE_PATTERN_AWARE,
    patternClassification,
    previewFirstResponseCapFraction: searchExecutionPolicy.previewFirstResponseCapFraction,
    searchExecutionPolicy,
    serviceHardGapBytes,
    syncCandidateBytesCap,
    syncComfortWindowSeconds: searchExecutionPolicy.syncComfortWindowSeconds,
    taskRecommendedAfterSeconds: searchExecutionPolicy.taskRecommendedAfterSeconds,
  };
}

/**
 * Builds the shared native-search command for pattern-aware line counting.
 *
 * @remarks
 * The returned command stays on the common `ugrep` lane while adapting the
 * builder output into count-oriented execution by removing line-number output
 * and injecting the native count flags.
 *
 * @param input - Candidate path, runtime profile, and caller-supplied pattern.
 * @returns Structured native-search command plan for matching-line counting.
 */
export function buildPatternAwareCountCommand(
  input: BuildPatternAwareCountCommandInput,
): UgrepCommand {
  const policy = resolveCountQueryPolicy({
    ioCapabilityProfile: input.ioCapabilityProfile,
    pattern: input.pattern,
  });

  if (
    policy.executionLane !== CountQueryExecutionLane.NATIVE_PATTERN_AWARE
    || policy.patternClassification === null
  ) {
    throw new Error("Pattern-aware count command requires a bound native-search policy lane.");
  }

  const baseCommand = buildUgrepCommand({
    candidatePath: input.candidatePath,
    caseSensitive: input.caseSensitive,
    executionPolicy: policy.searchExecutionPolicy,
    patternClassification: policy.patternClassification,
  });
  const args = withoutLineNumberFlag(baseCommand.args);

  args.splice(Math.max(args.length - 2, 0), 0, "--count", "--no-messages");

  return {
    ...baseCommand,
    args,
    syncCandidateBytesCap: policy.syncCandidateBytesCap ?? baseCommand.syncCandidateBytesCap,
  };
}
