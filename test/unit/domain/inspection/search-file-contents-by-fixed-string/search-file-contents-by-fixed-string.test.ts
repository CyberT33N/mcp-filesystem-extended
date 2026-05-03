import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockedAssertFormattedFixedStringResponseBudget,
  mockedCreateFixedStringSearchAggregateBudgetState,
  mockedDetectIoCapabilityProfile,
  mockedFormatSearchFixedStringContinuationAwareTextOutput,
  mockedGetSearchFixedStringPathResult,
  mockedResolveSearchExecutionPolicy,
} = vi.hoisted(() => ({
  mockedAssertFormattedFixedStringResponseBudget: vi.fn(),
  mockedCreateFixedStringSearchAggregateBudgetState: vi.fn(),
  mockedDetectIoCapabilityProfile: vi.fn(),
  mockedFormatSearchFixedStringContinuationAwareTextOutput: vi.fn(),
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
    formatSearchFixedStringContinuationAwareTextOutput:
      mockedFormatSearchFixedStringContinuationAwareTextOutput,
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
import {
  resolveExplicitFileScopeCsvFixturePaths,
  type ResolvedInspectionSearchFixturePaths,
} from "@test/shared/utils/inspection/search-fixture-loader";
import {
  createExplicitFileScopeHeaderMatchContract,
  createExpectedInspectionSearchMatch,
  type ExpectedInspectionSearchMatchContract,
} from "@test/shared/utils/inspection/search-result-assertions";

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

const workspaceRootPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../",
);

let explicitFileScopeFixturePaths: ResolvedInspectionSearchFixturePaths | undefined;
let explicitFileScopeMatchContract: ExpectedInspectionSearchMatchContract | undefined;

describe("search_file_contents_by_fixed_string", () => {
  beforeAll(async () => {
    const fixturePaths = resolveExplicitFileScopeCsvFixturePaths(workspaceRootPath);
    const fixtureContent = await readFile(fixturePaths.fileAbsolutePath, "utf8");
    const [headerLine] = fixtureContent.split(/\r?\n/u);

    if (headerLine === undefined || headerLine === "") {
      throw new Error(
        `Fixture '${fixturePaths.fileRelativePath}' must contain a non-empty CSV header line.`,
      );
    }

    explicitFileScopeFixturePaths = fixturePaths;
    explicitFileScopeMatchContract = createExplicitFileScopeHeaderMatchContract(
      fixturePaths,
      headerLine,
    );
  });

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
      admissionOutcome: "inline",
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
      nextContinuationState: null,
      root: "src",
      totalMatches: 1,
      truncated: false,
    };

    mockedGetSearchFixedStringPathResult.mockResolvedValue(pathResult);
    mockedFormatSearchFixedStringContinuationAwareTextOutput.mockReturnValue(
      "formatted fixed-string search output",
    );

    const result = await handleSearchFixedString({
      resumeToken: undefined,
      resumeMode: undefined,
      searchPaths: ["src"],
      fixedString: "search_file_contents_by_fixed_string",
      filePatterns: ["*.ts"],
      excludePatterns: ["**/dist/**"],
      includeExcludedGlobs: [],
      respectGitIgnore: false,
      maxResults: REGEX_SEARCH_MAX_RESULTS_HARD_CAP + 25,
      caseSensitive: true,
      allowedDirectories: ["C:/Projects/mcp/server/system/files/mcp-filesystem-extended"],
      inspectionResumeSessionStore: undefined,
    });

    expect(mockedGetSearchFixedStringPathResult).toHaveBeenCalledWith(
      expect.objectContaining({
        searchPath: "src",
        fixedString: "search_file_contents_by_fixed_string",
        filePatterns: ["*.ts"],
        excludePatterns: ["**/dist/**"],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
        caseSensitive: true,
        allowedDirectories: ["C:/Projects/mcp/server/system/files/mcp-filesystem-extended"],
        executionPolicy: TEST_SEARCH_EXECUTION_POLICY,
        aggregateBudgetState: { kind: "aggregate-budget-state" },
        batchRootCount: 1,
        continuationState: null,
        requestedResumeMode: null,
      }),
    );
    expect(
      mockedFormatSearchFixedStringContinuationAwareTextOutput,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        roots: [
          expect.objectContaining({
            root: "src",
            totalMatches: 1,
            truncated: false,
          }),
        ],
        totalLocations: 1,
        totalMatches: 1,
        truncated: false,
      }),
      "search_file_contents_by_fixed_string",
      REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
    );
    expect(
      mockedAssertFormattedFixedStringResponseBudget,
    ).toHaveBeenCalledWith(
      "search_file_contents_by_fixed_string",
      "formatted fixed-string search output",
      null,
    );
    expect(result).toBe("formatted fixed-string search output");
  });

  it("reuses the shared explicit file-scope fixture in the structured multi-root fixed-string result", async () => {
    const fixturePaths = explicitFileScopeFixturePaths;
    const matchContract = explicitFileScopeMatchContract;

    if (fixturePaths === undefined || matchContract === undefined) {
      throw new Error("Expected shared explicit file-scope fixture state to be initialized.");
    }

    mockedGetSearchFixedStringPathResult
      .mockResolvedValueOnce({
        admissionOutcome: "inline",
        error: null,
        filesSearched: 1,
        matches: [createExpectedInspectionSearchMatch(matchContract)],
        nextContinuationState: null,
        root: fixturePaths.fileRelativePath,
        totalMatches: 1,
        truncated: false,
      })
      .mockRejectedValueOnce(new Error("Fixed-string native lane timed out."));

    const result = await getSearchFixedStringResult({
      resumeToken: undefined,
      resumeMode: undefined,
      searchPaths: [fixturePaths.fileRelativePath, "fixtures"],
      fixedString: matchContract.expectedMatch,
      filePatterns: ["**/*.json"],
      excludePatterns: [],
      includeExcludedGlobs: [],
      respectGitIgnore: false,
      maxResults: 25,
      caseSensitive: true,
      allowedDirectories: [workspaceRootPath],
      inspectionResumeSessionStore: undefined,
    });

    expect(mockedGetSearchFixedStringPathResult).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        searchPath: fixturePaths.fileRelativePath,
        fixedString: matchContract.expectedMatch,
        filePatterns: ["**/*.json"],
        allowedDirectories: [workspaceRootPath],
        batchRootCount: 2,
      }),
    );
    expect(mockedGetSearchFixedStringPathResult).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        searchPath: "fixtures",
        fixedString: matchContract.expectedMatch,
        filePatterns: ["**/*.json"],
        allowedDirectories: [workspaceRootPath],
        batchRootCount: 2,
      }),
    );

    expect(result).toMatchObject({
      roots: [
        {
          error: null,
          filesSearched: 1,
          matches: [createExpectedInspectionSearchMatch(matchContract)],
          root: fixturePaths.fileRelativePath,
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
