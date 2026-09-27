import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockedCreateUnifiedDiff = vi.hoisted(() => vi.fn());

vi.mock("@infrastructure/formatting/unified-diff", () => ({
  createUnifiedDiff: mockedCreateUnifiedDiff,
  wrapDiffInSafeFencedBlock: vi.fn((diff: string) => diff),
}));

import { handleFileDiff } from "@domain/comparison/diff-files/handler";

describe("diff_files identical surface", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];
  let leftFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-diff-files-identical-"));
    allowedDirectories = [sandboxRootPath];
    leftFilePath = join(sandboxRootPath, "left.txt");

    await writeFile(leftFilePath, "alpha\n", "utf8");
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("reports an empty diff surface as identical files", async () => {
    mockedCreateUnifiedDiff.mockReturnValueOnce("");

    const output = await handleFileDiff(
      [{ file1: leftFilePath, file2: leftFilePath }],
      allowedDirectories,
    );

    expect(output).toBe("Files are identical.");
  });
});
