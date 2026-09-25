import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listTraversalMockState = vi.hoisted(() => {
  const state: {
    mockedAssertTraversalRuntimeBudget: ReturnType<typeof vi.fn>;
    mockedReaddir: ReturnType<typeof vi.fn>;
    mockedResolveTraversalScopeEntryPolicy: ReturnType<typeof vi.fn>;
    mockedResolveTraversalWorkloadAdmissionDecision: ReturnType<typeof vi.fn>;
    actualReaddir: typeof import("node:fs/promises").readdir | null;
    actualResolveTraversalScopeEntryPolicy: typeof import("@domain/shared/guardrails/traversal-scope-policy").resolveTraversalScopeEntryPolicy | null;
  } = {
    mockedAssertTraversalRuntimeBudget: vi.fn(),
    mockedReaddir: vi.fn(),
    mockedResolveTraversalScopeEntryPolicy: vi.fn(),
    mockedResolveTraversalWorkloadAdmissionDecision: vi.fn(),
    actualReaddir: null,
    actualResolveTraversalScopeEntryPolicy: null,
  };

  return state;
});

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

  listTraversalMockState.actualReaddir = actual.readdir;

  return {
    ...actual,
    default: {
      ...actual,
      readdir: listTraversalMockState.mockedReaddir,
    },
    readdir: listTraversalMockState.mockedReaddir,
  };
});

vi.mock("@domain/shared/guardrails/traversal-workload-admission", async () => {
  const actual = await vi.importActual<
    typeof import("@domain/shared/guardrails/traversal-workload-admission")
  >("@domain/shared/guardrails/traversal-workload-admission");

  return {
    ...actual,
    resolveTraversalWorkloadAdmissionDecision:
      listTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision,
  };
});

vi.mock("@domain/shared/guardrails/traversal-runtime-budget", async () => {
  const actual = await vi.importActual<
    typeof import("@domain/shared/guardrails/traversal-runtime-budget")
  >("@domain/shared/guardrails/traversal-runtime-budget");

  return {
    ...actual,
    assertTraversalRuntimeBudget: listTraversalMockState.mockedAssertTraversalRuntimeBudget,
  };
});

vi.mock("@domain/shared/guardrails/traversal-scope-policy", async () => {
  const actual = await vi.importActual<
    typeof import("@domain/shared/guardrails/traversal-scope-policy")
  >("@domain/shared/guardrails/traversal-scope-policy");

  listTraversalMockState.actualResolveTraversalScopeEntryPolicy =
    actual.resolveTraversalScopeEntryPolicy;

  return {
    ...actual,
    resolveTraversalScopeEntryPolicy:
      listTraversalMockState.mockedResolveTraversalScopeEntryPolicy,
  };
});

import { getListDirectoryEntriesResult } from "@domain/inspection/list-directory-entries/handler";
import { DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION } from "@domain/inspection/shared/filesystem-entry-metadata-contract";
import { TraversalRuntimeBudgetExceededError } from "@domain/shared/guardrails/traversal-runtime-budget";
import { TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES } from "@domain/shared/guardrails/traversal-workload-admission";
import { InspectionResumeSessionSqliteStore } from "@infrastructure/persistence/inspection-resume-session-sqlite-store";

describe("list_directory_entries traversal internals", () => {
  let sandboxRootPath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-list-traversal-"));

    const actualReaddir = listTraversalMockState.actualReaddir;
    const actualResolveTraversalScopeEntryPolicy =
      listTraversalMockState.actualResolveTraversalScopeEntryPolicy;

    if (actualReaddir === null || actualResolveTraversalScopeEntryPolicy === null) {
      throw new Error("Expected the actual boundary bindings to be initialized.");
    }

    listTraversalMockState.mockedReaddir.mockImplementation(async (path, options) =>
      actualReaddir(path, options),
    );
    listTraversalMockState.mockedAssertTraversalRuntimeBudget.mockImplementation(() => {});
    listTraversalMockState.mockedResolveTraversalScopeEntryPolicy.mockImplementation(
      (relativePath, isDirectory, resolution) =>
        actualResolveTraversalScopeEntryPolicy(relativePath, isDirectory, resolution),
    );
    listTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.INLINE,
      guidanceText: null,
    });

    const { mkdir, writeFile } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

    await mkdir(join(sandboxRootPath, "nested"), { recursive: true });
    await writeFile(join(sandboxRootPath, "nested", "sample.txt"), "sample");
    await writeFile(join(sandboxRootPath, "root.txt"), "root");
  });

  afterEach(async () => {
    await rm(sandboxRootPath, { recursive: true, force: true });
  });

  it("lists nested entries recursively in the plain inline lane", async () => {
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
      undefined,
    );

    expect(result.roots[0]?.entries.map((entry) => entry.name).sort()).toEqual([
      "nested",
      "root.txt",
    ]);
  });

  it("skips excluded entries in the recursive full-listing lane", async () => {
    const result = await getListDirectoryEntriesResult(
      undefined,
      undefined,
      [sandboxRootPath],
      true,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
      ["**/nested", "**/root.txt"],
      [],
      false,
      [sandboxRootPath],
      undefined,
    );

    expect(result.roots[0]?.entries).toEqual([]);
  });

  it("rejects roots whose traversal admission requires narrowing", async () => {
    listTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValueOnce({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.NARROWING_REQUIRED,
      guidanceText: "Narrow the requested root before retrying.",
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
        undefined,
      ),
    ).rejects.toThrow("Narrow the requested root before retrying.");
  });

  it("rethrows non-budget traversal failures in the preview chunk lane", async () => {
    listTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      guidanceText: null,
    });
    listTraversalMockState.mockedAssertTraversalRuntimeBudget.mockImplementationOnce(() => {
      throw new Error("unexpected traversal failure");
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
        undefined,
      ),
    ).rejects.toThrow("unexpected traversal failure");
  });

  it("aborts the preview chunk when the runtime budget is exhausted at an entry visit", async () => {
    listTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      guidanceText: null,
    });
    listTraversalMockState.mockedAssertTraversalRuntimeBudget.mockImplementation((toolName: string) => {
      if (toolName !== "list_directory_entries") {
        return;
      }

      throw new TraversalRuntimeBudgetExceededError(
        "Traversal runtime budget exhausted for the current listing pass.",
        "list_directory_entries",
        "traversal entries visited",
        100,
        1,
        "entries",
      );
    });

    const storeDirectoryPath = await mkdtemp(join(tmpdir(), "mcp-fs-list-traversal-store-"));
    const store = new InspectionResumeSessionSqliteStore(
      join(storeDirectoryPath, "sessions.sqlite"),
    );

    try {
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
        store,
      );

      expect(result.resume.resumable).toBe(true);
      expect(result.roots[0]?.entries).toEqual([]);
    } finally {
      store.close();
      await rm(storeDirectoryPath, { recursive: true, force: true });
    }
  });

  it("skips a child frame whose directory cannot be read in the preview chunk lane", async () => {
    listTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      guidanceText: null,
    });

    const actualReaddir = listTraversalMockState.actualReaddir;

    if (actualReaddir === null) {
      throw new Error("Expected the actual readdir binding to be initialized.");
    }

    listTraversalMockState.mockedReaddir.mockImplementation(async (path, options) => {
      if (typeof path === "string" && path.endsWith("nested")) {
        throw new Error("read failure");
      }

      return actualReaddir(path, options);
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
      undefined,
    );

    expect(result.resume.resumable).toBe(false);
    expect(result.roots[0]?.entries.map((entry) => entry.name)).toEqual(["nested", "root.txt"]);
  });

  it("skips entries excluded by the traversal scope policy in the preview chunk lane", async () => {
    listTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      guidanceText: null,
    });

    const actualResolve = listTraversalMockState.actualResolveTraversalScopeEntryPolicy;

    if (actualResolve === null) {
      throw new Error("Expected the actual scope-policy binding to be initialized.");
    }

    listTraversalMockState.mockedResolveTraversalScopeEntryPolicy.mockImplementation(
      async (relativePath, isDirectory, resolution) => {
        if (relativePath === "root.txt") {
          return {
            excluded: true,
            shouldTraverse: false,
          };
        }

        return actualResolve(relativePath, isDirectory, resolution);
      },
    );

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
      undefined,
    );

    expect(result.roots[0]?.entries.map((entry) => entry.name)).toEqual(["nested", "sample.txt"]);
  });

  it("stops the preview chunk when the estimated text response exceeds the bounded lane cap", async () => {
    listTraversalMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      guidanceText: null,
    });

    const { writeFile } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

    await Promise.all(
      Array.from({ length: 1400 }, (_, index) =>
        writeFile(join(sandboxRootPath, `entry-${index.toString().padStart(4, "0")}.txt`), "x"),
      ),
    );

    const storeDirectoryPath = await mkdtemp(join(tmpdir(), "mcp-fs-list-traversal-cap-store-"));
    const store = new InspectionResumeSessionSqliteStore(
      join(storeDirectoryPath, "sessions.sqlite"),
    );

    try {
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
        store,
      );

      expect(result.resume.resumable).toBe(true);
      expect(result.roots[0]?.entries.length).toBeGreaterThan(0);
    } finally {
      store.close();
      await rm(storeDirectoryPath, { recursive: true, force: true });
    }
  });
});
