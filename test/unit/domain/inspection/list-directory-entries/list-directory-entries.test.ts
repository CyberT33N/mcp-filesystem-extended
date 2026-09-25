import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  formatListDirectoryEntriesTextOutput,
  getListDirectoryEntriesResult,
  handleListDirectoryEntries,
} from "@domain/inspection/list-directory-entries/handler";
import { ListDirectoryEntriesArgsSchema } from "@domain/inspection/list-directory-entries/schema";
import { DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION } from "@domain/inspection/shared/filesystem-entry-metadata-contract";
import {
  INSPECTION_RESUME_ADMISSION_OUTCOMES,
  INSPECTION_RESUME_MODES,
} from "@domain/shared/resume/inspection-resume-contract";
import { InspectionResumeSessionSqliteStore } from "@infrastructure/persistence/inspection-resume-session-sqlite-store";

describe("list_directory_entries", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];
  let nestedDirectoryPath = "";
  let sampleFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(
      join(tmpdir(), "mcp-fs-list-directory-entries-"),
    );
    allowedDirectories = [sandboxRootPath];
    nestedDirectoryPath = join(sandboxRootPath, "nested");
    sampleFilePath = join(nestedDirectoryPath, "sample.txt");

    await mkdir(nestedDirectoryPath, { recursive: true });
    await writeFile(sampleFilePath, "sample");
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("defaults recursive traversal and grouped metadata selection for base requests", () => {
    const parsed = ListDirectoryEntriesArgsSchema.parse({
      roots: [sandboxRootPath],
    });

    expect(parsed.recursive).toBe(false);
    expect(parsed.metadata).toEqual(
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
    );
    expect(parsed.excludeGlobs).toEqual([]);
    expect(parsed.includeExcludedGlobs).toEqual([]);
  });

  it("enforces the directory-listing base-request and resume-only schema rules", () => {
    expect(
      ListDirectoryEntriesArgsSchema.safeParse({
        roots: [],
      }).success,
    ).toBe(false);

    expect(
      ListDirectoryEntriesArgsSchema.safeParse({
        resumeToken: "resume-1",
        resumeMode: "next-chunk",
      }).success,
    ).toBe(true);

    expect(
      ListDirectoryEntriesArgsSchema.safeParse({
        resumeToken: "resume-1",
        resumeMode: "next-chunk",
        roots: [sandboxRootPath],
      }).success,
    ).toBe(false);

    expect(
      ListDirectoryEntriesArgsSchema.safeParse({
        resumeToken: "resume-1",
      }).success,
    ).toBe(false);

    expect(
      ListDirectoryEntriesArgsSchema.safeParse({
        resumeMode: "next-chunk",
      }).success,
    ).toBe(false);
  });

  it("returns recursive structured entries with inline resume metadata for small listings", async () => {
    const result = await getListDirectoryEntriesResult(
      undefined,
      undefined,
      [sandboxRootPath],
      true,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
      [],
      [],
      false,
      allowedDirectories,
    );

    const root = result.roots[0];

    if (root === undefined) {
      throw new Error("Expected one listing root for the requested sandbox path.");
    }

    const nestedEntry = root.entries.find((entry) => entry.path === "nested");
    const sampleEntry = nestedEntry?.children?.[0];

    expect(root.requestedPath).toBe(sandboxRootPath);
    expect(nestedEntry?.type).toBe("directory");
    expect(sampleEntry?.path).toBe("nested/sample.txt");
    expect(sampleEntry?.type).toBe("file");
    expect(result.resume.resumable).toBe(false);
    expect(result.resume.resumeToken).toBeNull();
  });

  it("includes grouped timestamp and permission metadata when requested", async () => {
    const result = await getListDirectoryEntriesResult(
      undefined,
      undefined,
      [sandboxRootPath],
      false,
      { permissions: true, timestamps: true },
      [],
      [],
      false,
      allowedDirectories,
    );

    const root = result.roots[0];
    const nestedEntry = root?.entries.find((entry) => entry.path === "nested");

    expect(nestedEntry?.created).toEqual(expect.any(String));
    expect(nestedEntry?.modified).toEqual(expect.any(String));
    expect(nestedEntry?.accessed).toEqual(expect.any(String));
    expect(nestedEntry?.permissions).toEqual(expect.any(String));
  });

  it("keeps the plain encoded result on base inline listings", () => {
    const output = formatListDirectoryEntriesTextOutput({
      roots: [
        {
          requestedPath: "src",
          entries: [
            {
              name: "nested",
              path: "nested",
              type: "directory",
              size: 0,
            },
          ],
        },
      ],
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
    });

    expect(output).toContain("nested");
    expect(output).not.toContain("completion finished");
    expect(output).not.toContain("Bounded directory-entry payload:");
  });

  it("keeps the bounded chunk block with token lines on resumable listing preview passes", () => {
    const output = formatListDirectoryEntriesTextOutput({
      roots: [
        {
          requestedPath: "src",
          entries: [
            {
              name: "nested",
              path: "nested",
              type: "directory",
              size: 0,
            },
          ],
        },
      ],
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
    });

    expect(output).toContain("Directory listing preview is available for 1 root with 1 entries in this bounded chunk.");
    expect(output).toContain("Active resumeToken: resume_123");
    expect(output).toContain("Bounded directory-entry payload:");
    expect(output).not.toContain("completion finished");
  });

  it("never presents a terminal listing completion delta as the absolute session result", () => {
    const output = formatListDirectoryEntriesTextOutput({
      roots: [{ requestedPath: "src", entries: [] }],
      sessionDelivery: {
        continuationPass: true,
        previouslyDeliveredCount: 3,
        sessionTotalCount: 3,
      },
      admission: {
        outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
        guidanceText:
          "Continuation response. This payload contains directory entries from the persisted frontier position onward. Combine with the prior preview-chunk payload for the complete dataset.",
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
    });

    expect(output).toContain(
      "Directory-listing completion finished for 1 root: 0 additional entries in this final pass; session total 3 entries (3 already delivered in prior preview-chunk payloads).",
    );
    expect(output).toContain("Combine with the prior preview-chunk payload for the complete dataset.");
    expect(output).toContain("Bounded directory-entry payload:");
    expect(output).not.toContain("Active resumeToken:");
  });

  it("formats resumable multi-root listing completion progress with zero entries", () => {
    const output = formatListDirectoryEntriesTextOutput({
      roots: [
        { requestedPath: "src", entries: [] },
        { requestedPath: "docs", entries: [] },
      ],
      sessionDelivery: {
        continuationPass: true,
        previouslyDeliveredCount: 2,
        sessionTotalCount: 2,
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
    });

    expect(output).toContain("Directory listing completion progress is available for 2 roots with 0 entries in this bounded chunk.");
    expect(output).toContain("No entries collected in this chunk");
    expect(output).toContain("Active resumeToken: resume_123");
  });

  it("marks symbolic-link entries with their resolved link target", async () => {
    const aliasPath = join(nestedDirectoryPath, "alias.txt");
    await symlink(sampleFilePath, aliasPath, "file");

    const result = await getListDirectoryEntriesResult(
      undefined,
      undefined,
      [sandboxRootPath],
      true,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
      [],
      [],
      false,
      allowedDirectories,
    );

    const nestedEntry = result.roots[0]?.entries.find((entry) => entry.path === "nested");
    const aliasEntry = nestedEntry?.children?.find((entry) => entry.path === "nested/alias.txt");

    expect(aliasEntry?.type).toBe("symlink");
    expect(aliasEntry?.linkTarget).toBe(sampleFilePath);
  });

  it("threads session-cumulative delivery through a resumed directory-listing session", async () => {
    const storeDirectoryPath = await mkdtemp(
      join(tmpdir(), "mcp-fs-list-directory-entries-store-"),
    );
    const store = new InspectionResumeSessionSqliteStore(
      join(storeDirectoryPath, "sessions.sqlite"),
    );

    try {
      const seededSession = store.createSession({
        endpointName: "list_directory_entries",
        familyMember: "list_directory_entries",
        requestPayload: {
          requestedPaths: [sandboxRootPath],
          recursive: false,
          metadataSelection: DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
          excludePatterns: [],
          includeExcludedGlobs: [],
          respectGitIgnore: false,
        },
        resumeState: {
          rootTraversalStates: {
            [sandboxRootPath]: {
              traversalFrames: [{ directoryRelativePath: "", nextEntryIndex: 1 }],
            },
          },
          deliveredTotals: { entryCount: 3 },
        },
        admissionOutcome: "preview-first",
      });

      const result = await getListDirectoryEntriesResult(
        seededSession.resumeToken,
        INSPECTION_RESUME_MODES.COMPLETE_RESULT,
        [],
        false,
        DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
        [],
        [],
        false,
        allowedDirectories,
        store,
      );

      expect(result.sessionDelivery).toEqual({
        continuationPass: true,
        previouslyDeliveredCount: 3,
        sessionTotalCount: 4,
      });
      expect(result.resume.resumable).toBe(false);

      const output = await handleListDirectoryEntries(
        seededSession.resumeToken,
        INSPECTION_RESUME_MODES.COMPLETE_RESULT,
        [],
        false,
        DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
        [],
        [],
        false,
        allowedDirectories,
        store,
      );

      expect(output).toContain("Directory-listing completion finished for 1 root:");
      expect(output).toContain("session total 4 entries (3 already delivered in prior preview-chunk payloads)");
      expect(
        store.loadActiveSession(
          seededSession.resumeToken,
          "list_directory_entries",
          "list_directory_entries",
        ),
      ).toBeNull();
    } finally {
      store.close();
      await rm(storeDirectoryPath, { recursive: true, force: true });
    }
  });
});
