import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hoisted native fixed-string search runner mock used to stabilize the path-result contract tests.
 */
const { mockedRunUgrepSearch } = vi.hoisted(() => ({
  mockedRunUgrepSearch: vi.fn(),
}));

vi.mock("@infrastructure/search/ugrep-runner", () => ({
  runUgrepSearch: mockedRunUgrepSearch,
}));

import { getSearchFixedStringPathResult } from "@domain/inspection/search-file-contents-by-fixed-string/search-fixed-string-path-result";
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
});
