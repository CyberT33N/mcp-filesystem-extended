import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const globTraversalMockState = vi.hoisted(() => {
  const state: {
    mockedAssertTraversalRuntimeBudget: ReturnType<typeof vi.fn>;
    mockedReaddir: ReturnType<typeof vi.fn>;
    mockedResolveTraversalScopeEntryPolicy: ReturnType<typeof vi.fn>;
    mockedResolveTraversalWorkloadAdmissionDecision: ReturnType<typeof vi.fn>;
    mockedValidatePath: ReturnType<typeof vi.fn>;
    actualReaddir: typeof import("node:fs/promises").readdir | null;
    actualResolveTraversalScopeEntryPolicy: typeof import("@domain/shared/guardrails/traversal-scope-policy").resolveTraversalScopeEntryPolicy | null;
    actualValidatePath: typeof import("@infrastructure/filesystem/path-guard").validatePath | null;
  } = {
    mockedAssertTraversalRuntimeBudget: vi.fn(),
    mockedReaddir: vi.fn(),
    mockedResolveTraversalScopeEntryPolicy: vi.fn(),
    mockedResolveTraversalWorkloadAdmissionDecision: vi.fn(),
    mockedValidatePath: vi.fn(),
    actualReaddir: null,
    actualResolveTraversalScopeEntryPolicy: null,
    actualValidatePath: null,
  };

  return state;
});

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

  globTraversalMockState.actualReaddir = actual.readdir;

  return {
    ...actual,
    default: {
      ...actual,
      readdir: globTraversalMockState.mockedReaddir,
    },
    readdir: globTraversalMockState.mockedReaddir,
  };
});

vi.mock("@domain/shared/guardrails/traversal-workload-admission", async () => {
  const actual = await vi.importActual<
    typeof import("@domain/shared/guardrails/traversal-workload-admission")
  >("@domain/shared/guardrails/traversal-workload-admission");

  return {
    ...actual,
    resolveTraversalWorkloadAdmissionDecision:
      globTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision,
  };
});

vi.mock("@domain/shared/guardrails/traversal-runtime-budget", async () => {
  const actual = await vi.importActual<
    typeof import("@domain/shared/guardrails/traversal-runtime-budget")
  >("@domain/shared/guardrails/traversal-runtime-budget");

  return {
    ...actual,
    assertTraversalRuntimeBudget: globTraversalMockState.mockedAssertTraversalRuntimeBudget,
  };
});

vi.mock("@domain/shared/guardrails/traversal-scope-policy", async () => {
  const actual = await vi.importActual<
    typeof import("@domain/shared/guardrails/traversal-scope-policy")
  >("@domain/shared/guardrails/traversal-scope-policy");

  globTraversalMockState.actualResolveTraversalScopeEntryPolicy =
    actual.resolveTraversalScopeEntryPolicy;

  return {
    ...actual,
    resolveTraversalScopeEntryPolicy:
      globTraversalMockState.mockedResolveTraversalScopeEntryPolicy,
  };
});

vi.mock("@infrastructure/filesystem/path-guard", async () => {
  const actual = await vi.importActual<
    typeof import("@infrastructure/filesystem/path-guard")
  >("@infrastructure/filesystem/path-guard");

  globTraversalMockState.actualValidatePath = actual.validatePath;

  return {
    ...actual,
    validatePath: globTraversalMockState.mockedValidatePath,
  };
});

import { getFindFilesByGlobResult } from "@domain/inspection/find-files-by-glob/handler";
import { TraversalRuntimeBudgetExceededError } from "@domain/shared/guardrails/traversal-runtime-budget";
import { TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES } from "@domain/shared/guardrails/traversal-workload-admission";

describe("find_files_by_glob traversal internals", () => {
  let sandboxRootPath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-glob-traversal-"));

    const actualReaddir = globTraversalMockState.actualReaddir;
    const actualResolveTraversalScopeEntryPolicy =
      globTraversalMockState.actualResolveTraversalScopeEntryPolicy;
    const actualValidatePath = globTraversalMockState.actualValidatePath;

    if (
      actualReaddir === null
      || actualResolveTraversalScopeEntryPolicy === null
      || actualValidatePath === null
    ) {
      throw new Error("Expected the actual boundary bindings to be initialized.");
    }

    globTraversalMockState.mockedReaddir.mockImplementation(async (path, options) =>
      actualReaddir(path, options),
    );
    globTraversalMockState.mockedAssertTraversalRuntimeBudget.mockImplementation(() => {});
    globTraversalMockState.mockedResolveTraversalScopeEntryPolicy.mockImplementation(
      (relativePath, isDirectory, resolution) =>
        actualResolveTraversalScopeEntryPolicy(relativePath, isDirectory, resolution),
    );
    globTraversalMockState.mockedValidatePath.mockImplementation(async (candidatePath, allowed) =>
      actualValidatePath(candidatePath, allowed),
    );
    globTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.INLINE,
      guidanceText: null,
    });

    const { mkdir, writeFile } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

    await mkdir(join(sandboxRootPath, "child"), { recursive: true });
    await writeFile(join(sandboxRootPath, "alpha.ts"), "export const alpha = 1;\n");
    await writeFile(join(sandboxRootPath, "child", "beta.ts"), "export const beta = 2;\n");
  });

  afterEach(async () => {
    await rm(sandboxRootPath, { recursive: true, force: true });
  });

  it("collects matching files across nested directories in the plain inline lane", async () => {
    const result = await getFindFilesByGlobResult(
      undefined,
      undefined,
      [sandboxRootPath],
      "**/*.ts",
      [],
      [],
      false,
      100,
      [sandboxRootPath],
      undefined,
    );

    expect(result.totalMatches).toBe(2);
    expect(result.roots[0]?.matches).toEqual([
      join(sandboxRootPath, "alpha.ts"),
      join(sandboxRootPath, "child", "beta.ts"),
    ]);
  });

  it("skips a child frame whose directory cannot be read", async () => {
    const actualReaddir = globTraversalMockState.actualReaddir;

    if (actualReaddir === null) {
      throw new Error("Expected the actual readdir binding to be initialized.");
    }

    globTraversalMockState.mockedReaddir.mockImplementation(async (path, options) => {
      if (typeof path === "string" && path.endsWith("child")) {
        throw new Error("read failure");
      }

      return actualReaddir(path, options);
    });

    const result = await getFindFilesByGlobResult(
      undefined,
      undefined,
      [sandboxRootPath],
      "**/*.ts",
      [],
      [],
      false,
      100,
      [sandboxRootPath],
      undefined,
    );

    expect(result.roots[0]?.matches).toEqual([
      join(sandboxRootPath, "alpha.ts"),
    ]);
  });

  it("stops the traversal loop when the runtime budget is exhausted at an entry visit", async () => {
    globTraversalMockState.mockedAssertTraversalRuntimeBudget.mockImplementation(
      (toolName: string, state: { visitedEntries: number }) => {
        if (toolName !== "find_files_by_glob") {
          return;
        }

        if (state.visitedEntries >= 1) {
          throw new TraversalRuntimeBudgetExceededError(
            "Traversal runtime budget exhausted for the current glob pass.",
            "find_files_by_glob",
            "traversal entries visited",
            100,
            1,
            "entries",
          );
        }
      },
    );

    const result = await getFindFilesByGlobResult(
      undefined,
      undefined,
      [sandboxRootPath],
      "**/*.ts",
      [],
      [],
      false,
      100,
      [sandboxRootPath],
      undefined,
    );

    expect(result.roots[0]?.truncated).toBe(true);
  });

  it("stops the traversal loop when the runtime budget is exhausted at a child directory visit", async () => {
    globTraversalMockState.mockedAssertTraversalRuntimeBudget.mockImplementation((toolName: string, state: { visitedDirectories: number }) => {
      if (toolName !== "find_files_by_glob") {
        return;
      }

      if (state.visitedDirectories >= 2) {
        throw new TraversalRuntimeBudgetExceededError(
          "Traversal runtime budget exhausted for the current glob pass.",
          "find_files_by_glob",
          "traversal directories visited",
          state.visitedDirectories,
          1,
          "directories",
        );
      }
    });

    const result = await getFindFilesByGlobResult(
      undefined,
      undefined,
      [sandboxRootPath],
      "**/*.ts",
      [],
      [],
      false,
      100,
      [sandboxRootPath],
      undefined,
    );

    expect(result.roots[0]?.truncated).toBe(true);
  });

  it("rethrows non-budget traversal failures instead of swallowing them", async () => {
    globTraversalMockState.mockedAssertTraversalRuntimeBudget.mockImplementation((toolName: string) => {
      if (toolName !== "find_files_by_glob") {
        return;
      }

      throw new Error("unexpected traversal failure");
    });

    await expect(
      getFindFilesByGlobResult(
        undefined,
        undefined,
        [sandboxRootPath],
        "**/*.ts",
        [],
        [],
        false,
        100,
        [sandboxRootPath],
        undefined,
      ),
    ).rejects.toThrow("unexpected traversal failure");
  });

  it("rethrows non-budget traversal failures raised at an entry visit", async () => {
    globTraversalMockState.mockedAssertTraversalRuntimeBudget.mockImplementation(
      (toolName: string, state: { visitedEntries: number }) => {
        if (toolName !== "find_files_by_glob") {
          return;
        }

        if (state.visitedEntries >= 1) {
          throw new Error("unexpected entry-visit traversal failure");
        }
      },
    );

    await expect(
      getFindFilesByGlobResult(
        undefined,
        undefined,
        [sandboxRootPath],
        "**/*.ts",
        [],
        [],
        false,
        100,
        [sandboxRootPath],
        undefined,
      ),
    ).rejects.toThrow("unexpected entry-visit traversal failure");
  });

  it("skips entries excluded by the traversal scope policy", async () => {
    const actualResolve = globTraversalMockState.actualResolveTraversalScopeEntryPolicy;

    if (actualResolve === null) {
      throw new Error("Expected the actual scope-policy binding to be initialized.");
    }

    globTraversalMockState.mockedResolveTraversalScopeEntryPolicy.mockImplementation(
      async (relativePath, isDirectory, resolution) => {
        if (relativePath === "alpha.ts") {
          return {
            excluded: true,
            shouldTraverse: false,
          };
        }

        return actualResolve(relativePath, isDirectory, resolution);
      },
    );

    const result = await getFindFilesByGlobResult(
      undefined,
      undefined,
      [sandboxRootPath],
      "**/*.ts",
      [],
      [],
      false,
      100,
      [sandboxRootPath],
      undefined,
    );

    expect(result.roots[0]?.matches).toEqual([
      join(sandboxRootPath, "child", "beta.ts"),
    ]);
  });

  it("skips entries that fail path validation", async () => {
    const actualValidate = globTraversalMockState.actualValidatePath;

    if (actualValidate === null) {
      throw new Error("Expected the actual path-guard binding to be initialized.");
    }

    globTraversalMockState.mockedValidatePath.mockImplementation(async (candidatePath, allowed) => {
      if (typeof candidatePath === "string" && candidatePath.endsWith("alpha.ts")) {
        throw new Error("path rejected");
      }

      return actualValidate(candidatePath, allowed);
    });

    const result = await getFindFilesByGlobResult(
      undefined,
      undefined,
      [sandboxRootPath],
      "**/*.ts",
      [],
      [],
      false,
      100,
      [sandboxRootPath],
      undefined,
    );

    expect(result.roots[0]?.matches).toEqual([
      join(sandboxRootPath, "child", "beta.ts"),
    ]);
  });
});
