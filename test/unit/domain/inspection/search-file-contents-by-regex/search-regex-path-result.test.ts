import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hoisted native regex search runner mock used to stabilize the path-result contract tests.
 */
const { mockedGetRequiredUgrepExecutablePath, mockedRunUgrepSearch } = vi.hoisted(() => ({
  mockedGetRequiredUgrepExecutablePath: vi.fn(() => "C:/tools/ugrep.exe"),
  mockedRunUgrepSearch: vi.fn(),
}));

vi.mock("@infrastructure/search/ugrep-runner", () => ({
  runUgrepSearch: mockedRunUgrepSearch,
}));

vi.mock("@infrastructure/runtime/ugrep-runtime-dependency", () => ({
  getRequiredUgrepExecutablePath: mockedGetRequiredUgrepExecutablePath,
}));

import { SEARCH_FILE_CONTENTS_BY_REGEX_TOOL_NAME } from "@domain/inspection/search/search-file-contents-by-regex/schema";
import { getSearchRegexPathResult } from "@domain/inspection/search/search-file-contents-by-regex/search-regex-path-result";
import { INSPECTION_RESUME_MODES } from "@domain/shared/resume/inspection-resume-contract";
import { DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE } from "@domain/shared/runtime/io-capability-profile";
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import * as traversalRuntimeBudget from "@domain/shared/guardrails/traversal-runtime-budget";
import {
  resolveExplicitFileScopeCsvFixturePaths,
  type ResolvedInspectionSearchFixturePaths,
} from "@test/shared/utils/inspection/search-fixture-loader";
import {
  assertDirectoryRootIncludeGlobFilteredResult,
  assertExplicitFileScopeSingleMatchResult,
  createExplicitFileScopeHeaderMatchContract,
  type ExpectedInspectionSearchMatchContract,
} from "@test/shared/utils/inspection/search-result-assertions";

/**
 * Absolute workspace root used to resolve shared inspection fixtures for the regex path-result tests.
 */
const workspaceRootPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../",
);

/**
 * Resolved explicit file-scope fixture paths used by the shared regex path-result contract tests.
 */
let explicitFileScopeFixturePaths: ResolvedInspectionSearchFixturePaths | undefined;

/**
 * Canonical single-match expectation derived from the shared explicit file-scope fixture.
 */
let explicitFileScopeMatchContract: ExpectedInspectionSearchMatchContract | undefined;

describe("getSearchRegexPathResult", () => {
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
    mockedRunUgrepSearch.mockResolvedValue({
      exitCode: 1,
      spawnErrorMessage: null,
      stderr: "",
      stdout: "",
      timedOut: false,
    });
  });

  it("resolves explicit file roots through the shared fixture registry and shared assertions", async () => {
    const fixturePaths = explicitFileScopeFixturePaths;
    const matchContract = explicitFileScopeMatchContract;

    if (fixturePaths === undefined || matchContract === undefined) {
      throw new Error("Expected shared explicit file-scope fixture state to be initialized.");
    }

    mockedRunUgrepSearch.mockResolvedValueOnce({
      exitCode: 0,
      spawnErrorMessage: null,
      stderr: "",
      stdout: `${matchContract.expectedFile}:${matchContract.expectedLine}:${matchContract.expectedContent}`,
      timedOut: false,
    });

    const result = await getSearchRegexPathResult({
      toolName: SEARCH_FILE_CONTENTS_BY_REGEX_TOOL_NAME,
      searchPath: fixturePaths.fileRelativePath,
      pattern: fixturePaths.fixture.canonicalSearchToken,
      filePatterns: ["**/*.json"],
      excludePatterns: [],
      includeExcludedGlobs: [],
      respectGitIgnore: false,
      maxResults: 10,
      caseSensitive: true,
      allowedDirectories: [workspaceRootPath],
    });

    assertExplicitFileScopeSingleMatchResult(result, matchContract);
    expect(result.nextContinuationState).toBeNull();
    expect(mockedRunUgrepSearch).toHaveBeenCalledTimes(1);
  });

  it("keeps include globs active for directory roots through the shared fixture registry", async () => {
    const fixturePaths = explicitFileScopeFixturePaths;

    if (fixturePaths === undefined) {
      throw new Error("Expected shared explicit file-scope fixture state to be initialized.");
    }

    const result = await getSearchRegexPathResult({
      toolName: SEARCH_FILE_CONTENTS_BY_REGEX_TOOL_NAME,
      searchPath: fixturePaths.rootRelativePath,
      pattern: fixturePaths.fixture.canonicalSearchToken,
      filePatterns: ["**/*.json"],
      excludePatterns: [],
      includeExcludedGlobs: [],
      respectGitIgnore: false,
      maxResults: 10,
      caseSensitive: true,
      allowedDirectories: [workspaceRootPath],
    });

    assertDirectoryRootIncludeGlobFilteredResult(result);
    expect(result.nextContinuationState).toBeNull();
    expect(mockedRunUgrepSearch).not.toHaveBeenCalled();
  });

  it("disables the local soft runtime timeout for preview-family complete-result traversal", async () => {
    const fixturePaths = explicitFileScopeFixturePaths;

    if (fixturePaths === undefined) {
      throw new Error("Expected shared explicit file-scope fixture state to be initialized.");
    }

    const assertTraversalRuntimeBudgetSpy = vi.spyOn(
      traversalRuntimeBudget,
      "assertTraversalRuntimeBudget",
    );
    const executionPolicy = {
      ...resolveSearchExecutionPolicy(DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE),
      traversalInlineEntryBudget: 0,
      traversalInlineDirectoryBudget: 0,
      traversalPreviewFirstEntryBudget: 100,
      traversalPreviewFirstDirectoryBudget: 100,
      traversalPreviewExecutionEntryBudget: 100,
      traversalPreviewExecutionDirectoryBudget: 100,
    };

    try {
      const result = await getSearchRegexPathResult({
        toolName: SEARCH_FILE_CONTENTS_BY_REGEX_TOOL_NAME,
        searchPath: fixturePaths.rootRelativePath,
        pattern: fixturePaths.fixture.canonicalSearchToken,
        filePatterns: ["**/*.json"],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 10,
        caseSensitive: true,
        allowedDirectories: [workspaceRootPath],
        executionPolicy,
        requestedResumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      });

      expect(result.admissionOutcome).toBe("preview-first");
      expect(
        assertTraversalRuntimeBudgetSpy.mock.calls.some(([, , , , limits]) =>
          limits?.softTimeBudgetMs === null
        ),
      ).toBe(true);
    } finally {
      assertTraversalRuntimeBudgetSpy.mockRestore();
    }
  });

  it("uses native ugrep batching for complete-result traversal after preview-first admission", async () => {
    const sandboxRootPath = await mkdtemp(
      join(tmpdir(), "mcp-fs-regex-complete-result-batch-"),
    );
    const alphaFilePath = join(sandboxRootPath, "alpha.ts");
    const betaFilePath = join(sandboxRootPath, "beta.ts");
    const executionPolicy = {
      ...resolveSearchExecutionPolicy(DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE),
      traversalInlineEntryBudget: 0,
      traversalInlineDirectoryBudget: 0,
      traversalPreviewFirstEntryBudget: 100,
      traversalPreviewFirstDirectoryBudget: 100,
      traversalPreviewExecutionEntryBudget: 100,
      traversalPreviewExecutionDirectoryBudget: 100,
    };

    try {
      await writeFile(alphaFilePath, "export const needle = true;\n", "utf8");
      await writeFile(betaFilePath, "export const needle = true;\n", "utf8");

      mockedRunUgrepSearch.mockResolvedValueOnce({
        exitCode: 0,
        spawnErrorMessage: null,
        stderr: "",
        stdout: `${alphaFilePath}:1:export const needle = true;\n${betaFilePath}:1:export const needle = true;`,
        timedOut: false,
      });

      const result = await getSearchRegexPathResult({
        toolName: SEARCH_FILE_CONTENTS_BY_REGEX_TOOL_NAME,
        searchPath: sandboxRootPath,
        pattern: "needle",
        filePatterns: ["**/*.ts"],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 10,
        caseSensitive: true,
        allowedDirectories: [sandboxRootPath],
        executionPolicy,
        requestedResumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      });

      expect(result.totalMatches).toBe(2);
      expect(mockedRunUgrepSearch).toHaveBeenCalledTimes(1);
      expect(mockedRunUgrepSearch.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          args: expect.arrayContaining([alphaFilePath, betaFilePath]),
        }),
      );
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });
});
