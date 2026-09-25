import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockedResolveTraversalWorkloadAdmissionDecision } = vi.hoisted(() => ({
  mockedResolveTraversalWorkloadAdmissionDecision: vi.fn(),
}));

vi.mock("@domain/shared/guardrails/traversal-workload-admission", async () => {
  const actual = await vi.importActual<
    typeof import("@domain/shared/guardrails/traversal-workload-admission")
  >("@domain/shared/guardrails/traversal-workload-admission");

  return {
    ...actual,
    resolveTraversalWorkloadAdmissionDecision:
      mockedResolveTraversalWorkloadAdmissionDecision,
  };
});

import {
  getFindPathsByNameResult,
  handleSearchFiles,
} from "@domain/inspection/find-paths-by-name/handler";
import { TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES } from "@domain/shared/guardrails/traversal-workload-admission";
import { INSPECTION_RESUME_MODES } from "@domain/shared/resume/inspection-resume-contract";
import { InspectionResumeSessionSqliteStore } from "@infrastructure/persistence/inspection-resume-session-sqlite-store";

describe("find_paths_by_name resume lifecycle", () => {
  let sandboxRootPath = "";
  let storeDirectoryPath = "";
  let store: InspectionResumeSessionSqliteStore | undefined;

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-name-resume-"));
    storeDirectoryPath = await mkdtemp(join(tmpdir(), "mcp-fs-name-resume-store-"));
    store = new InspectionResumeSessionSqliteStore(
      join(storeDirectoryPath, "sessions.sqlite"),
    );

    mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      guidanceText: null,
    });

    await writeFile(join(sandboxRootPath, "schema-one.ts"), "export const one = 1;\n");
    await writeFile(join(sandboxRootPath, "schema-two.ts"), "export const two = 2;\n");
    await writeFile(join(sandboxRootPath, "schema-three.ts"), "export const three = 3;\n");
  });

  afterEach(async () => {
    store?.close();
    store = undefined;
    await rm(sandboxRootPath, { recursive: true, force: true });
    await rm(storeDirectoryPath, { recursive: true, force: true });
  });

  it("threads delivered totals through the full preview-first resume lifecycle", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    const baseResult = await getFindPathsByNameResult(
      undefined,
      undefined,
      [sandboxRootPath],
      "schema",
      [],
      [],
      false,
      activeStore,
      [sandboxRootPath],
      1,
    );

    expect(baseResult.resume.resumable).toBe(true);
    expect(baseResult.sessionDelivery).toEqual({
      continuationPass: false,
      previouslyDeliveredCount: 0,
      sessionTotalCount: 1,
    });

    const activeResumeToken = baseResult.resume.resumeToken;

    if (activeResumeToken === null) {
      throw new Error("Expected an active resume token after the preview-first base pass.");
    }

    const firstResumeResult = await getFindPathsByNameResult(
      activeResumeToken,
      INSPECTION_RESUME_MODES.NEXT_CHUNK,
      [],
      "",
      [],
      [],
      false,
      activeStore,
      [sandboxRootPath],
      1,
    );

    expect(firstResumeResult.resume.resumable).toBe(true);
    expect(firstResumeResult.sessionDelivery).toEqual({
      continuationPass: true,
      previouslyDeliveredCount: 1,
      sessionTotalCount: 2,
    });
    expect(
      activeStore.loadActiveSession(
        activeResumeToken,
        "find_paths_by_name",
        "find_paths_by_name",
      )?.resumeState,
    ).toMatchObject({
      deliveredTotals: { matchCount: 2 },
    });

    await getFindPathsByNameResult(
      activeResumeToken,
      INSPECTION_RESUME_MODES.NEXT_CHUNK,
      [],
      "",
      [],
      [],
      false,
      activeStore,
      [sandboxRootPath],
      1,
    );

    const terminalResult = await getFindPathsByNameResult(
      activeResumeToken,
      INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      [],
      "",
      [],
      [],
      false,
      activeStore,
      [sandboxRootPath],
      1,
    );

    expect(terminalResult.resume.resumable).toBe(false);
    expect(terminalResult.admission.guidanceText).toContain(
      "Combine with the prior preview-chunk payload",
    );

    const terminalOutput = await handleSearchFiles(
      activeResumeToken,
      INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      [],
      "",
      [],
      [],
      false,
      activeStore,
      [sandboxRootPath],
      1,
    );

    expect(terminalOutput).toContain("Name-discovery completion finished for 1 root:");
    expect(terminalOutput).not.toContain("No matches found");
  });

  it("keeps a truncating complete-result pass resumable and delivers the remaining frontier truthfully afterwards", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    const baseResult = await getFindPathsByNameResult(
      undefined,
      undefined,
      [sandboxRootPath],
      "schema",
      [],
      [],
      false,
      activeStore,
      [sandboxRootPath],
      1,
    );

    const activeResumeToken = baseResult.resume.resumeToken;

    if (activeResumeToken === null) {
      throw new Error("Expected an active resume token after the preview-first base pass.");
    }

    const truncatedCompletionOutput = await handleSearchFiles(
      activeResumeToken,
      INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      [],
      "",
      [],
      [],
      false,
      activeStore,
      [sandboxRootPath],
      1,
    );

    expect(truncatedCompletionOutput).toContain("Name-discovery completion progress is available for 1 root with 1 matches in this bounded chunk.");
    expect(truncatedCompletionOutput).toContain(`Active resumeToken: ${activeResumeToken}`);
    expect(truncatedCompletionOutput).not.toContain("completion finished");
    expect(
      activeStore.loadActiveSession(
        activeResumeToken,
        "find_paths_by_name",
        "find_paths_by_name",
      )?.resumeState,
    ).toMatchObject({
      deliveredTotals: { matchCount: 2 },
    });

    const terminalOutput = await handleSearchFiles(
      activeResumeToken,
      INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      [],
      "",
      [],
      [],
      false,
      activeStore,
      [sandboxRootPath],
      1,
    );

    expect(terminalOutput).toContain("Name-discovery completion finished for 1 root: 1 additional matches in this final pass; session total 3 matches (2 already delivered in prior preview-chunk payloads).");
    expect(
      activeStore.loadActiveSession(
        activeResumeToken,
        "find_paths_by_name",
        "find_paths_by_name",
      ),
    ).toBeNull();
  });

  it("completes the session with the carried delivery summary when no active roots remain", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    const seededSession = activeStore.createSession({
      endpointName: "find_paths_by_name",
      familyMember: "find_paths_by_name",
      requestPayload: {
        directoryPaths: [sandboxRootPath],
        pattern: "schema",
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 100,
      },
      resumeState: {
        rootTraversalStates: {
          elsewhere: {
            traversalFrames: [{ directoryRelativePath: "", nextEntryIndex: 3 }],
          },
        },
        deliveredTotals: { matchCount: 2 },
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
      activeStore,
      [sandboxRootPath],
      100,
    );

    expect(result.roots).toEqual([]);
    expect(result.sessionDelivery).toEqual({
      continuationPass: true,
      previouslyDeliveredCount: 2,
      sessionTotalCount: 2,
    });
    expect(
      activeStore.loadActiveSession(
        seededSession.resumeToken,
        "find_paths_by_name",
        "find_paths_by_name",
      ),
    ).toBeNull();
  });

  it("rejects resume requests when resume-session storage is unavailable", async () => {
    await expect(
      getFindPathsByNameResult(
        "insresume_unknown",
        INSPECTION_RESUME_MODES.NEXT_CHUNK,
        [],
        "",
        [],
        [],
        false,
        undefined,
        [sandboxRootPath],
        100,
      ),
    ).rejects.toThrow("Resume-session storage is unavailable for find_paths_by_name resume requests.");
  });

  it("rejects resume requests whose token resolves to no active session", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    await expect(
      getFindPathsByNameResult(
        "insresume_00000000-0000-0000-0000-000000000000",
        INSPECTION_RESUME_MODES.NEXT_CHUNK,
        [],
        "",
        [],
        [],
        false,
        activeStore,
        [sandboxRootPath],
        100,
      ),
    ).rejects.toThrow("could not be fulfilled because the supplied resume token does not resolve to an active server-owned resume session");
  });

  it("rejects a preview-first base response when resume-session storage is unavailable", async () => {
    await expect(
      getFindPathsByNameResult(
        undefined,
        undefined,
        [sandboxRootPath],
        "schema",
        [],
        [],
        false,
        undefined,
        [sandboxRootPath],
        1,
      ),
    ).rejects.toThrow("Resume-session storage is unavailable for preview-first name discovery.");
  });

  it("rejects roots whose traversal admission requires narrowing", async () => {
    mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValueOnce({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.NARROWING_REQUIRED,
      guidanceText: "Narrow the requested root before retrying.",
    });

    await expect(
      getFindPathsByNameResult(
        undefined,
        undefined,
        [sandboxRootPath],
        "schema",
        [],
        [],
        false,
        store,
        [sandboxRootPath],
        100,
      ),
    ).rejects.toThrow("Narrow the requested root before retrying.");
  });

  it("carries the multi-root scope-reduction guidance on resumed multi-root sessions", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    const secondaryRootPath = join(sandboxRootPath, "secondary");
    await mkdir(secondaryRootPath, { recursive: true });
    await writeFile(join(secondaryRootPath, "schema-four.ts"), "export const four = 4;\n");

    const seededSession = activeStore.createSession({
      endpointName: "find_paths_by_name",
      familyMember: "find_paths_by_name",
      requestPayload: {
        directoryPaths: [sandboxRootPath, secondaryRootPath],
        pattern: "schema",
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 100,
      },
      resumeState: {
        rootTraversalStates: {
          [sandboxRootPath]: {
            traversalFrames: [{ directoryRelativePath: "", nextEntryIndex: 3 }],
          },
          [secondaryRootPath]: {
            traversalFrames: [{ directoryRelativePath: "", nextEntryIndex: 1 }],
          },
        },
        deliveredTotals: { matchCount: 2 },
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
      activeStore,
      [sandboxRootPath, secondaryRootPath],
      100,
    );

    expect(result.admission.scopeReductionGuidanceText).toBe(
      "Reduce the discovery scope by narrowing roots or making nameContains more specific.",
    );
  });
});
