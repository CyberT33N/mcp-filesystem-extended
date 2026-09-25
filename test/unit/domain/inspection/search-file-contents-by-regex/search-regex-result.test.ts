import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
  assertFormattedRegexResponseBudget,
  formatSearchRegexContinuationAwareTextOutput,
  formatSearchRegexPathOutput,
  formatSearchRegexResultOutput,
} from "@domain/inspection/search/search-file-contents-by-regex/search-regex-result";
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

  it("never presents a terminal completion delta as the absolute session result", () => {
    const output = formatSearchRegexContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [],
            filesSearched: 54,
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
            "Scope reduction alternative: narrow roots, add includeGlobs, or tighten the regex to the intended file set.",
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
      "project[_ ]number",
      400,
    );

    expect(output).not.toContain("No matches found for regex");
    expect(output).toContain("No additional matches found for regex: project[_ ]number in this completion pass");
    expect(output).toContain("Searched 54 files in this completion pass");
    expect(output).toContain(
      "Regex-search completion finished for 1 root: 0 additional matches in 0 locations in this final pass; session total 1 matches in 1 locations (1 already delivered in prior preview-chunk payloads).",
    );
    expect(output).toContain("Combine with the prior preview-chunk payload for the complete dataset.");
    expect(output).toContain("The authoritative match payload remains in structuredContent.");
  });

  it("formats a terminal completion pass with additional matches as delta plus session summary", () => {
    const output = formatSearchRegexContinuationAwareTextOutput(
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
            filesSearched: 54,
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
    expect(output).toContain("Line 41: const lateBinding = resolveLate();");
    expect(output).toContain(
      "Regex-search completion finished for 1 root: 1 additional matches in 1 locations in this final pass; session total 3 matches in 3 locations (2 already delivered in prior preview-chunk payloads).",
    );
  });

  it("keeps completion-scoped wording on non-terminal complete-result passes with zero delta", () => {
    const output = formatSearchRegexContinuationAwareTextOutput(
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
            "Continuation response. This payload contains entries from the persisted frontier position onward. Combine with the prior preview-chunk payload for the complete dataset. More work remains; resume the same regex-search request by sending only resumeToken with resumeMode='complete-result' to continue the server-owned completion attempt.",
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
          recommendedResumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
        },
      },
      "project[_ ]number",
      400,
    );

    expect(output).not.toContain("No matches found for regex");
    expect(output).toContain("No additional matches found for regex: project[_ ]number in this completion pass");
    expect(output).toContain("Regex-search completion progress is available for 1 root with 0 matches in this bounded chunk.");
    expect(output).toContain("Active resumeToken: resume_123");
  });

  it("keeps the absolute verdict wording for base inline single-root responses", () => {
    const output = formatSearchRegexContinuationAwareTextOutput(
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

    expect(output).toContain("No matches found for regex: needle");
    expect(output).toContain("Searched 12 files");
  });

  it("formats base inline multi-root responses through the batch mapping path", () => {
    const output = formatSearchRegexContinuationAwareTextOutput(
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

    expect(output).toContain("No matches found for regex: needle");
    expect(output).toContain("Searched 12 files");
    expect(output).toContain("Searched 4 files");
  });

  it("formats resumable multi-root preview passes with the plural root label", () => {
    const output = formatSearchRegexContinuationAwareTextOutput(
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

    expect(output).toContain("Regex-search preview is available for 2 roots with 0 matches already reached in this bounded preview slice.");
    expect(output).toContain("No matches reached yet for regex: needle in this bounded preview slice");
  });

  it("formats terminal multi-root completion passes through the delta mapping path", () => {
    const output = formatSearchRegexContinuationAwareTextOutput(
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

    expect(output).toContain("No additional matches found for regex: needle in this completion pass");
    expect(output).toContain("Searched 12 files in this completion pass");
    expect(output).toContain("Searched 4 files in this completion pass");
    expect(output).toContain("Regex-search completion finished for 2 roots:");
  });

  it("formats completion-delta root failures and preview-first passthrough errors", () => {
    const failureOutput = formatSearchRegexContinuationAwareTextOutput(
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

    expect(failureOutput).toContain("Regex search failed for root src: Native search runner timed out before completion.");

    const passthroughOutput = formatSearchRegexContinuationAwareTextOutput(
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
    expect(passthroughOutput).not.toContain("Regex search failed for root");
  });

  it("formats completion-delta truncation and bounded-stop state lines", () => {
    const output = formatSearchRegexContinuationAwareTextOutput(
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
    expect(output).toContain("Search stopped early: Collected results reached the effective result limit of 1 for this search scope.");
  });

  it("formats zero-delta completion passes with a bounded-stop state line", () => {
    const output = formatSearchRegexContinuationAwareTextOutput(
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

    expect(output).toContain("No additional matches found for regex: needle in this completion pass");
    expect(output).toContain("Search stopped early: Tool guardrail refusal: runtime budget exceeded.");
  });

  it("falls back to the empty root result for sparse single-root continuation surfaces", () => {
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

    const previewOutput = formatSearchRegexContinuationAwareTextOutput(
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

    expect(previewOutput).toContain("No matches reached yet for regex: needle in this bounded preview slice");

    const terminalOutput = formatSearchRegexContinuationAwareTextOutput(
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

    expect(terminalOutput).toContain("No additional matches found for regex: needle in this completion pass");
  });

  it("formats the base path output with bounded-stop lines, truncation suffixes, and passthrough errors", () => {
    const zeroMatchWithStopState = formatSearchRegexPathOutput(
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

    expect(zeroMatchWithStopState).toContain("No matches found for regex: needle");
    expect(zeroMatchWithStopState).toContain("Search stopped early: Tool guardrail refusal: runtime budget exceeded.");

    const truncatedWithMatches = formatSearchRegexPathOutput(
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

    const passthrough = formatSearchRegexPathOutput(
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

  it("formats preview-path error and truncation branches through the resumable preview surface", () => {
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

    const errorOutput = formatSearchRegexContinuationAwareTextOutput(
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

    expect(errorOutput).toContain("Regex search failed for root src: Native search runner timed out before completion.");

    const passthroughOutput = formatSearchRegexContinuationAwareTextOutput(
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

    const truncatedOutput = formatSearchRegexContinuationAwareTextOutput(
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

  it("rejects a missing single root result in the base result mapping instead of formatting undefined data", () => {
    expect(() =>
      formatSearchRegexResultOutput(
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
    ).toThrow("Expected one root result for regex-search formatting.");
  });

  it("applies the global response fuse for complete-result mode and enforces the family cap otherwise", () => {
    const completeResultOutput = "x".repeat(129_000);

    expect(
      assertFormattedRegexResponseBudget(
        "search_file_contents_by_regex",
        completeResultOutput,
        INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      ),
    ).toBe(completeResultOutput);

    const overFamilyCapOutput = "x".repeat(129_000);

    expect(() =>
      assertFormattedRegexResponseBudget(
        "search_file_contents_by_regex",
        overFamilyCapOutput,
        null,
      ),
    ).toThrow("Regex search response exceeds the effective search-family cap.");

    const overGlobalCapOutput = "x".repeat(610_000);

    expect(() =>
      assertFormattedRegexResponseBudget(
        "search_file_contents_by_regex",
        overGlobalCapOutput,
        INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      ),
    ).toThrow("Regex search response exceeds the effective search-family cap.");
  });
});
