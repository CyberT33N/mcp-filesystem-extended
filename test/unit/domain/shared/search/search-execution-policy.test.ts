import { describe, expect, it } from "vitest";

import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import {
  CpuRegexTier,
  type IoCapabilityProfile,
  IoCapabilitySampleOrigin,
  RuntimeConfidenceTier,
  SourceReadTier,
  SpoolWriteTier,
} from "@domain/shared/runtime/io-capability-profile";

/**
 * Creates a deterministic runtime capability profile for search policy tests.
 *
 * @param overrides - Profile fields that the current test wants to override.
 * @returns One fully populated runtime capability profile for search policy resolution.
 */
function createIoCapabilityProfile(
  overrides: Partial<IoCapabilityProfile> = {},
): IoCapabilityProfile {
  return {
    cpuRegexTier: CpuRegexTier.B,
    estimatedSourceReadBytesPerSecond: 900_000_000,
    estimatedSpoolWriteBytesPerSecond: 550_000_000,
    lastCalibratedAt: "2026-04-16T21:30:00Z",
    runtimeConfidenceTier: RuntimeConfidenceTier.HIGH,
    sampleOrigin: IoCapabilitySampleOrigin.RUNTIME_TELEMETRY,
    sourceReadTier: SourceReadTier.A,
    spoolWriteTier: SpoolWriteTier.A,
    ...overrides,
  };
}

describe("resolveSearchExecutionPolicy", () => {
  it("preserves the bound sync, task, and preview thresholds for high-confidence profiles", () => {
    const policy = resolveSearchExecutionPolicy(createIoCapabilityProfile());

    expect(policy.syncComfortWindowSeconds).toBe(15);
    expect(policy.taskRecommendedAfterSeconds).toBe(60);
    expect(policy.previewFirstResponseCapFraction).toBe(0.5);
    expect(policy.taskBackedResponseCapFraction).toBe(0.85);
    expect(policy.effectiveSourceReadTier).toBe(SourceReadTier.A);
    expect(policy.effectiveCpuRegexTier).toBe(CpuRegexTier.B);
    expect(policy.regexSyncCandidateBytesCap).toBe(16 * 1_024 * 1_024);
    expect(policy.fixedStringSyncCandidateBytesCap).toBe(48 * 1_024 * 1_024);
  });

  it("downgrades unknown-confidence environments to the most conservative runtime tiers", () => {
    const policy = resolveSearchExecutionPolicy(
      createIoCapabilityProfile({
        cpuRegexTier: CpuRegexTier.S,
        runtimeConfidenceTier: RuntimeConfidenceTier.UNKNOWN,
        sourceReadTier: SourceReadTier.S,
      }),
    );

    expect(policy.runtimeConfidenceTier).toBe(RuntimeConfidenceTier.UNKNOWN);
    expect(policy.effectiveSourceReadTier).toBe(SourceReadTier.D);
    expect(policy.effectiveCpuRegexTier).toBe(CpuRegexTier.D);
    expect(policy.regexSyncCandidateBytesCap).toBe(8 * 1_024 * 1_024);
    expect(policy.fixedStringSyncCandidateBytesCap).toBe(16 * 1_024 * 1_024);
  });

  it("uses the more conservative execution tier when regex work is weaker than read throughput", () => {
    const policy = resolveSearchExecutionPolicy(
      createIoCapabilityProfile({
        cpuRegexTier: CpuRegexTier.C,
        sourceReadTier: SourceReadTier.S,
      }),
    );

    expect(policy.effectiveSourceReadTier).toBe(SourceReadTier.S);
    expect(policy.effectiveCpuRegexTier).toBe(CpuRegexTier.C);
    expect(policy.regexSyncCandidateBytesCap).toBe(12 * 1_024 * 1_024);
    expect(policy.fixedStringSyncCandidateBytesCap).toBe(64 * 1_024 * 1_024);
  });

  it("downgrades medium-confidence profiles by one tier before applying the shared budgets", () => {
    const policy = resolveSearchExecutionPolicy(
      createIoCapabilityProfile({
        cpuRegexTier: CpuRegexTier.A,
        runtimeConfidenceTier: RuntimeConfidenceTier.MEDIUM,
        sourceReadTier: SourceReadTier.S,
      }),
    );

    expect(policy.runtimeConfidenceTier).toBe(RuntimeConfidenceTier.MEDIUM);
    expect(policy.effectiveSourceReadTier).toBe(SourceReadTier.A);
    expect(policy.effectiveCpuRegexTier).toBe(CpuRegexTier.B);
    expect(policy.previewFirstResponseCapFraction).toBe(0.5);
    expect(policy.taskBackedResponseCapFraction).toBe(0.85);
    expect(policy.regexSyncCandidateBytesCap).toBe(16 * 1_024 * 1_024);
    expect(policy.fixedStringSyncCandidateBytesCap).toBe(48 * 1_024 * 1_024);
  });

  it("preserves the shared generic traversal-inline execution budget while family overrides remain consumer-owned", () => {
    const policy = resolveSearchExecutionPolicy(createIoCapabilityProfile());

    expect(policy.traversalInlineExecutionBudgetMs).toBe(4_000);
  });

  it("downgrades medium-confidence B tiers to their conservative C successors", () => {
    const policy = resolveSearchExecutionPolicy(
      createIoCapabilityProfile({
        cpuRegexTier: CpuRegexTier.B,
        runtimeConfidenceTier: RuntimeConfidenceTier.MEDIUM,
        sourceReadTier: SourceReadTier.B,
      }),
    );

    expect(policy.effectiveSourceReadTier).toBe(SourceReadTier.C);
    expect(policy.effectiveCpuRegexTier).toBe(CpuRegexTier.C);
  });

  it("keeps medium-confidence D tiers at the conservative floor", () => {
    const policy = resolveSearchExecutionPolicy(
      createIoCapabilityProfile({
        cpuRegexTier: CpuRegexTier.D,
        runtimeConfidenceTier: RuntimeConfidenceTier.MEDIUM,
        sourceReadTier: SourceReadTier.D,
      }),
    );

    expect(policy.effectiveSourceReadTier).toBe(SourceReadTier.D);
    expect(policy.effectiveCpuRegexTier).toBe(CpuRegexTier.D);
  });

  it("maps S-tier cpu regex strength onto the S source-read tier for conservative resolution", () => {
    const policy = resolveSearchExecutionPolicy(
      createIoCapabilityProfile({
        cpuRegexTier: CpuRegexTier.S,
        sourceReadTier: SourceReadTier.S,
      }),
    );

    expect(policy.effectiveSourceReadTier).toBe(SourceReadTier.S);
    expect(policy.regexSyncCandidateBytesCap).toBe(32 * 1_024 * 1_024);
  });

  it("downgrades medium-confidence A and S tiers through the conservative chain", () => {
    const policy = resolveSearchExecutionPolicy(
      createIoCapabilityProfile({
        cpuRegexTier: CpuRegexTier.S,
        runtimeConfidenceTier: RuntimeConfidenceTier.MEDIUM,
        sourceReadTier: SourceReadTier.A,
      }),
    );

    expect(policy.effectiveSourceReadTier).toBe(SourceReadTier.B);
    expect(policy.effectiveCpuRegexTier).toBe(CpuRegexTier.A);
    expect(policy.regexSyncCandidateBytesCap).toBe(16 * 1_024 * 1_024);
  });
});
