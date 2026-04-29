import {
  REGEX_SEARCH_MAX_CANDIDATE_BYTES,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import {
  CpuRegexTier,
  type IoCapabilityProfile,
  RuntimeConfidenceTier,
  SourceReadTier,
} from "@domain/shared/runtime/io-capability-profile";

const SEARCH_SYNC_COMFORT_WINDOW_SECONDS = 15;
const SEARCH_TASK_RECOMMENDED_AFTER_SECONDS = 60;
const SEARCH_PREVIEW_FIRST_RESPONSE_CAP_FRACTION = 0.5;
const SEARCH_TASK_BACKED_RESPONSE_CAP_FRACTION = 0.85;

const SEARCH_EXECUTION_POLICY_TIER_BUDGETS = {
  [SourceReadTier.S]: {
    regexSyncCandidateBytesCap: 32 * 1_024 * 1_024,
    fixedStringSyncCandidateBytesCap: 64 * 1_024 * 1_024,
    traversalInlineEntryBudget: 35_000,
    traversalInlineDirectoryBudget: 3_500,
    traversalInlineCandidateFileBudget: 12_000,
    traversalInlineExecutionBudgetMs: 4_500,
    traversalPreviewEntryBudget: 70_000,
    traversalPreviewDirectoryBudget: 7_000,
    traversalPreviewExecutionTimeBudgetMs: 4_500,
  },
  [SourceReadTier.A]: {
    regexSyncCandidateBytesCap: 24 * 1_024 * 1_024,
    fixedStringSyncCandidateBytesCap: 48 * 1_024 * 1_024,
    traversalInlineEntryBudget: 25_000,
    traversalInlineDirectoryBudget: 2_500,
    traversalInlineCandidateFileBudget: 8_000,
    traversalInlineExecutionBudgetMs: 4_000,
    traversalPreviewEntryBudget: 55_000,
    traversalPreviewDirectoryBudget: 5_500,
    traversalPreviewExecutionTimeBudgetMs: 4_000,
  },
  [SourceReadTier.B]: {
    regexSyncCandidateBytesCap: 16 * 1_024 * 1_024,
    fixedStringSyncCandidateBytesCap: 32 * 1_024 * 1_024,
    traversalInlineEntryBudget: 18_000,
    traversalInlineDirectoryBudget: 1_800,
    traversalInlineCandidateFileBudget: 6_000,
    traversalInlineExecutionBudgetMs: 3_500,
    traversalPreviewEntryBudget: 40_000,
    traversalPreviewDirectoryBudget: 4_000,
    traversalPreviewExecutionTimeBudgetMs: 3_500,
  },
  [SourceReadTier.C]: {
    regexSyncCandidateBytesCap: 12 * 1_024 * 1_024,
    fixedStringSyncCandidateBytesCap: 24 * 1_024 * 1_024,
    traversalInlineEntryBudget: 12_000,
    traversalInlineDirectoryBudget: 1_200,
    traversalInlineCandidateFileBudget: 4_000,
    traversalInlineExecutionBudgetMs: 3_000,
    traversalPreviewEntryBudget: 30_000,
    traversalPreviewDirectoryBudget: 3_000,
    traversalPreviewExecutionTimeBudgetMs: 3_000,
  },
  [SourceReadTier.D]: {
    regexSyncCandidateBytesCap: 8 * 1_024 * 1_024,
    fixedStringSyncCandidateBytesCap: 16 * 1_024 * 1_024,
    traversalInlineEntryBudget: 8_000,
    traversalInlineDirectoryBudget: 800,
    traversalInlineCandidateFileBudget: 3_000,
    traversalInlineExecutionBudgetMs: 2_500,
    traversalPreviewEntryBudget: 20_000,
    traversalPreviewDirectoryBudget: 2_000,
    traversalPreviewExecutionTimeBudgetMs: 2_500,
  },
} as const;

/**
 * Shared execution-policy contract for native-search workloads.
 *
 * @remarks
 * Later regex, fixed-string, content-read, and count workflows should consume one policy
 * vocabulary for sync comfort, preview-first behavior, and task escalation instead of
 * introducing endpoint-local thresholds. The calibrated lookup tables are intentionally higher for
 * valid local recursive workloads, but the shared policy still keeps preview-first at the 50-84%
 * band and reserves task-backed execution for the 85-100% band or for projected execution beyond
 * the 60-second recommendation window.
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
   * Fraction of the response-family cap that marks the task-backed escalation band.
   */
  taskBackedResponseCapFraction: number;

  /**
   * Candidate-byte ceiling for synchronous regex execution.
   */
  regexSyncCandidateBytesCap: number;

  /**
   * Candidate-byte ceiling for synchronous fixed-string execution.
   */
  fixedStringSyncCandidateBytesCap: number;

  /**
   * Absolute service hard gap for recursive aggregate regex-search candidate bytes.
   */
  regexServiceHardGapBytes: number;

  /**
   * Absolute service hard gap for recursive aggregate fixed-string-search candidate bytes.
   */
  fixedStringServiceHardGapBytes: number;

  /**
   * Entry-budget ceiling that still permits inline recursive traversal before preview or narrowing.
   */
  traversalInlineEntryBudget: number;

  /**
   * Directory-budget ceiling that still permits inline recursive traversal before preview or narrowing.
   */
  traversalInlineDirectoryBudget: number;

  /**
   * Candidate-file ceiling that still permits inline recursive traversal before per-file execution
   * fan-out becomes too expensive for the inline lane.
   */
  traversalInlineCandidateFileBudget: number;

  /**
   * Estimated wall-clock budget in milliseconds that one inline traversal lane may consume before
   * admission must degrade to preview-first or narrowing-required behavior.
   */
  traversalInlineExecutionBudgetMs: number;

  /**
   * Entry-budget ceiling that still permits preview-first traversal before narrowing becomes mandatory.
   */
  traversalPreviewFirstEntryBudget: number;

  /**
   * Directory-budget ceiling that still permits preview-first traversal before narrowing becomes mandatory.
   */
  traversalPreviewFirstDirectoryBudget: number;

  /**
   * Entry-budget ceiling enforced while the bounded preview-first lane is executing.
   */
  traversalPreviewExecutionEntryBudget: number;

  /**
   * Directory-budget ceiling enforced while the bounded preview-first lane is executing.
   */
  traversalPreviewExecutionDirectoryBudget: number;

  /**
   * Soft runtime budget in milliseconds enforced while the bounded preview-first lane is executing.
   */
  traversalPreviewExecutionTimeBudgetMs: number;
}

function downgradeSourceReadTierForConfidence(
  tier: SourceReadTier,
  confidence: RuntimeConfidenceTier,
): SourceReadTier {
  switch (confidence) {
    case RuntimeConfidenceTier.HIGH:
    case RuntimeConfidenceTier.LOW:
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
    case RuntimeConfidenceTier.LOW:
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

function resolveSearchExecutionTierBudget(tier: SourceReadTier) {
  return SEARCH_EXECUTION_POLICY_TIER_BUDGETS[tier];
}

/**
 * Resolves the shared search execution policy from the current runtime capability profile.
 *
 * @remarks
 * Proven local static discovery may now carry a `LOW` confidence floor without collapsing back to
 * tier `D`. The higher tier tables keep valid recursive workloads inline and preview-first longer,
 * while the explicit `0.50` and `0.85` band fractions preserve deterministic escalation semantics.
 * The deeper runtime fuse remains a later safeguard rather than the primary caller-facing band.
 * The returned `regexServiceHardGapBytes` and `fixedStringServiceHardGapBytes` surfaces describe
 * recursive aggregate candidate governance after explicit-file eligibility and content-state
 * compatibility have already been established; they are not front-door blockers for explicit large
 * text-compatible file search.
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
  const effectiveTierBudget = resolveSearchExecutionTierBudget(effectiveSourceReadTier);
  const regexTierBudget = resolveSearchExecutionTierBudget(regexExecutionTier);
  const recursiveAggregateCandidateHardGapBytes = REGEX_SEARCH_MAX_CANDIDATE_BYTES;

  return {
    effectiveSourceReadTier,
    effectiveCpuRegexTier,
    runtimeConfidenceTier: profile.runtimeConfidenceTier,
    syncComfortWindowSeconds: SEARCH_SYNC_COMFORT_WINDOW_SECONDS,
    taskRecommendedAfterSeconds: SEARCH_TASK_RECOMMENDED_AFTER_SECONDS,
    previewFirstResponseCapFraction: SEARCH_PREVIEW_FIRST_RESPONSE_CAP_FRACTION,
    taskBackedResponseCapFraction: SEARCH_TASK_BACKED_RESPONSE_CAP_FRACTION,
    regexSyncCandidateBytesCap: regexTierBudget.regexSyncCandidateBytesCap,
    fixedStringSyncCandidateBytesCap: effectiveTierBudget.fixedStringSyncCandidateBytesCap,
    regexServiceHardGapBytes: recursiveAggregateCandidateHardGapBytes,
    fixedStringServiceHardGapBytes: recursiveAggregateCandidateHardGapBytes,
    traversalInlineEntryBudget: effectiveTierBudget.traversalInlineEntryBudget,
    traversalInlineDirectoryBudget: effectiveTierBudget.traversalInlineDirectoryBudget,
    traversalInlineCandidateFileBudget: effectiveTierBudget.traversalInlineCandidateFileBudget,
    traversalInlineExecutionBudgetMs: effectiveTierBudget.traversalInlineExecutionBudgetMs,
    traversalPreviewFirstEntryBudget: effectiveTierBudget.traversalPreviewEntryBudget,
    traversalPreviewFirstDirectoryBudget: effectiveTierBudget.traversalPreviewDirectoryBudget,
    traversalPreviewExecutionEntryBudget: effectiveTierBudget.traversalPreviewEntryBudget,
    traversalPreviewExecutionDirectoryBudget: effectiveTierBudget.traversalPreviewDirectoryBudget,
    traversalPreviewExecutionTimeBudgetMs: effectiveTierBudget.traversalPreviewExecutionTimeBudgetMs,
  };
}
