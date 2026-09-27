import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockedReadValidatedFullTextFile = vi.hoisted(() => vi.fn());

vi.mock("@infrastructure/filesystem/text-read-core", () => ({
  formatLineNumberedTextContent: vi.fn((content: string) => content),
  readValidatedFullTextFile: mockedReadValidatedFullTextFile,
}));

import { handleReadFiles } from "@domain/inspection/read-files-with-line-numbers/handler";

describe("read_files_with_line_numbers error surface", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];
  let textFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-read-files-errors-"));
    allowedDirectories = [sandboxRootPath];
    textFilePath = join(sandboxRootPath, "notes.txt");

    await writeFile(textFilePath, "alpha\n", "utf8");
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("stringifies non-Error rejections from the shared read surface", async () => {
    mockedReadValidatedFullTextFile.mockRejectedValueOnce("raw string failure");

    const output = await handleReadFiles([textFilePath], allowedDirectories);

    expect(output).toContain(`${textFilePath}: Error - raw string failure`);
  });
});
