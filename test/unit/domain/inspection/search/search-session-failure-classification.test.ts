import { describe, expect, it } from "vitest";

import {
  classifySearchResumePassFailure,
  SEARCH_RESUME_PASS_FAILURE_CLASSES,
} from "@domain/inspection/search/search-session-failure-classification";
import { TraversalRuntimeBudgetExceededError } from "@domain/shared/guardrails/traversal-runtime-budget";

describe("search_resume_pass_failure_classification", () => {
  it("classifies traversal runtime budget breaches as transient", () => {
    expect(
      classifySearchResumePassFailure(
        new TraversalRuntimeBudgetExceededError(
          "Traversal runtime budget exceeded.",
          "search_file_contents_by_regex",
          "visited entries",
          2,
          1,
          "entries",
        ),
      ),
    ).toBe(SEARCH_RESUME_PASS_FAILURE_CLASSES.TRANSIENT);
  });

  it("classifies metadata-preflight rejections as permanent", () => {
    expect(
      classifySearchResumePassFailure(
        new Error(
          "Tool guardrail refusal: Request rejected during metadata preflight before content execution began.\nFailure code: metadata_preflight_rejected\nDetails:\n- reason",
        ),
      ),
    ).toBe(SEARCH_RESUME_PASS_FAILURE_CLASSES.PERMANENT);
  });

  it("classifies runtime-budget refusals, backend timeouts, and unclassified failures as transient", () => {
    expect(
      classifySearchResumePassFailure(new Error("Failure code: runtime_budget_exceeded")),
    ).toBe(SEARCH_RESUME_PASS_FAILURE_CLASSES.TRANSIENT);
    expect(
      classifySearchResumePassFailure(
        new Error("Native search runner timed out before completion."),
      ),
    ).toBe(SEARCH_RESUME_PASS_FAILURE_CLASSES.TRANSIENT);
    expect(classifySearchResumePassFailure(new Error("backend exploded"))).toBe(
      SEARCH_RESUME_PASS_FAILURE_CLASSES.TRANSIENT,
    );
    expect(classifySearchResumePassFailure("plain string failure")).toBe(
      SEARCH_RESUME_PASS_FAILURE_CLASSES.TRANSIENT,
    );
  });
});
