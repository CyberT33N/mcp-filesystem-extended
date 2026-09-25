import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  formatFindPathsByNameTextOutput,
  getFindPathsByNameResult,
  handleSearchFiles,
} from "@domain/inspection/find-paths-by-name/handler";
import { searchFiles } from "@domain/inspection/find-paths-by-name/helpers";
import { FindPathsByNameArgsSchema } from "@domain/inspection/find-paths-by-name/schema";
import {
  INSPECTION_RESUME_ADMISSION_OUTCOMES,
  INSPECTION_RESUME_MODES,
} from "@domain/shared/resume/inspection-resume-contract";
import { DISCOVERY_MAX_RESULTS_HARD_CAP } from "@domain/shared/guardrails/tool-guardrail-limits";
import { InspectionResumeSessionSqliteStore } from "@infrastructure/persistence/inspection-resume-session-sqlite-store";

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

    expect(
      FindPathsByNameArgsSchema.safeParse({
        nameContains: "schema",
      }).success,
    ).toBe(false);

    expect(
      FindPathsByNameArgsSchema.safeParse({
        roots: [sandboxRootPath],
      }).success,
    ).toBe(false);

    expect(
      FindPathsByNameArgsSchema.safeParse({
        resumeToken: "resume-1",
      }).success,
    ).toBe(false);

    expect(
      FindPathsByNameArgsSchema.safeParse({
        resumeMode: INSPECTION_RESUME_MODES.NEXT_CHUNK,
      }).success,
    ).toBe(false);
  });

  it("never presents a terminal name-discovery completion delta as the absolute session result", () => {
    const output = formatFindPathsByNameTextOutput(
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
            "Continuation response. This payload contains name-discovery matches from the persisted frontier position onward. Combine with the prior preview-chunk payload for the complete dataset.",
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
      100,
    );

    expect(output).not.toContain("No matches found");
    expect(output).toContain("No additional matches found in this completion pass");
    expect(output).toContain(
      "Name-discovery completion finished for 1 root: 0 additional matches in this final pass; session total 2 matches (2 already delivered in prior preview-chunk payloads).",
    );
  });

  it("formats a terminal name-discovery completion pass with additional matches as delta plus session summary", () => {
    const output = formatFindPathsByNameTextOutput(
      {
        roots: [{ root: "src", matches: ["src/late-schema.ts"], truncated: false }],
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
            "Continuation response. This payload contains name-discovery matches from the persisted frontier position onward. Combine with the prior preview-chunk payload for the complete dataset.",
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
      100,
    );

    expect(output).toContain("Found 1 additional matches in this completion pass");
    expect(output).toContain("src/late-schema.ts");
    expect(output).toContain(
      "Name-discovery completion finished for 1 root: 1 additional matches in this final pass; session total 3 matches (2 already delivered in prior preview-chunk payloads).",
    );
  });

  it("keeps the bounded chunk block without payload on resumable name-discovery preview passes", () => {
    const output = formatFindPathsByNameTextOutput(
      {
        roots: [{ root: "src", matches: ["src/schema.ts"], truncated: true }],
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
      100,
    );

    expect(output).toContain("Name-discovery preview is available for 1 root with 1 matches in this bounded chunk.");
    expect(output).toContain("Active resumeToken: resume_123");
    expect(output).not.toContain("completion finished");
  });

  it("formats base inline multi-root name responses through the batch mapping path", () => {
    const output = formatFindPathsByNameTextOutput(
      {
        roots: [
          { root: "src", matches: ["src/schema.ts"], truncated: false },
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
      100,
    );

    expect(output).toContain("src/schema.ts");
    expect(output).toContain("No matches found");
  });

  it("rejects a missing single root result instead of formatting undefined data", () => {
    expect(() =>
      formatFindPathsByNameTextOutput(
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
        100,
      ),
    ).toThrow("Expected one root result for name-based search.");
  });

  it("formats resumable multi-root name-discovery completion progress with the plural root label", () => {
    const output = formatFindPathsByNameTextOutput(
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
      100,
    );

    expect(output).toContain("Name-discovery completion progress is available for 2 roots with 0 matches in this bounded chunk.");
    expect(output).toContain("No matches found in this chunk");
  });

  it("formats terminal multi-root name-discovery completion passes through the delta mapping path", () => {
    const output = formatFindPathsByNameTextOutput(
      {
        roots: [
          { root: "src", matches: [], truncated: false },
          { root: "docs", matches: ["docs/late-schema.ts"], truncated: false },
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
      100,
    );

    expect(output).toContain("No additional matches found in this completion pass");
    expect(output).toContain("Found 1 additional matches in this completion pass");
    expect(output).toContain("Name-discovery completion finished for 2 roots:");
  });

  it("formats name-discovery completion-delta truncation states truthfully", () => {
    const truncatedEmptyOutput = formatFindPathsByNameTextOutput(
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
      100,
    );

    expect(truncatedEmptyOutput).toContain("Traversal scope exceeded the bounded preview-first lane before matching paths could be collected.");

    const truncatedMatchOutput = formatFindPathsByNameTextOutput(
      {
        roots: [{ root: "src", matches: ["src/schema.ts"], truncated: true }],
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
      1,
    );

    expect(truncatedMatchOutput).toContain("Found 1 additional matches in this completion pass");
    expect(truncatedMatchOutput).toContain("(limited to 1 results)");
  });

  it("falls back to the empty root result for sparse single-root terminal name-discovery surfaces", () => {
    const output = formatFindPathsByNameTextOutput(
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
      100,
    );

    expect(output).toContain("No additional matches found in this completion pass");
    expect(output).toContain("Name-discovery completion finished for 1 root:");
  });

  it("formats base inline name-search truncation states through the root output surface", () => {
    const truncatedEmpty = formatFindPathsByNameTextOutput(
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
      100,
    );

    expect(truncatedEmpty).toContain("Traversal scope exceeded the bounded preview-first lane before matching paths could be collected.");

    const truncatedWithMatches = formatFindPathsByNameTextOutput(
      {
        roots: [{ root: "src", matches: ["src/schema.ts"], truncated: true }],
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
      1,
    );

    expect(truncatedWithMatches).toContain("src/schema.ts");
    expect(truncatedWithMatches).toContain("(limited to 1 results)");
  });

  it("threads session-cumulative delivery through a resumed name-discovery session", async () => {
    const alphaRootPath = join(sandboxRootPath, "alpha");
    const storeDirectoryPath = await mkdtemp(join(tmpdir(), "mcp-fs-find-name-store-"));
    const store = new InspectionResumeSessionSqliteStore(
      join(storeDirectoryPath, "sessions.sqlite"),
    );

    try {
      const seededSession = store.createSession({
        endpointName: "find_paths_by_name",
        familyMember: "find_paths_by_name",
        requestPayload: {
          directoryPaths: [alphaRootPath],
          pattern: "schema",
          excludePatterns: [],
          includeExcludedGlobs: [],
          respectGitIgnore: false,
          maxResults: 100,
        },
        resumeState: {
          rootTraversalStates: {
            [alphaRootPath]: {
              traversalFrames: [{ directoryRelativePath: "", nextEntryIndex: 2 }],
            },
          },
          deliveredTotals: { matchCount: 1 },
        },
        admissionOutcome: "preview-first",
      });

      const result = await getFindPathsByNameResult(
        seededSession.resumeToken,
        INSPECTION_RESUME_MODES.COMPLETE_RESULT,
        [],
        "",
        [],
        [],
        false,
        store,
        allowedDirectories,
        100,
      );

      expect(result.sessionDelivery).toEqual({
        continuationPass: true,
        previouslyDeliveredCount: 1,
        sessionTotalCount: 1,
      });
      expect(result.resume.resumable).toBe(false);

      const output = await handleSearchFiles(
        seededSession.resumeToken,
        INSPECTION_RESUME_MODES.COMPLETE_RESULT,
        [],
        "",
        [],
        [],
        false,
        store,
        allowedDirectories,
        100,
      );

      expect(output).not.toContain("No matches found");
      expect(output).toContain("No additional matches found in this completion pass");
      expect(output).toContain(
        "session total 1 matches (1 already delivered in prior preview-chunk payloads)",
      );
      expect(
        store.loadActiveSession(
          seededSession.resumeToken,
          "find_paths_by_name",
          "find_paths_by_name",
        ),
      ).toBeNull();
    } finally {
      store.close();
      await rm(storeDirectoryPath, { recursive: true, force: true });
    }
  });
});
