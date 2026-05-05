import { describe, expect, it } from "vitest";

import {
  assertActualTextBudget,
  assertProjectedTextBudget,
  estimateDiffResponseCharsFromByteSizes,
  estimateLineNumberedResponseCharsFromBytes,
  estimateTokenLoadFromBytes,
} from "@domain/shared/guardrails/text-response-budget";

describe("text response budget", () => {
  it("projects token load and formatted character budgets from byte sizes", () => {
    expect(estimateTokenLoadFromBytes(7)).toBe(3);
    expect(estimateLineNumberedResponseCharsFromBytes(100)).toBe(199);
    expect(estimateDiffResponseCharsFromByteSizes(100, 50)).toBe(752);
  });

  it("allows projected and actual text budgets at the configured ceiling", () => {
    expect(() =>
      assertProjectedTextBudget(
        "read_files_with_line_numbers",
        100,
        100,
        "line-numbered read response",
      ),
    ).not.toThrow();

    expect(() =>
      assertActualTextBudget(
        "read_files_with_line_numbers",
        100,
        100,
        "line-numbered read response",
      ),
    ).not.toThrow();
  });

  it("rejects projected text budgets that exceed the preflight ceiling", () => {
    expect(() =>
      assertProjectedTextBudget(
        "read_files_with_line_numbers",
        101,
        100,
        "line-numbered read response",
        "Split the file set into smaller requests.",
      ),
    ).toThrow("Request rejected during metadata preflight");
  });

  it("rejects actual text budgets that exceed the runtime ceiling", () => {
    expect(() =>
      assertActualTextBudget(
        "read_files_with_line_numbers",
        101,
        100,
        "line-numbered read response",
      ),
    ).toThrow("Failure code: runtime_budget_exceeded");
  });
});
