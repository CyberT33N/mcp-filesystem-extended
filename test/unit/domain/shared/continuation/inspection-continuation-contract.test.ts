import { describe, expect, it } from "vitest";

import {
  createContinuationEnvelope,
  createInlineContinuationEnvelope,
  createPersistedContinuationEnvelope,
  getContinuationNotFoundMessage,
  INSPECTION_CONTINUATION_ADMISSION_OUTCOMES,
  INSPECTION_CONTINUATION_STATUSES,
  INSPECTION_CONTINUATION_TOKEN_FIELD,
  validateContinuationOnlyRequest,
} from "@domain/shared/continuation/inspection-continuation-contract";

describe("inspection_continuation_contract", () => {
  it("exposes the canonical continuation token and continuation vocabularies", () => {
    expect(INSPECTION_CONTINUATION_TOKEN_FIELD).toBe("continuationToken");
    expect(INSPECTION_CONTINUATION_ADMISSION_OUTCOMES).toEqual({
      INLINE: "inline",
      PREVIEW_FIRST: "preview-first",
      TASK_BACKED_REQUIRED: "task-backed-required",
    });
    expect(INSPECTION_CONTINUATION_STATUSES).toEqual({
      ACTIVE: "active",
      CANCELLED: "cancelled",
      COMPLETED: "completed",
      EXPIRED: "expired",
    });
  });

  it("builds the inline continuation envelope with cleared continuation metadata", () => {
    expect(createInlineContinuationEnvelope()).toEqual({
      admission: {
        outcome: INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.INLINE,
        guidanceText: null,
        resumable: false,
      },
      continuation: {
        continuationToken: null,
        familyMember: null,
        status: null,
        resumable: false,
        expiresAt: null,
      },
    });
  });

  it("builds a non-resumable continuation envelope when no persisted session is present", () => {
    expect(
      createContinuationEnvelope(
        INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
        "Retry with a narrower request.",
        null,
      ),
    ).toEqual({
      admission: {
        outcome: INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
        guidanceText: "Retry with a narrower request.",
        resumable: false,
      },
      continuation: {
        continuationToken: null,
        familyMember: null,
        status: null,
        resumable: false,
        expiresAt: null,
      },
    });
  });

  it("builds resumable continuation envelopes for active persisted sessions", () => {
    expect(
      createContinuationEnvelope(
        INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
        "Resume with the stored continuation token.",
        {
          continuationToken: "cont_123",
          familyMember: "directory-listing",
          status: INSPECTION_CONTINUATION_STATUSES.ACTIVE,
          expiresAt: "2026-05-04T12:03:00Z",
        },
      ),
    ).toEqual({
      admission: {
        outcome: INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
        guidanceText: "Resume with the stored continuation token.",
        resumable: true,
      },
      continuation: {
        continuationToken: "cont_123",
        familyMember: "directory-listing",
        status: INSPECTION_CONTINUATION_STATUSES.ACTIVE,
        resumable: true,
        expiresAt: "2026-05-04T12:03:00Z",
      },
    });
  });

  it("builds persisted continuation envelopes through the dedicated wrapper", () => {
    expect(
      createPersistedContinuationEnvelope(
        "regex-search",
        "cont_456",
        INSPECTION_CONTINUATION_STATUSES.COMPLETED,
        "2026-05-04T12:30:00Z",
        "Resume the same bounded search request.",
        INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.TASK_BACKED_REQUIRED,
      ),
    ).toEqual({
      admission: {
        outcome:
          INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.TASK_BACKED_REQUIRED,
        guidanceText: "Resume the same bounded search request.",
        resumable: true,
      },
      continuation: {
        continuationToken: "cont_456",
        familyMember: "regex-search",
        status: INSPECTION_CONTINUATION_STATUSES.COMPLETED,
        resumable: true,
        expiresAt: "2026-05-04T12:30:00Z",
      },
    });
  });

  it("filters invalid query-defining fields for continuation-only requests", () => {
    expect(
      validateContinuationOnlyRequest({
        continuationToken: "cont_789",
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
    ).toEqual(["includeGlobs", "roots"]);
  });

  it("returns no invalid fields when validation runs without a continuation token", () => {
    expect(
      validateContinuationOnlyRequest({
        continuationToken: undefined,
        queryFields: {
          roots: ["src/domain"],
        },
      }),
    ).toEqual([]);
  });

  it("formats the canonical not-found message with the failing family member", () => {
    expect(getContinuationNotFoundMessage("directory-listing")).toBe(
      "Continuation request for family 'directory-listing' could not be resumed because the supplied continuation token does not resolve to an active server-owned continuation session.",
    );
  });
});
