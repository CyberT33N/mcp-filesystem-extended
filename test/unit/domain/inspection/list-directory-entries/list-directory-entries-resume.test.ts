import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockedAssertTraversalRuntimeBudget,
  mockedResolveTraversalWorkloadAdmissionDecision,
} = vi.hoisted(() => ({
  mockedAssertTraversalRuntimeBudget: vi.fn(),
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

vi.mock("@domain/shared/guardrails/traversal-runtime-budget", async () => {
  const actual = await vi.importActual<
    typeof import("@domain/shared/guardrails/traversal-runtime-budget")
  >("@domain/shared/guardrails/traversal-runtime-budget");

  return {
    ...actual,
    assertTraversalRuntimeBudget: mockedAssertTraversalRuntimeBudget,
  };
});

import {
  getListDirectoryEntriesResult,
  handleListDirectoryEntries,
} from "@domain/inspection/list-directory-entries/handler";
import { DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION } from "@domain/inspection/shared/filesystem-entry-metadata-contract";
import { TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES } from "@domain/shared/guardrails/traversal-workload-admission";
import { TraversalRuntimeBudgetExceededError } from "@domain/shared/guardrails/traversal-runtime-budget";
import { INSPECTION_RESUME_MODES } from "@domain/shared/resume/inspection-resume-contract";
import { InspectionResumeSessionSqliteStore } from "@infrastructure/persistence/inspection-resume-session-sqlite-store";

describe("list_directory_entries resume lifecycle", () => {
  let sandboxRootPath = "";
  let storeDirectoryPath = "";
  let store: InspectionResumeSessionSqliteStore | undefined;
  let throwMode: "off" | "child-descend" | "always" = "off";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-list-resume-"));
    storeDirectoryPath = await mkdtemp(join(tmpdir(), "mcp-fs-list-resume-store-"));
    store = new InspectionResumeSessionSqliteStore(
      join(storeDirectoryPath, "sessions.sqlite"),
    );
    throwMode = "off";

    mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      guidanceText: null,
    });
    mockedAssertTraversalRuntimeBudget.mockImplementation((toolName: string, state: { visitedDirectories: number }) => {
      // The candidate-workload probe runs under its own tool name and passes through; only the
      // directory-listing preview chunk is aborted under the active throw mode.
      if (toolName !== "list_directory_entries" || throwMode === "off") {
        return;
      }

      if (throwMode === "always" || state.visitedDirectories >= 2) {
        throw new TraversalRuntimeBudgetExceededError(
          "Traversal runtime budget exhausted for the current listing pass.",
          "list_directory_entries",
          "traversal directories visited",
          state.visitedDirectories,
          1,
          "directories",
        );
      }
    });

    await mkdir(join(sandboxRootPath, "nested"), { recursive: true });
    await writeFile(join(sandboxRootPath, "nested", "sample.txt"), "sample");
  });

  afterEach(async () => {
    store?.close();
    store = undefined;
    await rm(sandboxRootPath, { recursive: true, force: true });
    await rm(storeDirectoryPath, { recursive: true, force: true });
  });

  it("threads delivered entry totals through the full preview-first resume lifecycle", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    throwMode = "child-descend";

    const baseResult = await getListDirectoryEntriesResult(
      undefined,
      undefined,
      [sandboxRootPath],
      true,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
      [],
      [],
      false,
      [sandboxRootPath],
      activeStore,
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

    throwMode = "off";

    const terminalResult = await getListDirectoryEntriesResult(
      activeResumeToken,
      INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      [],
      true,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
      [],
      [],
      false,
      [sandboxRootPath],
      activeStore,
    );

    expect(terminalResult.resume.resumable).toBe(false);
    expect(terminalResult.sessionDelivery).toEqual({
      continuationPass: true,
      previouslyDeliveredCount: 1,
      sessionTotalCount: 2,
    });
    expect(terminalResult.admission.guidanceText).toContain(
      "Combine with the prior preview-chunk payload",
    );

    const terminalOutput = await handleListDirectoryEntries(
      activeResumeToken,
      INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      [],
      true,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
      [],
      [],
      false,
      [sandboxRootPath],
      activeStore,
    );

    expect(terminalOutput).toContain("Directory-listing completion finished for 1 root:");
    expect(terminalOutput).toContain("session total 2 entries (1 already delivered in prior preview-chunk payloads)");
  });

  it("completes the session with the carried delivery summary when no active roots remain", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    const seededSession = activeStore.createSession({
      endpointName: "list_directory_entries",
      familyMember: "list_directory_entries",
      requestPayload: {
        requestedPaths: [sandboxRootPath],
        recursive: true,
        metadataSelection: DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
      },
      resumeState: {
        rootTraversalStates: {
          elsewhere: {
            traversalFrames: [{ directoryRelativePath: "", nextEntryIndex: 3 }],
          },
        },
        deliveredTotals: { entryCount: 2 },
      },
      admissionOutcome: "preview-first",
    });

    const result = await getListDirectoryEntriesResult(
      seededSession.resumeToken,
      INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      [],
      true,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
      [],
      [],
      false,
      [sandboxRootPath],
      activeStore,
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
        "list_directory_entries",
        "list_directory_entries",
      ),
    ).toBeNull();
  });

  it("rejects resume requests when resume-session storage is unavailable", async () => {
    await expect(
      getListDirectoryEntriesResult(
        "insresume_unknown",
        INSPECTION_RESUME_MODES.NEXT_CHUNK,
        [],
        false,
        DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
        [],
        [],
        false,
        [sandboxRootPath],
        undefined,
      ),
    ).rejects.toThrow("Resume-session storage is unavailable for list_directory_entries resume requests.");
  });

  it("rejects resume requests whose token resolves to no active session", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    await expect(
      getListDirectoryEntriesResult(
        "insresume_00000000-0000-0000-0000-000000000000",
        INSPECTION_RESUME_MODES.NEXT_CHUNK,
        [],
        false,
        DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
        [],
        [],
        false,
        [sandboxRootPath],
        activeStore,
      ),
    ).rejects.toThrow("could not be fulfilled because the supplied resume token does not resolve to an active server-owned resume session");
  });

  it("rejects a preview-first base response when resume-session storage is unavailable", async () => {
    throwMode = "always";

    await expect(
      getListDirectoryEntriesResult(
        undefined,
        undefined,
        [sandboxRootPath],
        true,
        DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
        [],
        [],
        false,
        [sandboxRootPath],
        undefined,
      ),
    ).rejects.toThrow("Resume-session storage is unavailable for directory-listing resume.");
  });

  it("falls back to next-chunk when the resume request carries no mode", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    throwMode = "child-descend";

    const seededSession = activeStore.createSession({
      endpointName: "list_directory_entries",
      familyMember: "list_directory_entries",
      requestPayload: {
        requestedPaths: [sandboxRootPath],
        recursive: true,
        metadataSelection: DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
      },
      resumeState: {
        rootTraversalStates: {
          [sandboxRootPath]: {
            traversalFrames: [{ directoryRelativePath: "", nextEntryIndex: 0 }],
          },
        },
        deliveredTotals: { entryCount: 1 },
      },
      admissionOutcome: "preview-first",
      lastRequestedResumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
    });

    const result = await getListDirectoryEntriesResult(
      seededSession.resumeToken,
      undefined,
      [],
      true,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
      [],
      [],
      false,
      [sandboxRootPath],
      activeStore,
    );

    expect(result.admission.outcome).toBe("preview-first");
    expect(result.resume.resumable).toBe(true);
  });

  it("updates the persisted resume state on a non-terminal next-chunk resume pass", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    throwMode = "always";

    const baseResult = await getListDirectoryEntriesResult(
      undefined,
      undefined,
      [sandboxRootPath],
      true,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
      [],
      [],
      false,
      [sandboxRootPath],
      activeStore,
    );

    expect(baseResult.resume.resumable).toBe(true);
    expect(baseResult.sessionDelivery).toEqual({
      continuationPass: false,
      previouslyDeliveredCount: 0,
      sessionTotalCount: 0,
    });

    const activeResumeToken = baseResult.resume.resumeToken;

    if (activeResumeToken === null) {
      throw new Error("Expected an active resume token after the preview-first base pass.");
    }

    const nextChunkResult = await getListDirectoryEntriesResult(
      activeResumeToken,
      INSPECTION_RESUME_MODES.NEXT_CHUNK,
      [],
      true,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
      [],
      [],
      false,
      [sandboxRootPath],
      activeStore,
    );

    expect(nextChunkResult.resume.resumable).toBe(true);
    expect(nextChunkResult.admission.outcome).toBe("preview-first");
    expect(
      activeStore.loadActiveSession(
        activeResumeToken,
        "list_directory_entries",
        "list_directory_entries",
      )?.resumeState,
    ).toMatchObject({
      deliveredTotals: { entryCount: 0 },
    });

    throwMode = "off";

    const terminalResult = await getListDirectoryEntriesResult(
      activeResumeToken,
      INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      [],
      true,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
      [],
      [],
      false,
      [sandboxRootPath],
      activeStore,
    );

    expect(terminalResult.resume.resumable).toBe(false);
    expect(terminalResult.sessionDelivery).toEqual({
      continuationPass: true,
      previouslyDeliveredCount: 0,
      sessionTotalCount: 2,
    });
  });
});
