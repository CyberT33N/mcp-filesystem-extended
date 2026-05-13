import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
  assertFormattedFixedStringResponseBudget,
  formatSearchFixedStringContinuationAwareTextOutput,
  formatSearchFixedStringPathOutput,
} from "@domain/inspection/search/search-file-contents-by-fixed-string/search-fixed-string-result";
import {
  INSPECTION_RESUME_ADMISSION_OUTCOMES,
  INSPECTION_RESUME_MODES,
  INSPECTION_RESUME_STATUSES,
} from "@domain/shared/resume/inspection-resume-contract";
import { SEARCH_STOP_REASON_LITERALS } from "@domain/inspection/search/search-stop-state";
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
        stopReason: null,
        stopMessage: null,
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
        stopReason: null,
        stopMessage: null,
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

  it("formats resumable fixed-string preview slices as preview progress instead of a hard refusal", () => {
    const output = formatSearchFixedStringContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [
              {
                file: "src/feature.ts",
                line: 12,
                content: "const promptBindingState = buildState();",
                match: "promptBindingState",
              },
            ],
            filesSearched: 55,
            totalMatches: 1,
            truncated: true,
            error: null,
            stopReason: SEARCH_STOP_REASON_LITERALS.EXECUTION_RUNTIME_BUDGET_EXHAUSTED,
            stopMessage: "Tool guardrail refusal: runtime budget exceeded.",
          },
        ],
        totalLocations: 1,
        totalMatches: 1,
        truncated: true,
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
          guidanceText:
            "Preview response. This payload already contains any matches reached inside the current bounded preview slice. Resume the same fixed-string-search request by sending only resumeToken with resumeMode='next-chunk' to the same endpoint to receive the next bounded chunk of matches.",
          scopeReductionGuidanceText:
            "Scope reduction alternative: narrow roots, add includeGlobs, or reduce the search to the relevant subtree.",
        },
        resume: {
          resumeToken: "resume_123",
          resumable: true,
          status: INSPECTION_RESUME_STATUSES.ACTIVE,
          expiresAt: "2026-05-14T12:00:00.000Z",
          supportedResumeModes: [
            INSPECTION_RESUME_MODES.NEXT_CHUNK,
            INSPECTION_RESUME_MODES.COMPLETE_RESULT,
          ],
          recommendedResumeMode: INSPECTION_RESUME_MODES.NEXT_CHUNK,
        },
      },
      "promptBindingState",
      80,
    );

    expect(output).toContain("Found 1 matches in 1 locations");
    expect(output).toContain("Fixed-string-search preview is available for 1 root with 1 matches already reached in this bounded preview slice.");
    expect(output).not.toContain("Search stopped early: Tool guardrail refusal");
  });

  it("tells text-only callers that a fixed-string preview slice reached no matches yet instead of implying final absence", () => {
    const output = formatSearchFixedStringContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [],
            filesSearched: 55,
            totalMatches: 0,
            truncated: true,
            error: null,
            stopReason: SEARCH_STOP_REASON_LITERALS.EXECUTION_RUNTIME_BUDGET_EXHAUSTED,
            stopMessage: "Tool guardrail refusal: runtime budget exceeded.",
          },
        ],
        totalLocations: 0,
        totalMatches: 0,
        truncated: true,
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
          guidanceText:
            "Preview response. This payload already contains any matches reached inside the current bounded preview slice. Resume the same fixed-string-search request by sending only resumeToken with resumeMode='next-chunk' to the same endpoint to receive the next bounded chunk of matches.",
          scopeReductionGuidanceText:
            "Scope reduction alternative: narrow roots, add includeGlobs, or reduce the search to the relevant subtree.",
        },
        resume: {
          resumeToken: "resume_123",
          resumable: true,
          status: INSPECTION_RESUME_STATUSES.ACTIVE,
          expiresAt: "2026-05-14T12:00:00.000Z",
          supportedResumeModes: [
            INSPECTION_RESUME_MODES.NEXT_CHUNK,
            INSPECTION_RESUME_MODES.COMPLETE_RESULT,
          ],
          recommendedResumeMode: INSPECTION_RESUME_MODES.NEXT_CHUNK,
        },
      },
      "promptBindingState",
      80,
    );

    expect(output).toContain("No matches reached yet for fixed string: promptBindingState in this bounded preview slice");
    expect(output).toContain("Searched 55 files in this bounded preview slice");
    expect(output).not.toContain("No matches found for fixed string");
  });
});
