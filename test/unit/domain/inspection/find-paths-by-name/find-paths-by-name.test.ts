import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  getFindPathsByNameResult,
  handleSearchFiles,
} from "@domain/inspection/find-paths-by-name/handler";
import { searchFiles } from "@domain/inspection/find-paths-by-name/helpers";
import { FindPathsByNameArgsSchema } from "@domain/inspection/find-paths-by-name/schema";
import { INSPECTION_RESUME_MODES } from "@domain/shared/resume/inspection-resume-contract";
import { DISCOVERY_MAX_RESULTS_HARD_CAP } from "@domain/shared/guardrails/tool-guardrail-limits";

describe("find_paths_by_name", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-find-name-"));
    allowedDirectories = [sandboxRootPath];

    await mkdir(join(sandboxRootPath, "alpha"), { recursive: true });
    await mkdir(join(sandboxRootPath, "gamma"), { recursive: true });
    await mkdir(join(sandboxRootPath, "schema-folder"), { recursive: true });

    await writeFile(
      join(sandboxRootPath, "alpha", "SchemaRecord.ts"),
      "export const schemaRecord = true;\n",
    );
    await writeFile(
      join(sandboxRootPath, "gamma", "schema-output.json"),
      '{"status":"ok"}\n',
    );
    await writeFile(
      join(sandboxRootPath, "alpha", "plain.txt"),
      "plain text\n",
    );
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("matches file and directory names case-insensitively through the helper surface", async () => {
    const result = await searchFiles(
      sandboxRootPath,
      "schema",
      [],
      [],
      false,
      allowedDirectories,
      100,
    );

    expect(result.matches).toEqual(
      expect.arrayContaining([
        join(sandboxRootPath, "alpha", "SchemaRecord.ts"),
        join(sandboxRootPath, "gamma", "schema-output.json"),
        join(sandboxRootPath, "schema-folder"),
      ]),
    );
    expect(result.truncated).toBe(false);
  });

  it("returns structured per-root name-search results with aggregate totals", async () => {
    const alphaRootPath = join(sandboxRootPath, "alpha");
    const gammaRootPath = join(sandboxRootPath, "gamma");

    const result = await getFindPathsByNameResult(
      undefined,
      undefined,
      [alphaRootPath, gammaRootPath],
      "schema",
      [],
      [],
      false,
      undefined,
      allowedDirectories,
      100,
    );

    const firstRoot = result.roots[0];
    const secondRoot = result.roots[1];

    expect(firstRoot).toBeDefined();
    expect(secondRoot).toBeDefined();

    if (firstRoot === undefined || secondRoot === undefined) {
      throw new Error("Expected structured results for both requested roots.");
    }

    expect(firstRoot.root).toBe(alphaRootPath);
    expect(firstRoot.matches).toEqual([
      join(alphaRootPath, "SchemaRecord.ts"),
    ]);
    expect(secondRoot.root).toBe(gammaRootPath);
    expect(secondRoot.matches).toEqual([
      join(gammaRootPath, "schema-output.json"),
    ]);
    expect(result.totalMatches).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.admission.outcome).toBe("inline");
    expect(result.resume.resumable).toBe(false);
  });

  it("formats caller-visible inline name-search output", async () => {
    const alphaRootPath = join(sandboxRootPath, "alpha");

    const output = await handleSearchFiles(
      undefined,
      undefined,
      [alphaRootPath],
      "schema",
      [],
      [],
      false,
      undefined,
      allowedDirectories,
      100,
    );

    expect(output).toContain(join(alphaRootPath, "SchemaRecord.ts"));
  });

  it("rejects resume requests when resume-session storage is unavailable", async () => {
    await expect(
      getFindPathsByNameResult(
        "resume-1",
        INSPECTION_RESUME_MODES.NEXT_CHUNK,
        [sandboxRootPath],
        "schema",
        [],
        [],
        false,
        undefined,
        allowedDirectories,
        100,
      ),
    ).rejects.toThrow(
      "Resume-session storage is unavailable for find_paths_by_name resume requests.",
    );
  });

  it("enforces base-request and resume-only schema rules", () => {
    const validBaseRequest = FindPathsByNameArgsSchema.safeParse({
      nameContains: "schema",
      roots: [sandboxRootPath],
    });
    const invalidResumeOnlyRequest = FindPathsByNameArgsSchema.safeParse({
      nameContains: "schema",
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
