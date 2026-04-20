import {
  REGEX_SEARCH_MAX_CANDIDATE_BYTES,
  TRAVERSAL_PREFLIGHT_MAX_VISITED_DIRECTORIES,
  TRAVERSAL_PREFLIGHT_MAX_VISITED_ENTRIES,
  TRAVERSAL_RUNTIME_SOFT_TIME_BUDGET_MS,
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

function resolveTraversalInlineEntryBudget(tier: SourceReadTier): number {
  switch (tier) {
    case SourceReadTier.S:
      return Math.max(1, Math.floor(TRAVERSAL_PREFLIGHT_MAX_VISITED_ENTRIES * 0.35));
    case SourceReadTier.A:
      return Math.max(1, Math.floor(TRAVERSAL_PREFLIGHT_MAX_VISITED_ENTRIES * 0.25));
    case SourceReadTier.B:
      return Math.max(1, Math.floor(TRAVERSAL_PREFLIGHT_MAX_VISITED_ENTRIES * 0.18));
    case SourceReadTier.C:
      return Math.max(1, Math.floor(TRAVERSAL_PREFLIGHT_MAX_VISITED_ENTRIES * 0.12));
    case SourceReadTier.D:
      return Math.max(1, Math.floor(TRAVERSAL_PREFLIGHT_MAX_VISITED_ENTRIES * 0.08));
  }
}

function resolveTraversalInlineDirectoryBudget(tier: SourceReadTier): number {
  switch (tier) {
    case SourceReadTier.S:
      return Math.max(1, Math.floor(TRAVERSAL_PREFLIGHT_MAX_VISITED_DIRECTORIES * 0.35));
    case SourceReadTier.A:
      return Math.max(1, Math.floor(TRAVERSAL_PREFLIGHT_MAX_VISITED_DIRECTORIES * 0.25));
    case SourceReadTier.B:
      return Math.max(1, Math.floor(TRAVERSAL_PREFLIGHT_MAX_VISITED_DIRECTORIES * 0.18));
    case SourceReadTier.C:
      return Math.max(1, Math.floor(TRAVERSAL_PREFLIGHT_MAX_VISITED_DIRECTORIES * 0.12));
    case SourceReadTier.D:
      return Math.max(1, Math.floor(TRAVERSAL_PREFLIGHT_MAX_VISITED_DIRECTORIES * 0.08));
  }
}

function resolveTraversalInlineCandidateFileBudget(tier: SourceReadTier): number {
  switch (tier) {
    case SourceReadTier.S:
      return 6_000;
    case SourceReadTier.A:
      return 4_000;
    case SourceReadTier.B:
      return 2_500;
    case SourceReadTier.C:
      return 1_500;
    case SourceReadTier.D:
      return 800;
  }
}

function resolveTraversalPreviewFirstEntryBudget(tier: SourceReadTier): number {
  switch (tier) {
    case SourceReadTier.S:
      return Math.max(1, Math.floor(TRAVERSAL_PREFLIGHT_MAX_VISITED_ENTRIES * 0.6));
    case SourceReadTier.A:
      return Math.max(1, Math.floor(TRAVERSAL_PREFLIGHT_MAX_VISITED_ENTRIES * 0.5));
    case SourceReadTier.B:
      return Math.max(1, Math.floor(TRAVERSAL_PREFLIGHT_MAX_VISITED_ENTRIES * 0.4));
    case SourceReadTier.C:
      return Math.max(1, Math.floor(TRAVERSAL_PREFLIGHT_MAX_VISITED_ENTRIES * 0.28));
    case SourceReadTier.D:
      return Math.max(1, Math.floor(TRAVERSAL_PREFLIGHT_MAX_VISITED_ENTRIES * 0.2));
  }
}

function resolveTraversalPreviewFirstDirectoryBudget(tier: SourceReadTier): number {
  switch (tier) {
    case SourceReadTier.S:
      return Math.max(1, Math.floor(TRAVERSAL_PREFLIGHT_MAX_VISITED_DIRECTORIES * 0.6));
    case SourceReadTier.A:
      return Math.max(1, Math.floor(TRAVERSAL_PREFLIGHT_MAX_VISITED_DIRECTORIES * 0.48));
    case SourceReadTier.B:
      return Math.max(1, Math.floor(TRAVERSAL_PREFLIGHT_MAX_VISITED_DIRECTORIES * 0.35));
    case SourceReadTier.C:
      return Math.max(1, Math.floor(TRAVERSAL_PREFLIGHT_MAX_VISITED_DIRECTORIES * 0.25));
    case SourceReadTier.D:
      return Math.max(1, Math.floor(TRAVERSAL_PREFLIGHT_MAX_VISITED_DIRECTORIES * 0.16));
  }
}

function resolveTraversalPreviewExecutionTimeBudgetMs(tier: SourceReadTier): number {
  switch (tier) {
    case SourceReadTier.S:
      return Math.min(2_500, TRAVERSAL_RUNTIME_SOFT_TIME_BUDGET_MS - 500);
    case SourceReadTier.A:
      return Math.min(2_000, TRAVERSAL_RUNTIME_SOFT_TIME_BUDGET_MS - 500);
    case SourceReadTier.B:
      return Math.min(1_500, TRAVERSAL_RUNTIME_SOFT_TIME_BUDGET_MS - 500);
    case SourceReadTier.C:
      return Math.min(1_250, TRAVERSAL_RUNTIME_SOFT_TIME_BUDGET_MS - 500);
    case SourceReadTier.D:
      return Math.min(1_000, TRAVERSAL_RUNTIME_SOFT_TIME_BUDGET_MS - 500);
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
    traversalInlineEntryBudget: resolveTraversalInlineEntryBudget(effectiveSourceReadTier),
    traversalInlineDirectoryBudget: resolveTraversalInlineDirectoryBudget(effectiveSourceReadTier),
    traversalInlineCandidateFileBudget: resolveTraversalInlineCandidateFileBudget(
      effectiveSourceReadTier,
    ),
    traversalPreviewFirstEntryBudget: resolveTraversalPreviewFirstEntryBudget(effectiveSourceReadTier),
    traversalPreviewFirstDirectoryBudget: resolveTraversalPreviewFirstDirectoryBudget(effectiveSourceReadTier),
    traversalPreviewExecutionEntryBudget: resolveTraversalPreviewFirstEntryBudget(
      effectiveSourceReadTier,
    ),
    traversalPreviewExecutionDirectoryBudget: resolveTraversalPreviewFirstDirectoryBudget(
      effectiveSourceReadTier,
    ),
    traversalPreviewExecutionTimeBudgetMs: resolveTraversalPreviewExecutionTimeBudgetMs(
      effectiveSourceReadTier,
    ),
  };
}
