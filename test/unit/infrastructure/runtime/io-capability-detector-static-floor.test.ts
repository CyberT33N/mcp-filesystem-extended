import { describe, expect, it, vi } from "vitest";

vi.mock("@domain/shared/runtime/io-capability-profile", async (importOriginal) => {
  const originalModule = await importOriginal<typeof import("@domain/shared/runtime/io-capability-profile")>();

  return {
    ...originalModule,
    PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE: {
      ...originalModule.PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
      estimatedSourceReadBytesPerSecond: null,
      estimatedSpoolWriteBytesPerSecond: null,
    },
  };
});

import {
  CpuRegexTier,
  IoCapabilitySampleOrigin,
  RuntimeConfidenceTier,
  SourceReadTier,
  SpoolWriteTier,
} from "@domain/shared/runtime/io-capability-profile";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";

describe("io_capability_detector static floor without proven throughput evidence", () => {
  it("degrades the proven local floor to conservative null estimates when static discovery carries no throughput numbers", () => {
    const profile = detectIoCapabilityProfile();

    expect(profile).toEqual({
      sourceReadTier: SourceReadTier.D,
      spoolWriteTier: SpoolWriteTier.D,
      cpuRegexTier: CpuRegexTier.C,
      runtimeConfidenceTier: RuntimeConfidenceTier.LOW,
      estimatedSourceReadBytesPerSecond: null,
      estimatedSpoolWriteBytesPerSecond: null,
      sampleOrigin: IoCapabilitySampleOrigin.STATIC_DISCOVERY,
      lastCalibratedAt: null,
    });
  });
});
