import { Stats } from "node:fs";
import fs, { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  collectFixedStringLineMatches,
  createFixedStringPatternClassification,
  createFixedStringRootErrorResult,
  getValidatedSearchScopeEntry,
  matchesIncludedFilePatterns,
  parseUgrepMatchLine,
  sanitizeFixedStringMatchContent,
} from "@domain/inspection/search/search-file-contents-by-fixed-string/fixed-string-search-support";
import { PATTERN_CLASSIFICATION_LITERALS } from "@domain/shared/search/pattern-classifier";

const CONTROL_BEL = "\u0007";

describe("fixed_string_search_support", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];
  let sampleFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-support-"));
    allowedDirectories = [sandboxRootPath];
    sampleFilePath = join(sandboxRootPath, "notes.txt");

    await writeFile(sampleFilePath, "needle in a haystack\n", "utf8");
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("creates the canonical literal pattern classification for fixed-string search", () => {
    expect(createFixedStringPatternClassification("needle")).toEqual({
      classification: PATTERN_CLASSIFICATION_LITERALS.literal,
      originalPattern: "needle",
      requiresPcre2: false,
      supportsLiteralFastPath: true,
    });
  });

  it("matches include globs across empty, bare-name, and slash-bearing forms", () => {
    expect(matchesIncludedFilePatterns("src/app.ts", [])).toBe(true);
    expect(matchesIncludedFilePatterns("src/app.ts", ["*.ts"])).toBe(true);
    expect(matchesIncludedFilePatterns("src/app.md", ["*.ts"])).toBe(false);
    expect(matchesIncludedFilePatterns("src/deep/app.ts", ["src/**/*.ts"])).toBe(true);
    expect(matchesIncludedFilePatterns("docs/app.ts", ["src/**/*.ts"])).toBe(false);
  });

  it("parses backend match lines and rejects structurally invalid lines", () => {
    expect(parseUgrepMatchLine("file.txt:3:matched content")).toEqual({
      file: "file.txt",
      line: 3,
      lineContent: "matched content",
    });
    expect(parseUgrepMatchLine("no-colons-here")).toBeNull();
    expect(parseUgrepMatchLine("file.txt:0:content")).toBeNull();
  });

  it("collects every literal hit per line while preserving caller casing", () => {
    expect(collectFixedStringLineMatches("content", "")).toEqual([]);
    expect(collectFixedStringLineMatches("a a", "a", true)).toEqual(["a", "a"]);
    expect(collectFixedStringLineMatches("Alpha alpha", "alpha", false)).toEqual([
      "Alpha",
      "alpha",
    ]);
    expect(collectFixedStringLineMatches("nothing here", "needle", true)).toEqual([]);
  });

  it("sanitizes control characters only on the hybrid literal-search lane", () => {
    const lineWithControl = `a${CONTROL_BEL}b`;

    expect(sanitizeFixedStringMatchContent("plain", "plain", false)).toBe("plain");
    expect(sanitizeFixedStringMatchContent(lineWithControl, "a", true)).toBe("a�b");
    expect(sanitizeFixedStringMatchContent(lineWithControl, "a", false)).toBe(lineWithControl);
  });

  it("creates the canonical per-root error result surface", () => {
    expect(createFixedStringRootErrorResult("root", "boom")).toEqual({
      error: "boom",
      matches: [],
      filesSearched: 0,
      root: "root",
      stopMessage: null,
      stopReason: null,
      totalMatches: 0,
      truncated: false,
    });
  });

  it("resolves a validated file search scope entry through the shared preflight surface", async () => {
    const entry = await getValidatedSearchScopeEntry(sampleFilePath, allowedDirectories);

    expect(entry.type).toBe("file");
    expect(entry.requestedPath).toBe(sampleFilePath);
  });

  it("rejects search scopes whose resolved type is neither file nor directory", async () => {
    vi.spyOn(fs, "lstat").mockResolvedValueOnce(new Stats());

    await expect(
      getValidatedSearchScopeEntry(sampleFilePath, allowedDirectories),
    ).rejects.toThrow("not permitted");
  });
});
