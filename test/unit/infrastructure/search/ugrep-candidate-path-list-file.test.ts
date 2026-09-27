import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { withTemporaryUgrepCandidatePathListFile } from "@infrastructure/search/ugrep-candidate-path-list-file";

describe("ugrep_candidate_path_list_file", () => {
  let sandboxRootPath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-ugrep-candidate-path-list-"));
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("rejects an empty candidate set before materializing a manifest", async () => {
    await expect(
      withTemporaryUgrepCandidatePathListFile([], async () => "unreachable"),
    ).rejects.toThrow("requires at least one candidate path");
  });

  it("materializes the ordered manifest for the callback and removes it afterwards", async () => {
    const candidatePaths = [
      join(sandboxRootPath, "alpha.txt"),
      join(sandboxRootPath, "beta.txt"),
    ];

    const observed = await withTemporaryUgrepCandidatePathListFile(
      candidatePaths,
      async (candidatePathListFile) => {
        const manifestContent = await readFile(candidatePathListFile, "utf8");

        return { candidatePathListFile, manifestContent };
      },
    );

    expect(observed.manifestContent).toBe(`${candidatePaths.join("\n")}\n`);
    await expect(access(observed.candidatePathListFile)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(access(dirname(observed.candidatePathListFile))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
