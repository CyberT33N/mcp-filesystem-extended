import { describe, expect, it } from "vitest";

import { formatFindFilesByGlobTextOutput } from "@domain/inspection/find-files-by-glob/handler";
import { formatFindPathsByNameTextOutput } from "@domain/inspection/find-paths-by-name/handler";
import { formatSearchRegexContinuationAwareTextOutput } from "@domain/inspection/search/search-file-contents-by-regex/search-regex-result";
import {
  formatInspectionTerminalCompletionTextBlock,
  INSPECTION_RESUME_ADMISSION_OUTCOMES,
  INSPECTION_RESUME_MODES,
  INSPECTION_RESUME_TERMINAL_CONTINUATION_GUIDANCE,
} from "@domain/shared/resume/inspection-resume-contract";

describe("search resume terminal truthfulness regression contract", () => {
  it("pins the canonical terminal continuation guidance text", () => {
    expect(INSPECTION_RESUME_TERMINAL_CONTINUATION_GUIDANCE).toBe(
      "Continuation response. This payload contains the final entries from the persisted frontier position onward. Combine with the prior preview-chunk payloads for the complete dataset.",
    );
  });

  it("pins the terminal completion block line order and structured payload pointer", () => {
    expect(
      formatInspectionTerminalCompletionTextBlock(
        {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        "summary line",
      ).split("\n"),
    ).toEqual([
      "summary line",
      INSPECTION_RESUME_TERMINAL_CONTINUATION_GUIDANCE,
      "The authoritative match payload remains in structuredContent.",
    ]);
  });

  it("guards the reported false-negative scenario: a terminal pass never claims absolute absence after a delivered preview", () => {
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
      "project[_ ]number",
      400,
    );

    expect(output).not.toContain("No matches found for regex");
    expect(output).toContain("No additional matches found for regex: project[_ ]number in this completion pass");
    expect(output).toContain("session total 1 matches in 1 locations");
  });

  it("guards glob-discovery completion passes: a resumable completion-backed pass never claims completion", () => {
    const output = formatFindFilesByGlobTextOutput(
      {
        roots: [{ root: "src", matches: ["src/one.ts"], truncated: true }],
        totalMatches: 1,
        truncated: true,
        sessionDelivery: {
          continuationPass: true,
          previouslyDeliveredCount: 1,
          sessionTotalCount: 2,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: "resume_123",
          resumable: true,
          status: "active",
          expiresAt: "2026-05-14T12:00:00.000Z",
          supportedResumeModes: [
            INSPECTION_RESUME_MODES.NEXT_CHUNK,
            INSPECTION_RESUME_MODES.COMPLETE_RESULT,
          ],
          recommendedResumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
        },
      },
      "**/*.ts",
      100,
    );

    expect(output).toContain("Glob-discovery completion progress is available for 1 root with 1 matches in this bounded chunk.");
    expect(output).toContain("Active resumeToken: resume_123");
    expect(output).not.toContain("completion finished");
  });

  it("guards name-discovery completion passes: a resumable completion-backed pass never claims completion", () => {
    const output = formatFindPathsByNameTextOutput(
      {
        roots: [{ root: "src", matches: ["src/schema-one.ts"], truncated: true }],
        totalMatches: 1,
        truncated: true,
        sessionDelivery: {
          continuationPass: true,
          previouslyDeliveredCount: 1,
          sessionTotalCount: 2,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: "resume_123",
          resumable: true,
          status: "active",
          expiresAt: "2026-05-14T12:00:00.000Z",
          supportedResumeModes: [
            INSPECTION_RESUME_MODES.NEXT_CHUNK,
            INSPECTION_RESUME_MODES.COMPLETE_RESULT,
          ],
          recommendedResumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
        },
      },
      100,
    );

    expect(output).toContain("Name-discovery completion progress is available for 1 root with 1 matches in this bounded chunk.");
    expect(output).toContain("Active resumeToken: resume_123");
    expect(output).not.toContain("completion finished");
  });
});
