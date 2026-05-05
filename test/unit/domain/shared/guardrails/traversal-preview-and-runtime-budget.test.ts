import { describe, expect, it } from "vitest";

import {
  TraversalRuntimeBudgetExceededError,
  assertTraversalRuntimeBudget,
  createTraversalRuntimeBudgetState,
  getTraversalRuntimeElapsedMs,
  isTraversalRuntimeBudgetExceededError,
  recordTraversalDirectoryVisit,
  recordTraversalEntryVisit,
} from "@domain/shared/guardrails/traversal-runtime-budget";
import {
  resolveTraversalPreviewLanePlan,
  shouldStopTraversalPreviewLane,
} from "@domain/shared/guardrails/traversal-preview-lane";
import { TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES } from "@domain/shared/guardrails/traversal-workload-admission";
import {
  CpuRegexTier,
  DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE,
  IoCapabilitySampleOrigin,
  PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
  RuntimeConfidenceTier,
  SourceReadTier,
  SpoolWriteTier,
} from "@domain/shared/runtime/io-capability-profile";
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";

describe("traversal preview and runtime budget", () => {
  it("returns an inert preview-lane plan when preview-first admission is not active", () => {
    const executionPolicy = resolveSearchExecutionPolicy(
      PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
    );

    const plan = resolveTraversalPreviewLanePlan(
      "src/domain",
      "list_directory_entries",
      {
        outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.INLINE,
        guidanceText: null,
      },
      executionPolicy,
      2_048,
    );

    expect(plan).toEqual({
      candidateByteBudget: null,
      guidanceText: null,
      runtimeBudgetLimits: null,
    });
    expect(shouldStopTraversalPreviewLane(0, 1, plan)).toBe(false);
  });

  it("builds the preview-first lane from the shared execution policy and stops when the next file exhausts the byte budget", () => {
    const executionPolicy = resolveSearchExecutionPolicy(
      PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
    );

    const plan = resolveTraversalPreviewLanePlan(
      "src/domain",
      "list_directory_entries",
      {
        outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST,
        guidanceText: null,
      },
      executionPolicy,
      2_048,
    );

    expect(plan.candidateByteBudget).toBe(2_048);
    expect(plan.guidanceText).toContain("src/domain");
    expect(plan.guidanceText).toContain("list_directory_entries");
    expect(plan.runtimeBudgetLimits).toEqual({
      maxVisitedEntries: executionPolicy.traversalPreviewExecutionEntryBudget,
      maxVisitedDirectories: executionPolicy.traversalPreviewExecutionDirectoryBudget,
      softTimeBudgetMs: executionPolicy.traversalPreviewExecutionTimeBudgetMs,
    });
    expect(shouldStopTraversalPreviewLane(1_500, 400, plan)).toBe(false);
    expect(shouldStopTraversalPreviewLane(1_500, 600, plan)).toBe(true);
  });

  it("tracks traversal counters and elapsed time for the shared runtime budget state", () => {
    const state = createTraversalRuntimeBudgetState(1_000);

    recordTraversalDirectoryVisit(state);
    recordTraversalEntryVisit(state, 2);

    expect(state.visitedDirectories).toBe(1);
    expect(state.visitedEntries).toBe(2);
    expect(getTraversalRuntimeElapsedMs(state, 1_450)).toBe(450);
  });

  it("raises a typed runtime-budget failure when visited entries exceed the configured ceiling", () => {
    const state = createTraversalRuntimeBudgetState(1_000);
    recordTraversalEntryVisit(state, 2);

    try {
      assertTraversalRuntimeBudget(
        "search_file_contents_by_regex",
        state,
        1_100,
        "Narrow the traversal root.",
        {
          maxVisitedEntries: 1,
          maxVisitedDirectories: 5,
          softTimeBudgetMs: 500,
        },
      );
      throw new Error("Expected entry budget exhaustion");
    } catch (error) {
      expect(error).toBeInstanceOf(TraversalRuntimeBudgetExceededError);
      expect(isTraversalRuntimeBudgetExceededError(error)).toBe(true);

      if (!(error instanceof Error)) {
        throw error;
      }

      expect(error.message).toContain("traversal entries visited");
      expect(error.message).toContain("deeper emergency safeguard");
    }
  });

  it("raises a typed runtime-budget failure when visited directories exceed the configured ceiling", () => {
    const state = createTraversalRuntimeBudgetState(1_000);
    recordTraversalDirectoryVisit(state, 2);

    try {
      assertTraversalRuntimeBudget(
        "search_file_contents_by_regex",
        state,
        1_100,
        "Narrow the traversal root.",
        {
          maxVisitedEntries: 5,
          maxVisitedDirectories: 1,
          softTimeBudgetMs: 500,
        },
      );
      throw new Error("Expected directory budget exhaustion");
    } catch (error) {
      expect(error).toBeInstanceOf(TraversalRuntimeBudgetExceededError);
      expect(isTraversalRuntimeBudgetExceededError(error)).toBe(true);

      if (!(error instanceof Error)) {
        throw error;
      }

      expect(error.message).toContain("traversal directories visited");
    }
  });

  it("raises a typed runtime-budget failure when elapsed time exceeds the soft runtime budget", () => {
    const state = createTraversalRuntimeBudgetState(1_000);

    try {
      assertTraversalRuntimeBudget(
        "search_file_contents_by_regex",
        state,
        1_800,
        "Narrow the traversal root.",
        {
          maxVisitedEntries: 5,
          maxVisitedDirectories: 5,
          softTimeBudgetMs: 500,
        },
      );
      throw new Error("Expected runtime budget exhaustion");
    } catch (error) {
      expect(error).toBeInstanceOf(TraversalRuntimeBudgetExceededError);
      expect(isTraversalRuntimeBudgetExceededError(error)).toBe(true);

      if (!(error instanceof Error)) {
        throw error;
      }

      expect(error.message).toContain("traversal soft runtime budget");
      expect(error.message).toContain("milliseconds");
    }
  });

  it("keeps the default conservative capability profile at the lowest search execution tiers", () => {
    const policy = resolveSearchExecutionPolicy(
      DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE,
    );

    expect(policy.effectiveSourceReadTier).toBe(SourceReadTier.D);
    expect(policy.effectiveCpuRegexTier).toBe(CpuRegexTier.D);
    expect(policy.runtimeConfidenceTier).toBe(RuntimeConfidenceTier.UNKNOWN);
    expect(policy.previewFirstResponseCapFraction).toBe(0.5);
    expect(policy.taskBackedResponseCapFraction).toBe(0.85);
    expect(policy.regexServiceHardGapBytes).toBe(policy.fixedStringServiceHardGapBytes);
  });

  it("downgrades medium-confidence runtime capability samples conservatively before resolving budgets", () => {
    const policy = resolveSearchExecutionPolicy({
      sourceReadTier: SourceReadTier.S,
      spoolWriteTier: SpoolWriteTier.S,
      cpuRegexTier: CpuRegexTier.S,
      runtimeConfidenceTier: RuntimeConfidenceTier.MEDIUM,
      estimatedSourceReadBytesPerSecond: 3_000_000_000,
      estimatedSpoolWriteBytesPerSecond: 2_000_000_000,
      sampleOrigin: IoCapabilitySampleOrigin.CALIBRATED_PROBE,
      lastCalibratedAt: "2026-01-05T00:00:00Z",
    });

    expect(policy.effectiveSourceReadTier).toBe(SourceReadTier.A);
    expect(policy.effectiveCpuRegexTier).toBe(CpuRegexTier.A);
    expect(policy.regexSyncCandidateBytesCap).toBe(24 * 1_024 * 1_024);
    expect(policy.fixedStringSyncCandidateBytesCap).toBe(48 * 1_024 * 1_024);
    expect(policy.traversalInlineEntryBudget).toBe(25_000);
    expect(policy.traversalPreviewFirstEntryBudget).toBe(55_000);
  });
});
