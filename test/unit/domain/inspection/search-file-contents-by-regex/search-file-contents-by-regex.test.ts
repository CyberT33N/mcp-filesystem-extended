import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockedAssertFormattedRegexResponseBudget,
  mockedCreateGuardrailedSearchRegexExecutionPlan,
  mockedCreateRegexSearchAggregateBudgetState,
  mockedDetectIoCapabilityProfile,
  mockedFormatSearchRegexContinuationAwareTextOutput,
  mockedGetSearchRegexPathResult,
  mockedResolveSearchExecutionPolicy,
} = vi.hoisted(() => ({
  mockedAssertFormattedRegexResponseBudget: vi.fn(),
  mockedCreateGuardrailedSearchRegexExecutionPlan: vi.fn(),
  mockedCreateRegexSearchAggregateBudgetState: vi.fn(),
  mockedDetectIoCapabilityProfile: vi.fn(),
  mockedFormatSearchRegexContinuationAwareTextOutput: vi.fn(),
  mockedGetSearchRegexPathResult: vi.fn(),
  mockedResolveSearchExecutionPolicy: vi.fn(),
}));

vi.mock("@domain/shared/guardrails/regex-search-safety", async () => {
  const actual = await vi.importActual<
    typeof import("@domain/shared/guardrails/regex-search-safety")
  >("@domain/shared/guardrails/regex-search-safety");

  return {
    ...actual,
    createGuardrailedSearchRegexExecutionPlan:
      mockedCreateGuardrailedSearchRegexExecutionPlan,
  };
});

vi.mock("@domain/shared/search/search-execution-policy", () => ({
  resolveSearchExecutionPolicy: mockedResolveSearchExecutionPolicy,
}));

vi.mock("@infrastructure/runtime/io-capability-detector", () => ({
  detectIoCapabilityProfile: mockedDetectIoCapabilityProfile,
}));

vi.mock(
  "@domain/inspection/search-file-contents-by-regex/search-regex-path-result",
  () => ({
    createRegexSearchAggregateBudgetState: mockedCreateRegexSearchAggregateBudgetState,
    getSearchRegexPathResult: mockedGetSearchRegexPathResult,
  }),
);

vi.mock(
  "@domain/inspection/search-file-contents-by-regex/search-regex-result",
  () => ({
    assertFormattedRegexResponseBudget: mockedAssertFormattedRegexResponseBudget,
    formatSearchRegexContinuationAwareTextOutput:
      mockedFormatSearchRegexContinuationAwareTextOutput,
  }),
);

import { REGEX_SEARCH_MAX_RESULTS_HARD_CAP } from "@domain/shared/guardrails/tool-guardrail-limits";
import { RegexSearchPatternContractError } from "@domain/shared/guardrails/regex-search-safety";
import { PATTERN_CLASSIFICATION_LITERALS } from "@domain/shared/search/pattern-classifier";
import {
  CpuRegexTier,
  DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE,
  RuntimeConfidenceTier,
  SourceReadTier,
} from "@domain/shared/runtime/io-capability-profile";
import {
  getSearchRegexResult,
  handleSearchRegex,
} from "@domain/inspection/search-file-contents-by-regex/handler";

const TEST_SEARCH_EXECUTION_POLICY = {
  effectiveCpuRegexTier: CpuRegexTier.B,
  effectiveSourceReadTier: SourceReadTier.A,
  fixedStringServiceHardGapBytes: 32 * 1_024 * 1_024,
  fixedStringSyncCandidateBytesCap: 16 * 1_024 * 1_024,
  previewFirstResponseCapFraction: 0.5,
  regexServiceHardGapBytes: 32 * 1_024 * 1_024,
  regexSyncCandidateBytesCap: 12 * 1_024 * 1_024,
  runtimeConfidenceTier: RuntimeConfidenceTier.HIGH,
  syncComfortWindowSeconds: 15,
  taskRecommendedAfterSeconds: 60,
};

const TEST_REGEX_EXECUTION_PLAN = {
  patternClassification: {
    classification: PATTERN_CLASSIFICATION_LITERALS.literal,
    originalPattern: "handleSearchRegex",
    requiresPcre2: false,
    supportsLiteralFastPath: true,
  },
  regex: /handleSearchRegex/gim,
};

describe("search_file_contents_by_regex", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedDetectIoCapabilityProfile.mockReturnValue(
      DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE,
    );
    mockedResolveSearchExecutionPolicy.mockReturnValue(
      TEST_SEARCH_EXECUTION_POLICY,
    );
    mockedCreateRegexSearchAggregateBudgetState.mockReturnValue({
      kind: "aggregate-budget-state",
    });
    mockedCreateGuardrailedSearchRegexExecutionPlan.mockReturnValue(
      TEST_REGEX_EXECUTION_PLAN,
    );
    mockedAssertFormattedRegexResponseBudget.mockImplementation(
      (_toolName, formattedOutput) => formattedOutput,
    );
  });

  it("caps the caller result limit at the shared hard cap for single-root formatted search", async () => {
    const pathResult = {
      admissionOutcome: "inline",
      error: null,
      filesSearched: 2,
      matches: [
        {
          content: "export async function handleSearchRegex(",
          file: "src/domain/inspection/search-file-contents-by-regex/handler.ts",
          line: 70,
          match: "handleSearchRegex",
        },
      ],
      nextContinuationState: null,
      root: "src",
      totalMatches: 1,
      truncated: false,
    };

    mockedGetSearchRegexPathResult.mockResolvedValue(pathResult);
    mockedFormatSearchRegexContinuationAwareTextOutput.mockReturnValue(
      "formatted regex search output",
    );

    const result = await handleSearchRegex({
      resumeToken: undefined,
      resumeMode: undefined,
      searchPaths: ["src"],
      pattern: "handleSearchRegex",
      filePatterns: ["*.ts"],
      excludePatterns: ["**/dist/**"],
      includeExcludedGlobs: [],
      respectGitIgnore: false,
      maxResults: REGEX_SEARCH_MAX_RESULTS_HARD_CAP + 25,
      caseSensitive: false,
      allowedDirectories: ["C:/Projects/mcp/server/system/files/mcp-filesystem-extended"],
      inspectionResumeSessionStore: undefined,
    });

    expect(mockedCreateGuardrailedSearchRegexExecutionPlan).toHaveBeenCalledWith(
      "search_file_contents_by_regex",
      "handleSearchRegex",
      false,
    );
    expect(mockedGetSearchRegexPathResult).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateBudgetState: { kind: "aggregate-budget-state" },
        allowedDirectories: [
          "C:/Projects/mcp/server/system/files/mcp-filesystem-extended",
        ],
        caseSensitive: false,
        executionPolicy: TEST_SEARCH_EXECUTION_POLICY,
        maxResults: REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
        pattern: "handleSearchRegex",
        regexExecutionPlan: TEST_REGEX_EXECUTION_PLAN,
        searchPath: "src",
        toolName: "search_file_contents_by_regex",
      }),
    );
    expect(mockedAssertFormattedRegexResponseBudget).toHaveBeenCalledWith(
      "search_file_contents_by_regex",
      "formatted regex search output",
      null,
    );
    expect(result).toBe("formatted regex search output");
  });

  it("preserves root-local failures in the structured multi-root result surface", async () => {
    mockedGetSearchRegexPathResult
      .mockResolvedValueOnce({
        admissionOutcome: "inline",
        error: null,
        filesSearched: 3,
        matches: [
          {
            content: "export const SearchFileContentsByRegexArgsSchema = z.object({",
            file: "src/domain/inspection/search-file-contents-by-regex/schema.ts",
            line: 22,
            match: "SearchFileContentsByRegexArgsSchema",
          },
        ],
        nextContinuationState: null,
        root: "src",
        totalMatches: 1,
        truncated: false,
      })
      .mockRejectedValueOnce(new Error("Native regex lane timed out."));

    const result = await getSearchRegexResult({
      resumeToken: undefined,
      resumeMode: undefined,
      searchPaths: ["src", "fixtures"],
      pattern: "SearchFileContentsByRegexArgsSchema",
      filePatterns: ["*.ts"],
      excludePatterns: [],
      includeExcludedGlobs: [],
      respectGitIgnore: false,
      maxResults: 25,
      caseSensitive: true,
      allowedDirectories: ["C:/Projects/mcp/server/system/files/mcp-filesystem-extended"],
      inspectionResumeSessionStore: undefined,
    });

    expect(result).toMatchObject({
      roots: [
        {
          error: null,
          filesSearched: 3,
          matches: [
            {
              content:
                "export const SearchFileContentsByRegexArgsSchema = z.object({",
              file: "src/domain/inspection/search-file-contents-by-regex/schema.ts",
              line: 22,
              match: "SearchFileContentsByRegexArgsSchema",
            },
          ],
          root: "src",
          totalMatches: 1,
          truncated: false,
        },
        {
          error: "Native regex lane timed out.",
          filesSearched: 0,
          matches: [],
          root: "fixtures",
          totalMatches: 0,
          truncated: false,
        },
      ],
      totalLocations: 1,
      totalMatches: 1,
      truncated: false,
    });
  });

  it("rethrows request-wide pattern contract failures instead of degrading them into root-local errors", async () => {
    mockedGetSearchRegexPathResult.mockRejectedValueOnce(
      new RegexSearchPatternContractError(
        "Pattern contract rejected for the selected execution lane.",
      ),
    );

    await expect(
      getSearchRegexResult({
        resumeToken: undefined,
        resumeMode: undefined,
        searchPaths: ["src"],
        pattern: "\\.(ts|js|tsx|jsx|mts|mjs|cts|cjs)(?!\\.)",
        filePatterns: ["*.ts"],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 25,
        caseSensitive: false,
        allowedDirectories: [
          "C:/Projects/mcp/server/system/files/mcp-filesystem-extended",
        ],
        inspectionResumeSessionStore: undefined,
      }),
    ).rejects.toThrow(
      "Pattern contract rejected for the selected execution lane.",
    );
  });

  it("rejects zero-length anchor patterns with a content-search contract response", async () => {
    const actualModule = await vi.importActual<
      typeof import("@domain/shared/guardrails/regex-search-safety")
    >("@domain/shared/guardrails/regex-search-safety");

    expect.assertions(5);

    try {
      actualModule.createGuardrailedSearchRegexExecutionPlan(
        "search_file_contents_by_regex",
        "^",
        true,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(RegexSearchPatternContractError);

      if (!(error instanceof RegexSearchPatternContractError)) {
        return;
      }

      expect(error.message).toContain(
        "Regex execution rejected because the pattern is out of contract for this content-search endpoint.",
      );
      expect(error.message).toContain(
        "The pattern can produce a zero-length match on sentinel input \"\".",
      );
      expect(error.message).toContain(
        "Contract boundary: This endpoint accepts only patterns that produce content-bearing matches and does not allow anchor-only or other zero-length matching patterns.",
      );
      expect(error.message).toContain(
        "Use a regex that consumes content characters for this endpoint, or switch to a dedicated anchor/position search surface for zero-width matching.",
      );
    }
  });

  it("surfaces zero-length contract rejections before root execution begins", async () => {
    const actualModule = await vi.importActual<
      typeof import("@domain/shared/guardrails/regex-search-safety")
    >("@domain/shared/guardrails/regex-search-safety");

    mockedCreateGuardrailedSearchRegexExecutionPlan.mockImplementation(
      (toolName: string, pattern: string, caseSensitive: boolean) =>
        actualModule.createGuardrailedSearchRegexExecutionPlan(
          toolName,
          pattern,
          caseSensitive,
        ),
    );

    await expect(
      getSearchRegexResult({
        resumeToken: undefined,
        resumeMode: undefined,
        searchPaths: ["src"],
        pattern: "^",
        filePatterns: ["*.ts"],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 25,
        caseSensitive: true,
        allowedDirectories: [
          "C:/Projects/mcp/server/system/files/mcp-filesystem-extended",
        ],
        inspectionResumeSessionStore: undefined,
      }),
    ).rejects.toThrow(
      "Regex execution rejected because the pattern is out of contract for this content-search endpoint.",
    );
    expect(mockedGetSearchRegexPathResult).not.toHaveBeenCalled();
  });
});
