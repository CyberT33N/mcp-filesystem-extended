import { describe, expect, expectTypeOf, it } from "vitest";

import {
  CpuRegexTier,
  DEFAULT_CONSERVATIVE_CPU_REGEX_TIER,
  DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE,
  IoCapabilitySampleOrigin,
  type IoCapabilityProfile,
  PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
  RuntimeConfidenceTier,
  SOURCE_READ_TIER_MINIMUM_BYTES_PER_SECOND,
  SPOOL_WRITE_TIER_MINIMUM_BYTES_PER_SECOND,
  SourceReadTier,
  SpoolWriteTier,
} from "@domain/shared/runtime/io-capability-profile";

describe("io capability profile", () => {
  it("keeps the canonical runtime tier literals stable", () => {
    expect(SourceReadTier).toEqual({
      S: "S",
      A: "A",
      B: "B",
      C: "C",
      D: "D",
    });
    expect(SpoolWriteTier).toEqual({
      S: "S",
      A: "A",
      B: "B",
      C: "C",
      D: "D",
    });
    expect(CpuRegexTier).toEqual({
      S: "S",
      A: "A",
      B: "B",
      C: "C",
      D: "D",
    });
    expect(RuntimeConfidenceTier).toEqual({
      HIGH: "HIGH",
      MEDIUM: "MEDIUM",
      LOW: "LOW",
      UNKNOWN: "UNKNOWN",
    });
    expect(IoCapabilitySampleOrigin).toEqual({
      STATIC_DISCOVERY: "STATIC_DISCOVERY",
      CALIBRATED_PROBE: "CALIBRATED_PROBE",
      RUNTIME_TELEMETRY: "RUNTIME_TELEMETRY",
    });
  });

  it("keeps the default conservative profile aligned with the unknown-confidence fallback contract", () => {
    expectTypeOf(DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE).toMatchTypeOf<IoCapabilityProfile>();
    expect(DEFAULT_CONSERVATIVE_CPU_REGEX_TIER).toBe(CpuRegexTier.D);
    expect(DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE).toEqual({
      sourceReadTier: SourceReadTier.D,
      spoolWriteTier: SpoolWriteTier.D,
      cpuRegexTier: CpuRegexTier.D,
      runtimeConfidenceTier: RuntimeConfidenceTier.UNKNOWN,
      estimatedSourceReadBytesPerSecond: null,
      estimatedSpoolWriteBytesPerSecond: null,
      sampleOrigin: IoCapabilitySampleOrigin.STATIC_DISCOVERY,
      lastCalibratedAt: null,
    });
    expect(Object.keys(DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE).sort()).toEqual([
      "cpuRegexTier",
      "estimatedSourceReadBytesPerSecond",
      "estimatedSpoolWriteBytesPerSecond",
      "lastCalibratedAt",
      "runtimeConfidenceTier",
      "sampleOrigin",
      "sourceReadTier",
      "spoolWriteTier",
    ]);
  });

  it("keeps the proven local static discovery profile aligned with the shared tier minimums", () => {
    expectTypeOf(PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE).toMatchTypeOf<IoCapabilityProfile>();
    expect(PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE).toEqual({
      sourceReadTier: SourceReadTier.C,
      spoolWriteTier: SpoolWriteTier.C,
      cpuRegexTier: CpuRegexTier.C,
      runtimeConfidenceTier: RuntimeConfidenceTier.LOW,
      estimatedSourceReadBytesPerSecond:
        SOURCE_READ_TIER_MINIMUM_BYTES_PER_SECOND[SourceReadTier.C],
      estimatedSpoolWriteBytesPerSecond:
        SPOOL_WRITE_TIER_MINIMUM_BYTES_PER_SECOND[SpoolWriteTier.C],
      sampleOrigin: IoCapabilitySampleOrigin.STATIC_DISCOVERY,
      lastCalibratedAt: null,
    });
  });
});
