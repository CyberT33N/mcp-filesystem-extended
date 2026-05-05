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

  it("returns null when the root-local gitignore file does not exist", async () => {
    mockedReadFile.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { code: "ENOENT" }),
    );

    const result = await readGitIgnoreTraversalEnrichmentForRoot(
      "C:/workspace/root",
    );

    expect(result).toBeNull();
    expect(mockedReadFile).toHaveBeenCalledWith(
      expect.stringContaining(ROOT_LOCAL_GITIGNORE_TRAVERSAL_SOURCE_PATH),
      "utf8",
    );
  });

  it("rethrows non-ENOENT filesystem failures while reading the root-local gitignore", async () => {
    mockedReadFile.mockRejectedValueOnce(
      Object.assign(new Error("permission denied"), { code: "EACCES" }),
    );

    await expect(
      readGitIgnoreTraversalEnrichmentForRoot("C:/workspace/root"),
    ).rejects.toThrow("permission denied");
  });

  it("parses material root-local gitignore content after the file is read successfully", async () => {
    mockedReadFile.mockResolvedValueOnce("dist/\n");

    const result = await readGitIgnoreTraversalEnrichmentForRoot(
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
});
