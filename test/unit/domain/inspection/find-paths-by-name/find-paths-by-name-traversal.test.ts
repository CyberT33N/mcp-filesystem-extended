import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nameTraversalMockState = vi.hoisted(() => {
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

  nameTraversalMockState.actualReaddir = actual.readdir;

  return {
    ...actual,
    default: {
      ...actual,
      readdir: nameTraversalMockState.mockedReaddir,
    },
    readdir: nameTraversalMockState.mockedReaddir,
  };
});

vi.mock("@domain/shared/guardrails/traversal-workload-admission", async () => {
  const actual = await vi.importActual<
    typeof import("@domain/shared/guardrails/traversal-workload-admission")
  >("@domain/shared/guardrails/traversal-workload-admission");

  return {
    ...actual,
    resolveTraversalWorkloadAdmissionDecision:
      nameTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision,
  };
});

vi.mock("@domain/shared/guardrails/traversal-runtime-budget", async () => {
  const actual = await vi.importActual<
    typeof import("@domain/shared/guardrails/traversal-runtime-budget")
  >("@domain/shared/guardrails/traversal-runtime-budget");

  return {
    ...actual,
    assertTraversalRuntimeBudget: nameTraversalMockState.mockedAssertTraversalRuntimeBudget,
  };
});

vi.mock("@domain/shared/guardrails/traversal-scope-policy", async () => {
  const actual = await vi.importActual<
    typeof import("@domain/shared/guardrails/traversal-scope-policy")
  >("@domain/shared/guardrails/traversal-scope-policy");

  nameTraversalMockState.actualResolveTraversalScopeEntryPolicy =
    actual.resolveTraversalScopeEntryPolicy;

  return {
    ...actual,
    resolveTraversalScopeEntryPolicy:
      nameTraversalMockState.mockedResolveTraversalScopeEntryPolicy,
  };
});

vi.mock("@infrastructure/filesystem/path-guard", async () => {
  const actual = await vi.importActual<
    typeof import("@infrastructure/filesystem/path-guard")
  >("@infrastructure/filesystem/path-guard");

  nameTraversalMockState.actualValidatePath = actual.validatePath;

  return {
    ...actual,
    validatePath: nameTraversalMockState.mockedValidatePath,
  };
});

import { getFindPathsByNameResult } from "@domain/inspection/find-paths-by-name/handler";
import { TraversalRuntimeBudgetExceededError } from "@domain/shared/guardrails/traversal-runtime-budget";
import { TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES } from "@domain/shared/guardrails/traversal-workload-admission";

describe("find_paths_by_name traversal internals", () => {
  let sandboxRootPath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-name-traversal-"));

    const actualReaddir = nameTraversalMockState.actualReaddir;
    const actualResolveTraversalScopeEntryPolicy =
      nameTraversalMockState.actualResolveTraversalScopeEntryPolicy;
    const actualValidatePath = nameTraversalMockState.actualValidatePath;

    if (
      actualReaddir === null
      || actualResolveTraversalScopeEntryPolicy === null
      || actualValidatePath === null
    ) {
      throw new Error("Expected the actual boundary bindings to be initialized.");
    }

    nameTraversalMockState.mockedReaddir.mockImplementation(async (path, options) =>
      actualReaddir(path, options),
    );
    nameTraversalMockState.mockedAssertTraversalRuntimeBudget.mockImplementation(() => {});
    nameTraversalMockState.mockedResolveTraversalScopeEntryPolicy.mockImplementation(
      (relativePath, isDirectory, resolution) =>
        actualResolveTraversalScopeEntryPolicy(relativePath, isDirectory, resolution),
    );
    nameTraversalMockState.mockedValidatePath.mockImplementation(async (candidatePath, allowed) =>
      actualValidatePath(candidatePath, allowed),
    );
    nameTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.INLINE,
      guidanceText: null,
    });

    const { mkdir, writeFile } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

    await mkdir(join(sandboxRootPath, "zzz-child"), { recursive: true });
    await writeFile(join(sandboxRootPath, "schema-alpha.ts"), "export const alpha = 1;\n");
    await writeFile(join(sandboxRootPath, "zzz-child", "schema-beta.ts"), "export const beta = 2;\n");
  });

  afterEach(async () => {
    await rm(sandboxRootPath, { recursive: true, force: true });
  });

  it("skips entries excluded by the traversal scope policy", async () => {
    const actualResolve = nameTraversalMockState.actualResolveTraversalScopeEntryPolicy;

    if (actualResolve === null) {
      throw new Error("Expected the actual scope-policy binding to be initialized.");
    }

    nameTraversalMockState.mockedResolveTraversalScopeEntryPolicy.mockImplementation(
      async (relativePath, isDirectory, resolution) => {
        if (relativePath === "schema-alpha.ts") {
          return {
            excluded: true,
            shouldTraverse: false,
          };
        }

        return actualResolve(relativePath, isDirectory, resolution);
      },
    );

    const result = await getFindPathsByNameResult(
      undefined,
      undefined,
      [sandboxRootPath],
      "schema",
      [],
      [],
      false,
      undefined,
      [sandboxRootPath],
      100,
    );

    expect(result.roots[0]?.matches).toEqual([
      join(sandboxRootPath, "zzz-child", "schema-beta.ts"),
    ]);
  });

  it("skips entries that fail path validation", async () => {
    const actualValidate = nameTraversalMockState.actualValidatePath;

    if (actualValidate === null) {
      throw new Error("Expected the actual path-guard binding to be initialized.");
    }

    nameTraversalMockState.mockedValidatePath.mockImplementation(async (candidatePath, allowed) => {
      if (typeof candidatePath === "string" && candidatePath.endsWith("schema-alpha.ts")) {
        throw new Error("path rejected");
      }

      return actualValidate(candidatePath, allowed);
    });

    const result = await getFindPathsByNameResult(
      undefined,
      undefined,
      [sandboxRootPath],
      "schema",
      [],
      [],
      false,
      undefined,
      [sandboxRootPath],
      100,
    );

    expect(result.roots[0]?.matches).toEqual([
      join(sandboxRootPath, "zzz-child", "schema-beta.ts"),
    ]);
  });

  it("rethrows directory-visit budget exhaustion while no matches are collected yet", async () => {
    nameTraversalMockState.mockedAssertTraversalRuntimeBudget.mockImplementation(
      (toolName: string, state: { visitedDirectories: number }) => {
        if (toolName !== "find_paths_by_name") {
          return;
        }

        if (state.visitedDirectories >= 1) {
          throw new TraversalRuntimeBudgetExceededError(
            "Traversal runtime budget exhausted for the current name pass.",
            "find_paths_by_name",
            "traversal directories visited",
            100,
            1,
            "directories",
          );
        }
      },
    );

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
        100,
      ),
    ).rejects.toThrow("Traversal runtime budget exhausted for the current name pass.");
  });

  it("truncates the traversal when the directory-visit budget is exhausted after matches were collected", async () => {
    nameTraversalMockState.mockedAssertTraversalRuntimeBudget.mockImplementation(
      (toolName: string, state: { visitedDirectories: number }) => {
        if (toolName !== "find_paths_by_name") {
          return;
        }

        if (state.visitedDirectories >= 2) {
          throw new TraversalRuntimeBudgetExceededError(
            "Traversal runtime budget exhausted for the current name pass.",
            "find_paths_by_name",
            "traversal directories visited",
            100,
            2,
            "directories",
          );
        }
      },
    );

    const result = await getFindPathsByNameResult(
      undefined,
      undefined,
      [sandboxRootPath],
      "schema",
      [],
      [],
      false,
      undefined,
      [sandboxRootPath],
      100,
    );

    expect(result.roots[0]?.truncated).toBe(true);
    expect(result.roots[0]?.matches).toEqual([
      join(sandboxRootPath, "schema-alpha.ts"),
    ]);
  });

  it("rethrows entry-visit budget exhaustion while no matches are collected yet", async () => {
    nameTraversalMockState.mockedAssertTraversalRuntimeBudget.mockImplementation(
      (toolName: string, state: { visitedEntries: number }) => {
        if (toolName !== "find_paths_by_name") {
          return;
        }

        if (state.visitedEntries >= 1) {
          throw new TraversalRuntimeBudgetExceededError(
            "Traversal runtime budget exhausted for the current name pass.",
            "find_paths_by_name",
            "traversal entries visited",
            100,
            1,
            "entries",
          );
        }
      },
    );

    await expect(
      getFindPathsByNameResult(
        undefined,
        undefined,
        [sandboxRootPath],
        "no-such-name",
        [],
        [],
        false,
        undefined,
        [sandboxRootPath],
        100,
      ),
    ).rejects.toThrow("Traversal runtime budget exhausted for the current name pass.");
  });

  it("truncates the traversal when the entry-visit budget is exhausted after matches were collected", async () => {
    const flatRootPath = join(sandboxRootPath, "flat");
    const { mkdir, writeFile } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

    await mkdir(flatRootPath, { recursive: true });
    await writeFile(join(flatRootPath, "schema-alpha.ts"), "export const alpha = 1;\n");
    await writeFile(join(flatRootPath, "schema-zeta.ts"), "export const zeta = 26;\n");

    nameTraversalMockState.mockedAssertTraversalRuntimeBudget.mockImplementation(
      (toolName: string, state: { visitedEntries: number }) => {
        if (toolName !== "find_paths_by_name") {
          return;
        }

        if (state.visitedEntries >= 2) {
          throw new TraversalRuntimeBudgetExceededError(
            "Traversal runtime budget exhausted for the current name pass.",
            "find_paths_by_name",
            "traversal entries visited",
            100,
            2,
            "entries",
          );
        }
      },
    );

    const result = await getFindPathsByNameResult(
      undefined,
      undefined,
      [flatRootPath],
      "schema",
      [],
      [],
      false,
      undefined,
      [sandboxRootPath],
      100,
    );

    expect(result.roots[0]?.truncated).toBe(true);
    expect(result.roots[0]?.matches).toEqual([
      join(flatRootPath, "schema-alpha.ts"),
    ]);
  });

  it("rethrows non-budget traversal failures instead of swallowing them", async () => {
    nameTraversalMockState.mockedAssertTraversalRuntimeBudget.mockImplementation((toolName: string) => {
      if (toolName !== "find_paths_by_name") {
        return;
      }

      throw new Error("unexpected traversal failure");
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
        undefined,
        [sandboxRootPath],
        100,
      ),
    ).rejects.toThrow("unexpected traversal failure");
  });

  it("rethrows non-budget traversal failures raised at an entry visit", async () => {
    nameTraversalMockState.mockedAssertTraversalRuntimeBudget.mockImplementation(
      (toolName: string, state: { visitedEntries: number }) => {
        if (toolName !== "find_paths_by_name") {
          return;
        }

        if (state.visitedEntries >= 1) {
          throw new Error("unexpected entry-visit traversal failure");
        }
      },
    );

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
        100,
      ),
    ).rejects.toThrow("unexpected entry-visit traversal failure");
  });
});
