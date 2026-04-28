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
  INSPECTION_CONTENT_STATE_LITERALS,
  type InspectionContentStateClassification,
  type InspectionContentState,
} from "./inspection-content-state";
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
  STREAMING_PATTERN_AWARE = "STREAMING_PATTERN_AWARE",
  STREAMING_TOTAL_ONLY = "STREAMING_TOTAL_ONLY",
  UNSUPPORTED_STATE = "UNSUPPORTED_STATE",
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
   * Shared inspection content state resolved for the current candidate surface.
   */
  inspectionContentState: InspectionContentState;

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

  /**
   * Canonical explanation when the current request must refuse or reroute on the resolved state.
   */
  unsupportedStateReason: string | null;

  /**
   * Explicit caller guidance when a pattern-aware request lands on an unsupported non-text state.
   */
  rerouteGuidance: string | null;
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

  /**
   * Shared inspection content classification already resolved for the current candidate surface.
   */
  inspectionContentClassification: Pick<
    InspectionContentStateClassification,
    "resolvedState" | "resolvedTextEncoding"
  >;
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

function createUnsupportedCountQueryPolicy(
  searchExecutionPolicy: SearchExecutionPolicy,
  inspectionContentState: InspectionContentState,
  unsupportedStateReason: string,
  rerouteGuidance: string | null,
  patternClassification: PatternClassification | null,
): CountQueryPolicy {
  return {
    executionLane: CountQueryExecutionLane.UNSUPPORTED_STATE,
    inspectionContentState,
    patternClassification,
    previewFirstResponseCapFraction: searchExecutionPolicy.previewFirstResponseCapFraction,
    rerouteGuidance,
    searchExecutionPolicy,
    serviceHardGapBytes: null,
    syncCandidateBytesCap: null,
    syncComfortWindowSeconds: searchExecutionPolicy.syncComfortWindowSeconds,
    taskRecommendedAfterSeconds: searchExecutionPolicy.taskRecommendedAfterSeconds,
    unsupportedStateReason,
  };
}

function resolvePatternAwareRerouteGuidance(
  inspectionContentState: InspectionContentState,
): string {
  if (inspectionContentState === INSPECTION_CONTENT_STATE_LITERALS.BINARY_CONFIDENT) {
    return "Use byte- or cursor-oriented inspection instead of pattern-aware line counting on binary-confident surfaces.";
  }

  return "Use search_file_contents_by_fixed_string or byte/cursor inspection instead of pattern-aware line counting on non-text surfaces.";
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
  const inspectionContentState = input.inspectionContentClassification.resolvedState;
  const countLinesStateAllowed =
    inspectionContentState === INSPECTION_CONTENT_STATE_LITERALS.TEXT_CONFIDENT
    || inspectionContentState
      === INSPECTION_CONTENT_STATE_LITERALS.HYBRID_TEXT_DOMINANT;

  if (input.pattern === undefined) {
    if (!countLinesStateAllowed) {
      return createUnsupportedCountQueryPolicy(
        searchExecutionPolicy,
        inspectionContentState,
        `Total-only line counting is unsupported for ${inspectionContentState} surfaces because the resulting totals would be semantically misleading.`,
        null,
        null,
      );
    }

    return {
      executionLane: CountQueryExecutionLane.STREAMING_TOTAL_ONLY,
      inspectionContentState,
      patternClassification: null,
      previewFirstResponseCapFraction: searchExecutionPolicy.previewFirstResponseCapFraction,
      rerouteGuidance: null,
      searchExecutionPolicy,
      serviceHardGapBytes: null,
      syncCandidateBytesCap: null,
      syncComfortWindowSeconds: searchExecutionPolicy.syncComfortWindowSeconds,
      taskRecommendedAfterSeconds: searchExecutionPolicy.taskRecommendedAfterSeconds,
      unsupportedStateReason: null,
    };
  }

  const patternClassification = classifyPattern(input.pattern);

  if (!countLinesStateAllowed) {
    return createUnsupportedCountQueryPolicy(
      searchExecutionPolicy,
      inspectionContentState,
      `Pattern-aware line counting is unsupported for ${inspectionContentState} surfaces on the count_lines endpoint.`,
      resolvePatternAwareRerouteGuidance(inspectionContentState),
      patternClassification,
    );
  }

  if (
    inspectionContentState === INSPECTION_CONTENT_STATE_LITERALS.HYBRID_TEXT_DOMINANT
    || input.inspectionContentClassification.resolvedTextEncoding !== "utf8"
  ) {
    return {
      executionLane: CountQueryExecutionLane.STREAMING_PATTERN_AWARE,
      inspectionContentState,
      patternClassification,
      previewFirstResponseCapFraction: searchExecutionPolicy.previewFirstResponseCapFraction,
      rerouteGuidance: null,
      searchExecutionPolicy,
      serviceHardGapBytes: null,
      syncCandidateBytesCap: null,
      syncComfortWindowSeconds: searchExecutionPolicy.syncComfortWindowSeconds,
      taskRecommendedAfterSeconds: searchExecutionPolicy.taskRecommendedAfterSeconds,
      unsupportedStateReason: null,
    };
  }

  const { serviceHardGapBytes, syncCandidateBytesCap } = resolvePatternAwareCaps(
    patternClassification,
    searchExecutionPolicy,
  );

  return {
    executionLane: CountQueryExecutionLane.NATIVE_PATTERN_AWARE,
    inspectionContentState,
    patternClassification,
    previewFirstResponseCapFraction: searchExecutionPolicy.previewFirstResponseCapFraction,
    rerouteGuidance: null,
    searchExecutionPolicy,
    serviceHardGapBytes,
    syncCandidateBytesCap,
    syncComfortWindowSeconds: searchExecutionPolicy.syncComfortWindowSeconds,
    taskRecommendedAfterSeconds: searchExecutionPolicy.taskRecommendedAfterSeconds,
    unsupportedStateReason: null,
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
    inspectionContentClassification: {
      resolvedState: INSPECTION_CONTENT_STATE_LITERALS.TEXT_CONFIDENT,
      resolvedTextEncoding: "utf8",
    },
    pattern: input.pattern,
  });

  if (
    policy.executionLane !== CountQueryExecutionLane.NATIVE_PATTERN_AWARE
    || policy.patternClassification === null
  ) {
    throw new Error(
      policy.unsupportedStateReason
      ?? "Pattern-aware count command requires a bound native-search policy lane.",
    );
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
