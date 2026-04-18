import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockedAssertFormattedFixedStringResponseBudget,
  mockedCreateFixedStringSearchAggregateBudgetState,
  mockedDetectIoCapabilityProfile,
  mockedFormatSearchFixedStringPathOutput,
  mockedGetSearchFixedStringPathResult,
  mockedResolveSearchExecutionPolicy,
} = vi.hoisted(() => ({
  mockedAssertFormattedFixedStringResponseBudget: vi.fn(),
  mockedCreateFixedStringSearchAggregateBudgetState: vi.fn(),
  mockedDetectIoCapabilityProfile: vi.fn(),
  mockedFormatSearchFixedStringPathOutput: vi.fn(),
  mockedGetSearchFixedStringPathResult: vi.fn(),
  mockedResolveSearchExecutionPolicy: vi.fn(),
}));

vi.mock("@domain/shared/search/search-execution-policy", () => ({
  resolveSearchExecutionPolicy: mockedResolveSearchExecutionPolicy,
}));

vi.mock("@infrastructure/runtime/io-capability-detector", () => ({
  detectIoCapabilityProfile: mockedDetectIoCapabilityProfile,
}));

vi.mock(
  "@domain/inspection/search-file-contents-by-fixed-string/search-fixed-string-path-result",
  () => ({
    createFixedStringSearchAggregateBudgetState:
      mockedCreateFixedStringSearchAggregateBudgetState,
    getSearchFixedStringPathResult: mockedGetSearchFixedStringPathResult,
  }),
);

vi.mock(
  "@domain/inspection/search-file-contents-by-fixed-string/search-fixed-string-result",
  () => ({
    assertFormattedFixedStringResponseBudget:
      mockedAssertFormattedFixedStringResponseBudget,
    formatSearchFixedStringPathOutput: mockedFormatSearchFixedStringPathOutput,
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
  getSearchFixedStringResult,
  handleSearchFixedString,
} from "@domain/inspection/search-file-contents-by-fixed-string/handler";

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

describe("search_file_contents_by_fixed_string", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedDetectIoCapabilityProfile.mockReturnValue(
      DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE,
    );
    mockedResolveSearchExecutionPolicy.mockReturnValue(
      TEST_SEARCH_EXECUTION_POLICY,
    );
    mockedCreateFixedStringSearchAggregateBudgetState.mockReturnValue({
      kind: "aggregate-budget-state",
    });
    mockedAssertFormattedFixedStringResponseBudget.mockImplementation(
      (_toolName, formattedOutput) => formattedOutput,
    );
  });

  it("caps the caller result limit at the shared hard cap for single-root fixed-string search", async () => {
    const pathResult = {
      error: null,
      filesSearched: 2,
      matches: [
        {
          content:
            "const SEARCH_FIXED_STRING_TOOL_NAME = \"search_file_contents_by_fixed_string\";",
          file:
            "src/domain/inspection/search-file-contents-by-fixed-string/handler.ts",
          line: 16,
          match: "search_file_contents_by_fixed_string",
        },
      ],
      root: "src",
      totalMatches: 1,
      truncated: false,
    };

    mockedGetSearchFixedStringPathResult.mockResolvedValue(pathResult);
    mockedFormatSearchFixedStringPathOutput.mockReturnValue(
      "formatted fixed-string search output",
    );

    const result = await handleSearchFixedString(
      ["src"],
      "search_file_contents_by_fixed_string",
      ["*.ts"],
      ["**/dist/**"],
      [],
      false,
      REGEX_SEARCH_MAX_RESULTS_HARD_CAP + 25,
      true,
      ["C:/Projects/mcp/server/system/files/mcp-filesystem-extended"],
    );

    expect(mockedGetSearchFixedStringPathResult).toHaveBeenCalledWith(
      "src",
      "search_file_contents_by_fixed_string",
      ["*.ts"],
      ["**/dist/**"],
      [],
      false,
      REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
      true,
      ["C:/Projects/mcp/server/system/files/mcp-filesystem-extended"],
      TEST_SEARCH_EXECUTION_POLICY,
      { kind: "aggregate-budget-state" },
    );
    expect(
      mockedAssertFormattedFixedStringResponseBudget,
    ).toHaveBeenCalledWith(
      "search_file_contents_by_fixed_string",
      "formatted fixed-string search output",
    );
    expect(result).toBe("formatted fixed-string search output");
  });

  it("preserves root-local failures in the structured multi-root fixed-string result", async () => {
    mockedGetSearchFixedStringPathResult
      .mockResolvedValueOnce({
        error: null,
        filesSearched: 4,
        matches: [
          {
            content: "export const SearchFileContentsByFixedStringArgsSchema = z.object({",
            file:
              "src/domain/inspection/search-file-contents-by-fixed-string/schema.ts",
            line: 20,
            match: "SearchFileContentsByFixedStringArgsSchema",
          },
        ],
        root: "src",
        totalMatches: 1,
        truncated: false,
      })
      .mockRejectedValueOnce(new Error("Fixed-string native lane timed out."));

    const result = await getSearchFixedStringResult(
      ["src", "fixtures"],
      "SearchFileContentsByFixedStringArgsSchema",
      ["*.ts"],
      [],
      [],
      false,
      25,
      false,
      ["C:/Projects/mcp/server/system/files/mcp-filesystem-extended"],
    );

    expect(result).toEqual({
      roots: [
        {
          error: null,
          filesSearched: 4,
          matches: [
            {
              content:
                "export const SearchFileContentsByFixedStringArgsSchema = z.object({",
              file:
                "src/domain/inspection/search-file-contents-by-fixed-string/schema.ts",
              line: 20,
              match: "SearchFileContentsByFixedStringArgsSchema",
            },
          ],
          root: "src",
          totalMatches: 1,
          truncated: false,
        },
        {
          error: "Fixed-string native lane timed out.",
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
