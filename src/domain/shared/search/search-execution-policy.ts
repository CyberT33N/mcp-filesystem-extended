import { REGEX_SEARCH_MAX_CANDIDATE_BYTES } from "@domain/shared/guardrails/tool-guardrail-limits";
import {
  CpuRegexTier,
  type IoCapabilityProfile,
  RuntimeConfidenceTier,
  SourceReadTier,
} from "@domain/shared/runtime/io-capability-profile";

const SEARCH_SYNC_COMFORT_WINDOW_SECONDS = 15;
const SEARCH_TASK_RECOMMENDED_AFTER_SECONDS = 60;
const SEARCH_PREVIEW_FIRST_RESPONSE_CAP_FRACTION = 0.5;

/**
 * Shared execution-policy contract for native-search workloads.
 *
 * @remarks
 * Later regex, fixed-string, content-read, and count workflows should consume one policy
 * vocabulary for sync comfort, preview-first behavior, and task escalation instead of
 * introducing endpoint-local thresholds.
 */
export interface SearchExecutionPolicy {
  /**
   * Effective source-read tier after confidence-based conservative downgrade.
   */
  effectiveSourceReadTier: SourceReadTier;

  /**
   * Effective CPU regex tier after confidence-based conservative downgrade.
   */
  effectiveCpuRegexTier: CpuRegexTier;

  /**
   * Confidence tier carried through from the runtime capability profile.
   */
  runtimeConfidenceTier: RuntimeConfidenceTier;

  /**
   * Preferred synchronous comfort window in seconds for inline execution.
   */
  syncComfortWindowSeconds: number;

  /**
   * Threshold in seconds after which task-backed execution should be recommended.
   */
  taskRecommendedAfterSeconds: number;

  /**
   * Fraction of the response-family cap that triggers preview-first behavior.
   */
  previewFirstResponseCapFraction: number;

  /**
   * Candidate-byte ceiling for synchronous regex execution.
   */
  regexSyncCandidateBytesCap: number;

  /**
   * Candidate-byte ceiling for synchronous fixed-string execution.
   */
  fixedStringSyncCandidateBytesCap: number;

  /**
   * Absolute service hard gap for regex search candidate bytes.
   */
  regexServiceHardGapBytes: number;

  /**
   * Absolute service hard gap for fixed-string search candidate bytes.
   */
  fixedStringServiceHardGapBytes: number;
}

function downgradeSourceReadTierForConfidence(
  tier: SourceReadTier,
  confidence: RuntimeConfidenceTier,
): SourceReadTier {
  switch (confidence) {
    case RuntimeConfidenceTier.HIGH:
      return tier;
    case RuntimeConfidenceTier.MEDIUM:
      switch (tier) {
        case SourceReadTier.S:
          return SourceReadTier.A;
        case SourceReadTier.A:
          return SourceReadTier.B;
        case SourceReadTier.B:
          return SourceReadTier.C;
        default:
          return SourceReadTier.D;
      }
    case RuntimeConfidenceTier.LOW:
    case RuntimeConfidenceTier.UNKNOWN:
      return SourceReadTier.D;
  }
}

function downgradeCpuRegexTierForConfidence(
  tier: CpuRegexTier,
  confidence: RuntimeConfidenceTier,
): CpuRegexTier {
  switch (confidence) {
    case RuntimeConfidenceTier.HIGH:
      return tier;
    case RuntimeConfidenceTier.MEDIUM:
      switch (tier) {
        case CpuRegexTier.S:
          return CpuRegexTier.A;
        case CpuRegexTier.A:
          return CpuRegexTier.B;
        case CpuRegexTier.B:
          return CpuRegexTier.C;
        default:
          return CpuRegexTier.D;
      }
    case RuntimeConfidenceTier.LOW:
    case RuntimeConfidenceTier.UNKNOWN:
      return CpuRegexTier.D;
  }
}

function sourceReadTierPriority(tier: SourceReadTier): number {
  switch (tier) {
    case SourceReadTier.S:
      return 5;
    case SourceReadTier.A:
      return 4;
    case SourceReadTier.B:
      return 3;
    case SourceReadTier.C:
      return 2;
    case SourceReadTier.D:
      return 1;
  }
}

function cpuRegexTierToSourceReadTier(tier: CpuRegexTier): SourceReadTier {
  switch (tier) {
    case CpuRegexTier.S:
      return SourceReadTier.S;
    case CpuRegexTier.A:
      return SourceReadTier.A;
    case CpuRegexTier.B:
      return SourceReadTier.B;
    case CpuRegexTier.C:
      return SourceReadTier.C;
    case CpuRegexTier.D:
      return SourceReadTier.D;
  }
}

function resolveMoreConservativeTier(
  sourceTier: SourceReadTier,
  cpuTier: CpuRegexTier,
): SourceReadTier {
  const cpuAsSourceTier = cpuRegexTierToSourceReadTier(cpuTier);

  if (sourceReadTierPriority(sourceTier) <= sourceReadTierPriority(cpuAsSourceTier)) {
    return sourceTier;
  }

  return cpuAsSourceTier;
}

function resolveRegexSyncCandidateBytesCap(tier: SourceReadTier): number {
  switch (tier) {
    case SourceReadTier.S:
      return 16 * 1_024 * 1_024;
    case SourceReadTier.A:
      return 12 * 1_024 * 1_024;
    case SourceReadTier.B:
      return 8 * 1_024 * 1_024;
    case SourceReadTier.C:
      return 4 * 1_024 * 1_024;
    case SourceReadTier.D:
      return 2 * 1_024 * 1_024;
  }
}

function resolveFixedStringSyncCandidateBytesCap(tier: SourceReadTier): number {
  switch (tier) {
    case SourceReadTier.S:
      return 24 * 1_024 * 1_024;
    case SourceReadTier.A:
      return 16 * 1_024 * 1_024;
    case SourceReadTier.B:
      return 12 * 1_024 * 1_024;
    case SourceReadTier.C:
      return 8 * 1_024 * 1_024;
    case SourceReadTier.D:
      return 4 * 1_024 * 1_024;
  }
}

/**
 * Resolves the shared search execution policy from the current runtime capability profile.
 *
 * @param profile - Conservative runtime capability profile produced by the runtime detector.
 * @returns Deterministic sync, preview-first, task, and hard-gap policy values for search workloads.
 */
export function resolveSearchExecutionPolicy(
  profile: IoCapabilityProfile,
): SearchExecutionPolicy {
  const effectiveSourceReadTier = downgradeSourceReadTierForConfidence(
    profile.sourceReadTier,
    profile.runtimeConfidenceTier,
  );
  const effectiveCpuRegexTier = downgradeCpuRegexTierForConfidence(
    profile.cpuRegexTier,
    profile.runtimeConfidenceTier,
  );
  const regexExecutionTier = resolveMoreConservativeTier(
    effectiveSourceReadTier,
    effectiveCpuRegexTier,
  );

  return {
    effectiveSourceReadTier,
    effectiveCpuRegexTier,
    runtimeConfidenceTier: profile.runtimeConfidenceTier,
    syncComfortWindowSeconds: SEARCH_SYNC_COMFORT_WINDOW_SECONDS,
    taskRecommendedAfterSeconds: SEARCH_TASK_RECOMMENDED_AFTER_SECONDS,
    previewFirstResponseCapFraction: SEARCH_PREVIEW_FIRST_RESPONSE_CAP_FRACTION,
    regexSyncCandidateBytesCap: resolveRegexSyncCandidateBytesCap(regexExecutionTier),
    fixedStringSyncCandidateBytesCap: resolveFixedStringSyncCandidateBytesCap(effectiveSourceReadTier),
    regexServiceHardGapBytes: REGEX_SEARCH_MAX_CANDIDATE_BYTES,
    fixedStringServiceHardGapBytes: REGEX_SEARCH_MAX_CANDIDATE_BYTES,
  };
}
