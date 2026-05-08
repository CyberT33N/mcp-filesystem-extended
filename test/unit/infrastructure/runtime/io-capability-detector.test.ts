import { describe, expect, it } from "vitest";

import {
  CpuRegexTier,
  DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE,
  IoCapabilitySampleOrigin,
  PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
  RuntimeConfidenceTier,
  SourceReadTier,
  SpoolWriteTier,
} from "@domain/shared/runtime/io-capability-profile";
import {
  detectIoCapabilityProfile,
  mergeIoCapabilityRuntimeTelemetry,
} from "@infrastructure/runtime/io-capability-detector";

describe("io_capability_detector", () => {
  it("returns the proven local static discovery floor when no inputs are provided", () => {
    expect(detectIoCapabilityProfile()).toEqual(
      PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
    );
  });

  it("falls back to the conservative default when explicit static discovery provides no usable evidence", () => {
    expect(detectIoCapabilityProfile({ staticDiscovery: {} })).toEqual(
      DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE,
    );
  });

  it("promotes calibrated probe data into a medium-confidence capability profile", () => {
    expect(
      detectIoCapabilityProfile({
        calibration: {
          measuredSourceReadBytesPerSecond: 900_000_000,
          measuredSpoolWriteBytesPerSecond: 160_000_000,
          detectedCpuRegexTier: CpuRegexTier.A,
          calibratedAt: "2026-01-06T00:00:00.000Z",
        },
      }),
    ).toEqual({
      sourceReadTier: SourceReadTier.A,
      spoolWriteTier: SpoolWriteTier.B,
      cpuRegexTier: CpuRegexTier.A,
      runtimeConfidenceTier: RuntimeConfidenceTier.MEDIUM,
      estimatedSourceReadBytesPerSecond: 900_000_000,
      estimatedSpoolWriteBytesPerSecond: 160_000_000,
      sampleOrigin: IoCapabilitySampleOrigin.CALIBRATED_PROBE,
      lastCalibratedAt: "2026-01-06T00:00:00.000Z",
    });
  });

  it("prefers runtime telemetry over the current profile and raises confidence to high", () => {
    expect(
      mergeIoCapabilityRuntimeTelemetry(
        DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE,
        {
          observedSourceReadBytesPerSecond: 90_000_000,
          observedSpoolWriteBytesPerSecond: 60_000_000,
          detectedCpuRegexTier: CpuRegexTier.B,
          observedAt: "2026-01-07T00:00:00.000Z",
        },
      ),
    ).toEqual({
      sourceReadTier: SourceReadTier.C,
      spoolWriteTier: SpoolWriteTier.C,
      cpuRegexTier: CpuRegexTier.B,
      runtimeConfidenceTier: RuntimeConfidenceTier.HIGH,
      estimatedSourceReadBytesPerSecond: 90_000_000,
      estimatedSpoolWriteBytesPerSecond: 60_000_000,
      sampleOrigin: IoCapabilitySampleOrigin.RUNTIME_TELEMETRY,
      lastCalibratedAt: "2026-01-07T00:00:00.000Z",
    });
  });

  it("keeps the current profile when telemetry does not contain usable observations", () => {
    expect(
      mergeIoCapabilityRuntimeTelemetry(
        PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
        { observedAt: "2026-01-08T00:00:00.000Z" },
      ),
    ).toBe(PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE);
  });
});
