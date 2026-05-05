import { describe, expect, it } from "vitest";

import { handleContentDiff } from "@domain/comparison/diff-text-content/handler";
import { DiffTextContentArgsSchema } from "@domain/comparison/diff-text-content/schema";
import {
  MAX_RAW_TEXT_DIFF_PAIRS_PER_REQUEST,
  MAX_TOTAL_RAW_TEXT_REQUEST_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

describe("diff_text_content", () => {
  it("returns a fenced unified diff for a single raw-text pair", async () => {
    const output = await handleContentDiff([
      {
        content1: "old line\nstable line\n",
        content2: "new line\nstable line\n",
        label1: "original.txt",
        label2: "modified.txt",
      },
    ]);

    expect(output.startsWith("```diff\n")).toBe(true);
    expect(output).toContain("original.txt");
    expect(output).toContain("modified.txt");
    expect(output).toContain("new line");
  });

  it("formats multiple raw-text diffs into a deterministic batch summary", async () => {
    const output = await handleContentDiff([
      {
        content1: "alpha\n",
        content2: "beta\n",
        label1: "left-a",
        label2: "right-a",
      },
      {
        content1: "one\n",
        content2: "two\n",
        label1: "left-b",
        label2: "right-b",
      },
    ]);

    expect(output).toContain("Processed 2 diff text content operations:");
    expect(output).toContain("- 2 operations completed successfully");
    expect(output).toContain("[1] left-a ↔ right-a (#1)");
    expect(output).toContain("[2] left-b ↔ right-b (#2)");
  });

  it("applies schema defaults for omitted content labels", () => {
    const parsed = DiffTextContentArgsSchema.parse({
      pairs: [{ leftContent: "old", rightContent: "new" }],
    });

    expect(parsed.pairs).toEqual([
      {
        leftContent: "old",
        rightContent: "new",
        leftLabel: "original",
        rightLabel: "modified",
      },
    ]);
  });

  it("rejects requests that exceed the raw-text diff pair cap", () => {
    expect(() =>
      DiffTextContentArgsSchema.parse({
        pairs: Array.from(
          { length: MAX_RAW_TEXT_DIFF_PAIRS_PER_REQUEST + 1 },
          () => ({ leftContent: "old", rightContent: "new" }),
        ),
      }),
    ).toThrow();
  });

  it("rejects cumulative raw-text requests that exceed the in-memory diff budget", async () => {
    const oversizedHalf = "a".repeat(
      Math.floor(MAX_TOTAL_RAW_TEXT_REQUEST_CHARS / 2) + 1,
    );

    await expect(
      handleContentDiff([
        {
          content1: oversizedHalf,
          content2: oversizedHalf,
          label1: "original",
          label2: "modified",
        },
      ]),
    ).rejects.toThrow("cumulative raw-text budget");
  });
});
