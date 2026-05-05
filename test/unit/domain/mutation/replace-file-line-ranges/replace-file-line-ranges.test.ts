import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleReplaceFileLineRanges } from "@domain/mutation/replace-file-line-ranges/handler";
import { applyFileLineRangeReplacements } from "@domain/mutation/replace-file-line-ranges/helpers";
import { ReplaceFileLineRangesArgsSchema } from "@domain/mutation/replace-file-line-ranges/schema";

describe("replace_file_line_ranges", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];
  let targetFilePath = "";
  let initialFileContent = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(
      join(tmpdir(), "mcp-fs-replace-file-line-ranges-"),
    );
    allowedDirectories = [sandboxRootPath];
    targetFilePath = join(sandboxRootPath, "notes.ts");
    initialFileContent = [
      "export const items = [",
      "  'first',",
      "  'second',",
      "];",
      "",
      "export function formatItems() {",
      "  return items.join(', ');",
      "}",
    ].join("\n");

    await writeFile(targetFilePath, initialFileContent, "utf8");
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("applies line-range replacements through the handler and writes the updated file", async () => {
    const output = await handleReplaceFileLineRanges(
      [
        {
          path: targetFilePath,
          replacements: [
            {
              startLine: 2,
              endLine: 3,
              replacementText: "'updated first',\n  'updated second',",
            },
          ],
        },
      ],
      false,
      { preserveIndentation: true },
      allowedDirectories,
    );

    expect(await readFile(targetFilePath, "utf8")).toBe(
      [
        "export const items = [",
        "  'updated first',",
        "  'updated second',",
        "];",
        "",
        "export function formatItems() {",
        "  return items.join(', ');",
        "}",
      ].join("\n"),
    );
    expect(output).toContain("Processed 1 files:");
    expect(output).toContain("Replacement 1: APPLIED (lines 2-3)");
  });

  it("returns a diff preview without writing when dryRun is enabled", async () => {
    const output = await handleReplaceFileLineRanges(
      [
        {
          path: targetFilePath,
          replacements: [
            {
              startLine: 7,
              endLine: 7,
              replacementText: "return items.join(' | ');",
            },
          ],
        },
      ],
      true,
      { preserveIndentation: true },
      allowedDirectories,
    );

    expect(await readFile(targetFilePath, "utf8")).toBe(initialFileContent);
    expect(output).toContain("Processed 1 files:");
    expect(output).toContain("```diff");
    expect(output).toContain("+  return items.join(' | ');");
  });

  it("preserves indentation when applying replacements directly through the helper", async () => {
    const preview = await applyFileLineRangeReplacements(
      targetFilePath,
      [
        {
          startLine: 7,
          endLine: 7,
          replacementText: "return items.join(' / ');",
        },
      ],
      true,
      { preserveIndentation: true },
    );

    expect(await readFile(targetFilePath, "utf8")).toBe(initialFileContent);
    expect(preview).toContain("+  return items.join(' / ');");
  });

  it("parses line-range replacement batches through the schema", () => {
    const parsed = ReplaceFileLineRangesArgsSchema.parse({
      files: [
        {
          path: "notes.txt",
          replacements: [
            {
              startLine: 1,
              endLine: 2,
              replacementText: "updated",
            },
          ],
        },
      ],
      dryRun: true,
    });

    expect(parsed.files).toEqual([
      {
        path: "notes.txt",
        replacements: [
          {
            startLine: 1,
            endLine: 2,
            replacementText: "updated",
          },
        ],
      },
    ]);
    expect(parsed.dryRun).toBe(true);
  });
});
