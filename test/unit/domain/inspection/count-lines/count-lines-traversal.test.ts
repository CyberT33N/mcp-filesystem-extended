import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const countLinesTraversalMockState = vi.hoisted(() => {
  const state: {
    mockedAssertTraversalRuntimeBudget: ReturnType<typeof vi.fn>;
    mockedReaddir: ReturnType<typeof vi.fn>;
    mockedStat: ReturnType<typeof vi.fn>;
    mockedResolveTraversalScopeEntryPolicy: ReturnType<typeof vi.fn>;
    mockedResolveTraversalWorkloadAdmissionDecision: ReturnType<typeof vi.fn>;
    mockedValidatePath: ReturnType<typeof vi.fn>;
    mockedClassifyInspectionContentState: ReturnType<typeof vi.fn>;
    actualReaddir: typeof import("node:fs/promises").readdir | null;
    actualStat: typeof import("node:fs/promises").stat | null;
    actualResolveTraversalScopeEntryPolicy: typeof import("@domain/shared/guardrails/traversal-scope-policy").resolveTraversalScopeEntryPolicy | null;
    actualValidatePath: typeof import("@infrastructure/filesystem/path-guard").validatePath | null;
    actualClassify: typeof import("@domain/shared/search/inspection-content-state").classifyInspectionContentState | null;
  } = {
    mockedAssertTraversalRuntimeBudget: vi.fn(),
    mockedReaddir: vi.fn(),
    mockedStat: vi.fn(),
    mockedResolveTraversalScopeEntryPolicy: vi.fn(),
    mockedResolveTraversalWorkloadAdmissionDecision: vi.fn(),
    mockedValidatePath: vi.fn(),
    mockedClassifyInspectionContentState: vi.fn(),
    actualReaddir: null,
    actualStat: null,
    actualResolveTraversalScopeEntryPolicy: null,
    actualValidatePath: null,
    actualClassify: null,
  };

  return state;
});

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

  countLinesTraversalMockState.actualStat = actual.stat;
  countLinesTraversalMockState.actualReaddir = actual.readdir;

  return {
    ...actual,
    default: {
      ...actual,
      stat: countLinesTraversalMockState.mockedStat,
      readdir: countLinesTraversalMockState.mockedReaddir,
    },
    stat: countLinesTraversalMockState.mockedStat,
    readdir: countLinesTraversalMockState.mockedReaddir,
  };
});

vi.mock("@domain/shared/guardrails/traversal-workload-admission", async () => {
  const actual = await vi.importActual<
    typeof import("@domain/shared/guardrails/traversal-workload-admission")
  >("@domain/shared/guardrails/traversal-workload-admission");

  return {
    ...actual,
    resolveTraversalWorkloadAdmissionDecision:
      countLinesTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision,
  };
});

vi.mock("@domain/shared/guardrails/traversal-runtime-budget", async () => {
  const actual = await vi.importActual<
    typeof import("@domain/shared/guardrails/traversal-runtime-budget")
  >("@domain/shared/guardrails/traversal-runtime-budget");

  return {
    ...actual,
    assertTraversalRuntimeBudget: countLinesTraversalMockState.mockedAssertTraversalRuntimeBudget,
  };
});

vi.mock("@domain/shared/guardrails/traversal-scope-policy", async () => {
  const actual = await vi.importActual<
    typeof import("@domain/shared/guardrails/traversal-scope-policy")
  >("@domain/shared/guardrails/traversal-scope-policy");

  countLinesTraversalMockState.actualResolveTraversalScopeEntryPolicy =
    actual.resolveTraversalScopeEntryPolicy;

  return {
    ...actual,
    resolveTraversalScopeEntryPolicy:
      countLinesTraversalMockState.mockedResolveTraversalScopeEntryPolicy,
  };
});

vi.mock("@infrastructure/filesystem/path-guard", async () => {
  const actual = await vi.importActual<
    typeof import("@infrastructure/filesystem/path-guard")
  >("@infrastructure/filesystem/path-guard");

  countLinesTraversalMockState.actualValidatePath = actual.validatePath;

  return {
    ...actual,
    validatePath: countLinesTraversalMockState.mockedValidatePath,
  };
});

vi.mock("@domain/shared/search/inspection-content-state", async () => {
  const actual = await vi.importActual<
    typeof import("@domain/shared/search/inspection-content-state")
  >("@domain/shared/search/inspection-content-state");

  countLinesTraversalMockState.actualClassify = actual.classifyInspectionContentState;

  return {
    ...actual,
    classifyInspectionContentState: countLinesTraversalMockState.mockedClassifyInspectionContentState,
  };
});

import { getCountLinesResult } from "@domain/inspection/count-lines/handler";
import { INSPECTION_CONTENT_STATE_LITERALS } from "@domain/shared/search/inspection-content-state";
import { TraversalRuntimeBudgetExceededError } from "@domain/shared/guardrails/traversal-runtime-budget";
import { TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES } from "@domain/shared/guardrails/traversal-workload-admission";
import { InspectionResumeSessionSqliteStore } from "@infrastructure/persistence/inspection-resume-session-sqlite-store";

describe("count_lines traversal internals", () => {
  let sandboxRootPath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-count-lines-traversal-"));

    const actualReaddir = countLinesTraversalMockState.actualReaddir;
    const actualStat = countLinesTraversalMockState.actualStat;
    const actualResolve = countLinesTraversalMockState.actualResolveTraversalScopeEntryPolicy;
    const actualValidate = countLinesTraversalMockState.actualValidatePath;
    const actualClassify = countLinesTraversalMockState.actualClassify;

    if (
      actualReaddir === null
      || actualStat === null
      || actualResolve === null
      || actualValidate === null
      || actualClassify === null
    ) {
      throw new Error("Expected the actual boundary bindings to be initialized.");
    }

    countLinesTraversalMockState.mockedReaddir.mockImplementation(async (candidatePath, options) =>
      actualReaddir(candidatePath, options),
    );
    countLinesTraversalMockState.mockedStat.mockImplementation(async (candidatePath, options) =>
      actualStat(candidatePath, options),
    );
    countLinesTraversalMockState.mockedAssertTraversalRuntimeBudget.mockImplementation(() => {});
    countLinesTraversalMockState.mockedResolveTraversalScopeEntryPolicy.mockImplementation(
      (relativePath, isDirectory, resolution) =>
        actualResolve(relativePath, isDirectory, resolution),
    );
    countLinesTraversalMockState.mockedValidatePath.mockImplementation(async (candidatePath, allowed) =>
      actualValidate(candidatePath, allowed),
    );
    countLinesTraversalMockState.mockedClassifyInspectionContentState.mockImplementation((input) =>
      actualClassify(input),
    );
    countLinesTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.INLINE,
      guidanceText: null,
    });

    const { mkdir, writeFile } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

    await mkdir(join(sandboxRootPath, "child"), { recursive: true });
    await writeFile(join(sandboxRootPath, "alpha.txt"), "a\nb\n");
    await writeFile(join(sandboxRootPath, "child", "beta.txt"), "c\nd\n");
  });

  afterEach(async () => {
    await rm(sandboxRootPath, { recursive: true, force: true });
  });

  it("stops the task-backed loop when the runtime budget is exhausted at a child directory visit", async () => {
    const storeDirectoryPath = await mkdtemp(join(tmpdir(), "mcp-fs-count-lines-traversal-store-"));
    const store = new InspectionResumeSessionSqliteStore(
      join(storeDirectoryPath, "sessions.sqlite"),
    );

    try {
      countLinesTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
        outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
        guidanceText: null,
      });
      countLinesTraversalMockState.mockedAssertTraversalRuntimeBudget.mockImplementation(
        (toolName: string, state: { visitedDirectories: number }) => {
          if (toolName !== "count_lines") {
            return;
          }

          if (state.visitedDirectories >= 2) {
            throw new TraversalRuntimeBudgetExceededError(
              "Traversal runtime budget exhausted for the current count-lines pass.",
              "count_lines",
              "traversal directories visited",
              100,
              2,
              "directories",
            );
          }
        },
      );

      const result = await getCountLinesResult(
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
        store,
        [sandboxRootPath],
      );

      expect(result.resume.resumable).toBe(true);
      expect(result.paths).toEqual([]);
    } finally {
      store.close();
      await rm(storeDirectoryPath, { recursive: true, force: true });
    }
  });

  it("rethrows non-budget failures at a task-backed directory visit", async () => {
    countLinesTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
      guidanceText: null,
    });
    countLinesTraversalMockState.mockedAssertTraversalRuntimeBudget.mockImplementation((toolName: string) => {
      if (toolName !== "count_lines") {
        return;
      }

      throw new Error("unexpected directory-visit failure");
    });

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
    ).rejects.toThrow("unexpected directory-visit failure");
  });

  it("rethrows non-budget failures at a task-backed entry visit", async () => {
    countLinesTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
      guidanceText: null,
    });
    countLinesTraversalMockState.mockedAssertTraversalRuntimeBudget.mockImplementation(
      (toolName: string, state: { visitedEntries: number }) => {
        if (toolName !== "count_lines") {
          return;
        }

        if (state.visitedEntries >= 1) {
          throw new Error("unexpected entry-visit failure");
        }
      },
    );

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
    ).rejects.toThrow("unexpected entry-visit failure");
  });

  it("skips a child frame whose directory cannot be read in the task-backed loop", async () => {
    const actualReaddir = countLinesTraversalMockState.actualReaddir;

    if (actualReaddir === null) {
      throw new Error("Expected the actual readdir binding to be initialized.");
    }

    countLinesTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
      guidanceText: null,
    });
    countLinesTraversalMockState.mockedReaddir.mockImplementation(async (candidatePath, options) => {
      if (typeof candidatePath === "string" && candidatePath.endsWith("child")) {
        throw new Error("read failure");
      }

      return actualReaddir(candidatePath, options);
    });

    const result = await getCountLinesResult(
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
    );

    expect(result.resume.resumable).toBe(false);
    expect(result.totalFiles).toBe(1);
  });

  it("skips entries excluded by the traversal scope policy in the task-backed loop", async () => {
    const actualResolve = countLinesTraversalMockState.actualResolveTraversalScopeEntryPolicy;

    if (actualResolve === null) {
      throw new Error("Expected the actual scope-policy binding to be initialized.");
    }

    countLinesTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
      guidanceText: null,
    });
    countLinesTraversalMockState.mockedResolveTraversalScopeEntryPolicy.mockImplementation(
      async (relativePath, isDirectory, resolution) => {
        if (relativePath === "alpha.txt") {
          return {
            excluded: true,
            shouldTraverse: false,
          };
        }

        return actualResolve(relativePath, isDirectory, resolution);
      },
    );

    const result = await getCountLinesResult(
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
    );

    expect(result.totalFiles).toBe(1);
    expect(result.paths[0]?.files[0]?.file).toBe(join(sandboxRootPath, "child", "beta.txt"));
  });

  it("skips entries that fail path validation in the task-backed loop", async () => {
    const actualValidate = countLinesTraversalMockState.actualValidatePath;

    if (actualValidate === null) {
      throw new Error("Expected the actual path-guard binding to be initialized.");
    }

    countLinesTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
      guidanceText: null,
    });
    countLinesTraversalMockState.mockedValidatePath.mockImplementation(async (candidatePath, allowed) => {
      if (typeof candidatePath === "string" && candidatePath.endsWith("alpha.txt")) {
        throw new Error("path rejected");
      }

      return actualValidate(candidatePath, allowed);
    });

    const result = await getCountLinesResult(
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
    );

    expect(result.totalFiles).toBe(1);
    expect(result.paths[0]?.files[0]?.file).toBe(join(sandboxRootPath, "child", "beta.txt"));
  });

  it("rethrows an unsupported-state failure raised inside the task-backed loop", async () => {
    countLinesTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
      guidanceText: null,
    });
    countLinesTraversalMockState.mockedClassifyInspectionContentState.mockImplementation((input) => ({
      ...countLinesTraversalMockState.actualClassify?.(input),
      resolvedState: INSPECTION_CONTENT_STATE_LITERALS.BINARY_CONFIDENT,
    }));

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
    ).rejects.toThrow("count_lines unsupported state:");
  });

  it("skips a child directory whose read fails in the inline loop", async () => {
    const actualReaddir = countLinesTraversalMockState.actualReaddir;

    if (actualReaddir === null) {
      throw new Error("Expected the actual readdir binding to be initialized.");
    }

    countLinesTraversalMockState.mockedReaddir.mockImplementation(async (candidatePath, options) => {
      if (typeof candidatePath === "string" && candidatePath.endsWith("child")) {
        throw new Error("child read failure");
      }

      return actualReaddir(candidatePath, options);
    });

    const result = await getCountLinesResult(
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
    );

    expect(result.totalFiles).toBe(1);
    expect(result.paths[0]?.files[0]?.file).toBe(join(sandboxRootPath, "alpha.txt"));
  });

  it("skips files whose counting fails in the inline loop when no pattern is set", async () => {
    const actualStat = countLinesTraversalMockState.actualStat;

    if (actualStat === null) {
      throw new Error("Expected the actual stat binding to be initialized.");
    }

    countLinesTraversalMockState.mockedStat.mockImplementation(async (candidatePath, options) => {
      if (typeof candidatePath === "string" && candidatePath.endsWith("alpha.txt")) {
        throw new Error("stat failure");
      }

      return actualStat(candidatePath, options);
    });

    const result = await getCountLinesResult(
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
    );

    expect(result.totalFiles).toBe(1);
    expect(result.paths[0]?.files[0]?.file).toBe(join(sandboxRootPath, "child", "beta.txt"));
  });

  it("rethrows a counting failure inside the inline loop when a pattern is set", async () => {
    const actualStat = countLinesTraversalMockState.actualStat;

    if (actualStat === null) {
      throw new Error("Expected the actual stat binding to be initialized.");
    }

    countLinesTraversalMockState.mockedStat.mockImplementation(async (candidatePath, options) => {
      if (typeof candidatePath === "string" && candidatePath.endsWith("alpha.txt")) {
        throw new Error("stat failure");
      }

      return actualStat(candidatePath, options);
    });

    await expect(
      getCountLinesResult(
        undefined,
        undefined,
        [sandboxRootPath],
        true,
        "TODO",
        [],
        [],
        [],
        false,
        false,
        undefined,
        [sandboxRootPath],
      ),
    ).rejects.toThrow("stat failure");
  });

  it("rethrows an unsupported-state failure raised inside the inline loop", async () => {
    countLinesTraversalMockState.mockedClassifyInspectionContentState.mockImplementation((input) => ({
      ...countLinesTraversalMockState.actualClassify?.(input),
      resolvedState: INSPECTION_CONTENT_STATE_LITERALS.BINARY_CONFIDENT,
    }));

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
    ).rejects.toThrow("count_lines unsupported state:");
  });

  it("skips a directory that the scope policy marks as non-traversable in the task-backed loop", async () => {
    const actualResolve = countLinesTraversalMockState.actualResolveTraversalScopeEntryPolicy;

    if (actualResolve === null) {
      throw new Error("Expected the actual scope-policy binding to be initialized.");
    }

    countLinesTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
      guidanceText: null,
    });
    countLinesTraversalMockState.mockedResolveTraversalScopeEntryPolicy.mockImplementation(
      async (relativePath, isDirectory, resolution) => {
        if (relativePath === "child" && isDirectory) {
          return {
            excluded: false,
            shouldTraverse: false,
          };
        }

        return actualResolve(relativePath, isDirectory, resolution);
      },
    );

    const storeDirectoryPath = await mkdtemp(join(tmpdir(), "mcp-fs-count-lines-traversal-store-"));
    const store = new InspectionResumeSessionSqliteStore(
      join(storeDirectoryPath, "sessions.sqlite"),
    );

    try {
      const result = await getCountLinesResult(
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
        store,
        [sandboxRootPath],
      );

      expect(result.totalFiles).toBe(1);
      expect(result.paths[0]?.files[0]?.file).toBe(join(sandboxRootPath, "alpha.txt"));
    } finally {
      store.close();
      await rm(storeDirectoryPath, { recursive: true, force: true });
    }
  });

  it("rethrows a counting failure inside the task-backed loop when a pattern is set", async () => {
    const actualStat = countLinesTraversalMockState.actualStat;

    if (actualStat === null) {
      throw new Error("Expected the actual stat binding to be initialized.");
    }

    countLinesTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
      guidanceText: null,
    });
    countLinesTraversalMockState.mockedStat.mockImplementation(async (candidatePath, options) => {
      if (typeof candidatePath === "string" && candidatePath.endsWith("alpha.txt")) {
        throw new Error("stat failure");
      }

      return actualStat(candidatePath, options);
    });

    await expect(
      getCountLinesResult(
        undefined,
        undefined,
        [sandboxRootPath],
        true,
        "TODO",
        [],
        [],
        [],
        false,
        false,
        undefined,
        [sandboxRootPath],
      ),
    ).rejects.toThrow("stat failure");
  });

  it("skips entries excluded by the traversal scope policy in the inline loop", async () => {
    const actualResolve = countLinesTraversalMockState.actualResolveTraversalScopeEntryPolicy;

    if (actualResolve === null) {
      throw new Error("Expected the actual scope-policy binding to be initialized.");
    }

    countLinesTraversalMockState.mockedResolveTraversalScopeEntryPolicy.mockImplementation(
      async (relativePath, isDirectory, resolution) => {
        if (relativePath === "alpha.txt") {
          return {
            excluded: true,
            shouldTraverse: false,
          };
        }

        return actualResolve(relativePath, isDirectory, resolution);
      },
    );

    const result = await getCountLinesResult(
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
    );

    expect(result.totalFiles).toBe(1);
    expect(result.paths[0]?.files[0]?.file).toBe(join(sandboxRootPath, "child", "beta.txt"));
  });

  it("skips files that fail path validation in the inline loop when no pattern is set", async () => {
    const actualValidate = countLinesTraversalMockState.actualValidatePath;

    if (actualValidate === null) {
      throw new Error("Expected the actual path-guard binding to be initialized.");
    }

    countLinesTraversalMockState.mockedValidatePath.mockImplementation(async (candidatePath, allowed) => {
      if (typeof candidatePath === "string" && candidatePath.endsWith("alpha.txt")) {
        throw new Error("path rejected");
      }

      return actualValidate(candidatePath, allowed);
    });

    const result = await getCountLinesResult(
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
    );

    expect(result.totalFiles).toBe(1);
    expect(result.paths[0]?.files[0]?.file).toBe(join(sandboxRootPath, "child", "beta.txt"));
  });
});
