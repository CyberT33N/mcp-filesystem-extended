import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  applyCommonResumeSchemaRefinement,
  createInlineResumeEnvelope,
  createPersistedResumeEnvelope,
  createResumeEnvelope,
  formatInspectionPreviewChunkTextBlock,
  getResumeSessionNotFoundMessage,
  InspectionCompletionOnlyAdmissionSchema,
  InspectionCompletionOnlyResumeMetadataSchema,
  InspectionCompletionOnlyResumeModeFieldSchema,
  InspectionResumeAdmissionSchema,
  InspectionResumeMetadataSchema,
  InspectionResumeModeFieldSchema,
  InspectionResumeTokenFieldSchema,
  INSPECTION_COMPLETION_ONLY_RESUME_MODES,
  INSPECTION_PREVIEW_SUPPORTED_RESUME_MODES,
  INSPECTION_RESUME_ADMISSION_OUTCOMES,
  INSPECTION_RESUME_MODE_FIELD,
  INSPECTION_RESUME_MODES,
  INSPECTION_RESUME_STATUSES,
  INSPECTION_RESUME_TOKEN_FIELD,
  validateResumeOnlyRequest,
} from "@domain/shared/resume/inspection-resume-contract";
import {
  cloneInspectionResumeTraversalFrames,
  commitInspectionResumeTraversalEntry,
} from "@domain/shared/resume/inspection-resume-frontier";

describe("inspection_resume_contract", () => {
  it("exposes the canonical resume token and mode vocabularies", () => {
    expect(INSPECTION_RESUME_TOKEN_FIELD).toBe("resumeToken");
    expect(INSPECTION_RESUME_MODE_FIELD).toBe("resumeMode");
    expect(INSPECTION_RESUME_ADMISSION_OUTCOMES).toEqual({
      INLINE: "inline",
      PREVIEW_FIRST: "preview-first",
      COMPLETION_BACKED_REQUIRED: "completion-backed-required",
      NARROWING_REQUIRED: "narrowing-required",
    });
    expect(INSPECTION_RESUME_MODES).toEqual({
      NEXT_CHUNK: "next-chunk",
      COMPLETE_RESULT: "complete-result",
    });
    expect(INSPECTION_RESUME_STATUSES).toEqual({
      ACTIVE: "active",
      CANCELLED: "cancelled",
      COMPLETED: "completed",
      EXPIRED: "expired",
    });
    expect(INSPECTION_PREVIEW_SUPPORTED_RESUME_MODES).toEqual([
      "next-chunk",
      "complete-result",
    ]);
    expect(INSPECTION_COMPLETION_ONLY_RESUME_MODES).toEqual([
      "complete-result",
    ]);
  });

  it("validates the shared resume token and resume mode field schemas", () => {
    const resumeTokenSchema = InspectionResumeTokenFieldSchema("regex-search");

    expect(resumeTokenSchema.safeParse("resume_123").success).toBe(true);
    expect(resumeTokenSchema.safeParse("").success).toBe(false);
    expect(InspectionResumeModeFieldSchema.safeParse("next-chunk").success).toBe(
      true,
    );
    expect(
      InspectionResumeModeFieldSchema.safeParse("unsupported-mode").success,
    ).toBe(false);
    expect(
      InspectionCompletionOnlyResumeModeFieldSchema.safeParse(
        "complete-result",
      ).success,
    ).toBe(true);
    expect(
      InspectionCompletionOnlyResumeModeFieldSchema.safeParse("next-chunk")
        .success,
    ).toBe(false);
  });

  it("parses the preview-family and completion-only schema surfaces with the expected lane restrictions", () => {
    expect(
      InspectionResumeAdmissionSchema.safeParse({
        outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
        guidanceText: "Resume the next bounded chunk.",
        scopeReductionGuidanceText: null,
      }).success,
    ).toBe(true);
    expect(
      InspectionResumeMetadataSchema.safeParse({
        resumeToken: "resume_123",
        supportedResumeModes: ["next-chunk", "complete-result"],
        recommendedResumeMode: "next-chunk",
        status: "active",
        resumable: true,
        expiresAt: "2026-05-04T12:03:00Z",
      }).success,
    ).toBe(true);
    expect(
      InspectionCompletionOnlyAdmissionSchema.safeParse({
        outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
        guidanceText: "This should fail.",
        scopeReductionGuidanceText: null,
      }).success,
    ).toBe(false);
    expect(
      InspectionCompletionOnlyResumeMetadataSchema.safeParse({
        resumeToken: "resume_456",
        supportedResumeModes: ["next-chunk"],
        recommendedResumeMode: "next-chunk",
        status: "active",
        resumable: true,
        expiresAt: "2026-05-04T12:03:00Z",
      }).success,
    ).toBe(false);
  });

  it("builds inline, non-resumable, and persisted resume envelopes with the shared resumable metadata rules", () => {
    expect(createInlineResumeEnvelope()).toEqual({
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
    });

    expect(
      createResumeEnvelope(
        INSPECTION_RESUME_ADMISSION_OUTCOMES.NARROWING_REQUIRED,
        null,
        "Narrow the requested root before retrying.",
        {
          resumeToken: null,
          status: null,
          expiresAt: null,
          supportedResumeModes: [INSPECTION_RESUME_MODES.COMPLETE_RESULT],
          recommendedResumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
        },
      ),
    ).toEqual({
      admission: {
        outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.NARROWING_REQUIRED,
        guidanceText: null,
        scopeReductionGuidanceText:
          "Narrow the requested root before retrying.",
      },
      resume: {
        resumeToken: null,
        resumable: false,
        status: null,
        expiresAt: null,
        supportedResumeModes: ["complete-result"],
        recommendedResumeMode: "complete-result",
      },
    });

    expect(
      createPersistedResumeEnvelope(
        "resume_789",
        INSPECTION_RESUME_STATUSES.ACTIVE,
        "2026-05-04T12:30:00Z",
        INSPECTION_PREVIEW_SUPPORTED_RESUME_MODES,
        INSPECTION_RESUME_MODES.NEXT_CHUNK,
        "Resume the next bounded chunk.",
        "Reduce the root scope if the payload stays too large.",
        INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      ),
    ).toEqual({
      admission: {
        outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
        guidanceText: "Resume the next bounded chunk.",
        scopeReductionGuidanceText:
          "Reduce the root scope if the payload stays too large.",
      },
      resume: {
        resumeToken: "resume_789",
        resumable: true,
        status: INSPECTION_RESUME_STATUSES.ACTIVE,
        expiresAt: "2026-05-04T12:30:00Z",
        supportedResumeModes: ["next-chunk", "complete-result"],
        recommendedResumeMode: "next-chunk",
      },
    });
  });

  it("formats preview chunk text blocks with the canonical structured payload guidance", () => {
    expect(
      formatInspectionPreviewChunkTextBlock(
        {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
          guidanceText: null,
          scopeReductionGuidanceText: "Narrow the roots before retrying.",
        },
        {
          resumeToken: "resume_456",
          resumable: true,
          status: INSPECTION_RESUME_STATUSES.ACTIVE,
          expiresAt: "2026-05-04T12:45:00Z",
          supportedResumeModes: [...INSPECTION_PREVIEW_SUPPORTED_RESUME_MODES],
          recommendedResumeMode: INSPECTION_RESUME_MODES.NEXT_CHUNK,
        },
        "Preview-first traversal is active for the current search request.",
        "Fallback guidance text.",
      ).split("\n"),
    ).toEqual([
      "Preview-first traversal is active for the current search request.",
      "Active resumeToken: resume_456",
      "Supported resume modes: next-chunk, complete-result",
      "Fallback guidance text.",
      "The authoritative match payload remains in structuredContent.",
      "Narrow the roots before retrying.",
    ]);
  });

  it("enforces the shared schema refinement rules for resume-only requests", () => {
    const inspectionResumeRequestSchema = z
      .object({
        resumeToken: z.string().optional(),
        resumeMode: InspectionResumeModeFieldSchema,
        roots: z.array(z.string()).optional(),
      })
      .superRefine((args, ctx) =>
        applyCommonResumeSchemaRefinement(
          args,
          ctx,
          (args.roots?.length ?? 0) > 0,
        ),
      );

    expect(
      inspectionResumeRequestSchema.safeParse({
        resumeMode: INSPECTION_RESUME_MODES.NEXT_CHUNK,
      }).success,
    ).toBe(false);
    expect(
      inspectionResumeRequestSchema.safeParse({
        resumeToken: "resume_123",
      }).success,
    ).toBe(false);
    expect(
      inspectionResumeRequestSchema.safeParse({
        resumeToken: "resume_123",
        resumeMode: INSPECTION_RESUME_MODES.NEXT_CHUNK,
        roots: ["src/domain"],
      }).success,
    ).toBe(false);
    expect(
      inspectionResumeRequestSchema.safeParse({
        roots: ["src/domain"],
      }).success,
    ).toBe(true);
    expect(
      inspectionResumeRequestSchema.safeParse({
        resumeToken: "resume_123",
        resumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      }).success,
    ).toBe(true);
  });

  it("reports invalid query-defining fields and missing resume mode for resume-only requests", () => {
    expect(
      validateResumeOnlyRequest({
        resumeToken: "resume_999",
        resumeMode: undefined,
        queryFields: {
          roots: ["src/domain"],
          includeGlobs: ["**/*.ts"],
          recursive: false,
          emptyString: "",
          emptyArray: [],
          falseFlag: false,
          nullField: null,
          undefinedField: undefined,
        },
      }),
    ).toEqual({
      invalidFieldNames: ["includeGlobs", "roots"],
      missingResumeMode: true,
    });

    expect(
      validateResumeOnlyRequest({
        resumeToken: undefined,
        resumeMode: undefined,
        queryFields: {
          roots: ["src/domain"],
        },
      }),
    ).toEqual({
      invalidFieldNames: [],
      missingResumeMode: false,
    });
  });

  it("formats the canonical resume-session not-found message with the failing family member", () => {
    expect(getResumeSessionNotFoundMessage("fixed-string-search")).toBe(
      "Resume request for family 'fixed-string-search' could not be fulfilled because the supplied resume token does not resolve to an active server-owned resume session.",
    );
  });

  it("clones traversal frames without reusing mutable references and commits traversal entries in place", () => {
    const traversalFrames = [
      {
        directoryRelativePath: "src/domain/shared",
        nextEntryIndex: 2,
      },
    ];

    const clonedTraversalFrames =
      cloneInspectionResumeTraversalFrames(traversalFrames);

    expect(clonedTraversalFrames).toEqual(traversalFrames);
    expect(clonedTraversalFrames).not.toBe(traversalFrames);
    expect(clonedTraversalFrames[0]).not.toBe(traversalFrames[0]);

    commitInspectionResumeTraversalEntry(clonedTraversalFrames[0]!);

    expect(clonedTraversalFrames[0]).toEqual({
      directoryRelativePath: "src/domain/shared",
      nextEntryIndex: 3,
    });
    expect(traversalFrames[0]).toEqual({
      directoryRelativePath: "src/domain/shared",
      nextEntryIndex: 2,
    });
  });
});
