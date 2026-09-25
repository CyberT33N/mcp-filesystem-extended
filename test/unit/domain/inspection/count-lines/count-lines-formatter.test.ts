import { describe, expect, it } from "vitest";

import { formatCountLinesResultOutput } from "@domain/inspection/count-lines/handler";
import {
  INSPECTION_RESUME_ADMISSION_OUTCOMES,
  INSPECTION_RESUME_MODES,
  type InspectionResumeAdmission,
  type InspectionResumeMetadata,
} from "@domain/shared/resume/inspection-resume-contract";
import type { CountLinesResult } from "@domain/inspection/count-lines/handler";

function createInlineAdmission(): InspectionResumeAdmission {
  return {
    outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.INLINE,
    guidanceText: null,
    scopeReductionGuidanceText: null,
  };
}

function createInlineResume(): InspectionResumeMetadata {
  return {
    resumeToken: null,
    resumable: false,
    status: null,
    expiresAt: null,
    supportedResumeModes: [],
    recommendedResumeMode: null,
  };
}

function createResumableCompletionAdmission(guidanceText: string | null): InspectionResumeAdmission {
  return {
    outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
    guidanceText,
    scopeReductionGuidanceText: null,
  };
}

function createResumableCompletionResume(): InspectionResumeMetadata {
  return {
    resumeToken: "resume_123",
    resumable: true,
    status: "active",
    expiresAt: "2026-05-14T12:00:00.000Z",
    supportedResumeModes: [INSPECTION_RESUME_MODES.COMPLETE_RESULT],
    recommendedResumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
  };
}

describe("count_lines formatter surfaces", () => {
  it("returns the admission guidance for a resumable completion-backed pending pass without paths", () => {
    const result: CountLinesResult = {
      paths: [],
      totalFiles: 0,
      totalLines: 0,
      totalMatchingLines: 0,
      admission: createResumableCompletionAdmission("Completion is continuing in the background."),
      resume: createResumableCompletionResume(),
    };

    expect(formatCountLinesResultOutput(result, undefined)).toBe(
      "Completion is continuing in the background.",
    );
  });

  it("falls back to the canonical continuation guidance when a pending pass carries no admission guidance", () => {
    const result: CountLinesResult = {
      paths: [],
      totalFiles: 0,
      totalLines: 0,
      totalMatchingLines: 0,
      admission: createResumableCompletionAdmission(null),
      resume: createResumableCompletionResume(),
    };

    expect(formatCountLinesResultOutput(result, undefined)).toContain(
      "Resume the same count-lines request by sending only resumeToken with resumeMode='complete-result'",
    );
  });

  it("formats a single path without a pattern as plain line counts", () => {
    const result: CountLinesResult = {
      paths: [
        {
          path: "src",
          files: [
            { file: "src/b.ts", count: 10 },
            { file: "src/a.ts", count: 4 },
          ],
          totalLines: 14,
          totalMatchingLines: 0,
        },
      ],
      totalFiles: 2,
      totalLines: 14,
      totalMatchingLines: 0,
      admission: createInlineAdmission(),
      resume: createInlineResume(),
    };

    const output = formatCountLinesResultOutput(result, undefined);

    expect(output).toContain("src/b.ts: 10 lines");
    expect(output).toContain("src/a.ts: 4 lines");
    expect(output).toContain("Total: 2 files, 14 lines");
    expect(output).not.toContain("matching lines");
  });

  it("formats a single path with a pattern including matching-line totals", () => {
    const result: CountLinesResult = {
      paths: [
        {
          path: "src",
          files: [
            { file: "src/a.ts", count: 10, matchingCount: 3 },
          ],
          totalLines: 10,
          totalMatchingLines: 3,
        },
      ],
      totalFiles: 1,
      totalLines: 10,
      totalMatchingLines: 3,
      admission: createInlineAdmission(),
      resume: createInlineResume(),
    };

    const output = formatCountLinesResultOutput(result, "TODO");

    expect(output).toContain("src/a.ts: 10 lines total, 3 matching lines");
    expect(output).toContain("Total: 1 files, 10 lines, 3 matching lines");
  });

  it("formats an empty single path as a no-files verdict", () => {
    const result: CountLinesResult = {
      paths: [
        {
          path: "src/empty",
          files: [],
          totalLines: 0,
          totalMatchingLines: 0,
        },
      ],
      totalFiles: 0,
      totalLines: 0,
      totalMatchingLines: 0,
      admission: createInlineAdmission(),
      resume: createInlineResume(),
    };

    expect(formatCountLinesResultOutput(result, undefined)).toBe("No files found matching the criteria.");
  });

  it("formats multiple paths through the batch operation surface", () => {
    const result: CountLinesResult = {
      paths: [
        {
          path: "src/one",
          files: [{ file: "src/one/a.ts", count: 2 }],
          totalLines: 2,
          totalMatchingLines: 0,
        },
        {
          path: "src/two",
          files: [{ file: "src/two/b.ts", count: 6 }],
          totalLines: 6,
          totalMatchingLines: 0,
        },
      ],
      totalFiles: 2,
      totalLines: 8,
      totalMatchingLines: 0,
      admission: createInlineAdmission(),
      resume: createInlineResume(),
    };

    const output = formatCountLinesResultOutput(result, undefined);

    expect(output).toContain("src/one");
    expect(output).toContain("src/two");
    expect(output).toContain("src/one/a.ts: 2 lines");
    expect(output).toContain("src/two/b.ts: 6 lines");
  });
});
