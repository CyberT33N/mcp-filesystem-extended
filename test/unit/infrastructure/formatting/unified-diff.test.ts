import { describe, expect, it } from "vitest";

import {
  createUnifiedDiff,
  normalizeLineEndings,
  wrapDiffInSafeFencedBlock,
} from "@infrastructure/formatting/unified-diff";

describe("unified_diff", () => {
  it("normalizes CRLF content before building a unified diff", () => {
    expect(normalizeLineEndings("alpha\r\nbeta\r\n")).toBe("alpha\nbeta\n");

    const diff = createUnifiedDiff(
      "alpha\r\nbeta\r\n",
      "alpha\ncharlie\n",
      "before.txt",
      "after.txt",
    );

    expect(diff).toContain("--- before.txt\toriginal");
    expect(diff).toContain("+++ after.txt\tmodified");
    expect(diff).toContain("-beta");
    expect(diff).toContain("+charlie");
    expect(diff).not.toContain("\r\n");
  });

  it("wraps diffs in the minimum safe fenced block when backticks already appear in the diff", () => {
    const rawDiff = "```diff\n-old\n+new\n````";
    const wrapped = wrapDiffInSafeFencedBlock(rawDiff);

    expect(wrapped.startsWith("`````diff\n")).toBe(true);
    expect(wrapped.endsWith("`````")) .toBe(true);
    expect(wrapped).toContain(rawDiff);
  });
});
