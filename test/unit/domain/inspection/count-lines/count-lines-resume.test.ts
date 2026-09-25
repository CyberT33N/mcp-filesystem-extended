import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockedAssertTraversalRuntimeBudget, mockedResolveTraversalWorkloadAdmissionDecision } = vi.hoisted(() => ({
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

import { getCountLinesResult, handleCountLines } from "@domain/inspection/count-lines/handler";
import { TraversalRuntimeBudgetExceededError } from "@domain/shared/guardrails/traversal-runtime-budget";
import { TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES } from "@domain/shared/guardrails/traversal-workload-admission";
import { INSPECTION_RESUME_MODES } from "@domain/shared/resume/inspection-resume-contract";
import { InspectionResumeSessionSqliteStore } from "@infrastructure/persistence/inspection-resume-session-sqlite-store";

describe("count_lines resume lifecycle", () => {
  let sandboxRootPath = "";
  let storeDirectoryPath = "";
  let store: InspectionResumeSessionSqliteStore | undefined;
  let entryBudgetThreshold = Number.MAX_SAFE_INTEGER;

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-count-lines-resume-"));
    storeDirectoryPath = await mkdtemp(join(tmpdir(), "mcp-fs-count-lines-resume-store-"));
    store = new InspectionResumeSessionSqliteStore(
      join(storeDirectoryPath, "sessions.sqlite"),
    );

    entryBudgetThreshold = Number.MAX_SAFE_INTEGER;

    mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
      guidanceText: null,
    });

    mockedAssertTraversalRuntimeBudget.mockImplementation(
      (toolName: string, state: { visitedEntries: number }) => {
        if (toolName !== "count_lines") {
          return;
        }

        if (state.visitedEntries >= entryBudgetThreshold) {
          throw new TraversalRuntimeBudgetExceededError(
            "Traversal runtime budget exhausted for the current count-lines pass.",
            "count_lines",
            "traversal entries visited",
            100,
            1,
            "entries",
          );
        }
      },
    );

    await writeFile(join(sandboxRootPath, "one.txt"), "a\nb\n");
    await writeFile(join(sandboxRootPath, "two.txt"), "c\nd\n");
    await writeFile(join(sandboxRootPath, "three.txt"), "e\nf\n");
  });

  afterEach(async () => {
    store?.close();
    store = undefined;
    await rm(sandboxRootPath, { recursive: true, force: true });
    await rm(storeDirectoryPath, { recursive: true, force: true });
  });

  it("rejects resume requests when resume-session storage is unavailable", async () => {
    await expect(
      getCountLinesResult(
        "insresume_unknown",
        INSPECTION_RESUME_MODES.COMPLETE_RESULT,
        [],
        true,
        undefined,
        [],
        [],
        [],
        false,
        false,
        undefined,
        [sandboxRootPath],
      ),
    ).rejects.toThrow("Resume-session storage is unavailable for count_lines resume requests.");
  });

  it("rejects completion-backed pending base passes when resume-session storage is unavailable", async () => {
    entryBudgetThreshold = 1;

    await expect(
      getCountLinesResult(
        undefined,
        undefined,
        [sandboxRootPath],
        true,
        undefined,
        [],
        [],
        [],
        false,
        false,
        undefined,
        [sandboxRootPath],
      ),
    ).rejects.toThrow("Resume-session storage is unavailable for completion-backed count_lines execution.");
  });

  it("rejects resume requests whose token resolves to no active session", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    await expect(
      getCountLinesResult(
        "insresume_00000000-0000-0000-0000-000000000000",
        INSPECTION_RESUME_MODES.COMPLETE_RESULT,
        [],
        true,
        undefined,
        [],
        [],
        [],
        false,
        false,
        activeStore,
        [sandboxRootPath],
      ),
    ).rejects.toThrow("could not be fulfilled because the supplied resume token does not resolve to an active server-owned resume session");
  });

  it("threads a completion-backed session through pending passes into a truthful terminal completion", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    entryBudgetThreshold = 1;

    const baseResult = await getCountLinesResult(
      undefined,
      undefined,
      [sandboxRootPath],
      true,
      undefined,
      [],
      [],
      [],
      false,
      false,
      activeStore,
      [sandboxRootPath],
    );

    expect(baseResult.resume.resumable).toBe(true);
    expect(baseResult.admission.outcome).toBe("completion-backed-required");

    const activeResumeToken = baseResult.resume.resumeToken;

    if (activeResumeToken === null) {
      throw new Error("Expected an active resume token after the completion-backed base pass.");
    }

    expect(
      activeStore.loadActiveSession(
        activeResumeToken,
        "count_lines",
        "count_lines",
      ),
    ).not.toBeNull();

    entryBudgetThreshold = 2;

    const pendingResumeResult = await getCountLinesResult(
      activeResumeToken,
      undefined,
      [],
      true,
      undefined,
      [],
      [],
      [],
      false,
      false,
      activeStore,
      [sandboxRootPath],
    );

    expect(pendingResumeResult.resume.resumable).toBe(true);
    expect(pendingResumeResult.resume.resumeToken).toBe(activeResumeToken);
    expect(
      activeStore.loadActiveSession(
        activeResumeToken,
        "count_lines",
        "count_lines",
      ),
    ).not.toBeNull();

    entryBudgetThreshold = Number.MAX_SAFE_INTEGER;

    const terminalResult = await getCountLinesResult(
      activeResumeToken,
      INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      [],
      true,
      undefined,
      [],
      [],
      [],
      false,
      false,
      activeStore,
      [sandboxRootPath],
    );

    expect(terminalResult.resume.resumable).toBe(false);
    expect(terminalResult.totalFiles).toBe(3);
    expect(terminalResult.totalLines).toBe(6);

    const terminalOutput = await handleCountLines(
      activeResumeToken,
      INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      [],
      true,
      undefined,
      [],
      [],
      [],
      false,
      false,
      activeStore,
      [sandboxRootPath],
    );

    expect(terminalOutput).toContain("Total: 3 files, 6 lines");
    expect(
      activeStore.loadActiveSession(
        activeResumeToken,
        "count_lines",
        "count_lines",
      ),
    ).toBeNull();
  });

  it("falls back to the completion-only default mode when a legacy session carries no last requested mode", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    const seededSession = activeStore.createSession({
      endpointName: "count_lines",
      familyMember: "count_lines",
      requestPayload: {
        filePaths: [sandboxRootPath],
        recursive: true,
        pattern: null,
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        ignoreEmptyLines: false,
      },
      resumeState: {
        pathStates: {
          [sandboxRootPath]: {
            traversalFrames: [{ directoryRelativePath: "", nextEntryIndex: 1 }],
            files: [],
            totalLines: 0,
            totalMatchingLines: 0,
            completed: false,
          },
        },
      },
      admissionOutcome: "completion-backed-required",
      lastRequestedResumeMode: null,
    });

    const result = await getCountLinesResult(
      seededSession.resumeToken,
      undefined,
      [],
      true,
      undefined,
      [],
      [],
      [],
      false,
      false,
      activeStore,
      [sandboxRootPath],
    );

    expect(result.resume.resumable).toBe(false);
    expect(result.totalFiles).toBe(2);
    expect(result.totalLines).toBe(4);
  });

  it("carries a completed path state across a resume while a pending sibling completes", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    const completedPath = join(sandboxRootPath, "completed");
    const pendingPath = join(sandboxRootPath, "pending");
    await mkdir(completedPath, { recursive: true });
    await mkdir(pendingPath, { recursive: true });
    await writeFile(join(pendingPath, "later.txt"), "x\ny\n");

    const seededSession = activeStore.createSession({
      endpointName: "count_lines",
      familyMember: "count_lines",
      requestPayload: {
        filePaths: [completedPath, pendingPath],
        recursive: true,
        pattern: null,
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        ignoreEmptyLines: false,
      },
      resumeState: {
        pathStates: {
          [completedPath]: {
            traversalFrames: [],
            files: [{ file: join(completedPath, "done.txt"), count: 5 }],
            totalLines: 5,
            totalMatchingLines: 0,
            completed: true,
          },
          [pendingPath]: {
            traversalFrames: [{ directoryRelativePath: "", nextEntryIndex: 0 }],
            files: [],
            totalLines: 0,
            totalMatchingLines: 0,
            completed: false,
          },
        },
      },
      admissionOutcome: "completion-backed-required",
      lastRequestedResumeMode: "complete-result",
    });

    const result = await getCountLinesResult(
      seededSession.resumeToken,
      INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      [],
      true,
      undefined,
      [],
      [],
      [],
      false,
      false,
      activeStore,
      [sandboxRootPath],
    );

    expect(result.resume.resumable).toBe(false);
    expect(result.totalFiles).toBe(2);
    expect(result.totalLines).toBe(7);
  });
});
