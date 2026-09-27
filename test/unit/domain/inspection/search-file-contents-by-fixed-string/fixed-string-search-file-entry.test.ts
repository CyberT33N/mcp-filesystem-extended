import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockedGetRequiredUgrepExecutablePath,
  mockedRunUgrepSearch,
} = vi.hoisted(() => ({
  mockedGetRequiredUgrepExecutablePath: vi.fn(() => "C:/tools/ugrep.exe"),
  mockedRunUgrepSearch: vi.fn(),
}));

vi.mock("@infrastructure/runtime/ugrep-runtime-dependency", () => ({
  getRequiredUgrepExecutablePath: mockedGetRequiredUgrepExecutablePath,
}));

vi.mock("@infrastructure/search/ugrep-runner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@infrastructure/search/ugrep-runner")>();

  return {
    ...actual,
    runUgrepSearch: mockedRunUgrepSearch,
  };
});

import {
  collectFixedStringMatchesFromDecodedText,
  collectFixedStringMatchesFromFileEntry,
} from "@domain/inspection/search/search-file-contents-by-fixed-string/fixed-string-search-file-entry";
import { createFixedStringSearchAggregateBudgetState } from "@domain/inspection/search/search-file-contents-by-fixed-string/fixed-string-search-aggregate-budget-state";
import { REGEX_SEARCH_MAX_RESULTS_HARD_CAP } from "@domain/shared/guardrails/tool-guardrail-limits";
import { PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE } from "@domain/shared/runtime/io-capability-profile";
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import type { UgrepSearchExecutionResult } from "@infrastructure/search/ugrep-runner";

const createUgrepResult = (
  overrides: Partial<UgrepSearchExecutionResult> = {},
): UgrepSearchExecutionResult => ({
  args: [],
  durationMs: 1,
  executable: "C:/tools/ugrep.exe",
  exitCode: 0,
  fixedStringMode: true,
  requiresPcre2: false,
  signal: null,
  spawnErrorMessage: null,
  stderr: "",
  stdout: "",
  syncCandidateBytesCap: 0,
  timedOut: false,
  ...overrides,
});

describe("fixed_string_search_file_entry", () => {
  let sandboxRootPath = "";
  let textFilePath = "";
  let binaryFilePath = "";
  let utf16FilePath = "";

  const textEntry = () => ({
    requestedPath: textFilePath,
    size: 12,
    type: "file" as const,
    validPath: textFilePath,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-file-entry-"));
    textFilePath = join(sandboxRootPath, "notes.txt");
    binaryFilePath = join(sandboxRootPath, "image.png");
    utf16FilePath = join(sandboxRootPath, "utf16.txt");

    await writeFile(textFilePath, "needle one\nneedle two\n", "utf8");
    await writeFile(
      binaryFilePath,
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    await writeFile(utf16FilePath, Buffer.from("needle one\nneedle two\n", "utf16le"));
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("skips already-delivered matches and truncates at the remaining location budget", () => {
    const skipped = collectFixedStringMatchesFromDecodedText(
      textEntry(),
      "needle",
      true,
      "needle one\nneedle two\nneedle three",
      3,
      1,
    );

    expect(skipped.matches).toHaveLength(2);
    expect(skipped.matches[0]?.line).toBe(2);
    expect(skipped.truncated).toBe(false);

    const truncated = collectFixedStringMatchesFromDecodedText(
      textEntry(),
      "needle",
      true,
      "needle one\nneedle two\nneedle three",
      1,
      0,
    );

    expect(truncated.matches).toHaveLength(1);
    expect(truncated.truncated).toBe(true);
  });

  it("returns the unstopped early result when the candidate leaves the include-glob surface", async () => {
    const result = await collectFixedStringMatchesFromFileEntry(
      textEntry(),
      "notes.txt",
      "needle",
      ["*.md"],
      true,
      resolveSearchExecutionPolicy(PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE),
      createFixedStringSearchAggregateBudgetState(),
      false,
      false,
      false,
      10,
      0,
      0,
    );

    expect(result.fileSearched).toBe(false);
    expect(result.matches).toEqual([]);
  });

  it("refuses or skips unsupported file scopes depending on the caller policy", async () => {
    const binaryEntry = {
      requestedPath: binaryFilePath,
      size: 8,
      type: "file" as const,
      validPath: binaryFilePath,
    };
    const policy = resolveSearchExecutionPolicy(
      PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
    );

    await expect(
      collectFixedStringMatchesFromFileEntry(
        binaryEntry,
        "image.png",
        "needle",
        [],
        true,
        policy,
        createFixedStringSearchAggregateBudgetState(),
        false,
        true,
        false,
        10,
        0,
        0,
      ),
    ).rejects.toThrow("binary");

    const skipped = await collectFixedStringMatchesFromFileEntry(
      binaryEntry,
      "image.png",
      "needle",
      [],
      true,
      policy,
      createFixedStringSearchAggregateBudgetState(),
      false,
      false,
      false,
      10,
      0,
      0,
    );

    expect(skipped.fileSearched).toBe(false);
    expect(skipped.matches).toEqual([]);
  });

  it("reports the max-results stop state when the location budget is already exhausted", async () => {
    const result = await collectFixedStringMatchesFromFileEntry(
      textEntry(),
      "notes.txt",
      "needle",
      [],
      true,
      resolveSearchExecutionPolicy(PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE),
      createFixedStringSearchAggregateBudgetState(),
      false,
      false,
      false,
      0,
      0,
      0,
    );

    expect(result.fileSearched).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.stopState.stopReason).toBe("max_results_limit_reached");
  });

  it("enforces the aggregate candidate-byte budget before reading the candidate", async () => {
    const policy = {
      ...resolveSearchExecutionPolicy(PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE),
      fixedStringServiceHardGapBytes: 4,
    };

    await expect(
      collectFixedStringMatchesFromFileEntry(
        textEntry(),
        "notes.txt",
        "needle",
        [],
        true,
        policy,
        createFixedStringSearchAggregateBudgetState(),
        true,
        false,
        false,
        10,
        0,
        0,
      ),
    ).rejects.toThrow("Candidate byte budget exceeds");
  });

  it("reduces the effective location cap when the preview-first response cap triggers", async () => {
    const policy = {
      ...resolveSearchExecutionPolicy(PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE),
      fixedStringSyncCandidateBytesCap: 4,
    };
    const expectedCap = Math.max(
      1,
      Math.min(300, Math.floor(REGEX_SEARCH_MAX_RESULTS_HARD_CAP * 0.5)),
    );

    mockedRunUgrepSearch.mockResolvedValueOnce(
      createUgrepResult({
        stdout: `${textFilePath}:1:needle\n`.repeat(250),
      }),
    );

    const result = await collectFixedStringMatchesFromFileEntry(
      textEntry(),
      "notes.txt",
      "needle",
      [],
      true,
      policy,
      createFixedStringSearchAggregateBudgetState(),
      false,
      false,
      true,
      300,
      0,
      0,
    );

    expect(mockedRunUgrepSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining([`--max-count=${expectedCap}`]),
      }),
    );
    expect(result.truncated).toBe(true);
    expect(result.stopState.stopReason).toBe("max_results_limit_reached");
  });

  it("collects matches through the decoded-text fallback for utf16le surfaces", async () => {
    const utf16Entry = {
      requestedPath: utf16FilePath,
      size: Buffer.byteLength("needle one\nneedle two\n", "utf16le"),
      type: "file" as const,
      validPath: utf16FilePath,
    };

    const result = await collectFixedStringMatchesFromFileEntry(
      utf16Entry,
      "utf16.txt",
      "needle",
      [],
      true,
      resolveSearchExecutionPolicy(PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE),
      createFixedStringSearchAggregateBudgetState(),
      false,
      false,
      false,
      10,
      0,
      0,
    );

    expect(result.fileSearched).toBe(true);
    expect(result.totalMatches).toBe(2);
    expect(result.matches[0]?.line).toBe(1);
  });

  it("truncates the decoded-text fallback at the effective location budget", async () => {
    const utf16Entry = {
      requestedPath: utf16FilePath,
      size: Buffer.byteLength("needle one\nneedle two\n", "utf16le"),
      type: "file" as const,
      validPath: utf16FilePath,
    };

    const result = await collectFixedStringMatchesFromFileEntry(
      utf16Entry,
      "utf16.txt",
      "needle",
      [],
      true,
      resolveSearchExecutionPolicy(PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE),
      createFixedStringSearchAggregateBudgetState(),
      false,
      false,
      false,
      1,
      0,
      0,
    );

    expect(result.truncated).toBe(true);
    expect(result.stopState.stopReason).toBe("max_results_limit_reached");
  });

  it("throws the formatted spawn failure when the native runner cannot start", async () => {
    mockedRunUgrepSearch.mockResolvedValueOnce(
      createUgrepResult({ exitCode: null, spawnErrorMessage: "spawn ENOENT" }),
    );

    await expect(
      collectFixedStringMatchesFromFileEntry(
        textEntry(),
        "notes.txt",
        "needle",
        [],
        true,
        resolveSearchExecutionPolicy(PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE),
        createFixedStringSearchAggregateBudgetState(),
        false,
        false,
        false,
        10,
        0,
        0,
      ),
    ).rejects.toThrow("Native search runner failed to start");
  });

  it("throws when the native runner times out", async () => {
    mockedRunUgrepSearch.mockResolvedValueOnce(createUgrepResult({ timedOut: true }));

    await expect(
      collectFixedStringMatchesFromFileEntry(
        textEntry(),
        "notes.txt",
        "needle",
        [],
        true,
        resolveSearchExecutionPolicy(PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE),
        createFixedStringSearchAggregateBudgetState(),
        false,
        false,
        false,
        10,
        0,
        0,
      ),
    ).rejects.toThrow("timed out");
  });

  it("throws native backend failures with stderr evidence or the bare exit code", async () => {
    mockedRunUgrepSearch.mockResolvedValueOnce(
      createUgrepResult({ exitCode: 2, stderr: "backend exploded" }),
    );

    await expect(
      collectFixedStringMatchesFromFileEntry(
        textEntry(),
        "notes.txt",
        "needle",
        [],
        true,
        resolveSearchExecutionPolicy(PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE),
        createFixedStringSearchAggregateBudgetState(),
        false,
        false,
        false,
        10,
        0,
        0,
      ),
    ).rejects.toThrow("backend exploded");

    mockedRunUgrepSearch.mockResolvedValueOnce(createUgrepResult({ exitCode: 2 }));

    await expect(
      collectFixedStringMatchesFromFileEntry(
        textEntry(),
        "notes.txt",
        "needle",
        [],
        true,
        resolveSearchExecutionPolicy(PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE),
        createFixedStringSearchAggregateBudgetState(),
        false,
        false,
        false,
        10,
        0,
        0,
      ),
    ).rejects.toThrow("exited with code 2");
  });

  it("returns an unstopped empty result when the native runner reports no matches", async () => {
    mockedRunUgrepSearch.mockResolvedValueOnce(createUgrepResult({ exitCode: 1 }));

    const noMatchExit = await collectFixedStringMatchesFromFileEntry(
      textEntry(),
      "notes.txt",
      "needle",
      [],
      true,
      resolveSearchExecutionPolicy(PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE),
      createFixedStringSearchAggregateBudgetState(),
      false,
      false,
      false,
      10,
      0,
      0,
    );

    expect(noMatchExit.matches).toEqual([]);
    expect(noMatchExit.stopState.stopReason).toBeNull();

    mockedRunUgrepSearch.mockResolvedValueOnce(createUgrepResult({ stdout: "   \n" }));

    const emptyStdout = await collectFixedStringMatchesFromFileEntry(
      textEntry(),
      "notes.txt",
      "needle",
      [],
      true,
      resolveSearchExecutionPolicy(PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE),
      createFixedStringSearchAggregateBudgetState(),
      false,
      false,
      false,
      10,
      0,
      0,
    );

    expect(emptyStdout.matches).toEqual([]);
  });

  it("skips structurally invalid backend lines and honors skip-plus-truncate in the native lane", async () => {
    mockedRunUgrepSearch.mockResolvedValueOnce(
      createUgrepResult({
        stdout: [
          "garbage-line-without-structure",
          `${textFilePath}:1:needle one`,
          `${textFilePath}:2:needle two`,
          `${textFilePath}:3:needle three`,
        ].join("\n"),
      }),
    );

    const result = await collectFixedStringMatchesFromFileEntry(
      textEntry(),
      "notes.txt",
      "needle",
      [],
      true,
      resolveSearchExecutionPolicy(PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE),
      createFixedStringSearchAggregateBudgetState(),
      false,
      false,
      false,
      2,
      1,
      0,
    );

    expect(result.matches).toHaveLength(2);
    expect(result.matches[0]?.line).toBe(2);
    expect(result.truncated).toBe(true);
    expect(result.stopState.stopReason).toBe("max_results_limit_reached");
  });

  it("returns an unstopped native result when matches stay inside the location budget", async () => {
    mockedRunUgrepSearch.mockResolvedValueOnce(
      createUgrepResult({
        stdout: `${textFilePath}:1:needle one\n${textFilePath}:2:needle two`,
      }),
    );

    const result = await collectFixedStringMatchesFromFileEntry(
      textEntry(),
      "notes.txt",
      "needle",
      [],
      true,
      resolveSearchExecutionPolicy(PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE),
      createFixedStringSearchAggregateBudgetState(),
      false,
      false,
      false,
      10,
      0,
      0,
    );

    expect(result.matches).toHaveLength(2);
    expect(result.truncated).toBe(false);
    expect(result.stopState.stopReason).toBeNull();
  });
});
