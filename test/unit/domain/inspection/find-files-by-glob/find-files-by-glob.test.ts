import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Hoisted symlink-target resolver mock used to drive the vanished-alias guard deterministically.
 */
const findFilesByGlobMockState = vi.hoisted(() => {
  const state: {
    mockedResolveSymlinkTargetPath: ReturnType<typeof vi.fn>;
    actualResolveSymlinkTargetPath:
      | typeof import("@infrastructure/filesystem/filesystem-entry-metadata").resolveSymlinkTargetPath
      | null;
  } = {
    mockedResolveSymlinkTargetPath: vi.fn(),
    actualResolveSymlinkTargetPath: null,
  };

  return state;
});

vi.mock("@infrastructure/filesystem/filesystem-entry-metadata", async () => {
  const actual = await vi.importActual<
    typeof import("@infrastructure/filesystem/filesystem-entry-metadata")
  >("@infrastructure/filesystem/filesystem-entry-metadata");

  findFilesByGlobMockState.actualResolveSymlinkTargetPath = actual.resolveSymlinkTargetPath;

  return {
    ...actual,
    resolveSymlinkTargetPath: findFilesByGlobMockState.mockedResolveSymlinkTargetPath,
  };
});

import {
  formatFindFilesByGlobTextOutput,
  getFindFilesByGlobResult,
  handleSearchGlob,
} from "@domain/inspection/find-files-by-glob/handler";
import { FindFilesByGlobArgsSchema } from "@domain/inspection/find-files-by-glob/schema";
import {
  INSPECTION_RESUME_ADMISSION_OUTCOMES,
  INSPECTION_RESUME_MODES,
} from "@domain/shared/resume/inspection-resume-contract";
import { DISCOVERY_MAX_RESULTS_HARD_CAP } from "@domain/shared/guardrails/tool-guardrail-limits";
import { InspectionResumeSessionSqliteStore } from "@infrastructure/persistence/inspection-resume-session-sqlite-store";

describe("find_files_by_glob", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];

  beforeEach(async () => {
    const actualResolveSymlinkTargetPath = findFilesByGlobMockState.actualResolveSymlinkTargetPath;

    if (actualResolveSymlinkTargetPath === null) {
      throw new Error("Expected the actual symlink-target resolver binding to be initialized.");
    }

    findFilesByGlobMockState.mockedResolveSymlinkTargetPath.mockReset();
    findFilesByGlobMockState.mockedResolveSymlinkTargetPath.mockImplementation(
      actualResolveSymlinkTargetPath,
    );

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

  it("marks alias matches with their resolved link targets across structured and text surfaces", async () => {
    const canonicalFilePath = join(sandboxRootPath, "alpha", "one.ts");
    const aliasPath = join(sandboxRootPath, "beta", "alias.ts");
    await symlink(canonicalFilePath, aliasPath, "file");

    const result = await getFindFilesByGlobResult(
      undefined,
      undefined,
      [sandboxRootPath],
      "**/alias.ts",
      [],
      [],
      false,
      100,
      allowedDirectories,
    );

    expect(result.roots[0]?.matches).toEqual([aliasPath]);
    expect(result.roots[0]?.symlinkMatches).toEqual([
      { path: aliasPath, linkTarget: canonicalFilePath },
    ]);

    const output = await handleSearchGlob(
      undefined,
      undefined,
      [sandboxRootPath],
      "**/alias.ts",
      [],
      [],
      false,
      100,
      allowedDirectories,
    );

    expect(output).toContain(`${aliasPath} [symlink → ${canonicalFilePath}]`);
  });

  it("delivers an alias match without its marking when the link-target resolution fails mid-traversal", async () => {
    const canonicalFilePath = join(sandboxRootPath, "alpha", "one.ts");
    const aliasPath = join(sandboxRootPath, "beta", "alias.ts");
    await symlink(canonicalFilePath, aliasPath, "file");

    findFilesByGlobMockState.mockedResolveSymlinkTargetPath.mockRejectedValueOnce(
      new Error("ENOENT: symbolic link vanished mid-traversal"),
    );

    const result = await getFindFilesByGlobResult(
      undefined,
      undefined,
      [sandboxRootPath],
      "**/alias.ts",
      [],
      [],
      false,
      100,
      allowedDirectories,
    );

    expect(result.roots[0]?.matches).toEqual([aliasPath]);
    expect(result.roots[0]?.symlinkMatches).toBeUndefined();
  });

  it("marks alias matches with their resolved link targets in completion-delta text output", () => {
    const output = formatFindFilesByGlobTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: ["src/alias.ts"],
            truncated: false,
            symlinkMatches: [{ path: "src/alias.ts", linkTarget: "src/one.ts" }],
          },
        ],
        totalMatches: 1,
        truncated: false,
        sessionDelivery: {
          continuationPass: true,
          previouslyDeliveredCount: 2,
          sessionTotalCount: 3,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: null,
          resumable: false,
          status: null,
          expiresAt: null,
          supportedResumeModes: [],
          recommendedResumeMode: null,
        },
      },
      "**/*.ts",
      100,
    );

    expect(output).toContain("Found 1 additional files matching pattern: **/*.ts in this completion pass");
    expect(output).toContain("src/alias.ts [symlink → src/one.ts]");
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

    expect(
      FindFilesByGlobArgsSchema.safeParse({
        glob: "**/*.ts",
      }).success,
    ).toBe(false);

    expect(
      FindFilesByGlobArgsSchema.safeParse({
        roots: [sandboxRootPath],
      }).success,
    ).toBe(false);

    expect(
      FindFilesByGlobArgsSchema.safeParse({
        resumeToken: "resume-1",
      }).success,
    ).toBe(false);

    expect(
      FindFilesByGlobArgsSchema.safeParse({
        resumeMode: INSPECTION_RESUME_MODES.NEXT_CHUNK,
      }).success,
    ).toBe(false);
  });

  it("never presents a terminal glob completion delta as the absolute session result", () => {
    const output = formatFindFilesByGlobTextOutput(
      {
        roots: [{ root: "src", matches: [], truncated: false }],
        totalMatches: 0,
        truncated: false,
        sessionDelivery: {
          continuationPass: true,
          previouslyDeliveredCount: 2,
          sessionTotalCount: 2,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
          guidanceText:
            "Continuation response. This payload contains glob matches from the persisted frontier position onward. Combine with the prior preview-chunk payload for the complete dataset.",
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: null,
          resumable: false,
          status: null,
          expiresAt: null,
          supportedResumeModes: [
            INSPECTION_RESUME_MODES.NEXT_CHUNK,
            INSPECTION_RESUME_MODES.COMPLETE_RESULT,
          ],
          recommendedResumeMode: null,
        },
      },
      "**/*.ts",
      100,
    );

    expect(output).not.toContain("No files matching pattern");
    expect(output).toContain("No additional files matching pattern: **/*.ts in this completion pass");
    expect(output).toContain(
      "Glob-discovery completion finished for 1 root: 0 additional matches in this final pass; session total 2 matches (2 already delivered in prior preview-chunk payloads).",
    );
    expect(output).toContain("Combine with the prior preview-chunk payload for the complete dataset.");
  });

  it("formats a terminal glob completion pass with additional matches as delta plus session summary", () => {
    const output = formatFindFilesByGlobTextOutput(
      {
        roots: [{ root: "src", matches: ["src/late.ts"], truncated: false }],
        totalMatches: 1,
        truncated: false,
        sessionDelivery: {
          continuationPass: true,
          previouslyDeliveredCount: 2,
          sessionTotalCount: 3,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
          guidanceText:
            "Continuation response. This payload contains glob matches from the persisted frontier position onward. Combine with the prior preview-chunk payload for the complete dataset.",
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: null,
          resumable: false,
          status: null,
          expiresAt: null,
          supportedResumeModes: [
            INSPECTION_RESUME_MODES.NEXT_CHUNK,
            INSPECTION_RESUME_MODES.COMPLETE_RESULT,
          ],
          recommendedResumeMode: null,
        },
      },
      "**/*.ts",
      100,
    );

    expect(output).toContain("Found 1 additional files matching pattern: **/*.ts in this completion pass");
    expect(output).toContain("src/late.ts");
    expect(output).toContain(
      "Glob-discovery completion finished for 1 root: 1 additional matches in this final pass; session total 3 matches (2 already delivered in prior preview-chunk payloads).",
    );
  });

  it("keeps the bounded chunk block without payload on resumable glob preview passes", () => {
    const output = formatFindFilesByGlobTextOutput(
      {
        roots: [{ root: "src", matches: ["src/one.ts"], truncated: true }],
        totalMatches: 1,
        truncated: true,
        sessionDelivery: {
          continuationPass: false,
          previouslyDeliveredCount: 0,
          sessionTotalCount: 1,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
          guidanceText: null,
          scopeReductionGuidanceText: "Narrow the roots before retrying.",
        },
        resume: {
          resumeToken: "resume_123",
          resumable: true,
          status: "active",
          expiresAt: "2026-05-14T12:00:00.000Z",
          supportedResumeModes: [
            INSPECTION_RESUME_MODES.NEXT_CHUNK,
            INSPECTION_RESUME_MODES.COMPLETE_RESULT,
          ],
          recommendedResumeMode: INSPECTION_RESUME_MODES.NEXT_CHUNK,
        },
      },
      "**/*.ts",
      100,
    );

    expect(output).toContain("Glob-discovery preview is available for 1 root with 1 matches in this bounded chunk.");
    expect(output).toContain("Active resumeToken: resume_123");
    expect(output).not.toContain("completion finished");
  });

  it("formats base inline multi-root glob responses through the batch mapping path", () => {
    const output = formatFindFilesByGlobTextOutput(
      {
        roots: [
          { root: "src", matches: ["src/one.ts"], truncated: false },
          { root: "docs", matches: [], truncated: false },
        ],
        totalMatches: 1,
        truncated: false,
        sessionDelivery: {
          continuationPass: false,
          previouslyDeliveredCount: 0,
          sessionTotalCount: 1,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.INLINE,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: null,
          resumable: false,
          status: null,
          expiresAt: null,
          supportedResumeModes: [],
          recommendedResumeMode: null,
        },
      },
      "**/*.ts",
      100,
    );

    expect(output).toContain("src/one.ts");
    expect(output).toContain("No files matching pattern: **/*.ts");
  });

  it("rejects a missing single root result instead of formatting undefined data", () => {
    expect(() =>
      formatFindFilesByGlobTextOutput(
        {
          roots: Array(1),
          totalMatches: 0,
          truncated: false,
          sessionDelivery: {
            continuationPass: false,
            previouslyDeliveredCount: 0,
            sessionTotalCount: 0,
          },
          admission: {
            outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.INLINE,
            guidanceText: null,
            scopeReductionGuidanceText: null,
          },
          resume: {
            resumeToken: null,
            resumable: false,
            status: null,
            expiresAt: null,
            supportedResumeModes: [],
            recommendedResumeMode: null,
          },
        },
        "**/*.ts",
        100,
      ),
    ).toThrow("Expected one root result for glob-search formatting.");
  });

  it("formats resumable multi-root glob completion progress with the plural root label", () => {
    const output = formatFindFilesByGlobTextOutput(
      {
        roots: [
          { root: "src", matches: [], truncated: true },
          { root: "docs", matches: [], truncated: true },
        ],
        totalMatches: 0,
        truncated: true,
        sessionDelivery: {
          continuationPass: true,
          previouslyDeliveredCount: 1,
          sessionTotalCount: 1,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: "resume_123",
          resumable: true,
          status: "active",
          expiresAt: "2026-05-14T12:00:00.000Z",
          supportedResumeModes: [
            INSPECTION_RESUME_MODES.NEXT_CHUNK,
            INSPECTION_RESUME_MODES.COMPLETE_RESULT,
          ],
          recommendedResumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
        },
      },
      "**/*.ts",
      100,
    );

    expect(output).toContain("Glob-discovery completion progress is available for 2 roots with 0 matches in this bounded chunk.");
    expect(output).toContain("No matches found in this chunk");
  });

  it("formats terminal multi-root glob completion passes through the delta mapping path", () => {
    const output = formatFindFilesByGlobTextOutput(
      {
        roots: [
          { root: "src", matches: [], truncated: false },
          { root: "docs", matches: ["docs/late.ts"], truncated: false },
        ],
        totalMatches: 1,
        truncated: false,
        sessionDelivery: {
          continuationPass: true,
          previouslyDeliveredCount: 2,
          sessionTotalCount: 3,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: null,
          resumable: false,
          status: null,
          expiresAt: null,
          supportedResumeModes: [],
          recommendedResumeMode: null,
        },
      },
      "**/*.ts",
      100,
    );

    expect(output).toContain("No additional files matching pattern: **/*.ts in this completion pass");
    expect(output).toContain("Found 1 additional files matching pattern: **/*.ts in this completion pass");
    expect(output).toContain("Glob-discovery completion finished for 2 roots:");
  });

  it("formats glob completion-delta truncation states truthfully", () => {
    const truncatedEmptyOutput = formatFindFilesByGlobTextOutput(
      {
        roots: [{ root: "src", matches: [], truncated: true }],
        totalMatches: 0,
        truncated: true,
        sessionDelivery: {
          continuationPass: true,
          previouslyDeliveredCount: 0,
          sessionTotalCount: 0,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: null,
          resumable: false,
          status: null,
          expiresAt: null,
          supportedResumeModes: [],
          recommendedResumeMode: null,
        },
      },
      "**/*.ts",
      100,
    );

    expect(truncatedEmptyOutput).toContain("Traversal scope exceeded the bounded preview-first lane before matching files could be collected.");

    const truncatedMatchOutput = formatFindFilesByGlobTextOutput(
      {
        roots: [{ root: "src", matches: ["src/one.ts"], truncated: true }],
        totalMatches: 1,
        truncated: true,
        sessionDelivery: {
          continuationPass: true,
          previouslyDeliveredCount: 0,
          sessionTotalCount: 1,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: null,
          resumable: false,
          status: null,
          expiresAt: null,
          supportedResumeModes: [],
          recommendedResumeMode: null,
        },
      },
      "**/*.ts",
      1,
    );

    expect(truncatedMatchOutput).toContain("Found 1 additional files matching pattern: **/*.ts in this completion pass (limited to 1 results)");
  });

  it("falls back to the empty root result for sparse single-root terminal glob surfaces", () => {
    const output = formatFindFilesByGlobTextOutput(
      {
        roots: Array(1),
        totalMatches: 0,
        truncated: false,
        sessionDelivery: {
          continuationPass: true,
          previouslyDeliveredCount: 1,
          sessionTotalCount: 1,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: null,
          resumable: false,
          status: null,
          expiresAt: null,
          supportedResumeModes: [],
          recommendedResumeMode: null,
        },
      },
      "**/*.ts",
      100,
    );

    expect(output).toContain("No additional files matching pattern: **/*.ts in this completion pass");
    expect(output).toContain("Glob-discovery completion finished for 1 root:");
  });

  it("formats base inline glob truncation states through the root output surface", () => {
    const truncatedEmpty = formatFindFilesByGlobTextOutput(
      {
        roots: [{ root: "src", matches: [], truncated: true }],
        totalMatches: 0,
        truncated: true,
        sessionDelivery: {
          continuationPass: false,
          previouslyDeliveredCount: 0,
          sessionTotalCount: 0,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.INLINE,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: null,
          resumable: false,
          status: null,
          expiresAt: null,
          supportedResumeModes: [],
          recommendedResumeMode: null,
        },
      },
      "**/*.ts",
      100,
    );

    expect(truncatedEmpty).toContain("Traversal scope exceeded the bounded preview-first lane before matching files could be collected.");

    const truncatedWithMatches = formatFindFilesByGlobTextOutput(
      {
        roots: [{ root: "src", matches: ["src/one.ts"], truncated: true }],
        totalMatches: 1,
        truncated: true,
        sessionDelivery: {
          continuationPass: false,
          previouslyDeliveredCount: 0,
          sessionTotalCount: 1,
        },
        admission: {
          outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.INLINE,
          guidanceText: null,
          scopeReductionGuidanceText: null,
        },
        resume: {
          resumeToken: null,
          resumable: false,
          status: null,
          expiresAt: null,
          supportedResumeModes: [],
          recommendedResumeMode: null,
        },
      },
      "**/*.ts",
      1,
    );

    expect(truncatedWithMatches).toContain("Found 1 files matching pattern: **/*.ts (limited to 1 results)");
  });

  it("threads session-cumulative delivery through a resumed glob session", async () => {
    const storeDirectoryPath = await mkdtemp(join(tmpdir(), "mcp-fs-find-glob-store-"));
    const store = new InspectionResumeSessionSqliteStore(
      join(storeDirectoryPath, "sessions.sqlite"),
    );

    try {
      const seededSession = store.createSession({
        endpointName: "find_files_by_glob",
        familyMember: "find_files_by_glob",
        requestPayload: {
          searchPaths: [sandboxRootPath],
          pattern: "**/*.ts",
          excludePatterns: [],
          includeExcludedGlobs: [],
          respectGitIgnore: false,
          maxResults: 100,
        },
        resumeState: {
          rootTraversalStates: {
            [sandboxRootPath]: {
              traversalFrames: [{ directoryRelativePath: "", nextEntryIndex: 2 }],
            },
          },
          deliveredTotals: { matchCount: 1 },
        },
        admissionOutcome: "preview-first",
      });

      const result = await getFindFilesByGlobResult(
        seededSession.resumeToken,
        INSPECTION_RESUME_MODES.COMPLETE_RESULT,
        [],
        "",
        [],
        [],
        false,
        100,
        allowedDirectories,
        store,
      );

      expect(result.sessionDelivery).toEqual({
        continuationPass: true,
        previouslyDeliveredCount: 1,
        sessionTotalCount: 1,
      });
      expect(result.resume.resumable).toBe(false);

      const output = await handleSearchGlob(
        seededSession.resumeToken,
        INSPECTION_RESUME_MODES.COMPLETE_RESULT,
        [],
        "",
        [],
        [],
        false,
        100,
        allowedDirectories,
        store,
      );

      expect(output).not.toContain("No files matching pattern");
      expect(output).toContain("No additional files matching pattern: **/*.ts in this completion pass");
      expect(output).toContain(
        "session total 1 matches (1 already delivered in prior preview-chunk payloads)",
      );
      expect(
        store.loadActiveSession(
          seededSession.resumeToken,
          "find_files_by_glob",
          "find_files_by_glob",
        ),
      ).toBeNull();
    } finally {
      store.close();
      await rm(storeDirectoryPath, { recursive: true, force: true });
    }
  });
});
