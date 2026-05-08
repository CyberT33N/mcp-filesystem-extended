import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { calculateFileHash } from "@infrastructure/filesystem/checksum";

describe("calculateFileHash", () => {
  let sandboxRootPath = "";
  let sampleFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-checksum-"));
    sampleFilePath = join(sandboxRootPath, "sample.txt");
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("uses sha256 when callers omit the algorithm", async () => {
    await writeFile(sampleFilePath, "abc", "utf8");

    await expect(calculateFileHash(sampleFilePath)).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("supports caller-provided hash algorithms", async () => {
    await writeFile(sampleFilePath, "abc", "utf8");

    await expect(calculateFileHash(sampleFilePath, "md5")).resolves.toBe(
      "900150983cd24fb0d6963f7d28e17f72",
    );
  });
});
