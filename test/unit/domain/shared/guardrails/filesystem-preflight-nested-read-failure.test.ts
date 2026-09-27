import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockedGetFileSystemEntryMetadata,
  mockedReaddir,
  mockedValidatePath,
} = vi.hoisted(() => ({
  mockedGetFileSystemEntryMetadata: vi.fn(),
  mockedReaddir: vi.fn(),
  mockedValidatePath: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: {
    readdir: mockedReaddir,
  },
  readdir: mockedReaddir,
}));

vi.mock("@infrastructure/filesystem/filesystem-entry-metadata", () => ({
  getFileSystemEntryMetadata: mockedGetFileSystemEntryMetadata,
}));

vi.mock("@infrastructure/filesystem/path-guard", () => ({
  validatePath: mockedValidatePath,
}));

import { resolveTraversalPreflightContext } from "@domain/shared/guardrails/filesystem-preflight";

/**
 * Builds a minimal Dirent-shaped test double for the mocked readdir surface.
 */
const createDirent = (name: string, kind: "file" | "directory") => ({
  name,
  isBlockDevice: () => false,
  isCharacterDevice: () => false,
  isDirectory: () => kind === "directory",
  isFIFO: () => false,
  isFile: () => kind === "file",
  isSocket: () => false,
  isSymbolicLink: () => false,
});

describe("filesystem preflight nested read failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedValidatePath.mockResolvedValue("C:/workspace/root");
    mockedGetFileSystemEntryMetadata.mockResolvedValue({
      size: 0,
      type: "directory",
    });
  });

  it("skips nested directories that cannot be read during the admission probe", async () => {
    mockedReaddir.mockImplementation(async (directoryPath: string) => {
      if (directoryPath === "C:/workspace/root") {
        return [createDirent("broken", "directory")];
      }

      throw Object.assign(new Error("permission denied"), { code: "EACCES" });
    });

    const result = await resolveTraversalPreflightContext(
      "search_file_contents_by_regex",
      "root",
      [],
      [],
      false,
      ["C:/allowed"],
      ["directory"],
      true,
    );

    expect(result.traversalPreflightAdmissionEvidence?.visitedDirectories).toBe(2);
    expect(result.traversalPreflightAdmissionEvidence?.probeTruncated).toBe(false);
  });

  it("skips excluded entries and sorts nested directory content by relative path", async () => {
    mockedReaddir.mockImplementation(async (directoryPath: string) => {
      const normalizedDirectoryPath = directoryPath.replaceAll("\\", "/");

      if (normalizedDirectoryPath === "C:/workspace/root") {
        return [
          createDirent("excluded.txt", "file"),
          createDirent("keep.txt", "file"),
          createDirent("nested", "directory"),
        ];
      }

      if (normalizedDirectoryPath === "C:/workspace/root/nested") {
        return [
          createDirent("child.txt", "file"),
          createDirent("another.txt", "file"),
        ];
      }

      return [];
    });

    const result = await resolveTraversalPreflightContext(
      "search_file_contents_by_regex",
      "root",
      ["excluded*.txt"],
      [],
      false,
      ["C:/allowed"],
      ["directory"],
      true,
    );

    expect(result.traversalPreflightAdmissionEvidence?.visitedEntries).toBe(4);
    expect(result.traversalPreflightAdmissionEvidence?.visitedDirectories).toBe(2);
  });

  it("uses the canonical fallback reason when the root read failure is not an Error", async () => {
    mockedReaddir.mockRejectedValue("raw string failure");

    await expect(
      resolveTraversalPreflightContext(
        "search_file_contents_by_regex",
        "root",
        [],
        [],
        false,
        ["C:/allowed"],
        ["directory"],
        true,
      ),
    ).rejects.toThrow("Traversal root could not be read during preflight admission.");
  });
});
