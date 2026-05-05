import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleFileDiff } from "@domain/comparison/diff-files/handler";
import { DiffFilesArgsSchema } from "@domain/comparison/diff-files/schema";
import { MAX_COMPARISON_PAIRS_PER_REQUEST } from "@domain/shared/guardrails/tool-guardrail-limits";

describe("diff_files", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];
  let leftFilePath = "";
  let rightFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-diff-files-"));
    allowedDirectories = [sandboxRootPath];
    leftFilePath = join(sandboxRootPath, "left.txt");
    rightFilePath = join(sandboxRootPath, "right.txt");

    await writeFile(leftFilePath, "alpha\nbeta\n", "utf8");
    await writeFile(rightFilePath, "alpha\ngamma\n", "utf8");
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("returns a fenced unified diff for a single valid file pair", async () => {
    const output = await handleFileDiff(
      [{ file1: leftFilePath, file2: rightFilePath }],
      allowedDirectories,
    );

    expect(output.startsWith("```diff\n")).toBe(true);
    expect(output).toContain(leftFilePath);
    expect(output).toContain(rightFilePath);
    expect(output).toContain("gamma");
    expect(output).not.toContain("Processed 1 diff files operations:");
  });

  it("formats mixed batch results and surfaces per-pair errors", async () => {
    const missingFilePath = join(sandboxRootPath, "missing.txt");

    const output = await handleFileDiff(
      [
        { file1: leftFilePath, file2: rightFilePath },
        { file1: leftFilePath, file2: missingFilePath },
      ],
      allowedDirectories,
    );

    expect(output).toContain("Processed 2 diff files operations:");
    expect(output).toContain("- 1 operation completed successfully");
    expect(output).toContain("- 1 operation failed");
    expect(output).toContain(`${leftFilePath} ↔ ${rightFilePath}`);
    expect(output).toContain("Errors:");
    expect(output).toContain(`- ${leftFilePath} ↔ ${missingFilePath}: Error comparing files:`);
  });

  it("parses file diff pairs through the schema contract", () => {
    const parsed = DiffFilesArgsSchema.parse({
      pairs: [{ leftPath: "before.txt", rightPath: "after.txt" }],
    });

    expect(parsed.pairs).toEqual([
      { leftPath: "before.txt", rightPath: "after.txt" },
    ]);
  });

  it("rejects requests that exceed the comparison pair cap", () => {
    expect(() =>
      DiffFilesArgsSchema.parse({
        pairs: Array.from(
          { length: MAX_COMPARISON_PAIRS_PER_REQUEST + 1 },
          (_, index) => ({
            leftPath: `before-${index}.txt`,
            rightPath: `after-${index}.txt`,
          }),
        ),
      }),
    ).toThrow();
  });
});
