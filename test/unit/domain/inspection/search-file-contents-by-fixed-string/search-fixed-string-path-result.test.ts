import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hoisted native fixed-string search runner mock used to stabilize the path-result contract tests.
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

import { getSearchFixedStringPathResult } from "@domain/inspection/search/search-file-contents-by-fixed-string/search-fixed-string-path-result";
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
 * Absolute workspace root used to resolve shared inspection fixtures for the fixed-string path-result tests.
 */
const workspaceRootPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../",
);

/**
 * Resolved explicit file-scope fixture paths used by the shared fixed-string path-result contract tests.
 */
let explicitFileScopeFixturePaths: ResolvedInspectionSearchFixturePaths | undefined;

/**
 * Canonical single-match expectation derived from the shared explicit file-scope fixture.
 */
let explicitFileScopeMatchContract: ExpectedInspectionSearchMatchContract | undefined;

describe("getSearchFixedStringPathResult", () => {
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

    const result = await getSearchFixedStringPathResult({
      searchPath: fixturePaths.fileRelativePath,
      fixedString: fixturePaths.fixture.canonicalSearchToken,
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

    const result = await getSearchFixedStringPathResult({
      searchPath: fixturePaths.rootRelativePath,
      fixedString: fixturePaths.fixture.canonicalSearchToken,
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
      const result = await getSearchFixedStringPathResult({
        searchPath: fixturePaths.rootRelativePath,
        fixedString: fixturePaths.fixture.canonicalSearchToken,
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
      join(tmpdir(), "mcp-fs-fixed-string-complete-result-batch-"),
    );
    const primaryDirectoryPath = join(sandboxRootPath, "primary");
    const secondaryDirectoryPath = join(sandboxRootPath, "secondary", "nested");
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
      await mkdir(primaryDirectoryPath, { recursive: true });
      await mkdir(secondaryDirectoryPath, { recursive: true });
      const filePaths = [
        ...Array.from({ length: 12 }, (_, index) =>
          join(primaryDirectoryPath, `alpha-${index + 1}.ts`)
        ),
        ...Array.from({ length: 8 }, (_, index) =>
          join(secondaryDirectoryPath, `beta-${index + 1}.ts`)
        ),
      ];

      await Promise.all(
        filePaths.map((filePath) =>
          writeFile(filePath, "export const needle = true;\n", "utf8")
        ),
      );

      mockedRunUgrepSearch.mockResolvedValueOnce({
        exitCode: 0,
        spawnErrorMessage: null,
        stderr: "",
        stdout: filePaths
          .map((filePath) => `${filePath}:1:export const needle = true;`)
          .join("\n"),
        timedOut: false,
      });

      const result = await getSearchFixedStringPathResult({
        searchPath: sandboxRootPath,
        fixedString: "needle",
        filePatterns: ["**/*.ts"],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 50,
        caseSensitive: true,
        allowedDirectories: [sandboxRootPath],
        executionPolicy,
        requestedResumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      });

      expect(result.totalMatches).toBe(filePaths.length);
      expect(mockedRunUgrepSearch).toHaveBeenCalledTimes(1);
      expect(mockedRunUgrepSearch.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          args: expect.arrayContaining([expect.stringMatching(/^--from=/)]),
        }),
      );
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });
});
