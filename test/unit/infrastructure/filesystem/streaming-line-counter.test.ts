import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  countMatchingLinesInFile,
  countTotalLinesInFile,
} from "@infrastructure/filesystem/streaming-line-counter";

describe("streaming_line_counter", () => {
  let sandboxRootPath = "";
  let sampleFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-streaming-line-counter-"));
    sampleFilePath = join(sandboxRootPath, "sample.txt");
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("counts newline-delimited lines without inventing a trailing empty line by default", async () => {
    await writeFile(sampleFilePath, "alpha\nbeta\n", "utf8");

    await expect(countTotalLinesInFile(sampleFilePath)).resolves.toBe(2);
  });

  it("ignores blank lines when callers request that behavior", async () => {
    await writeFile(sampleFilePath, "alpha\n\nbeta\n", "utf8");

    await expect(
      countTotalLinesInFile(sampleFilePath, { ignoreEmptyLines: true }),
    ).resolves.toBe(2);
  });

  it("counts only lines that match the caller-owned predicate", async () => {
    await writeFile(sampleFilePath, "alpha\nbeta\napricot\n", "utf8");

    await expect(
      countMatchingLinesInFile(
        sampleFilePath,
        async (line) => line.startsWith("a"),
        { ignoreEmptyLines: true },
      ),
    ).resolves.toBe(2);
  });
});
