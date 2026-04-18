import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockedBuildUgrepCommand } = vi.hoisted(() => ({
  mockedBuildUgrepCommand: vi.fn(),
}));

vi.mock("@infrastructure/search/ugrep-command-builder", () => ({
  buildUgrepCommand: mockedBuildUgrepCommand,
}));

import {
  CountQueryExecutionLane,
  buildPatternAwareCountCommand,
  resolveCountQueryPolicy,
} from "@domain/shared/search/count-query-policy";
import {
  CpuRegexTier,
  DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE,
  IoCapabilitySampleOrigin,
  RuntimeConfidenceTier,
  SourceReadTier,
  SpoolWriteTier,
} from "@domain/shared/runtime/io-capability-profile";

const HIGH_CONFIDENCE_IO_CAPABILITY_PROFILE = {
  ...DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE,
  cpuRegexTier: CpuRegexTier.B,
  estimatedSourceReadBytesPerSecond: 900_000_000,
  estimatedSpoolWriteBytesPerSecond: 550_000_000,
  lastCalibratedAt: "2026-04-16T21:30:00Z",
  runtimeConfidenceTier: RuntimeConfidenceTier.HIGH,
  sampleOrigin: IoCapabilitySampleOrigin.RUNTIME_TELEMETRY,
  sourceReadTier: SourceReadTier.A,
  spoolWriteTier: SpoolWriteTier.A,
};

describe("count_lines large-file policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps total-only counting on the streaming lane while preserving shared thresholds", () => {
    const policy = resolveCountQueryPolicy({
      ioCapabilityProfile: HIGH_CONFIDENCE_IO_CAPABILITY_PROFILE,
      pattern: undefined,
    });

    expect(policy.executionLane).toBe(
      CountQueryExecutionLane.STREAMING_TOTAL_ONLY,
    );
    expect(policy.patternClassification).toBeNull();
    expect(policy.previewFirstResponseCapFraction).toBe(0.5);
    expect(policy.syncComfortWindowSeconds).toBe(15);
    expect(policy.taskRecommendedAfterSeconds).toBe(60);
    expect(policy.syncCandidateBytesCap).toBeNull();
    expect(policy.serviceHardGapBytes).toBeNull();
  });

  it("builds a native pattern-aware count command without line-number output", () => {
    mockedBuildUgrepCommand.mockReturnValue({
      args: ["--line-number", "--json", "TODO", "file.txt"],
      syncCandidateBytesCap: 1_024,
    });

    const command = buildPatternAwareCountCommand({
      candidatePath: "file.txt",
      caseSensitive: true,
      ioCapabilityProfile: HIGH_CONFIDENCE_IO_CAPABILITY_PROFILE,
      pattern: "TODO",
    });

    expect(mockedBuildUgrepCommand).toHaveBeenCalledWith({
      candidatePath: "file.txt",
      caseSensitive: true,
      executionPolicy: expect.objectContaining({
        fixedStringSyncCandidateBytesCap: 16 * 1_024 * 1_024,
      }),
      patternClassification: expect.objectContaining({
        classification: "literal",
        supportsLiteralFastPath: true,
      }),
    });
    expect(command.args).toEqual([
      "--json",
      "--count",
      "--no-messages",
      "TODO",
      "file.txt",
    ]);
    expect(command.syncCandidateBytesCap).toBe(16 * 1_024 * 1_024);
  });
});
