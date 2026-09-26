import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { calculateFileHash, calculateFileRegionHash } from "@infrastructure/filesystem/checksum";

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

describe("calculateFileRegionHash", () => {
  let sandboxRootPath = "";
  let sampleFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-region-hash-"));
    sampleFilePath = join(sandboxRootPath, "sample.txt");
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("hashes the whole file identically to calculateFileHash", async () => {
    await writeFile(sampleFilePath, "alpha\nbeta\n", "utf8");

    await expect(
      calculateFileRegionHash(sampleFilePath, { mode: "whole-file" }, "sha256"),
    ).resolves.toBe(await calculateFileHash(sampleFilePath, "sha256"));
  });

  it("hashes the prefix through the marker including its LF terminator", async () => {
    await writeFile(sampleFilePath, "alpha\n# MARK\nfree-stuff\n", "utf8");

    const regionHash = await calculateFileRegionHash(
      sampleFilePath,
      { mode: "prefix-through-marker", marker: "# MARK" },
      "sha256",
    );
    const expected = await calculateFileRegionHash(
      sampleFilePath,
      { mode: "byte-range", start: 0, endExclusive: "alpha\n# MARK\n".length },
      "sha256",
    );

    expect(regionHash).toBe(expected);
  });

  it("includes the CRLF terminator of the marker line", async () => {
    await writeFile(sampleFilePath, "alpha\r\n# MARK\r\nfree\r\n", "utf8");

    const regionHash = await calculateFileRegionHash(
      sampleFilePath,
      { mode: "prefix-through-marker", marker: "# MARK" },
      "sha256",
    );
    const expected = await calculateFileRegionHash(
      sampleFilePath,
      { mode: "byte-range", start: 0, endExclusive: "alpha\r\n# MARK\r\n".length },
      "sha256",
    );

    expect(regionHash).toBe(expected);
  });

  it("excludes content after the marker line from the region hash", async () => {
    await writeFile(sampleFilePath, "alpha\n# MARK\nfree-stuff\n", "utf8");

    const regionHash = await calculateFileRegionHash(
      sampleFilePath,
      { mode: "prefix-through-marker", marker: "# MARK" },
      "sha256",
    );

    expect(regionHash).not.toBe(await calculateFileHash(sampleFilePath, "sha256"));
  });

  it("hashes a marker line at end of file without a terminator", async () => {
    await writeFile(sampleFilePath, "alpha\n# MARK", "utf8");

    const regionHash = await calculateFileRegionHash(
      sampleFilePath,
      { mode: "prefix-through-marker", marker: "# MARK" },
      "sha256",
    );
    const expected = await calculateFileRegionHash(
      sampleFilePath,
      { mode: "byte-range", start: 0, endExclusive: "alpha\n# MARK".length },
      "sha256",
    );

    expect(regionHash).toBe(expected);
  });

  it("fails closed when the marker is absent", async () => {
    await writeFile(sampleFilePath, "alpha\n", "utf8");

    await expect(
      calculateFileRegionHash(sampleFilePath, { mode: "prefix-through-marker", marker: "# MARK" }, "sha256"),
    ).rejects.toThrow("marker not found");
  });

  it("hashes an exact byte-range window", async () => {
    await writeFile(sampleFilePath, "alpha\nbeta\n", "utf8");

    const regionHash = await calculateFileRegionHash(
      sampleFilePath,
      { mode: "byte-range", start: 0, endExclusive: 6 },
      "sha256",
    );
    const expected = await calculateFileRegionHash(
      sampleFilePath,
      { mode: "prefix-through-marker", marker: "alpha\n" },
      "sha256",
    );

    expect(regionHash).toBe(expected);
  });

  it("fails closed when the byte-range start is outside the file", async () => {
    await writeFile(sampleFilePath, "alpha\n", "utf8");

    await expect(
      calculateFileRegionHash(sampleFilePath, { mode: "byte-range", start: 999, endExclusive: 1000 }, "sha256"),
    ).rejects.toThrow("is outside the file");
  });

  it("fails closed when the byte-range end exceeds the file size", async () => {
    await writeFile(sampleFilePath, "alpha\n", "utf8");

    await expect(
      calculateFileRegionHash(sampleFilePath, { mode: "byte-range", start: 0, endExclusive: 999 }, "sha256"),
    ).rejects.toThrow("exceeds the file size");
  });

  it("supports caller-provided hash algorithms for regions", async () => {
    await writeFile(sampleFilePath, "abc", "utf8");

    await expect(
      calculateFileRegionHash(sampleFilePath, { mode: "whole-file" }, "md5"),
    ).resolves.toBe("900150983cd24fb0d6963f7d28e17f72");
  });

  it("uses sha256 when callers omit the algorithm for a region", async () => {
    await writeFile(sampleFilePath, "abc", "utf8");

    await expect(
      calculateFileRegionHash(sampleFilePath, { mode: "whole-file" }),
    ).resolves.toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
