import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockedGetFileSystemEntryMetadata,
  mockedValidatePath,
} = vi.hoisted(() => ({
  mockedGetFileSystemEntryMetadata: vi.fn(),
  mockedValidatePath: vi.fn(),
}));

vi.mock("@infrastructure/filesystem/filesystem-entry-metadata", () => ({
  getFileSystemEntryMetadata: mockedGetFileSystemEntryMetadata,
}));

vi.mock("@infrastructure/filesystem/path-guard", () => ({
  validatePath: mockedValidatePath,
}));

import {
  assertCandidateByteBudget,
  assertExpectedFileTypes,
  buildTraversalNarrowingGuidance,
  collectValidatedFilesystemPreflightEntries,
  resolveTraversalPreflightContext,
  sumPreflightBytes,
} from "@domain/shared/guardrails/filesystem-preflight";
import { MAX_GENERIC_PATHS_PER_REQUEST } from "@domain/shared/guardrails/tool-guardrail-limits";

describe("filesystem preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds the canonical traversal narrowing guidance for broad traversal roots", () => {
    expect(buildTraversalNarrowingGuidance("src/domain")).toBe(
      "Narrow the requested root 'src/domain', add exclude globs, or target a more specific descendant before retrying broad recursive traversal.",
    );
  });

  it("collects validated filesystem entries in request order and sums their byte sizes", async () => {
    mockedValidatePath
      .mockResolvedValueOnce("C:/allowed/alpha.txt")
      .mockResolvedValueOnce("C:/allowed/beta");
    mockedGetFileSystemEntryMetadata
      .mockResolvedValueOnce({ size: 3, type: "file" })
      .mockResolvedValueOnce({ size: 7, type: "directory" });

    const entries = await collectValidatedFilesystemPreflightEntries(
      "list_directory_entries",
      ["alpha.txt", "beta"],
      ["C:/allowed"],
    );

    expect(entries).toEqual([
      {
        requestedPath: "alpha.txt",
        validPath: "C:/allowed/alpha.txt",
        type: "file",
        size: 3,
      },
      {
        requestedPath: "beta",
        validPath: "C:/allowed/beta",
        type: "directory",
        size: 7,
      },
    ]);
    expect(sumPreflightBytes(entries)).toBe(10);
  });

  it("resolves traversal preflight context without a recursive admission probe when traversal is disabled", async () => {
    mockedValidatePath.mockResolvedValueOnce("C:/allowed/root.txt");
    mockedGetFileSystemEntryMetadata.mockResolvedValueOnce({
      size: 9,
      type: "file",
    });

    const result = await resolveTraversalPreflightContext(
      "list_directory_entries",
      "root.txt",
      [],
      [],
      false,
      ["C:/allowed"],
      ["file"],
      false,
    );

    expect(result.rootEntry).toEqual({
      requestedPath: "root.txt",
      validPath: "C:/allowed/root.txt",
      type: "file",
      size: 9,
    });
    expect(result.traversalPreflightAdmissionEvidence).toBeNull();
    expect(result.traversalScopePolicyResolution).toBeDefined();
    expect(result.traversalScopePolicyResolution.gitIgnoreEnrichmentApplied).toBe(false);
  });

  it("creates a hierarchical gitignore traversal state for recursive directory roots when requested", async () => {
    mockedValidatePath.mockResolvedValueOnce("C:/allowed/root");
    mockedGetFileSystemEntryMetadata.mockResolvedValueOnce({
      size: 0,
      type: "directory",
    });

    const result = await resolveTraversalPreflightContext(
      "find_files_by_glob",
      "root",
      [],
      [],
      true,
      ["C:/allowed"],
      ["directory"],
      false,
    );

    expect(result.traversalScopePolicyResolution.gitIgnoreEnrichmentApplied).toBe(true);
    expect(result.traversalScopePolicyResolution.gitIgnoreTraversalHierarchy).not.toBeNull();
    expect(
      result.traversalScopePolicyResolution.gitIgnoreTraversalHierarchy?.rootAbsolutePath,
    ).toBe("C:/allowed/root");
  });

  it("rejects requested path batches that exceed the shared metadata preflight ceiling", async () => {
    await expect(
      collectValidatedFilesystemPreflightEntries(
        "read_files_with_line_numbers",
        Array.from({ length: MAX_GENERIC_PATHS_PER_REQUEST + 1 }, (_, index) =>
          `path-${index}`,
        ),
        ["C:/allowed"],
      ),
    ).rejects.toThrow(
      "Requested path count exceeds the shared metadata preflight ceiling.",
    );
  });

  it("rejects resolved filesystem entry types that are not permitted for the current operation", () => {
    expect(() =>
      assertExpectedFileTypes(
        "get_file_checksums",
        [
          {
            requestedPath: "fixtures",
            validPath: "C:/allowed/fixtures",
            type: "directory",
            size: 0,
          },
        ],
        ["file"],
      ),
    ).toThrow("Resolved filesystem entry type is not permitted for this operation.");
  });

  it("rejects candidate byte budgets that exceed the configured hard preflight cap", () => {
    expect(() =>
      assertCandidateByteBudget(
        "read_files_with_line_numbers",
        101,
        100,
        "line-numbered read response",
      ),
    ).toThrow(
      "Candidate byte budget exceeds the preflight ceiling before content execution begins.",
    );
  });

  it("counts only workload-relevant file entries during traversal preflight when a workload policy is provided", async () => {
    const sandboxRootPath = await mkdtemp(
      join(tmpdir(), "mcp-fs-preflight-workload-policy-"),
    );
    const matchingFilePath = join(sandboxRootPath, "keep.ts");
    const ignoredFilePath = join(sandboxRootPath, "skip.md");

    try {
      await writeFile(matchingFilePath, "export const keep = true;", "utf8");
      await writeFile(ignoredFilePath, "# ignored", "utf8");

      mockedValidatePath.mockResolvedValueOnce(sandboxRootPath);
      mockedGetFileSystemEntryMetadata.mockResolvedValueOnce({
        size: 0,
        type: "directory",
      });

      const result = await resolveTraversalPreflightContext(
        "search_file_contents_by_regex",
        "root",
        [],
        [],
        false,
        [sandboxRootPath],
        ["directory"],
        true,
        {
          shouldCountFileEntryTowardBudget: (candidateRelativePath, entry) =>
            !entry.isFile() || candidateRelativePath.endsWith(".ts"),
        },
      );

      expect(result.traversalPreflightAdmissionEvidence?.visitedEntries).toBe(1);
      expect(result.traversalPreflightAdmissionEvidence?.visitedDirectories).toBe(1);
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("mentions optional respectGitIgnore narrowing when preflight fails and a root-local gitignore is available but inactive", async () => {
    const sandboxRootPath = await mkdtemp(
      join(tmpdir(), "mcp-fs-preflight-gitignore-hint-"),
    );

    try {
      await writeFile(join(sandboxRootPath, ".gitignore"), "coverage/\n", "utf8");
      mockedValidatePath.mockResolvedValueOnce(sandboxRootPath);
      mockedGetFileSystemEntryMetadata.mockResolvedValueOnce({
        size: 0,
        type: "directory",
      });

      const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => {
        const stack = new Error().stack ?? "";

        return stack.includes("getTraversalScopePreflightBudgetStop")
          ? 4_501
          : 0;
      });

      await expect(
        resolveTraversalPreflightContext(
          "search_file_contents_by_regex",
          "root",
          [],
          [],
          false,
          [sandboxRootPath],
          ["directory"],
          true,
        ),
      ).rejects.toThrow("respectGitIgnore=true");

      dateNowSpy.mockRestore();
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });
});
