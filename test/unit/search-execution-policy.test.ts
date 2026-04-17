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
    expect(policy.effectiveSourceReadTier).toBe(SourceReadTier.A);
    expect(policy.effectiveCpuRegexTier).toBe(CpuRegexTier.B);
    expect(policy.regexSyncCandidateBytesCap).toBe(8 * 1_024 * 1_024);
    expect(policy.fixedStringSyncCandidateBytesCap).toBe(16 * 1_024 * 1_024);
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
    expect(policy.regexSyncCandidateBytesCap).toBe(2 * 1_024 * 1_024);
    expect(policy.fixedStringSyncCandidateBytesCap).toBe(4 * 1_024 * 1_024);
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
    expect(policy.regexSyncCandidateBytesCap).toBe(4 * 1_024 * 1_024);
    expect(policy.fixedStringSyncCandidateBytesCap).toBe(24 * 1_024 * 1_024);
  });
});
