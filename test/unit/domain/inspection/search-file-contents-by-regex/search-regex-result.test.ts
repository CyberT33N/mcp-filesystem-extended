import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
  assertFormattedRegexResponseBudget,
  formatSearchRegexContinuationAwareTextOutput,
  formatSearchRegexPathOutput,
} from "@domain/inspection/search/search-file-contents-by-regex/search-regex-result";
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
 * Absolute workspace root used to resolve shared inspection fixtures for formatted regex result tests.
 */
const workspaceRootPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../",
);

/**
 * Resolved explicit file-scope fixture paths used by the formatted regex result tests.
 */
let explicitFileScopeFixturePaths: ResolvedInspectionSearchFixturePaths | undefined;

/**
 * Canonical single-match expectation derived from the shared explicit file-scope fixture.
 */
let explicitFileScopeMatchContract: ExpectedInspectionSearchMatchContract | undefined;

describe("search-regex-result", () => {
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

    const output = formatSearchRegexPathOutput(
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

  it("formats root-local regex failures without hiding the affected root", () => {
    const output = formatSearchRegexPathOutput(
      {
        root: "fixtures",
        matches: [],
        filesSearched: 0,
        totalMatches: 0,
        truncated: false,
        error: "Native regex lane timed out.",
        stopReason: null,
        stopMessage: null,
      },
      "SearchFileContentsByRegexArgsSchema",
      25,
    );

    expect(output).toBe(
      "Regex search failed for root fixtures: Native regex lane timed out.",
    );
  });

  it("returns unchanged formatted output while the regex response stays under budget", () => {
    const formattedOutput = "formatted regex search output";

    expect(
      assertFormattedRegexResponseBudget(
        "search_file_contents_by_regex",
        formattedOutput,
        null,
      ),
    ).toBe(formattedOutput);
  });

  it("formats resumable preview slices as preview progress instead of a hard refusal", () => {
    const output = formatSearchRegexContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [
              {
                file: "src/feature.ts",
                line: 12,
                content: "const effectivePromptManifest = buildManifest();",
                match: "effectivePromptManifest",
              },
            ],
            filesSearched: 58,
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
            "Preview response. This payload already contains any matches reached inside the current bounded preview slice. Resume the same regex-search request by sending only resumeToken with resumeMode='next-chunk' to the same endpoint to receive the next bounded chunk of matches.",
          scopeReductionGuidanceText:
            "Scope reduction alternative: narrow roots, add includeGlobs, or tighten the regex to the intended file set.",
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
      "effectivePromptManifest",
      80,
    );

    expect(output).toContain("Found 1 matches in 1 locations");
    expect(output).toContain("Regex-search preview is available for 1 root with 1 matches already reached in this bounded preview slice.");
    expect(output).not.toContain("Search stopped early: Tool guardrail refusal");
  });

  it("tells text-only callers that a preview slice reached no matches yet instead of implying final absence", () => {
    const output = formatSearchRegexContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [],
            filesSearched: 58,
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
            "Preview response. This payload already contains any matches reached inside the current bounded preview slice. Resume the same regex-search request by sending only resumeToken with resumeMode='next-chunk' to the same endpoint to receive the next bounded chunk of matches.",
          scopeReductionGuidanceText:
            "Scope reduction alternative: narrow roots, add includeGlobs, or tighten the regex to the intended file set.",
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
      "effectivePromptManifest",
      80,
    );

    expect(output).toContain("No matches reached yet for regex: effectivePromptManifest in this bounded preview slice");
    expect(output).toContain("Searched 58 files in this bounded preview slice");
    expect(output).not.toContain("No matches found for regex");
  });
});
