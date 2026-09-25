import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
  assertFormattedFixedStringResponseBudget,
  formatSearchFixedStringContinuationAwareTextOutput,
  formatSearchFixedStringPathOutput,
  formatSearchFixedStringResultOutput,
} from "@domain/inspection/search/search-file-contents-by-fixed-string/search-fixed-string-result";
import {
  INSPECTION_RESUME_ADMISSION_OUTCOMES,
  INSPECTION_RESUME_MODES,
  INSPECTION_RESUME_STATUSES,
  type InspectionResumeMetadata,
} from "@domain/shared/resume/inspection-resume-contract";
import { SEARCH_STOP_REASON_LITERALS } from "@domain/inspection/search/search-stop-state";
import { type SearchSessionDeliverySummary } from "@domain/inspection/search/search-session-delivery";
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
        sessionDelivery: {
          continuationPass: false,
          previouslyDeliveredCount: 0,
          previouslyDeliveredLocationCount: 0,
          sessionTotalCount: 1,
          sessionTotalLocationCount: 1,
        },
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
        sessionDelivery: {
          continuationPass: false,
          previouslyDeliveredCount: 0,
          previouslyDeliveredLocationCount: 0,
          sessionTotalCount: 0,
          sessionTotalLocationCount: 0,
        },
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

  it("never presents a terminal fixed-string completion delta as the absolute session result", () => {
    const output = formatSearchFixedStringContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [],
            filesSearched: 57,
            totalMatches: 0,
            truncated: false,
            error: null,
            stopReason: null,
            stopMessage: null,
          },
        ],
        totalLocations: 0,
        totalMatches: 0,
        truncated: false,
        sessionDelivery: {
          continuationPass: true,
          previouslyDeliveredCount: 1,
          previouslyDeliveredLocationCount: 1,
          sessionTotalCount: 1,
          sessionTotalLocationCount: 1,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
          guidanceText:
            "Continuation response. This payload contains entries from the persisted frontier position onward. Combine with the prior preview-chunk payload for the complete dataset.",
          scopeReductionGuidanceText:
            "Scope reduction alternative: narrow roots, add includeGlobs, or reduce the search to the relevant subtree.",
        },
        resume: {
          resumeToken: null,
          resumable: false,
          status: null,
          expiresAt: null,
          supportedResumeModes: [
            INSPECTION_RESUME_MODES.NEXT_CHUNK,
            INSPECTION_RESUME_MODES.COMPLETE_RESULT,
          ],
          recommendedResumeMode: null,
        },
      },
      "project number",
      400,
    );

    expect(output).not.toContain("No matches found for fixed string");
    expect(output).toContain("No additional matches found for fixed string: project number in this completion pass");
    expect(output).toContain("Searched 57 files in this completion pass");
    expect(output).toContain(
      "Fixed-string-search completion finished for 1 root: 0 additional matches in 0 locations in this final pass; session total 1 matches in 1 locations (1 already delivered in prior preview-chunk payloads).",
    );
    expect(output).toContain("Combine with the prior preview-chunk payload for the complete dataset.");
  });

  it("formats a terminal fixed-string completion pass with additional matches as delta plus session summary", () => {
    const output = formatSearchFixedStringContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [
              {
                file: "src/late.ts",
                line: 41,
                content: "const lateBinding = resolveLate();",
                match: "lateBinding",
              },
            ],
            filesSearched: 57,
            totalMatches: 1,
            truncated: false,
            error: null,
            stopReason: null,
            stopMessage: null,
          },
        ],
        totalLocations: 1,
        totalMatches: 1,
        truncated: false,
        sessionDelivery: {
          continuationPass: true,
          previouslyDeliveredCount: 2,
          previouslyDeliveredLocationCount: 2,
          sessionTotalCount: 3,
          sessionTotalLocationCount: 3,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
          guidanceText:
            "Continuation response. This payload contains entries from the persisted frontier position onward. Combine with the prior preview-chunk payload for the complete dataset.",
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: null,
          resumable: false,
          status: null,
          expiresAt: null,
          supportedResumeModes: [
            INSPECTION_RESUME_MODES.NEXT_CHUNK,
            INSPECTION_RESUME_MODES.COMPLETE_RESULT,
          ],
          recommendedResumeMode: null,
        },
      },
      "lateBinding",
      400,
    );

    expect(output).toContain("Found 1 additional matches in 1 locations in this completion pass");
    expect(output).toContain("File: src/late.ts");
    expect(output).toContain(
      "Fixed-string-search completion finished for 1 root: 1 additional matches in 1 locations in this final pass; session total 3 matches in 3 locations (2 already delivered in prior preview-chunk payloads).",
    );
  });

  it("keeps the absolute verdict wording for base inline single-root fixed-string responses", () => {
    const output = formatSearchFixedStringContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [],
            filesSearched: 12,
            totalMatches: 0,
            truncated: false,
            error: null,
            stopReason: null,
            stopMessage: null,
          },
        ],
        totalLocations: 0,
        totalMatches: 0,
        truncated: false,
        sessionDelivery: {
          continuationPass: false,
          previouslyDeliveredCount: 0,
          previouslyDeliveredLocationCount: 0,
          sessionTotalCount: 0,
          sessionTotalLocationCount: 0,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.INLINE,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: null,
          resumable: false,
          status: null,
          expiresAt: null,
          supportedResumeModes: [],
          recommendedResumeMode: null,
        },
      },
      "needle",
      100,
    );

    expect(output).toContain("No matches found for fixed string: needle");
    expect(output).toContain("Searched 12 files");
  });

  it("formats base inline multi-root fixed-string responses through the batch mapping path", () => {
    const output = formatSearchFixedStringContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [],
            filesSearched: 12,
            totalMatches: 0,
            truncated: false,
            error: null,
            stopReason: null,
            stopMessage: null,
          },
          {
            root: "docs",
            matches: [],
            filesSearched: 4,
            totalMatches: 0,
            truncated: false,
            error: null,
            stopReason: null,
            stopMessage: null,
          },
        ],
        totalLocations: 0,
        totalMatches: 0,
        truncated: false,
        sessionDelivery: {
          continuationPass: false,
          previouslyDeliveredCount: 0,
          previouslyDeliveredLocationCount: 0,
          sessionTotalCount: 0,
          sessionTotalLocationCount: 0,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.INLINE,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: null,
          resumable: false,
          status: null,
          expiresAt: null,
          supportedResumeModes: [],
          recommendedResumeMode: null,
        },
      },
      "needle",
      100,
    );

    expect(output).toContain("Searched 12 files");
    expect(output).toContain("Searched 4 files");
  });

  it("formats resumable multi-root fixed-string preview passes with the plural root label", () => {
    const output = formatSearchFixedStringContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [],
            filesSearched: 12,
            totalMatches: 0,
            truncated: true,
            error: null,
            stopReason: null,
            stopMessage: null,
          },
          {
            root: "docs",
            matches: [],
            filesSearched: 4,
            totalMatches: 0,
            truncated: true,
            error: null,
            stopReason: null,
            stopMessage: null,
          },
        ],
        totalLocations: 0,
        totalMatches: 0,
        truncated: true,
        sessionDelivery: {
          continuationPass: false,
          previouslyDeliveredCount: 0,
          previouslyDeliveredLocationCount: 0,
          sessionTotalCount: 0,
          sessionTotalLocationCount: 0,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
          guidanceText: null,
          scopeReductionGuidanceText: null,
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
      "needle",
      100,
    );

    expect(output).toContain("Fixed-string-search preview is available for 2 roots with 0 matches already reached in this bounded preview slice.");
    expect(output).toContain("No matches reached yet for fixed string: needle in this bounded preview slice");
  });

  it("keeps completion-scoped wording on non-terminal fixed-string complete-result passes with zero delta", () => {
    const output = formatSearchFixedStringContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [],
            filesSearched: 25,
            totalMatches: 0,
            truncated: true,
            error: null,
            stopReason: SEARCH_STOP_REASON_LITERALS.COMPLETION_CONTINUATION_AVAILABLE,
            stopMessage: "Additional matches remain in the persisted completion frontier for this search scope.",
          },
        ],
        totalLocations: 0,
        totalMatches: 0,
        truncated: true,
        sessionDelivery: {
          continuationPass: true,
          previouslyDeliveredCount: 1,
          previouslyDeliveredLocationCount: 1,
          sessionTotalCount: 1,
          sessionTotalLocationCount: 1,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
          guidanceText:
            "Continuation response. This payload contains entries from the persisted frontier position onward. Combine with the prior preview-chunk payload for the complete dataset. More work remains; resume the same fixed-string-search request by sending only resumeToken with resumeMode='complete-result' to continue the server-owned completion attempt.",
          scopeReductionGuidanceText: null,
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
          recommendedResumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
        },
      },
      "needle",
      100,
    );

    expect(output).not.toContain("No matches found for fixed string");
    expect(output).toContain("No additional matches found for fixed string: needle in this completion pass");
    expect(output).toContain("Fixed-string-search completion progress is available for 1 root with 0 matches in this bounded chunk.");
  });

  it("formats terminal multi-root fixed-string completion passes through the delta mapping path", () => {
    const output = formatSearchFixedStringContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [],
            filesSearched: 12,
            totalMatches: 0,
            truncated: false,
            error: null,
            stopReason: null,
            stopMessage: null,
          },
          {
            root: "docs",
            matches: [],
            filesSearched: 4,
            totalMatches: 0,
            truncated: false,
            error: null,
            stopReason: null,
            stopMessage: null,
          },
        ],
        totalLocations: 0,
        totalMatches: 0,
        truncated: false,
        sessionDelivery: {
          continuationPass: true,
          previouslyDeliveredCount: 2,
          previouslyDeliveredLocationCount: 2,
          sessionTotalCount: 2,
          sessionTotalLocationCount: 2,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: null,
          resumable: false,
          status: null,
          expiresAt: null,
          supportedResumeModes: [],
          recommendedResumeMode: null,
        },
      },
      "needle",
      100,
    );

    expect(output).toContain("No additional matches found for fixed string: needle in this completion pass");
    expect(output).toContain("Searched 12 files in this completion pass");
    expect(output).toContain("Searched 4 files in this completion pass");
    expect(output).toContain("Fixed-string-search completion finished for 2 roots:");
  });

  it("formats fixed-string completion-delta root failures and preview-first passthrough errors", () => {
    const failureOutput = formatSearchFixedStringContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [],
            filesSearched: 0,
            totalMatches: 0,
            truncated: false,
            error: "Native search runner timed out before completion.",
            stopReason: null,
            stopMessage: null,
          },
        ],
        totalLocations: 0,
        totalMatches: 0,
        truncated: false,
        sessionDelivery: {
          continuationPass: true,
          previouslyDeliveredCount: 1,
          previouslyDeliveredLocationCount: 1,
          sessionTotalCount: 1,
          sessionTotalLocationCount: 1,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: null,
          resumable: false,
          status: null,
          expiresAt: null,
          supportedResumeModes: [],
          recommendedResumeMode: null,
        },
      },
      "needle",
      100,
    );

    expect(failureOutput).toContain("Fixed-string search failed for root src: Native search runner timed out before completion.");

    const passthroughOutput = formatSearchFixedStringContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [],
            filesSearched: 0,
            totalMatches: 0,
            truncated: false,
            error: "Preview-first traversal for root src is not supported on this surface.",
            stopReason: null,
            stopMessage: null,
          },
        ],
        totalLocations: 0,
        totalMatches: 0,
        truncated: false,
        sessionDelivery: {
          continuationPass: true,
          previouslyDeliveredCount: 1,
          previouslyDeliveredLocationCount: 1,
          sessionTotalCount: 1,
          sessionTotalLocationCount: 1,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: null,
          resumable: false,
          status: null,
          expiresAt: null,
          supportedResumeModes: [],
          recommendedResumeMode: null,
        },
      },
      "needle",
      100,
    );

    expect(passthroughOutput).toContain("Preview-first traversal for root src is not supported on this surface.");
    expect(passthroughOutput).not.toContain("Fixed-string search failed for root");
  });

  it("formats fixed-string completion-delta truncation and bounded-stop state lines", () => {
    const output = formatSearchFixedStringContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [
              {
                file: "src/needle.ts",
                line: 7,
                content: "const needle = true;",
                match: "needle",
              },
            ],
            filesSearched: 30,
            totalMatches: 1,
            truncated: true,
            error: null,
            stopReason: SEARCH_STOP_REASON_LITERALS.MAX_RESULTS_LIMIT_REACHED,
            stopMessage: "Collected results reached the effective result limit of 1 for this search scope.",
          },
        ],
        totalLocations: 1,
        totalMatches: 1,
        truncated: true,
        sessionDelivery: {
          continuationPass: true,
          previouslyDeliveredCount: 0,
          previouslyDeliveredLocationCount: 0,
          sessionTotalCount: 1,
          sessionTotalLocationCount: 1,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: null,
          resumable: false,
          status: null,
          expiresAt: null,
          supportedResumeModes: [],
          recommendedResumeMode: null,
        },
      },
      "needle",
      1,
    );

    expect(output).toContain("Found 1 additional matches in 1 locations in this completion pass (limited to 1 results)");
  });

  it("formats zero-delta fixed-string completion passes with a bounded-stop state line", () => {
    const output = formatSearchFixedStringContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [],
            filesSearched: 30,
            totalMatches: 0,
            truncated: false,
            error: null,
            stopReason: SEARCH_STOP_REASON_LITERALS.EXECUTION_RUNTIME_BUDGET_EXHAUSTED,
            stopMessage: "Tool guardrail refusal: runtime budget exceeded.",
          },
        ],
        totalLocations: 0,
        totalMatches: 0,
        truncated: false,
        sessionDelivery: {
          continuationPass: true,
          previouslyDeliveredCount: 1,
          previouslyDeliveredLocationCount: 1,
          sessionTotalCount: 1,
          sessionTotalLocationCount: 1,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: null,
          resumable: false,
          status: null,
          expiresAt: null,
          supportedResumeModes: [],
          recommendedResumeMode: null,
        },
      },
      "needle",
      100,
    );

    expect(output).toContain("No additional matches found for fixed string: needle in this completion pass");
    expect(output).toContain("Search stopped early: Tool guardrail refusal: runtime budget exceeded.");
  });

  it("falls back to the empty root result for sparse single-root fixed-string continuation surfaces", () => {
    const sharedResume: InspectionResumeMetadata = {
      resumeToken: "resume_123",
      resumable: true,
      status: INSPECTION_RESUME_STATUSES.ACTIVE,
      expiresAt: "2026-05-14T12:00:00.000Z",
      supportedResumeModes: [
        INSPECTION_RESUME_MODES.NEXT_CHUNK,
        INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      ],
      recommendedResumeMode: INSPECTION_RESUME_MODES.NEXT_CHUNK,
    };
    const sharedDelivery: SearchSessionDeliverySummary = {
      continuationPass: true,
      previouslyDeliveredCount: 1,
      previouslyDeliveredLocationCount: 1,
      sessionTotalCount: 1,
      sessionTotalLocationCount: 1,
    };

    const previewOutput = formatSearchFixedStringContinuationAwareTextOutput(
      {
        roots: Array(1),
        totalLocations: 0,
        totalMatches: 0,
        truncated: true,
        sessionDelivery: { ...sharedDelivery },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: { ...sharedResume },
      },
      "needle",
      100,
    );

    expect(previewOutput).toContain("No matches reached yet for fixed string: needle in this bounded preview slice");

    const terminalOutput = formatSearchFixedStringContinuationAwareTextOutput(
      {
        roots: Array(1),
        totalLocations: 0,
        totalMatches: 0,
        truncated: false,
        sessionDelivery: { ...sharedDelivery },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: null,
          resumable: false,
          status: null,
          expiresAt: null,
          supportedResumeModes: [],
          recommendedResumeMode: null,
        },
      },
      "needle",
      100,
    );

    expect(terminalOutput).toContain("No additional matches found for fixed string: needle in this completion pass");
  });

  it("formats the base fixed-string path output with bounded-stop lines, truncation suffixes, and passthrough errors", () => {
    const zeroMatchWithStopState = formatSearchFixedStringPathOutput(
      {
        root: "src",
        matches: [],
        filesSearched: 30,
        totalMatches: 0,
        truncated: false,
        error: null,
        stopReason: SEARCH_STOP_REASON_LITERALS.EXECUTION_RUNTIME_BUDGET_EXHAUSTED,
        stopMessage: "Tool guardrail refusal: runtime budget exceeded.",
      },
      "needle",
      100,
    );

    expect(zeroMatchWithStopState).toContain("No matches found for fixed string: needle");
    expect(zeroMatchWithStopState).toContain("Search stopped early: Tool guardrail refusal: runtime budget exceeded.");

    const truncatedWithMatches = formatSearchFixedStringPathOutput(
      {
        root: "src",
        matches: [
          {
            file: "src/needle.ts",
            line: 7,
            content: "const needle = true;",
            match: "needle",
          },
        ],
        filesSearched: 30,
        totalMatches: 1,
        truncated: true,
        error: null,
        stopReason: SEARCH_STOP_REASON_LITERALS.MAX_RESULTS_LIMIT_REACHED,
        stopMessage: "Collected results reached the effective result limit of 1 for this search scope.",
      },
      "needle",
      1,
    );

    expect(truncatedWithMatches).toContain("Found 1 matches in 1 locations (limited to 1 results)");
    expect(truncatedWithMatches).toContain("Search stopped early: Collected results reached the effective result limit of 1 for this search scope.");

    const passthrough = formatSearchFixedStringPathOutput(
      {
        root: "src",
        matches: [],
        filesSearched: 0,
        totalMatches: 0,
        truncated: false,
        error: "Preview-first traversal for root src is not supported on this surface.",
        stopReason: null,
        stopMessage: null,
      },
      "needle",
      100,
    );

    expect(passthrough).toBe("Preview-first traversal for root src is not supported on this surface.");
  });

  it("formats fixed-string preview-path error and truncation branches through the resumable preview surface", () => {
    const sharedResume: InspectionResumeMetadata = {
      resumeToken: "resume_123",
      resumable: true,
      status: INSPECTION_RESUME_STATUSES.ACTIVE,
      expiresAt: "2026-05-14T12:00:00.000Z",
      supportedResumeModes: [
        INSPECTION_RESUME_MODES.NEXT_CHUNK,
        INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      ],
      recommendedResumeMode: INSPECTION_RESUME_MODES.NEXT_CHUNK,
    };
    const sharedDelivery: SearchSessionDeliverySummary = {
      continuationPass: false,
      previouslyDeliveredCount: 0,
      previouslyDeliveredLocationCount: 0,
      sessionTotalCount: 0,
      sessionTotalLocationCount: 0,
    };

    const errorOutput = formatSearchFixedStringContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [],
            filesSearched: 0,
            totalMatches: 0,
            truncated: false,
            error: "Native search runner timed out before completion.",
            stopReason: null,
            stopMessage: null,
          },
        ],
        totalLocations: 0,
        totalMatches: 0,
        truncated: false,
        sessionDelivery: { ...sharedDelivery },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: { ...sharedResume },
      },
      "needle",
      100,
    );

    expect(errorOutput).toContain("Fixed-string search failed for root src: Native search runner timed out before completion.");

    const passthroughOutput = formatSearchFixedStringContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [],
            filesSearched: 0,
            totalMatches: 0,
            truncated: false,
            error: "Preview-first traversal for root src is not supported on this surface.",
            stopReason: null,
            stopMessage: null,
          },
        ],
        totalLocations: 0,
        totalMatches: 0,
        truncated: false,
        sessionDelivery: { ...sharedDelivery },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: { ...sharedResume },
      },
      "needle",
      100,
    );

    expect(passthroughOutput).toContain("Preview-first traversal for root src is not supported on this surface.");

    const truncatedOutput = formatSearchFixedStringContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [
              {
                file: "src/needle.ts",
                line: 7,
                content: "const needle = true;",
                match: "needle",
              },
            ],
            filesSearched: 30,
            totalMatches: 1,
            truncated: true,
            error: null,
            stopReason: SEARCH_STOP_REASON_LITERALS.MAX_RESULTS_LIMIT_REACHED,
            stopMessage: "Collected results reached the effective result limit of 1 for this search scope.",
          },
        ],
        totalLocations: 1,
        totalMatches: 1,
        truncated: true,
        sessionDelivery: { ...sharedDelivery },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: { ...sharedResume },
      },
      "needle",
      1,
    );

    expect(truncatedOutput).toContain("Found 1 matches in 1 locations (limited to 1 results)");
  });

  it("rejects a missing single root result in the base fixed-string result mapping instead of formatting undefined data", () => {
    expect(() =>
      formatSearchFixedStringResultOutput(
        {
          roots: Array(1),
          totalLocations: 0,
          totalMatches: 0,
          truncated: false,
          sessionDelivery: {
            continuationPass: false,
            previouslyDeliveredCount: 0,
            previouslyDeliveredLocationCount: 0,
            sessionTotalCount: 0,
            sessionTotalLocationCount: 0,
          },
          admission: {
            outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.INLINE,
            guidanceText: null,
            scopeReductionGuidanceText: null,
          },
          resume: {
            resumeToken: null,
            resumable: false,
            status: null,
            expiresAt: null,
            supportedResumeModes: [],
            recommendedResumeMode: null,
          },
        },
        "needle",
        100,
      ),
    ).toThrow("Expected one root result for fixed-string formatting.");
  });

  it("applies the global response fuse for complete-result mode and enforces the fixed-string family cap otherwise", () => {
    const completeResultOutput = "x".repeat(129_000);

    expect(
      assertFormattedFixedStringResponseBudget(
        "search_file_contents_by_fixed_string",
        completeResultOutput,
        INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      ),
    ).toBe(completeResultOutput);

    expect(() =>
      assertFormattedFixedStringResponseBudget(
        "search_file_contents_by_fixed_string",
        "x".repeat(129_000),
        null,
      ),
    ).toThrow("Fixed-string search response exceeds the effective search-family cap.");

    expect(() =>
      assertFormattedFixedStringResponseBudget(
        "search_file_contents_by_fixed_string",
        "x".repeat(610_000),
        INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      ),
    ).toThrow("Fixed-string search response exceeds the effective search-family cap.");
  });
});
