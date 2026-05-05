import { describe, expect, it } from "vitest";

import {
  assertContentMutationInputBudget,
  assertPathMutationBatchBudget,
} from "@domain/mutation/shared/mutation-guardrails";
import {
  CONTENT_MUTATION_TOTAL_INPUT_CHARS,
  MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST,
} from "@domain/shared/guardrails/tool-guardrail-limits";

describe("mutation guardrails", () => {
  it("allows path-mutation batches at the shared operation ceiling", () => {
    expect(() =>
      assertPathMutationBatchBudget(
        "copy_paths",
        MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST,
      ),
    ).not.toThrow();
  });

  it("rejects path-mutation batches above the shared operation ceiling", () => {
    expect(() =>
      assertPathMutationBatchBudget(
        "copy_paths",
        MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST + 1,
      ),
    ).toThrow("Budget surface: copy_paths.operations.");
  });

  it("allows cumulative content-bearing mutation input at the shared character ceiling", () => {
    expect(() =>
      assertContentMutationInputBudget("create_files", [
        { content: "x".repeat(CONTENT_MUTATION_TOTAL_INPUT_CHARS) },
      ]),
    ).not.toThrow();
  });

  it("rejects cumulative content-bearing mutation input above the shared character ceiling", () => {
    expect(() =>
      assertContentMutationInputBudget("create_files", [
        { content: "x".repeat(CONTENT_MUTATION_TOTAL_INPUT_CHARS) },
        { content: "y" },
      ]),
    ).toThrow("Cumulative content-bearing mutation input characters");
  });
});
