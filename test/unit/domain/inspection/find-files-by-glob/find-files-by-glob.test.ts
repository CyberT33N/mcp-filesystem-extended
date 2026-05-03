import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  getFindFilesByGlobResult,
  handleSearchGlob,
} from "@domain/inspection/find-files-by-glob/handler";
import { FindFilesByGlobArgsSchema } from "@domain/inspection/find-files-by-glob/schema";
import { INSPECTION_RESUME_MODES } from "@domain/shared/resume/inspection-resume-contract";
import { DISCOVERY_MAX_RESULTS_HARD_CAP } from "@domain/shared/guardrails/tool-guardrail-limits";

describe("find_files_by_glob", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-find-glob-"));
    allowedDirectories = [sandboxRootPath];

    await mkdir(join(sandboxRootPath, "alpha"), { recursive: true });
    await mkdir(join(sandboxRootPath, "beta"), { recursive: true });

    await writeFile(
      join(sandboxRootPath, "alpha", "one.ts"),
      "export const one = 1;\n",
    );
    await writeFile(
      join(sandboxRootPath, "beta", "two.ts"),
      "export const two = 2;\n",
    );
    await writeFile(
      join(sandboxRootPath, "beta", "three.js"),
      "export const three = 3;\n",
    );
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("returns structured glob-search results for a small allowed root", async () => {
    const result = await getFindFilesByGlobResult(
      undefined,
      undefined,
      [sandboxRootPath],
      "**/*.ts",
      [],
      [],
      false,
      100,
      allowedDirectories,
    );

    const firstRoot = result.roots[0];

    expect(firstRoot).toBeDefined();

    if (firstRoot === undefined) {
      throw new Error("Expected one structured root result.");
    }

    expect(firstRoot.root).toBe(sandboxRootPath);
    expect(firstRoot.matches).toEqual([
      join(sandboxRootPath, "alpha", "one.ts"),
      join(sandboxRootPath, "beta", "two.ts"),
    ]);
    expect(firstRoot.truncated).toBe(false);
    expect(result.totalMatches).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.admission.outcome).toBe("inline");
    expect(result.resume.resumable).toBe(false);
  });

  it("formats caller-visible glob search output for inline matches", async () => {
    const output = await handleSearchGlob(
      undefined,
      undefined,
      [sandboxRootPath],
      "**/*.ts",
      [],
      [],
      false,
      100,
      allowedDirectories,
    );

    expect(output).toContain("Found 2 files matching pattern: **/*.ts");
    expect(output).toContain(join(sandboxRootPath, "alpha", "one.ts"));
    expect(output).toContain(join(sandboxRootPath, "beta", "two.ts"));
  });

  it("rejects resume requests when resume-session storage is unavailable", async () => {
    await expect(
      getFindFilesByGlobResult(
        "resume-1",
        INSPECTION_RESUME_MODES.NEXT_CHUNK,
        [sandboxRootPath],
        "**/*.ts",
        [],
        [],
        false,
        100,
        allowedDirectories,
      ),
    ).rejects.toThrow(
      "Resume-session storage is unavailable for find_files_by_glob resume requests.",
    );
  });

  it("enforces base-request and resume-only schema rules", () => {
    const validBaseRequest = FindFilesByGlobArgsSchema.safeParse({
      glob: "**/*.ts",
      roots: [sandboxRootPath],
    });
    const invalidResumeOnlyRequest = FindFilesByGlobArgsSchema.safeParse({
      glob: "**/*.ts",
      resumeMode: INSPECTION_RESUME_MODES.NEXT_CHUNK,
      resumeToken: "resume-1",
      roots: [sandboxRootPath],
    });

    expect(validBaseRequest.success).toBe(true);

    if (validBaseRequest.success) {
      expect(validBaseRequest.data.maxResults).toBe(
        DISCOVERY_MAX_RESULTS_HARD_CAP,
      );
    }

    expect(invalidResumeOnlyRequest.success).toBe(false);

    if (!invalidResumeOnlyRequest.success) {
      expect(
        invalidResumeOnlyRequest.error.issues.some((issue) =>
          issue.message.includes(
            "Resume-only requests must omit new query-defining fields",
          ),
        ),
      ).toBe(true);
    }
  });
});
