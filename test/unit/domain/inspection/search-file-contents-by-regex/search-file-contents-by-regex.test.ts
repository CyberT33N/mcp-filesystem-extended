import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockedAssertFormattedRegexResponseBudget,
  mockedCompileGuardrailedSearchRegex,
  mockedCreateRegexSearchAggregateBudgetState,
  mockedDetectIoCapabilityProfile,
  mockedFormatSearchRegexPathOutput,
  mockedGetSearchRegexPathResult,
  mockedResolveSearchExecutionPolicy,
} = vi.hoisted(() => ({
  mockedAssertFormattedRegexResponseBudget: vi.fn(),
  mockedCompileGuardrailedSearchRegex: vi.fn(),
  mockedCreateRegexSearchAggregateBudgetState: vi.fn(),
  mockedDetectIoCapabilityProfile: vi.fn(),
  mockedFormatSearchRegexPathOutput: vi.fn(),
  mockedGetSearchRegexPathResult: vi.fn(),
  mockedResolveSearchExecutionPolicy: vi.fn(),
}));

vi.mock("@domain/shared/guardrails/regex-search-safety", () => ({
  compileGuardrailedSearchRegex: mockedCompileGuardrailedSearchRegex,
}));

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
    formatSearchRegexPathOutput: mockedFormatSearchRegexPathOutput,
  }),
);

import { REGEX_SEARCH_MAX_RESULTS_HARD_CAP } from "@domain/shared/guardrails/tool-guardrail-limits";
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
    mockedAssertFormattedRegexResponseBudget.mockImplementation(
      (_toolName, formattedOutput) => formattedOutput,
    );
  });

  it("caps the caller result limit at the shared hard cap for single-root formatted search", async () => {
    const pathResult = {
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
      root: "src",
      totalMatches: 1,
      truncated: false,
    };

    mockedGetSearchRegexPathResult.mockResolvedValue(pathResult);
    mockedFormatSearchRegexPathOutput.mockReturnValue(
      "formatted regex search output",
    );

    const result = await handleSearchRegex(
      ["src"],
      "handleSearchRegex",
      ["*.ts"],
      ["**/dist/**"],
      [],
      false,
      REGEX_SEARCH_MAX_RESULTS_HARD_CAP + 25,
      false,
      ["C:/Projects/mcp/server/system/files/mcp-filesystem-extended"],
    );

    expect(mockedCompileGuardrailedSearchRegex).toHaveBeenCalledWith(
      "search_file_contents_by_regex",
      "handleSearchRegex",
      false,
    );
    expect(mockedGetSearchRegexPathResult).toHaveBeenCalledWith(
      "search_file_contents_by_regex",
      "src",
      "handleSearchRegex",
      ["*.ts"],
      ["**/dist/**"],
      [],
      false,
      REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
      false,
      ["C:/Projects/mcp/server/system/files/mcp-filesystem-extended"],
      TEST_SEARCH_EXECUTION_POLICY,
      { kind: "aggregate-budget-state" },
    );
    expect(mockedAssertFormattedRegexResponseBudget).toHaveBeenCalledWith(
      "search_file_contents_by_regex",
      "formatted regex search output",
    );
    expect(result).toBe("formatted regex search output");
  });

  it("preserves root-local failures in the structured multi-root result surface", async () => {
    mockedGetSearchRegexPathResult
      .mockResolvedValueOnce({
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
        root: "src",
        totalMatches: 1,
        truncated: false,
      })
      .mockRejectedValueOnce(new Error("Native regex lane timed out."));

    const result = await getSearchRegexResult(
      ["src", "fixtures"],
      "SearchFileContentsByRegexArgsSchema",
      ["*.ts"],
      [],
      [],
      false,
      25,
      true,
      ["C:/Projects/mcp/server/system/files/mcp-filesystem-extended"],
    );

    expect(result).toEqual({
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
});
