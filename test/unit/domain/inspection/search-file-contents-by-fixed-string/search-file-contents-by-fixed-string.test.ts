import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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
  "@domain/inspection/search/search-file-contents-by-fixed-string/fixed-string-search-aggregate-budget-state",
  () => ({
    createFixedStringSearchAggregateBudgetState:
      mockedCreateFixedStringSearchAggregateBudgetState,
  }),
);

vi.mock(
  "@domain/inspection/search/search-file-contents-by-fixed-string/search-fixed-string-path-result",
  () => ({
    getSearchFixedStringPathResult: mockedGetSearchFixedStringPathResult,
  }),
);

vi.mock(
  "@domain/inspection/search/search-file-contents-by-fixed-string/search-fixed-string-result",
  () => ({
    assertFormattedFixedStringResponseBudget:
      mockedAssertFormattedFixedStringResponseBudget,
    formatSearchFixedStringContinuationAwareTextOutput:
      mockedFormatSearchFixedStringContinuationAwareTextOutput,
  }),
);

import { REGEX_SEARCH_MAX_RESULTS_HARD_CAP } from "@domain/shared/guardrails/tool-guardrail-limits";
import { INSPECTION_RESUME_MODES } from "@domain/shared/resume/inspection-resume-contract";
import { InspectionResumeSessionSqliteStore } from "@infrastructure/persistence/inspection-resume-session-sqlite-store";
import { SearchFileContentsByFixedStringArgsSchema } from "@domain/inspection/search/search-file-contents-by-fixed-string/schema";
import {
  CpuRegexTier,
  DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE,
  RuntimeConfidenceTier,
  SourceReadTier,
} from "@domain/shared/runtime/io-capability-profile";
import {
  buildSearchFixedStringToolResult,
  getSearchFixedStringResult,
  handleSearchFixedString,
} from "@domain/inspection/search/search-file-contents-by-fixed-string/handler";
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
            "src/domain/inspection/search/search-file-contents-by-fixed-string/handler.ts",
          line: 16,
          match: "search_file_contents_by_fixed_string",
        },
      ],
      nextContinuationState: null,
      root: "src",
      totalMatches: 1,
      truncated: false,
      traversalInlineExecutionBudgetMs: 4_000,
      traversalInlineCandidateFileBudget: 8_000,
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

  it("builds text and structured fixed-string tool surfaces from one shared execution result", async () => {
    const pathResult = {
      admissionOutcome: "inline",
      error: null,
      filesSearched: 2,
      matches: [],
      nextContinuationState: null,
      root: "src",
      totalMatches: 0,
      truncated: false,
    };

    mockedGetSearchFixedStringPathResult.mockResolvedValue(pathResult);
    mockedFormatSearchFixedStringContinuationAwareTextOutput.mockReturnValue(
      "formatted fixed-string search output",
    );

    const toolResult = await buildSearchFixedStringToolResult({
      resumeToken: undefined,
      resumeMode: undefined,
      searchPaths: ["src"],
      fixedString: "search_file_contents_by_fixed_string",
      filePatterns: ["*.ts"],
      excludePatterns: [],
      includeExcludedGlobs: [],
      respectGitIgnore: false,
      maxResults: 10,
      caseSensitive: true,
      allowedDirectories: ["C:/Projects/mcp/server/system/files/mcp-filesystem-extended"],
      inspectionResumeSessionStore: undefined,
    });

    expect(toolResult.text).toBe("formatted fixed-string search output");
    expect(toolResult.result).toMatchObject({
      roots: [
        expect.objectContaining({
          root: "src",
        }),
      ],
      totalLocations: 0,
      totalMatches: 0,
      truncated: false,
    });
    expect(mockedGetSearchFixedStringPathResult).toHaveBeenCalledTimes(1);
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

  it("persists session-cumulative delivered totals when a preview-first base pass creates the session", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-handler-resume-"));
    const store = new InspectionResumeSessionSqliteStore(
      join(sandboxRootPath, "sessions.sqlite"),
    );

    try {
      mockedGetSearchFixedStringPathResult.mockResolvedValue({
        admissionOutcome: "preview-first",
        error: null,
        filesSearched: 5,
        matches: [
          {
            content: "referenced by their project numbers;",
            file: "src/foundation.mdc",
            line: 398,
            match: "project number",
          },
        ],
        nextContinuationState: {
          traversalFrames: [{ directoryRelativePath: "", nextEntryIndex: 5 }],
          activeFileRelativePath: null,
          activeFileMatchOffset: 0,
        },
        root: "src",
        totalMatches: 1,
        truncated: true,
      });

      const result = await getSearchFixedStringResult({
        resumeToken: undefined,
        resumeMode: undefined,
        searchPaths: ["src"],
        fixedString: "project number",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 100,
        caseSensitive: false,
        allowedDirectories: [sandboxRootPath],
        inspectionResumeSessionStore: store,
      });

      expect(result.resume.resumable).toBe(true);
      expect(result.sessionDelivery).toEqual({
        continuationPass: false,
        previouslyDeliveredCount: 0,
        previouslyDeliveredLocationCount: 0,
        sessionTotalCount: 1,
        sessionTotalLocationCount: 1,
      });

      const activeResumeToken = result.resume.resumeToken;

      if (activeResumeToken === null) {
        throw new Error("Expected an active resume token for the preview-first base pass.");
      }

      const persistedSession = store.loadActiveSession(
        activeResumeToken,
        "search_file_contents_by_fixed_string",
        "search_file_contents_by_fixed_string",
      );

      expect(persistedSession?.resumeState).toMatchObject({
        deliveredTotals: {
          matchCount: 1,
          locationCount: 1,
        },
      });
    } finally {
      store.close();
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("reports the session-cumulative delivery on the terminal completion pass of a resumed session", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-handler-terminal-"));
    const store = new InspectionResumeSessionSqliteStore(
      join(sandboxRootPath, "sessions.sqlite"),
    );

    try {
      const seededSession = store.createSession({
        endpointName: "search_file_contents_by_fixed_string",
        familyMember: "search_file_contents_by_fixed_string",
        requestPayload: {
          searchPaths: ["src"],
          fixedString: "project number",
          filePatterns: [],
          excludePatterns: [],
          includeExcludedGlobs: [],
          respectGitIgnore: false,
          maxResults: 100,
          caseSensitive: false,
        },
        resumeState: {
          rootTraversalStates: {
            src: {
              traversalFrames: [{ directoryRelativePath: "", nextEntryIndex: 5 }],
              activeFileRelativePath: null,
              activeFileMatchOffset: 0,
            },
          },
          deliveredTotals: {
            matchCount: 1,
            locationCount: 1,
          },
        },
        admissionOutcome: "preview-first",
      });

      mockedGetSearchFixedStringPathResult.mockResolvedValue({
        admissionOutcome: "preview-first",
        error: null,
        filesSearched: 57,
        matches: [],
        nextContinuationState: null,
        root: "src",
        totalMatches: 0,
        truncated: false,
      });

      const result = await getSearchFixedStringResult({
        resumeToken: seededSession.resumeToken,
        resumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
        searchPaths: [],
        fixedString: "",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 100,
        caseSensitive: false,
        allowedDirectories: [sandboxRootPath],
        inspectionResumeSessionStore: store,
      });

      expect(result.sessionDelivery).toEqual({
        continuationPass: true,
        previouslyDeliveredCount: 1,
        previouslyDeliveredLocationCount: 1,
        sessionTotalCount: 1,
        sessionTotalLocationCount: 1,
      });
      expect(result.resume.resumable).toBe(false);
      expect(result.admission.outcome).toBe("completion-backed-required");
      expect(result.admission.guidanceText).toContain(
        "Combine with the prior preview-chunk payload",
      );

      const actualResultModule = await vi.importActual<
        typeof import("@domain/inspection/search/search-file-contents-by-fixed-string/search-fixed-string-result")
      >("@domain/inspection/search/search-file-contents-by-fixed-string/search-fixed-string-result");

      mockedFormatSearchFixedStringContinuationAwareTextOutput.mockImplementation(
        actualResultModule.formatSearchFixedStringContinuationAwareTextOutput,
      );

      const toolResult = await buildSearchFixedStringToolResult({
        resumeToken: seededSession.resumeToken,
        resumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
        searchPaths: [],
        fixedString: "",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 100,
        caseSensitive: false,
        allowedDirectories: [sandboxRootPath],
        inspectionResumeSessionStore: store,
      });

      expect(toolResult.text).not.toContain("No matches found for fixed string");
      expect(toolResult.text).toContain(
        "No additional matches found for fixed string: project number in this completion pass",
      );
      expect(toolResult.text).toContain(
        "session total 1 matches in 1 locations (1 already delivered in prior preview-chunk payloads)",
      );
      expect(
        store.loadActiveSession(
          seededSession.resumeToken,
          "search_file_contents_by_fixed_string",
          "search_file_contents_by_fixed_string",
        ),
      ).toBeNull();
    } finally {
      store.close();
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("persists updated delivered totals on a non-terminal complete-result resume pass", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-handler-progress-"));
    const store = new InspectionResumeSessionSqliteStore(
      join(sandboxRootPath, "sessions.sqlite"),
    );

    try {
      const seededSession = store.createSession({
        endpointName: "search_file_contents_by_fixed_string",
        familyMember: "search_file_contents_by_fixed_string",
        requestPayload: {
          searchPaths: ["src"],
          fixedString: "needle",
          filePatterns: [],
          excludePatterns: [],
          includeExcludedGlobs: [],
          respectGitIgnore: false,
          maxResults: 100,
          caseSensitive: false,
        },
        resumeState: {
          rootTraversalStates: {
            src: {
              traversalFrames: [{ directoryRelativePath: "", nextEntryIndex: 5 }],
              activeFileRelativePath: null,
              activeFileMatchOffset: 0,
            },
          },
          deliveredTotals: {
            matchCount: 1,
            locationCount: 1,
          },
        },
        admissionOutcome: "preview-first",
      });

      mockedGetSearchFixedStringPathResult.mockResolvedValue({
        admissionOutcome: "preview-first",
        error: null,
        filesSearched: 12,
        matches: [
          {
            content: "const needle = true;",
            file: "src/late.ts",
            line: 7,
            match: "needle",
          },
        ],
        nextContinuationState: {
          traversalFrames: [{ directoryRelativePath: "", nextEntryIndex: 12 }],
          activeFileRelativePath: null,
          activeFileMatchOffset: 0,
        },
        root: "src",
        totalMatches: 1,
        truncated: true,
      });

      const result = await getSearchFixedStringResult({
        resumeToken: seededSession.resumeToken,
        resumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
        searchPaths: [],
        fixedString: "",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 100,
        caseSensitive: false,
        allowedDirectories: [sandboxRootPath],
        inspectionResumeSessionStore: store,
      });

      expect(result.sessionDelivery).toEqual({
        continuationPass: true,
        previouslyDeliveredCount: 1,
        previouslyDeliveredLocationCount: 1,
        sessionTotalCount: 2,
        sessionTotalLocationCount: 2,
      });
      expect(result.resume.resumable).toBe(true);
      expect(result.admission.guidanceText).toContain("More work remains");

      const persistedSession = store.loadActiveSession(
        seededSession.resumeToken,
        "search_file_contents_by_fixed_string",
        "search_file_contents_by_fixed_string",
      );

      expect(persistedSession?.resumeState).toMatchObject({
        deliveredTotals: {
          matchCount: 2,
          locationCount: 2,
        },
      });
    } finally {
      store.close();
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("completes the session with the carried delivery summary when no active roots remain", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-handler-empty-roots-"));
    const store = new InspectionResumeSessionSqliteStore(
      join(sandboxRootPath, "sessions.sqlite"),
    );

    try {
      const seededSession = store.createSession({
        endpointName: "search_file_contents_by_fixed_string",
        familyMember: "search_file_contents_by_fixed_string",
        requestPayload: {
          searchPaths: ["src"],
          fixedString: "needle",
          filePatterns: [],
          excludePatterns: [],
          includeExcludedGlobs: [],
          respectGitIgnore: false,
          maxResults: 100,
          caseSensitive: false,
        },
        resumeState: {
          rootTraversalStates: {
            other: {
              traversalFrames: [{ directoryRelativePath: "", nextEntryIndex: 5 }],
              activeFileRelativePath: null,
              activeFileMatchOffset: 0,
            },
          },
          deliveredTotals: {
            matchCount: 4,
            locationCount: 3,
          },
        },
        admissionOutcome: "preview-first",
      });

      const result = await getSearchFixedStringResult({
        resumeToken: seededSession.resumeToken,
        resumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
        searchPaths: [],
        fixedString: "",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 100,
        caseSensitive: false,
        allowedDirectories: [sandboxRootPath],
        inspectionResumeSessionStore: store,
      });

      expect(result.roots).toEqual([]);
      expect(result.sessionDelivery).toEqual({
        continuationPass: true,
        previouslyDeliveredCount: 4,
        previouslyDeliveredLocationCount: 3,
        sessionTotalCount: 4,
        sessionTotalLocationCount: 3,
      });
      expect(mockedGetSearchFixedStringPathResult).not.toHaveBeenCalled();
      expect(
        store.loadActiveSession(
          seededSession.resumeToken,
          "search_file_contents_by_fixed_string",
          "search_file_contents_by_fixed_string",
        ),
      ).toBeNull();
    } finally {
      store.close();
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("rejects resume requests when resume-session storage is unavailable", async () => {
    await expect(
      getSearchFixedStringResult({
        resumeToken: "insresume_unknown",
        resumeMode: INSPECTION_RESUME_MODES.NEXT_CHUNK,
        searchPaths: [],
        fixedString: "",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 100,
        caseSensitive: false,
        allowedDirectories: [],
        inspectionResumeSessionStore: undefined,
      }),
    ).rejects.toThrow("Resume-session storage is unavailable for fixed-string-search resume requests.");
  });

  it("rejects resume requests whose token resolves to no active session", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-handler-unknown-token-"));
    const store = new InspectionResumeSessionSqliteStore(
      join(sandboxRootPath, "sessions.sqlite"),
    );

    try {
      await expect(
        getSearchFixedStringResult({
          resumeToken: "insresume_00000000-0000-0000-0000-000000000000",
          resumeMode: INSPECTION_RESUME_MODES.NEXT_CHUNK,
          searchPaths: [],
          fixedString: "",
          filePatterns: [],
          excludePatterns: [],
          includeExcludedGlobs: [],
          respectGitIgnore: false,
          maxResults: 100,
          caseSensitive: false,
          allowedDirectories: [sandboxRootPath],
          inspectionResumeSessionStore: store,
        }),
      ).rejects.toThrow("could not be fulfilled because the supplied resume token does not resolve to an active server-owned resume session");
    } finally {
      store.close();
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("rejects a preview-first fixed-string base response when resume-session storage is unavailable", async () => {
    mockedGetSearchFixedStringPathResult.mockResolvedValue({
      admissionOutcome: "preview-first",
      error: null,
      filesSearched: 5,
      matches: [],
      nextContinuationState: {
        traversalFrames: [{ directoryRelativePath: "", nextEntryIndex: 5 }],
        activeFileRelativePath: null,
        activeFileMatchOffset: 0,
      },
      root: "src",
      totalMatches: 0,
      truncated: true,
    });

    await expect(
      getSearchFixedStringResult({
        resumeToken: undefined,
        resumeMode: undefined,
        searchPaths: ["src"],
        fixedString: "needle",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 100,
        caseSensitive: false,
        allowedDirectories: [],
        inspectionResumeSessionStore: undefined,
      }),
    ).rejects.toThrow("Resume-session storage is unavailable for preview-first fixed-string search.");
  });

  it("falls back to the persisted resume mode and then to next-chunk when the resume request carries no mode", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-handler-mode-fallback-"));
    const store = new InspectionResumeSessionSqliteStore(
      join(sandboxRootPath, "sessions.sqlite"),
    );

    try {
      mockedGetSearchFixedStringPathResult.mockResolvedValue({
        admissionOutcome: "preview-first",
        error: null,
        filesSearched: 12,
        matches: [],
        nextContinuationState: {
          traversalFrames: [{ directoryRelativePath: "", nextEntryIndex: 12 }],
          activeFileRelativePath: null,
          activeFileMatchOffset: 0,
        },
        root: "src",
        totalMatches: 0,
        truncated: true,
      });

      const seededWithMode = store.createSession({
        endpointName: "search_file_contents_by_fixed_string",
        familyMember: "search_file_contents_by_fixed_string",
        requestPayload: {
          searchPaths: ["src"],
          fixedString: "needle",
          filePatterns: [],
          excludePatterns: [],
          includeExcludedGlobs: [],
          respectGitIgnore: false,
          maxResults: 100,
          caseSensitive: false,
        },
        resumeState: {
          rootTraversalStates: {
            src: {
              traversalFrames: [{ directoryRelativePath: "", nextEntryIndex: 5 }],
              activeFileRelativePath: null,
              activeFileMatchOffset: 0,
            },
          },
          deliveredTotals: { matchCount: 1, locationCount: 1 },
        },
        admissionOutcome: "preview-first",
        lastRequestedResumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      });

      const persistedModeResult = await getSearchFixedStringResult({
        resumeToken: seededWithMode.resumeToken,
        resumeMode: undefined,
        searchPaths: [],
        fixedString: "",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 100,
        caseSensitive: false,
        allowedDirectories: [sandboxRootPath],
        inspectionResumeSessionStore: store,
      });

      expect(persistedModeResult.admission.outcome).toBe("completion-backed-required");
      expect(persistedModeResult.admission.guidanceText).toContain("More work remains");

      const seededWithoutMode = store.createSession({
        endpointName: "search_file_contents_by_fixed_string",
        familyMember: "search_file_contents_by_fixed_string",
        requestPayload: {
          searchPaths: ["src"],
          fixedString: "needle",
          filePatterns: [],
          excludePatterns: [],
          includeExcludedGlobs: [],
          respectGitIgnore: false,
          maxResults: 100,
          caseSensitive: false,
        },
        resumeState: {
          rootTraversalStates: {
            src: {
              traversalFrames: [{ directoryRelativePath: "", nextEntryIndex: 5 }],
              activeFileRelativePath: null,
              activeFileMatchOffset: 0,
            },
          },
          deliveredTotals: { matchCount: 1, locationCount: 1 },
        },
        admissionOutcome: "preview-first",
      });

      const defaultModeResult = await getSearchFixedStringResult({
        resumeToken: seededWithoutMode.resumeToken,
        resumeMode: undefined,
        searchPaths: [],
        fixedString: "",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 100,
        caseSensitive: false,
        allowedDirectories: [sandboxRootPath],
        inspectionResumeSessionStore: store,
      });

      expect(defaultModeResult.admission.outcome).toBe("preview-first");
    } finally {
      store.close();
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("preserves non-Error root failures as plain text in the fixed-string result surface", async () => {
    mockedGetSearchFixedStringPathResult.mockRejectedValue("plain lane failure");

    const result = await getSearchFixedStringResult({
      resumeToken: undefined,
      resumeMode: undefined,
      searchPaths: ["src"],
      fixedString: "needle",
      filePatterns: [],
      excludePatterns: [],
      includeExcludedGlobs: [],
      respectGitIgnore: false,
      maxResults: 100,
      caseSensitive: false,
      allowedDirectories: [],
      inspectionResumeSessionStore: undefined,
    });

    expect(result.roots[0]).toMatchObject({
      error: "plain lane failure",
      root: "src",
    });
  });

  it("enforces the fixed-string base-request and resume-only schema rules", () => {
    expect(
      SearchFileContentsByFixedStringArgsSchema.safeParse({
        roots: ["src"],
        fixedString: "needle",
      }).success,
    ).toBe(true);

    expect(
      SearchFileContentsByFixedStringArgsSchema.safeParse({
        fixedString: "needle",
      }).success,
    ).toBe(false);

    expect(
      SearchFileContentsByFixedStringArgsSchema.safeParse({
        roots: ["src"],
      }).success,
    ).toBe(false);

    expect(
      SearchFileContentsByFixedStringArgsSchema.safeParse({
        resumeToken: "insresume_123",
        resumeMode: INSPECTION_RESUME_MODES.NEXT_CHUNK,
      }).success,
    ).toBe(true);

    expect(
      SearchFileContentsByFixedStringArgsSchema.safeParse({
        resumeToken: "insresume_123",
        resumeMode: INSPECTION_RESUME_MODES.NEXT_CHUNK,
        roots: ["src"],
      }).success,
    ).toBe(false);

    expect(
      SearchFileContentsByFixedStringArgsSchema.safeParse({
        resumeToken: "insresume_123",
      }).success,
    ).toBe(false);

    expect(
      SearchFileContentsByFixedStringArgsSchema.safeParse({
        resumeMode: INSPECTION_RESUME_MODES.NEXT_CHUNK,
      }).success,
    ).toBe(false);
  });
});
