import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockedReadFile } = vi.hoisted(() => ({
  mockedReadFile: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: {
    readFile: mockedReadFile,
  },
  readFile: mockedReadFile,
}));

import {
  createGitIgnoreTraversalEnrichment,
  createGitIgnoreTraversalHierarchy,
  getGitIgnoreTraversalEnrichmentForDirectory,
  isGitIgnoreTraversalHierarchyExcluded,
  readGitIgnoreTraversalEnrichmentForDirectory,
  readGitIgnoreTraversalEnrichmentForRoot,
  ROOT_LOCAL_GITIGNORE_TRAVERSAL_SOURCE_PATH,
} from "@domain/shared/guardrails/gitignore-traversal-enrichment";

describe("gitignore traversal enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes the canonical root-local gitignore source path literal", () => {
    expect(ROOT_LOCAL_GITIGNORE_TRAVERSAL_SOURCE_PATH).toBe(".gitignore");
  });

  it("creates a lazy hierarchy rooted at the validated traversal root", () => {
    const hierarchy = createGitIgnoreTraversalHierarchy("C:/workspace/root");

    expect(hierarchy.rootAbsolutePath).toBe("C:/workspace/root");
    expect(hierarchy.layerCache.size).toBe(0);
  });

  it("returns null when gitignore text contains only whitespace or comments", () => {
    expect(createGitIgnoreTraversalEnrichment("\n# ignored\n   \n")).toBeNull();
  });

  it("creates traversal enrichment with a matcher and an optional source-path override", () => {
    const enrichment = createGitIgnoreTraversalEnrichment("dist/\ncoverage/\n", {
      sourcePath: "workspace/.gitignore",
    });

    expect(enrichment).not.toBeNull();
    expect(enrichment?.sourcePath).toBe("workspace/.gitignore");
    expect(enrichment?.matcher.ignores("dist/app.js")).toBe(true);
    expect(enrichment?.matcher.ignores("src/app.ts")).toBe(false);
  });

  it("returns null when the directory-local gitignore file does not exist", async () => {
    mockedReadFile.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { code: "ENOENT" }),
    );

    const result = await readGitIgnoreTraversalEnrichmentForDirectory(
      "C:/workspace/root",
    );

    expect(result).toBeNull();
    expect(mockedReadFile).toHaveBeenCalledWith(
      expect.stringContaining(ROOT_LOCAL_GITIGNORE_TRAVERSAL_SOURCE_PATH),
      "utf8",
    );
  });

  it("rethrows non-ENOENT filesystem failures while reading the directory-local gitignore", async () => {
    mockedReadFile.mockRejectedValueOnce(
      Object.assign(new Error("permission denied"), { code: "EACCES" }),
    );

    await expect(
      readGitIgnoreTraversalEnrichmentForDirectory("C:/workspace/root"),
    ).rejects.toThrow("permission denied");
  });

  it("parses material directory-local gitignore content after the file is read successfully", async () => {
    mockedReadFile.mockResolvedValueOnce("dist/\n");

    const result = await readGitIgnoreTraversalEnrichmentForDirectory(
      "C:/workspace/root",
      {
        sourcePath: "workspace/.gitignore",
      },
    );

    expect(result).not.toBeNull();
    expect(result?.sourcePath).toBe("workspace/.gitignore");
    expect(result?.matcher.ignores("dist/output.js")).toBe(true);
    expect(result?.matcher.ignores("src/output.ts")).toBe(false);
  });

  it("keeps the root-specific reader as a thin wrapper around the directory reader", async () => {
    mockedReadFile.mockResolvedValueOnce("coverage/\n");

    const result = await readGitIgnoreTraversalEnrichmentForRoot(
      "C:/workspace/root",
      {
        sourcePath: "workspace/.gitignore",
      },
    );

    expect(result?.sourcePath).toBe("workspace/.gitignore");
    expect(result?.matcher.ignores("coverage/index.txt")).toBe(true);
  });

  it("caches parsed directory-local layers inside the hierarchy", async () => {
    mockedReadFile.mockResolvedValueOnce("coverage/\n");

    const hierarchy = createGitIgnoreTraversalHierarchy("C:/workspace/root");
    const firstLayer = await getGitIgnoreTraversalEnrichmentForDirectory(
      hierarchy,
      ".",
    );
    const secondLayer = await getGitIgnoreTraversalEnrichmentForDirectory(
      hierarchy,
      ".",
    );

    expect(firstLayer).toBe(secondLayer);
    expect(mockedReadFile).toHaveBeenCalledTimes(1);
  });

  it("applies hierarchical gitignore layers only to the subtree that owns them", async () => {
    mockedReadFile.mockImplementation(async (candidatePath: string) => {
      const normalizedCandidatePath = candidatePath.replaceAll("\\", "/");

      if (normalizedCandidatePath === "C:/workspace/root/.gitignore") {
        return "coverage/\n";
      }

      if (normalizedCandidatePath === "C:/workspace/root/packages/app/.gitignore") {
        return "secret/\n";
      }

      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    });

    const hierarchy = createGitIgnoreTraversalHierarchy("C:/workspace/root");

    await expect(
      isGitIgnoreTraversalHierarchyExcluded(
        "coverage/report.txt",
        false,
        hierarchy,
      ),
    ).resolves.toBe(true);
    await expect(
      isGitIgnoreTraversalHierarchyExcluded(
        "packages/app/secret/token.txt",
        false,
        hierarchy,
      ),
    ).resolves.toBe(true);
    await expect(
      isGitIgnoreTraversalHierarchyExcluded(
        "packages/other/secret/token.txt",
        false,
        hierarchy,
      ),
    ).resolves.toBe(false);
    await expect(
      isGitIgnoreTraversalHierarchyExcluded(
        "packages/app/src/index.ts",
        false,
        hierarchy,
      ),
    ).resolves.toBe(false);
  });
});
