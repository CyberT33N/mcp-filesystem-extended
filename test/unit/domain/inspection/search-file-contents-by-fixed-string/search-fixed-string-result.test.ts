import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
  assertFormattedFixedStringResponseBudget,
  formatSearchFixedStringPathOutput,
} from "@domain/inspection/search-file-contents-by-fixed-string/search-fixed-string-result";
import {
  resolveExplicitFileScopeCsvFixturePaths,
  type ResolvedInspectionSearchFixturePaths,
} from "@test/shared/utils/inspection/search-fixture-loader";
import {
  createExplicitFileScopeHeaderMatchContract,
  createExpectedInspectionSearchMatch,
  type ExpectedInspectionSearchMatchContract,
} from "@test/shared/utils/inspection/search-result-assertions";

/**
 * Absolute workspace root used to resolve shared inspection fixtures for formatted fixed-string result tests.
 */
const workspaceRootPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../",
);

/**
 * Resolved explicit file-scope fixture paths used by the formatted fixed-string result tests.
 */
let explicitFileScopeFixturePaths: ResolvedInspectionSearchFixturePaths | undefined;

/**
 * Canonical single-match expectation derived from the shared explicit file-scope fixture.
 */
let explicitFileScopeMatchContract: ExpectedInspectionSearchMatchContract | undefined;

describe("search-fixed-string-result", () => {
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

  it("formats one shared explicit file-scope match with file and line detail", () => {
    const fixturePaths = explicitFileScopeFixturePaths;
    const matchContract = explicitFileScopeMatchContract;

    if (fixturePaths === undefined || matchContract === undefined) {
      throw new Error("Expected shared explicit file-scope fixture state to be initialized.");
    }

    const output = formatSearchFixedStringPathOutput(
      {
        root: fixturePaths.fileRelativePath,
        matches: [createExpectedInspectionSearchMatch(matchContract)],
        filesSearched: 1,
        totalMatches: 1,
        truncated: false,
        error: null,
      },
      matchContract.expectedMatch,
      10,
    );

    expect(output).toContain("Found 1 matches in 1 locations");
    expect(output).toContain(`File: ${matchContract.expectedFile}`);
    expect(output).toContain(
      `Line ${matchContract.expectedLine}: ${matchContract.expectedContent}`,
    );
  });

  it("formats root-local fixed-string failures without hiding the affected root", () => {
    const output = formatSearchFixedStringPathOutput(
      {
        root: "fixtures",
        matches: [],
        filesSearched: 0,
        totalMatches: 0,
        truncated: false,
        error: "Fixed-string native lane timed out.",
      },
      "SearchFileContentsByFixedStringArgsSchema",
      25,
    );

    expect(output).toBe(
      "Fixed-string search failed for root fixtures: Fixed-string native lane timed out.",
    );
  });

  it("returns unchanged formatted output while the fixed-string response stays under budget", () => {
    const formattedOutput = "formatted fixed-string search output";

    expect(
      assertFormattedFixedStringResponseBudget(
        "search_file_contents_by_fixed_string",
        formattedOutput,
        null,
      ),
    ).toBe(formattedOutput);
  });
});
