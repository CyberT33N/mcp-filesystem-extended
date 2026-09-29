import { rmSync } from "node:fs";
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

  it("merges continuation states from multiple truncating roots into one persisted session", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    throwMode = "always";

    const secondaryRootPath = join(sandboxRootPath, "secondary");
    await mkdir(secondaryRootPath, { recursive: true });

    const result = await getListDirectoryEntriesResult(
      undefined,
      undefined,
      [sandboxRootPath, secondaryRootPath],
      true,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
      [],
      [],
      false,
      [sandboxRootPath, secondaryRootPath],
      activeStore,
    );

    expect(result.roots).toHaveLength(2);
    expect(result.resume.resumable).toBe(true);
  });

  it("rethrows non-budget failures from the traversal runtime safeguard at a directory visit", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    mockedAssertTraversalRuntimeBudget.mockImplementation((toolName: string) => {
      if (toolName === "list_directory_entries") {
        throw new Error("unexpected safeguard internals failure");
      }
    });

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
        activeStore,
      ),
    ).rejects.toThrow("unexpected safeguard internals failure");
  });

  it("aborts the preview pass when the traversal runtime budget is exhausted at an entry visit", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    let handlerScopedCalls = 0;
    mockedAssertTraversalRuntimeBudget.mockImplementation((toolName: string, state: { visitedEntries: number }) => {
      if (toolName !== "list_directory_entries") {
        return;
      }

      handlerScopedCalls += 1;

      if (handlerScopedCalls === 2) {
        throw new TraversalRuntimeBudgetExceededError(
          "Traversal runtime budget exhausted for the current listing pass.",
          "list_directory_entries",
          "traversal entries visited",
          state.visitedEntries,
          1,
          "entries",
        );
      }
    });

    const result = await getListDirectoryEntriesResult(
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

    expect(result.resume.resumable).toBe(true);
  });

  it("rethrows non-budget failures from the traversal runtime safeguard at an entry visit", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    let handlerScopedCalls = 0;
    mockedAssertTraversalRuntimeBudget.mockImplementation((toolName: string) => {
      if (toolName !== "list_directory_entries") {
        return;
      }

      handlerScopedCalls += 1;

      if (handlerScopedCalls === 2) {
        throw new Error("unexpected safeguard internals failure");
      }
    });

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
        activeStore,
      ),
    ).rejects.toThrow("unexpected safeguard internals failure");
  });

  it("applies the family response cap for inline base requests through the formatted handler", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValueOnce({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.INLINE,
      guidanceText: null,
    });

    const output = await handleListDirectoryEntries(
      undefined,
      undefined,
      [sandboxRootPath],
      false,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
      [],
      [],
      false,
      [sandboxRootPath],
      activeStore,
    );

    expect(output).toContain("nested");
  });

  it("skips default-excluded entries while estimating the non-recursive inline response surface", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    await mkdir(join(sandboxRootPath, "node_modules"));
    await writeFile(join(sandboxRootPath, "node_modules", "vendored.js"), "ignored");

    mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValueOnce({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.INLINE,
      guidanceText: null,
    });

    const result = await getListDirectoryEntriesResult(
      undefined,
      undefined,
      [sandboxRootPath],
      false,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
      [],
      [],
      false,
      [sandboxRootPath],
      activeStore,
    );

    expect(result.roots[0]?.entries.map((entry) => entry.name)).not.toContain("node_modules");
  });

  it("falls back to canonical narrowing guidance when the admission decision carries no guidance text", async () => {
    mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValueOnce({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.NARROWING_REQUIRED,
      guidanceText: null,
    });

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
        store,
      ),
    ).rejects.toThrow(`Narrow the requested root '${sandboxRootPath}'`);
  });

  it("closes a preview-first base pass truthfully when a directory frame must be discarded", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    const doomedDirectoryPath = join(sandboxRootPath, "zz-doomed");
    await mkdir(doomedDirectoryPath, { recursive: true });
    await writeFile(join(doomedDirectoryPath, "hidden.txt"), "hidden");
    await writeFile(join(sandboxRootPath, "aaa.txt"), "aaa");

    mockedAssertTraversalRuntimeBudget.mockImplementation((toolName: string, state: { visitedDirectories: number }) => {
      // The candidate-workload probe runs under its own tool name and passes through. The
      // 'zz-doomed' directory sorts last beneath the root and vanishes at its child frame's
      // directory visit — after the entry was materialized, before its content is read — so the
      // collector must record a frontier discard instead of silently dropping the frame.
      if (toolName !== "list_directory_entries") {
        return;
      }

      if (state.visitedDirectories === 3) {
        rmSync(doomedDirectoryPath, { recursive: true, force: true });
      }
    });

    const result = await getListDirectoryEntriesResult(
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

    expect(result.resume.resumable).toBe(false);
    expect(result.resume.resumeToken).toBeNull();
    expect(result.frontierReconciliation.status).toBe("diverged");
    expect(result.frontierReconciliation.discardedDirectories).toEqual([
      { requestedPath: sandboxRootPath, directoryRelativePath: "zz-doomed" },
    ]);
    expect(result.sessionDelivery).toEqual({
      continuationPass: false,
      previouslyDeliveredCount: 0,
      sessionTotalCount: 4,
    });
    expect(result.roots[0]?.entries.map((entry) => entry.path)).toEqual([
      "aaa.txt",
      "nested",
      "nested/sample.txt",
      "zz-doomed",
    ]);

    // Recreate the discarded directory so the formatted handler drive replays the same seam.
    await mkdir(doomedDirectoryPath, { recursive: true });
    await writeFile(join(doomedDirectoryPath, "hidden.txt"), "hidden");

    const output = await handleListDirectoryEntries(
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

    expect(output).toContain("Directory-listing session closed without completing:");
    expect(output).toContain(`First discard: 'zz-doomed' beneath root '${sandboxRootPath}'.`);
    expect(output).not.toContain("completion finished");
  });

  it("cancels the persisted session truthfully when a resume pass discards a directory frame", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    const doomedDirectoryPath = join(sandboxRootPath, "zz-doomed");
    await mkdir(doomedDirectoryPath, { recursive: true });
    await writeFile(join(doomedDirectoryPath, "hidden.txt"), "hidden");
    await writeFile(join(sandboxRootPath, "aaa.txt"), "aaa");
    await writeFile(join(sandboxRootPath, "bbb.txt"), "bbb");

    let budgetExhaustionArmed = true;

    mockedAssertTraversalRuntimeBudget.mockImplementation((toolName: string, state: { visitedEntries: number; visitedDirectories: number }) => {
      // The candidate-workload probe runs under its own tool name and passes through. The base
      // pass aborts at the third entry visit; on the disarmed resume pass the 'zz-doomed'
      // directory sorts last beneath the root and vanishes at its child frame's directory visit —
      // after the entry was materialized, before its content is read.
      if (toolName !== "list_directory_entries") {
        return;
      }

      if (budgetExhaustionArmed && state.visitedEntries >= 3) {
        throw new TraversalRuntimeBudgetExceededError(
          "Traversal runtime budget exhausted for the current listing pass.",
          "list_directory_entries",
          "traversal entries visited",
          state.visitedEntries,
          2,
          "entries",
        );
      }

      if (!budgetExhaustionArmed && state.visitedDirectories === 2) {
        rmSync(doomedDirectoryPath, { recursive: true, force: true });
      }
    });

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
    expect(baseResult.roots[0]?.entries.map((entry) => entry.path)).toEqual(["aaa.txt", "bbb.txt"]);

    const resumeToken = baseResult.resume.resumeToken;

    if (resumeToken === null) {
      throw new Error("Expected an active resume token after the preview-first base pass.");
    }

    budgetExhaustionArmed = false;

    const resumeResult = await getListDirectoryEntriesResult(
      resumeToken,
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

    expect(resumeResult.resume.resumable).toBe(false);
    expect(resumeResult.resume.resumeToken).toBeNull();
    expect(resumeResult.frontierReconciliation.status).toBe("diverged");
    expect(resumeResult.frontierReconciliation.discardedDirectories).toEqual([
      { requestedPath: sandboxRootPath, directoryRelativePath: "zz-doomed" },
    ]);
    expect(resumeResult.sessionDelivery).toEqual({
      continuationPass: true,
      previouslyDeliveredCount: 2,
      sessionTotalCount: 5,
    });

    // Recreate the discarded directory so the formatted handler drive replays the same seam.
    await mkdir(doomedDirectoryPath, { recursive: true });
    await writeFile(join(doomedDirectoryPath, "hidden.txt"), "hidden");

    const terminalOutput = await handleListDirectoryEntries(
      resumeToken,
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

    expect(terminalOutput).toContain("Directory-listing session closed without completing:");
    expect(terminalOutput).not.toContain("completion finished");
    expect(
      activeStore.loadActiveSession(
        resumeToken,
        "list_directory_entries",
        "list_directory_entries",
      ),
    ).toBeNull();
  });
});
