import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const countLinesPathsMockState = vi.hoisted(() => {
  const state: {
    mockedClassifyInspectionContentState: ReturnType<typeof vi.fn>;
    mockedRunUgrepSearch: ReturnType<typeof vi.fn>;
    mockedStat: ReturnType<typeof vi.fn>;
    mockedReaddir: ReturnType<typeof vi.fn>;
    mockedResolveTraversalWorkloadAdmissionDecision: ReturnType<typeof vi.fn>;
    actualClassify: typeof import("@domain/shared/search/inspection-content-state").classifyInspectionContentState | null;
    actualStat: typeof import("node:fs/promises").stat | null;
    actualReaddir: typeof import("node:fs/promises").readdir | null;
  } = {
    mockedClassifyInspectionContentState: vi.fn(),
    mockedRunUgrepSearch: vi.fn(),
    mockedStat: vi.fn(),
    mockedReaddir: vi.fn(),
    mockedResolveTraversalWorkloadAdmissionDecision: vi.fn(),
    actualClassify: null,
    actualStat: null,
    actualReaddir: null,
  };

  return state;
});

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

  countLinesPathsMockState.actualStat = actual.stat;
  countLinesPathsMockState.actualReaddir = actual.readdir;

  return {
    ...actual,
    default: {
      ...actual,
      stat: countLinesPathsMockState.mockedStat,
      readdir: countLinesPathsMockState.mockedReaddir,
    },
    stat: countLinesPathsMockState.mockedStat,
    readdir: countLinesPathsMockState.mockedReaddir,
  };
});

vi.mock("@domain/shared/search/inspection-content-state", async () => {
  const actual = await vi.importActual<
    typeof import("@domain/shared/search/inspection-content-state")
  >("@domain/shared/search/inspection-content-state");

  countLinesPathsMockState.actualClassify = actual.classifyInspectionContentState;

  return {
    ...actual,
    classifyInspectionContentState: countLinesPathsMockState.mockedClassifyInspectionContentState,
  };
});

vi.mock("@infrastructure/search/ugrep-runner", async () => {
  const actual = await vi.importActual<
    typeof import("@infrastructure/search/ugrep-runner")
  >("@infrastructure/search/ugrep-runner");

  return {
    ...actual,
    runUgrepSearch: countLinesPathsMockState.mockedRunUgrepSearch,
  };
});

vi.mock("@infrastructure/runtime/ugrep-runtime-dependency", async () => {
  const actual = await vi.importActual<
    typeof import("@infrastructure/runtime/ugrep-runtime-dependency")
  >("@infrastructure/runtime/ugrep-runtime-dependency");

  return {
    ...actual,
    getRequiredUgrepExecutablePath: () => "ugrep",
  };
});

vi.mock("@domain/shared/guardrails/traversal-workload-admission", async () => {
  const actual = await vi.importActual<
    typeof import("@domain/shared/guardrails/traversal-workload-admission")
  >("@domain/shared/guardrails/traversal-workload-admission");

  return {
    ...actual,
    resolveTraversalWorkloadAdmissionDecision:
      countLinesPathsMockState.mockedResolveTraversalWorkloadAdmissionDecision,
  };
});

import { getCountLinesResult, getRequiredCompletedPathState, getRequiredSinglePathResult } from "@domain/inspection/count-lines/handler";
import { INSPECTION_CONTENT_STATE_LITERALS } from "@domain/shared/search/inspection-content-state";
import { TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES } from "@domain/shared/guardrails/traversal-workload-admission";
import type { UgrepSearchExecutionResult } from "@infrastructure/search/ugrep-runner";

function createUgrepResult(overrides: Partial<UgrepSearchExecutionResult>): UgrepSearchExecutionResult {
  return {
    executable: "ugrep",
    args: [],
    exitCode: 0,
    signal: null,
    stdout: "",
    stderr: "",
    durationMs: 5,
    timedOut: false,
    spawnErrorMessage: null,
    fixedStringMode: false,
    requiresPcre2: false,
    syncCandidateBytesCap: 0,
    ...overrides,
  };
}

describe("count_lines path and lane coverage", () => {
  let sandboxRootPath = "";
  let alphaFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-count-lines-paths-"));
    alphaFilePath = join(sandboxRootPath, "alpha.txt");

    const actualStat = countLinesPathsMockState.actualStat;
    const actualReaddir = countLinesPathsMockState.actualReaddir;
    const actualClassify = countLinesPathsMockState.actualClassify;

    if (actualStat === null || actualReaddir === null || actualClassify === null) {
      throw new Error("Expected the actual boundary bindings to be initialized.");
    }

    countLinesPathsMockState.mockedStat.mockImplementation(async (candidatePath, options) =>
      actualStat(candidatePath, options),
    );
    countLinesPathsMockState.mockedReaddir.mockImplementation(async (candidatePath, options) =>
      actualReaddir(candidatePath, options),
    );
    countLinesPathsMockState.mockedClassifyInspectionContentState.mockImplementation((input) => actualClassify(input));
    countLinesPathsMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.INLINE,
      guidanceText: null,
    });

    await writeFile(alphaFilePath, "alpha\nTODO one\nbeta\nTODO two\n");
  });

  afterEach(async () => {
    await rm(sandboxRootPath, { recursive: true, force: true });
  });

  it("counts a single file directly through the file path lane", async () => {
    const result = await getCountLinesResult(
      undefined,
      undefined,
      [alphaFilePath],
      false,
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
    expect(result.totalLines).toBe(4);
    expect(result.admission.outcome).toBe("inline");
    expect(result.resume.resumable).toBe(false);
  });

  it("rejects a directory request without recursive traversal", async () => {
    await expect(
      getCountLinesResult(
        undefined,
        undefined,
        [sandboxRootPath],
        false,
        undefined,
        [],
        [],
        [],
        false,
        false,
        undefined,
        [sandboxRootPath],
      ),
    ).rejects.toThrow("Path is a directory. Use recursive=true to count lines in all files.");
  });

  it("rejects a path that is neither a file nor a directory", async () => {
    const actualStat = countLinesPathsMockState.actualStat;

    if (actualStat === null) {
      throw new Error("Expected the actual stat binding to be initialized.");
    }

    countLinesPathsMockState.mockedStat.mockImplementation(async (candidatePath, options) => {
      const actualStats = await actualStat(candidatePath, options);

      if (typeof candidatePath === "string" && candidatePath.endsWith("alpha.txt")) {
        return {
          ...actualStats,
          isFile: () => false,
          isDirectory: () => false,
        };
      }

      return actualStats;
    });

    await expect(
      getCountLinesResult(
        undefined,
        undefined,
        [alphaFilePath],
        false,
        undefined,
        [],
        [],
        [],
        false,
        false,
        undefined,
        [sandboxRootPath],
      ),
    ).rejects.toThrow("Path is neither a file nor a directory.");
  });

  it("rejects a directory request whose traversal admission requires narrowing", async () => {
    countLinesPathsMockState.mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.NARROWING_REQUIRED,
      guidanceText: "Narrow the requested root before retrying.",
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
    ).rejects.toThrow("Narrow the requested root before retrying.");
  });

  it("rejects total-only counting on a binary-confident surface with the reason alone", async () => {
    countLinesPathsMockState.mockedClassifyInspectionContentState.mockImplementation((input) => ({
      ...countLinesPathsMockState.actualClassify?.(input),
      resolvedState: INSPECTION_CONTENT_STATE_LITERALS.BINARY_CONFIDENT,
    }));

    await expect(
      getCountLinesResult(
        undefined,
        undefined,
        [alphaFilePath],
        false,
        undefined,
        [],
        [],
        [],
        false,
        false,
        undefined,
        [sandboxRootPath],
      ),
    ).rejects.toThrow("semantically misleading");
  });

  it("rejects pattern-aware counting on a binary-confident surface with reroute guidance", async () => {
    countLinesPathsMockState.mockedClassifyInspectionContentState.mockImplementation((input) => ({
      ...countLinesPathsMockState.actualClassify?.(input),
      resolvedState: INSPECTION_CONTENT_STATE_LITERALS.BINARY_CONFIDENT,
    }));

    await expect(
      getCountLinesResult(
        undefined,
        undefined,
        [alphaFilePath],
        false,
        "TODO",
        [],
        [],
        [],
        false,
        false,
        undefined,
        [sandboxRootPath],
      ),
    ).rejects.toThrow("byte- or cursor-oriented inspection");
  });

  it("counts matching lines through the streaming pattern-aware lane on hybrid text surfaces", async () => {
    countLinesPathsMockState.mockedClassifyInspectionContentState.mockImplementation((input) => ({
      ...countLinesPathsMockState.actualClassify?.(input),
      resolvedState: INSPECTION_CONTENT_STATE_LITERALS.HYBRID_TEXT_DOMINANT,
    }));

    const result = await getCountLinesResult(
      undefined,
      undefined,
      [alphaFilePath],
      false,
      "TODO",
      [],
      [],
      [],
      false,
      false,
      undefined,
      [sandboxRootPath],
    );

    expect(result.totalFiles).toBe(1);
    expect(result.totalLines).toBe(4);
    expect(result.totalMatchingLines).toBe(2);
  });

  it("parses the trailing count from a native pattern-aware ugrep result", async () => {
    countLinesPathsMockState.mockedRunUgrepSearch.mockResolvedValue(
      createUgrepResult({ stdout: `${alphaFilePath}:2\n` }),
    );

    const result = await getCountLinesResult(
      undefined,
      undefined,
      [alphaFilePath],
      false,
      "TODO",
      [],
      [],
      [],
      false,
      false,
      undefined,
      [sandboxRootPath],
    );

    expect(result.totalMatchingLines).toBe(2);
  });

  it("treats an empty native pattern-aware stdout surface as zero matches", async () => {
    countLinesPathsMockState.mockedRunUgrepSearch.mockResolvedValue(
      createUgrepResult({ stdout: "" }),
    );

    const result = await getCountLinesResult(
      undefined,
      undefined,
      [alphaFilePath],
      false,
      "TODO",
      [],
      [],
      [],
      false,
      false,
      undefined,
      [sandboxRootPath],
    );

    expect(result.totalMatchingLines).toBe(0);
  });

  it("rejects an unreadable native pattern-aware count surface", async () => {
    countLinesPathsMockState.mockedRunUgrepSearch.mockResolvedValue(
      createUgrepResult({ stdout: "garbage-without-count" }),
    );

    await expect(
      getCountLinesResult(
        undefined,
        undefined,
        [alphaFilePath],
        false,
        "TODO",
        [],
        [],
        [],
        false,
        false,
        undefined,
        [sandboxRootPath],
      ),
    ).rejects.toThrow("unreadable count surface");
  });

  it("rejects a native pattern-aware run that could not start", async () => {
    countLinesPathsMockState.mockedRunUgrepSearch.mockResolvedValue(
      createUgrepResult({ spawnErrorMessage: "ugrep not found", exitCode: null }),
    );

    await expect(
      getCountLinesResult(
        undefined,
        undefined,
        [alphaFilePath],
        false,
        "TODO",
        [],
        [],
        [],
        false,
        false,
        undefined,
        [sandboxRootPath],
      ),
    ).rejects.toThrow("Native search runner failed to start");
  });

  it("rejects a native pattern-aware run that timed out", async () => {
    countLinesPathsMockState.mockedRunUgrepSearch.mockResolvedValue(
      createUgrepResult({ timedOut: true }),
    );

    await expect(
      getCountLinesResult(
        undefined,
        undefined,
        [alphaFilePath],
        false,
        "TODO",
        [],
        [],
        [],
        false,
        false,
        undefined,
        [sandboxRootPath],
      ),
    ).rejects.toThrow("timed out before completion");
  });

  it("surfaces a native pattern-aware failure reason from stderr", async () => {
    countLinesPathsMockState.mockedRunUgrepSearch.mockResolvedValue(
      createUgrepResult({ exitCode: 2, stderr: "bad pattern surface" }),
    );

    await expect(
      getCountLinesResult(
        undefined,
        undefined,
        [alphaFilePath],
        false,
        "TODO",
        [],
        [],
        [],
        false,
        false,
        undefined,
        [sandboxRootPath],
      ),
    ).rejects.toThrow("bad pattern surface");
  });

  it("rejects a native pattern-aware failure without a stderr reason", async () => {
    countLinesPathsMockState.mockedRunUgrepSearch.mockResolvedValue(
      createUgrepResult({ exitCode: 2, stderr: "" }),
    );

    await expect(
      getCountLinesResult(
        undefined,
        undefined,
        [alphaFilePath],
        false,
        "TODO",
        [],
        [],
        [],
        false,
        false,
        undefined,
        [sandboxRootPath],
      ),
    ).rejects.toThrow("failed unexpectedly");
  });

  it("matches filename-only file patterns against the entry name", async () => {
    const nestedDirPath = join(sandboxRootPath, "nested");
    const { mkdir, writeFile: writeFileActual } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

    await mkdir(nestedDirPath, { recursive: true });
    await writeFileActual(join(nestedDirPath, "beta.md"), "gamma\ndelta\n");
    await writeFileActual(join(nestedDirPath, "gamma.txt"), "epsilon\nzeta\n");

    const result = await getCountLinesResult(
      undefined,
      undefined,
      [sandboxRootPath],
      true,
      undefined,
      ["*.txt"],
      [],
      [],
      false,
      false,
      undefined,
      [sandboxRootPath],
    );

    expect(result.totalFiles).toBe(2);
    expect(result.totalLines).toBe(6);
  });

  it("routes a recursive directory request with a pattern through the pattern-aware cost model", async () => {
    countLinesPathsMockState.mockedRunUgrepSearch.mockResolvedValue(
      createUgrepResult({ stdout: `${alphaFilePath}:2\n` }),
    );

    const result = await getCountLinesResult(
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
    );

    expect(result.totalFiles).toBe(1);
    expect(result.totalMatchingLines).toBe(2);
  });
});

describe("getRequiredCompletedPathState", () => {
  it("returns the completed path state when it is present", () => {
    const pathState = {
      traversalFrames: [],
      files: [],
      totalLines: 12,
      totalMatchingLines: 0,
      completed: true,
    };

    expect(getRequiredCompletedPathState({ src: pathState }, "src")).toBe(pathState);
  });

  it("throws when the requested path has no completed path state", () => {
    expect(() => getRequiredCompletedPathState({}, "src")).toThrow(
      "Expected a completed path state for 'src'.",
    );
  });
});

describe("getRequiredSinglePathResult", () => {
  it("returns the single path result when exactly one is present", () => {
    const pathResult = { path: "src", files: [], totalLines: 12, totalMatchingLines: 0 };

    expect(getRequiredSinglePathResult([pathResult])).toBe(pathResult);
  });

  it("throws when the single path result is missing", () => {
    expect(() => getRequiredSinglePathResult([])).toThrow(
      "Expected one path result for count-lines formatting.",
    );
  });
});
