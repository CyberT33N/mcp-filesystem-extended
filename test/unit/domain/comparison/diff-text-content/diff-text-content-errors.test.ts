import { describe, expect, it, vi } from "vitest";

const mockedCreateUnifiedDiff = vi.hoisted(() => vi.fn());

vi.mock("@infrastructure/formatting/unified-diff", () => ({
  createUnifiedDiff: mockedCreateUnifiedDiff,
  wrapDiffInSafeFencedBlock: vi.fn((diff: string) => diff),
}));

import { handleContentDiff } from "@domain/comparison/diff-text-content/handler";

describe("diff_text_content error aggregation", () => {
  it("keeps sibling pairs when one pair fails during diff generation", async () => {
    mockedCreateUnifiedDiff
      .mockImplementationOnce(() => {
        throw new Error("diff engine exploded");
      })
      .mockReturnValueOnce("diff-body");

    const output = await handleContentDiff([
      { content1: "a", content2: "b", label1: "left-a", label2: "right-a" },
      { content1: "c", content2: "d", label1: "left-b", label2: "right-b" },
    ]);

    expect(output).toContain("- 1 operation completed successfully");
    expect(output).toContain("- 1 operation failed");
    expect(output).toContain("diff engine exploded");
  });
});
