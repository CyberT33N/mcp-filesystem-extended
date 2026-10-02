import { describe, expect, it } from "vitest";

import {
  aggregateTraversalAdmissionProjections,
  buildTraversalAdmissionProjection,
  TRAVERSAL_ADMISSION_PROJECTION_BANDS,
  TRAVERSAL_ADMISSION_PROJECTION_CONFIDENCES,
  TRAVERSAL_ADMISSION_PROJECTION_UNAVAILABLE_REASONS,
  TraversalAdmissionProjectionSchema,
} from "@domain/shared/guardrails/traversal-admission-projection";
import type { TraversalCandidateWorkloadEvidence } from "@domain/shared/guardrails/traversal-candidate-workload";

function createProbeEvidence(
  overrides: Partial<TraversalCandidateWorkloadEvidence> = {},
): TraversalCandidateWorkloadEvidence {
  return {
    estimatedCandidateBytes: 12,
    matchedCandidateFiles: 2,
    visitedEntries: 7,
    estimatedResponseChars: 42,
    probeElapsedMs: 120,
    probeTruncated: false,
    ...overrides,
  };
}

describe("traversal admission projection", () => {
  it("derives small bands with high measured confidence from a complete probe", () => {
    const projection = buildTraversalAdmissionProjection({
      candidateWorkloadEvidence: createProbeEvidence(),
      executionCostModel: {
        executionTimeCostMultiplier: 2,
        estimatedPerCandidateFileCostMs: 0,
      },
    });

    expect(projection.estimatedTotalEntries).toEqual({
      band: "small",
      confidence: "high",
      probeTruncated: false,
    });
    expect(projection.estimatedTotalCandidateBytes).toEqual({
      band: "small",
      confidence: "high",
      probeTruncated: false,
    });
    expect(projection.estimatedTotalResponseChars).toEqual({
      band: "small",
      confidence: "medium",
      probeTruncated: false,
    });
    expect(projection.estimatedRemainingDurationMs).toEqual({
      band: "small",
      confidence: "medium",
      probeTruncated: false,
    });
  });

  it("derives the char band ladder across medium, large, and huge response estimates", () => {
    const mediumProjection = buildTraversalAdmissionProjection({
      candidateWorkloadEvidence: createProbeEvidence({ estimatedResponseChars: 100_000 }),
    });
    const largeProjection = buildTraversalAdmissionProjection({
      candidateWorkloadEvidence: createProbeEvidence({ estimatedResponseChars: 300_000 }),
    });
    const hugeProjection = buildTraversalAdmissionProjection({
      candidateWorkloadEvidence: createProbeEvidence({ estimatedResponseChars: 600_000 }),
    });

    expect(
      mediumProjection.estimatedTotalResponseChars,
    ).toMatchObject({ band: TRAVERSAL_ADMISSION_PROJECTION_BANDS.MEDIUM });
    expect(
      largeProjection.estimatedTotalResponseChars,
    ).toMatchObject({ band: TRAVERSAL_ADMISSION_PROJECTION_BANDS.LARGE });
    expect(
      hugeProjection.estimatedTotalResponseChars,
    ).toMatchObject({ band: TRAVERSAL_ADMISSION_PROJECTION_BANDS.HUGE });
  });

  it("derives the entry band ladder across small, medium, large, and huge entry counts", () => {
    const smallProjection = buildTraversalAdmissionProjection({
      candidateWorkloadEvidence: createProbeEvidence({ visitedEntries: 500 }),
    });
    const mediumProjection = buildTraversalAdmissionProjection({
      candidateWorkloadEvidence: createProbeEvidence({ visitedEntries: 5_000 }),
    });
    const largeProjection = buildTraversalAdmissionProjection({
      candidateWorkloadEvidence: createProbeEvidence({ visitedEntries: 50_000 }),
    });
    const hugeProjection = buildTraversalAdmissionProjection({
      candidateWorkloadEvidence: createProbeEvidence({ visitedEntries: 500_000 }),
    });

    expect(
      smallProjection.estimatedTotalEntries,
    ).toMatchObject({ band: TRAVERSAL_ADMISSION_PROJECTION_BANDS.SMALL });
    expect(
      mediumProjection.estimatedTotalEntries,
    ).toMatchObject({ band: TRAVERSAL_ADMISSION_PROJECTION_BANDS.MEDIUM });
    expect(
      largeProjection.estimatedTotalEntries,
    ).toMatchObject({ band: TRAVERSAL_ADMISSION_PROJECTION_BANDS.LARGE });
    expect(
      hugeProjection.estimatedTotalEntries,
    ).toMatchObject({ band: TRAVERSAL_ADMISSION_PROJECTION_BANDS.HUGE });
  });

  it("derives the duration band ladder from the modeled execution cost", () => {
    const costModel = {
      executionTimeCostMultiplier: 2,
      estimatedPerCandidateFileCostMs: 500,
    };
    const smallProjection = buildTraversalAdmissionProjection({
      candidateWorkloadEvidence: createProbeEvidence({
        probeElapsedMs: 1_000,
        matchedCandidateFiles: 2,
      }),
      executionCostModel: costModel,
    });
    const mediumProjection = buildTraversalAdmissionProjection({
      candidateWorkloadEvidence: createProbeEvidence({
        probeElapsedMs: 10_000,
        matchedCandidateFiles: 4,
      }),
      executionCostModel: costModel,
    });
    const largeProjection = buildTraversalAdmissionProjection({
      candidateWorkloadEvidence: createProbeEvidence({
        probeElapsedMs: 50_000,
        matchedCandidateFiles: 8,
      }),
      executionCostModel: costModel,
    });
    const hugeProjection = buildTraversalAdmissionProjection({
      candidateWorkloadEvidence: createProbeEvidence({
        probeElapsedMs: 100_000,
        matchedCandidateFiles: 100,
      }),
      executionCostModel: costModel,
    });

    expect(
      smallProjection.estimatedRemainingDurationMs,
    ).toMatchObject({ band: TRAVERSAL_ADMISSION_PROJECTION_BANDS.SMALL });
    expect(
      mediumProjection.estimatedRemainingDurationMs,
    ).toMatchObject({ band: TRAVERSAL_ADMISSION_PROJECTION_BANDS.MEDIUM });
    expect(
      largeProjection.estimatedRemainingDurationMs,
    ).toMatchObject({ band: TRAVERSAL_ADMISSION_PROJECTION_BANDS.LARGE });
    expect(
      hugeProjection.estimatedRemainingDurationMs,
    ).toMatchObject({ band: TRAVERSAL_ADMISSION_PROJECTION_BANDS.HUGE });
  });

  it("reports a documented lower bound with low confidence when the probe truncated", () => {
    const projection = buildTraversalAdmissionProjection({
      candidateWorkloadEvidence: createProbeEvidence({ probeTruncated: true }),
      executionCostModel: {
        executionTimeCostMultiplier: 2,
        estimatedPerCandidateFileCostMs: 0,
      },
    });

    expect(projection.estimatedTotalEntries).toEqual({
      band: "small",
      confidence: "low",
      probeTruncated: true,
    });
    expect(projection.estimatedTotalCandidateBytes).toEqual({
      band: "small",
      confidence: "low",
      probeTruncated: true,
    });
    expect(projection.estimatedTotalResponseChars).toEqual({
      band: "small",
      confidence: "low",
      probeTruncated: true,
    });
    expect(projection.estimatedRemainingDurationMs).toEqual({
      band: "small",
      confidence: "low",
      probeTruncated: true,
    });
  });

  it("reports probe_truncated_hard when a truncated probe measured nothing", () => {
    const projection = buildTraversalAdmissionProjection({
      candidateWorkloadEvidence: createProbeEvidence({
        probeTruncated: true,
        visitedEntries: 0,
        estimatedCandidateBytes: 0,
        matchedCandidateFiles: 0,
      }),
    });

    expect(projection.estimatedTotalEntries).toEqual({
      available: false,
      reason: TRAVERSAL_ADMISSION_PROJECTION_UNAVAILABLE_REASONS.PROBE_TRUNCATED_HARD,
    });
    expect(projection.estimatedTotalCandidateBytes).toEqual({
      available: false,
      reason: TRAVERSAL_ADMISSION_PROJECTION_UNAVAILABLE_REASONS.PROBE_TRUNCATED_HARD,
    });
  });

  it("reports match_density_unknown when the family supplied no response estimator", () => {
    const projection = buildTraversalAdmissionProjection({
      candidateWorkloadEvidence: createProbeEvidence({ estimatedResponseChars: null }),
    });

    expect(projection.estimatedTotalResponseChars).toEqual({
      available: false,
      reason: TRAVERSAL_ADMISSION_PROJECTION_UNAVAILABLE_REASONS.MATCH_DENSITY_UNKNOWN,
    });
  });

  it("reports no_execution_cost_model when no execution-cost model is supplied", () => {
    const projection = buildTraversalAdmissionProjection({
      candidateWorkloadEvidence: createProbeEvidence(),
      executionCostModel: null,
    });

    expect(projection.estimatedRemainingDurationMs).toEqual({
      available: false,
      reason: TRAVERSAL_ADMISSION_PROJECTION_UNAVAILABLE_REASONS.NO_EXECUTION_COST_MODEL,
    });
  });

  it("aggregates per-root projections to the widest band with the lowest confidence and OR-combined truncation", () => {
    const aggregate = aggregateTraversalAdmissionProjections([
      buildTraversalAdmissionProjection({
        candidateWorkloadEvidence: createProbeEvidence({ visitedEntries: 5 }),
      }),
      buildTraversalAdmissionProjection({
        candidateWorkloadEvidence: createProbeEvidence({
          visitedEntries: 50_000,
          estimatedCandidateBytes: 300_000,
          probeTruncated: true,
        }),
      }),
      null,
    ]);

    expect(aggregate).not.toBeNull();
    expect(aggregate?.estimatedTotalEntries).toEqual({
      band: "large",
      confidence: "low",
      probeTruncated: true,
    });
    expect(aggregate?.estimatedTotalCandidateBytes).toEqual({
      band: "large",
      confidence: "low",
      probeTruncated: true,
    });
    expect(aggregate?.estimatedTotalResponseChars).toEqual({
      band: "small",
      confidence: "low",
      probeTruncated: true,
    });
  });

  it("keeps unavailable fields only when every root reported unavailable", () => {
    const aggregate = aggregateTraversalAdmissionProjections([
      buildTraversalAdmissionProjection({
        candidateWorkloadEvidence: createProbeEvidence({ estimatedResponseChars: null }),
      }),
      buildTraversalAdmissionProjection({
        candidateWorkloadEvidence: createProbeEvidence({ estimatedResponseChars: null }),
      }),
    ]);

    expect(aggregate?.estimatedTotalResponseChars).toEqual({
      available: false,
      reason: TRAVERSAL_ADMISSION_PROJECTION_UNAVAILABLE_REASONS.MATCH_DENSITY_UNKNOWN,
    });
  });

  it("returns null when no root contributed a projection", () => {
    expect(aggregateTraversalAdmissionProjections([])).toBeNull();
    expect(aggregateTraversalAdmissionProjections([null, undefined])).toBeNull();
  });

  it("accepts a canonical projection payload through the shared zod schema", () => {
    const parsed = TraversalAdmissionProjectionSchema.parse({
      estimatedTotalEntries: { band: "large", confidence: "medium", probeTruncated: false },
      estimatedTotalCandidateBytes: { band: "large", confidence: "high", probeTruncated: false },
      estimatedTotalResponseChars: { available: false, reason: "match_density_unknown" },
      estimatedRemainingDurationMs: { band: "medium", confidence: "low", probeTruncated: true },
    });

    expect(parsed.estimatedTotalEntries).toEqual({
      band: "large",
      confidence: "medium",
      probeTruncated: false,
    });
    expect(TRAVERSAL_ADMISSION_PROJECTION_CONFIDENCES.HIGH).toBe("high");
  });

  it("rejects fabricated precision such as a naked numeric projection value", () => {
    expect(
      TraversalAdmissionProjectionSchema.safeParse({
        estimatedTotalEntries: { band: "large", confidence: "medium", probeTruncated: false },
        estimatedTotalCandidateBytes: { band: "large", confidence: "high", probeTruncated: false },
        estimatedTotalResponseChars: 148_703,
        estimatedRemainingDurationMs: { band: "medium", confidence: "low", probeTruncated: true },
      }).success,
    ).toBe(false);
  });
});
