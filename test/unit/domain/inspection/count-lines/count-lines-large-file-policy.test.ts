import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  getCountLinesResult,
  handleCountLines,
} from "@domain/inspection/count-lines/handler";
import { CountLinesArgsSchema } from "@domain/inspection/count-lines/schema";
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

let allowedDirectories: string[] = [];
let alphaFilePath = "";
let betaFilePath = "";
let sandboxRootPath = "";

describe("count_lines large-file policy", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-count-lines-"));
    allowedDirectories = [sandboxRootPath];
    alphaFilePath = join(sandboxRootPath, "alpha.txt");
    betaFilePath = join(sandboxRootPath, "nested", "beta.txt");

    await mkdir(join(sandboxRootPath, "nested"), { recursive: true });
    await writeFile(alphaFilePath, "alpha\nbeta\n");
    await writeFile(betaFilePath, "gamma\ndelta\n");
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("keeps total-only counting on the streaming lane while preserving shared thresholds", () => {
    const policy = resolveCountQueryPolicy({
      inspectionContentClassification: {
        resolvedState: "TEXT_CONFIDENT",
        resolvedTextEncoding: "utf8",
      },
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

  it("returns structured totals for recursive count-lines requests", async () => {
    const result = await getCountLinesResult(
      undefined,
      undefined,
      [sandboxRootPath],
      true,
      undefined,
      ["**/*.txt"],
      [],
      [],
      false,
      false,
      undefined,
      allowedDirectories,
    );

    const firstPath = result.paths[0];

    expect(firstPath).toBeDefined();

    if (firstPath === undefined) {
      throw new Error("Expected one structured count-lines result path.");
    }

    expect(firstPath.path).toBe(sandboxRootPath);
    expect(firstPath.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          count: 2,
          file: alphaFilePath,
        }),
        expect.objectContaining({
          count: 2,
          file: betaFilePath,
        }),
      ]),
    );
    expect(result.totalFiles).toBe(2);
    expect(result.totalLines).toBe(4);
    expect(result.totalMatchingLines).toBe(0);
    expect(result.admission.outcome).toBe("inline");
    expect(result.resume.resumable).toBe(false);
  });

  it("formats recursive count-lines output for caller-visible text", async () => {
    const output = await handleCountLines(
      undefined,
      undefined,
      [sandboxRootPath],
      true,
      undefined,
      ["**/*.txt"],
      [],
      [],
      false,
      false,
      undefined,
      allowedDirectories,
    );

    expect(output).toContain("Line counts:");
    expect(output).toContain(alphaFilePath);
    expect(output).toContain(betaFilePath);
    expect(output).toContain("Total: 2 files, 4 lines");
  });

  it("defaults recursive and empty-line handling flags in the request schema", () => {
    const parsed = CountLinesArgsSchema.parse({
      paths: [sandboxRootPath],
    });

    expect(parsed.recursive).toBe(false);
    expect(parsed.ignoreEmptyLines).toBe(false);
    expect(parsed.includeGlobs).toEqual([]);
    expect(parsed.excludeGlobs).toEqual([]);
  });
});
