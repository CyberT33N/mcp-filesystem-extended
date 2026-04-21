import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockedRunUgrepSearch } = vi.hoisted(() => ({
  mockedRunUgrepSearch: vi.fn(),
}));

vi.mock("@infrastructure/search/ugrep-runner", () => ({
  runUgrepSearch: mockedRunUgrepSearch,
}));

import { getSearchFixedStringPathResult } from "@domain/inspection/search-file-contents-by-fixed-string/search-fixed-string-path-result";
import { getSearchRegexPathResult } from "@domain/inspection/search-file-contents-by-regex/search-regex-path-result";

const currentDirectoryPath = dirname(fileURLToPath(import.meta.url));
const workspaceRootPath = resolve(currentDirectoryPath, "../../../..");
const fixtureDirectoryRelativePath =
  "test/fixtures/search-explicit-file-scope-contract";
const fixtureFileRelativePath =
  `${fixtureDirectoryRelativePath}/patient-explicit-file-scope.csv`;
const fixtureFileAbsolutePath = resolve(workspaceRootPath, fixtureFileRelativePath);
let fixtureHeaderLine = "";

function createSuccessfulExecutionResult() {
  return {
    exitCode: 0,
    spawnErrorMessage: null,
    stderr: "",
    stdout: `${fixtureFileAbsolutePath}:1:${fixtureHeaderLine}`,
    timedOut: false,
  };
}

describe("explicit file scope search contract", () => {
  beforeAll(async () => {
    const fixtureContent = await readFile(fixtureFileAbsolutePath, "utf8");
    const [headerLine] = fixtureContent.split(/\r?\n/u);

    if (headerLine === undefined || headerLine === "") {
      throw new Error(
        `Fixture '${fixtureFileRelativePath}' must contain a non-empty CSV header line.`,
      );
    }

    fixtureHeaderLine = headerLine;
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

  it("bypasses include globs for explicit fixed-string csv file roots", async () => {
    mockedRunUgrepSearch.mockResolvedValueOnce(createSuccessfulExecutionResult());

    const result = await getSearchFixedStringPathResult(
      fixtureFileRelativePath,
      "PRAXIS1",
      ["**/*.json"],
      [],
      [],
      false,
      10,
      true,
      [workspaceRootPath],
    );

    expect(result.error).toBeNull();
    expect(result.filesSearched).toBe(1);
    expect(result.totalMatches).toBe(1);
    expect(result.matches).toEqual([
      {
        content: fixtureHeaderLine,
        file: fixtureFileAbsolutePath,
        line: 1,
        match: "PRAXIS1",
      },
    ]);
    expect(mockedRunUgrepSearch).toHaveBeenCalledTimes(1);
  });

  it("bypasses include globs for explicit regex csv file roots", async () => {
    mockedRunUgrepSearch.mockResolvedValueOnce(createSuccessfulExecutionResult());

    const result = await getSearchRegexPathResult(
      "search_file_contents_by_regex",
      fixtureFileRelativePath,
      "PRAXIS1",
      ["**/*.json"],
      [],
      [],
      false,
      10,
      true,
      [workspaceRootPath],
    );

    expect(result.error).toBeNull();
    expect(result.filesSearched).toBe(1);
    expect(result.totalMatches).toBe(1);
    expect(result.matches).toEqual([
      {
        content: fixtureHeaderLine,
        file: fixtureFileAbsolutePath,
        line: 1,
        match: "PRAXIS1",
      },
    ]);
    expect(mockedRunUgrepSearch).toHaveBeenCalledTimes(1);
  });

  it("keeps include globs active for fixed-string directory roots", async () => {
    const result = await getSearchFixedStringPathResult(
      fixtureDirectoryRelativePath,
      "PRAXIS1",
      ["**/*.json"],
      [],
      [],
      false,
      10,
      true,
      [workspaceRootPath],
    );

    expect(result.error).toBeNull();
    expect(result.filesSearched).toBe(0);
    expect(result.totalMatches).toBe(0);
    expect(result.matches).toEqual([]);
    expect(mockedRunUgrepSearch).not.toHaveBeenCalled();
  });

  it("keeps include globs active for regex directory roots", async () => {
    const result = await getSearchRegexPathResult(
      "search_file_contents_by_regex",
      fixtureDirectoryRelativePath,
      "PRAXIS1",
      ["**/*.json"],
      [],
      [],
      false,
      10,
      true,
      [workspaceRootPath],
    );

    expect(result.error).toBeNull();
    expect(result.filesSearched).toBe(0);
    expect(result.totalMatches).toBe(0);
    expect(result.matches).toEqual([]);
    expect(mockedRunUgrepSearch).not.toHaveBeenCalled();
  });
});
