import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CpuRegexTier,
  RuntimeConfidenceTier,
  SourceReadTier,
} from "@domain/shared/runtime/io-capability-profile";

/**
 * Hoisted runtime-dependency mock state used by the `ugrep` command-builder tests.
 */
const ugrepCommandBuilderTestState = vi.hoisted(() => ({
  mockedGetRequiredUgrepExecutablePath: vi.fn(() => "C:/tools/ugrep.exe"),
}));

vi.mock("@infrastructure/runtime/ugrep-runtime-dependency", () => ({
  getRequiredUgrepExecutablePath:
    ugrepCommandBuilderTestState.mockedGetRequiredUgrepExecutablePath,
}));

import {
  PATTERN_CLASSIFICATION_LITERALS,
  type PatternClassification,
} from "@domain/shared/search/pattern-classifier";
import type { SearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import { buildUgrepCommand } from "@infrastructure/search/ugrep-command-builder";

/**
 * Creates one fully populated shared search execution policy for command-builder tests.
 *
 * @param overrides - Policy fields that the current test wants to override.
 * @returns One complete native-search execution policy surface.
 */
function createSearchExecutionPolicy(
  overrides: Partial<SearchExecutionPolicy> = {},
): SearchExecutionPolicy {
  return {
    effectiveCpuRegexTier: CpuRegexTier.B,
    effectiveSourceReadTier: SourceReadTier.A,
    fixedStringServiceHardGapBytes: 32 * 1_024 * 1_024,
    fixedStringSyncCandidateBytesCap: 48 * 1_024 * 1_024,
    previewFirstResponseCapFraction: 0.5,
    regexServiceHardGapBytes: 32 * 1_024 * 1_024,
    regexSyncCandidateBytesCap: 16 * 1_024 * 1_024,
    runtimeConfidenceTier: RuntimeConfidenceTier.HIGH,
    syncComfortWindowSeconds: 15,
    taskBackedResponseCapFraction: 0.85,
    taskRecommendedAfterSeconds: 60,
    traversalInlineCandidateFileBudget: 8_000,
    traversalInlineDirectoryBudget: 2_500,
    traversalInlineEntryBudget: 25_000,
    traversalInlineExecutionBudgetMs: 4_000,
    traversalPreviewExecutionDirectoryBudget: 5_500,
    traversalPreviewExecutionEntryBudget: 55_000,
    traversalPreviewExecutionTimeBudgetMs: 4_000,
    traversalPreviewFirstDirectoryBudget: 5_500,
    traversalPreviewFirstEntryBudget: 55_000,
    ...overrides,
  };
}

/**
 * Creates one shared pattern-classification surface for native-search command-builder tests.
 *
 * @param overrides - Classification fields that the current test wants to override.
 * @returns One complete pattern-classification result.
 */
function createPatternClassification(
  overrides: Partial<PatternClassification> = {},
): PatternClassification {
  return {
    classification: PATTERN_CLASSIFICATION_LITERALS.literal,
    originalPattern: "PRAXIS1",
    requiresPcre2: false,
    supportsLiteralFastPath: true,
    ...overrides,
  };
}

describe("buildUgrepCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds the fixed-string hybrid lane with the policy-owned literal byte cap", () => {
    const executionPolicy = createSearchExecutionPolicy();

    const command = buildUgrepCommand({
      afterContextLines: 1,
      beforeContextLines: 2,
      candidatePaths: ["test/fixtures/patients.csv"],
      caseSensitive: false,
      executionPolicy,
      hybridLiteralSearchLane: true,
      maxCount: 7,
      patternClassification: createPatternClassification(),
    });

    expect(command).toEqual({
      args: [
        "--binary-files=text",
        "--color=never",
        "--line-number",
        "--with-filename",
        "--ignore-case",
        "--before-context=2",
        "--after-context=1",
        "--max-count=7",
        "--fixed-strings",
        "PRAXIS1",
        "test/fixtures/patients.csv",
      ],
      executable: "C:/tools/ugrep.exe",
      fixedStringMode: true,
      hybridLiteralSearchLane: true,
      requiresPcre2: false,
      syncCandidateBytesCap: executionPolicy.fixedStringSyncCandidateBytesCap,
    });
    expect(
      ugrepCommandBuilderTestState.mockedGetRequiredUgrepExecutablePath,
    ).toHaveBeenCalledTimes(1);
  });

  it("builds the PCRE2 lane without literal-search flags and keeps the regex byte cap", () => {
    const executionPolicy = createSearchExecutionPolicy({
      regexSyncCandidateBytesCap: 12 * 1_024 * 1_024,
    });

    const command = buildUgrepCommand({
      candidatePaths: ["src/domain", "src/infrastructure"],
      caseSensitive: true,
      executionPolicy,
      maxCount: 0,
      patternClassification: createPatternClassification({
        classification: PATTERN_CLASSIFICATION_LITERALS.pcre2HeavyRegex,
        originalPattern: "(?<=PRAXIS)\\d+",
        requiresPcre2: true,
        supportsLiteralFastPath: false,
      }),
    });

    expect(command).toEqual({
      args: [
        "--binary-files=without-match",
        "--color=never",
        "--line-number",
        "--with-filename",
        "--perl-regexp",
        "(?<=PRAXIS)\\d+",
        "src/domain",
        "src/infrastructure",
      ],
      executable: "C:/tools/ugrep.exe",
      fixedStringMode: false,
      hybridLiteralSearchLane: false,
      requiresPcre2: true,
      syncCandidateBytesCap: executionPolicy.regexSyncCandidateBytesCap,
    });
  });
});
