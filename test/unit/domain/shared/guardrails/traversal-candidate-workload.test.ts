import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hoisted filesystem mocks for traversal candidate-workload tests.
 */
const { mockedReaddir, mockedStat } = vi.hoisted(() => ({
  mockedReaddir: vi.fn(),
  mockedStat: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: {
    readdir: mockedReaddir,
    stat: mockedStat,
  },
  readdir: mockedReaddir,
  stat: mockedStat,
}));

import { collectTraversalCandidateWorkloadEvidence } from "@domain/shared/guardrails/traversal-candidate-workload";
import { resolveTraversalScopePolicy } from "@domain/shared/guardrails/traversal-scope-policy";

describe("traversal candidate workload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("collects matched candidate bytes, file counts, and response-surface estimates across nested directories", async () => {
    const createDirent = (name: string, kind: "file" | "directory") => ({
      name,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isDirectory: () => kind === "directory",
      isFIFO: () => false,
      isFile: () => kind === "file",
      isSocket: () => false,
      isSymbolicLink: () => false,
    });

    mockedReaddir.mockImplementation(async (directoryPath: string) => {
      if (directoryPath === "C:/workspace/root") {
        return [
          createDirent("alpha.ts", "file"),
          createDirent("alpha.txt", "file"),
          createDirent("nested", "directory"),
        ];
      }

      if (directoryPath === "C:/workspace/root/nested") {
        return [createDirent("beta.ts", "file")];
      }

      return [];
    });

    mockedStat.mockImplementation(async (candidatePath: string) => {
      if (candidatePath === "C:/workspace/root/alpha.ts") {
        return { size: 5 };
      }

      if (candidatePath === "C:/workspace/root/nested/beta.ts") {
        return { size: 7 };
      }

      throw new Error(`Unexpected stat path: ${candidatePath}`);
    });

    const result = await collectTraversalCandidateWorkloadEvidence({
      validRootPath: "C:/workspace/root",
      traversalScopePolicyResolution: resolveTraversalScopePolicy("."),
      runtimeBudgetLimits: {
        maxVisitedEntries: 20,
        maxVisitedDirectories: 20,
        softTimeBudgetMs: 10_000,
      },
      inlineCandidateByteBudget: 100,
      fileMatcher: (candidateRelativePath) => candidateRelativePath.endsWith(".ts"),
      responseSurfaceEstimator: {
        shouldCountEntry: (candidateRelativePath, entry) =>
          entry.isFile() && candidateRelativePath.endsWith(".ts"),
        estimateEntryResponseChars: () => 21,
      },
    });

    expect(result.estimatedCandidateBytes).toBe(12);
    expect(result.matchedCandidateFiles).toBe(2);
    expect(result.estimatedResponseChars).toBe(42);
    expect(result.probeTruncated).toBe(false);
    expect(result.probeElapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("continues into default-excluded directories only when an includeExcluded glob reopens a descendant", async () => {
    const createDirent = (name: string, kind: "file" | "directory") => ({
      name,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isDirectory: () => kind === "directory",
      isFIFO: () => false,
      isFile: () => kind === "file",
      isSocket: () => false,
      isSymbolicLink: () => false,
    });

    mockedReaddir.mockImplementation(async (directoryPath: string) => {
      if (directoryPath === "C:/workspace/root") {
        return [
          createDirent("dist", "directory"),
          createDirent("src.ts", "file"),
        ];
      }

      if (directoryPath === "C:/workspace/root/dist") {
        return [
          createDirent("keep.ts", "file"),
          createDirent("skip.ts", "file"),
        ];
      }

      return [];
    });

    mockedStat.mockImplementation(async (candidatePath: string) => {
      if (candidatePath === "C:/workspace/root/src.ts") {
        return { size: 3 };
      }

      if (candidatePath === "C:/workspace/root/dist/keep.ts") {
        return { size: 4 };
      }

      throw new Error(`Unexpected stat path: ${candidatePath}`);
    });

    const result = await collectTraversalCandidateWorkloadEvidence({
      validRootPath: "C:/workspace/root",
      traversalScopePolicyResolution: resolveTraversalScopePolicy(".", [], {
        includeExcludedGlobs: ["dist/keep.ts"],
      }),
      runtimeBudgetLimits: {
        maxVisitedEntries: 20,
        maxVisitedDirectories: 20,
        softTimeBudgetMs: 10_000,
      },
      inlineCandidateByteBudget: 100,
      fileMatcher: (candidateRelativePath) => candidateRelativePath.endsWith(".ts"),
    });

    expect(result.estimatedCandidateBytes).toBe(7);
    expect(result.matchedCandidateFiles).toBe(2);
    expect(result.estimatedResponseChars).toBeNull();
    expect(result.probeTruncated).toBe(false);
  });

  it("marks the probe as truncated when the inline candidate-byte budget is exceeded", async () => {
    const createDirent = (name: string) => ({
      name,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isDirectory: () => false,
      isFIFO: () => false,
      isFile: () => true,
      isSocket: () => false,
      isSymbolicLink: () => false,
    });

    mockedReaddir.mockResolvedValue([
      createDirent("alpha.ts"),
      createDirent("beta.ts"),
    ]);
    mockedStat
      .mockResolvedValueOnce({ size: 5 })
      .mockResolvedValueOnce({ size: 7 });

    const result = await collectTraversalCandidateWorkloadEvidence({
      validRootPath: "C:/workspace/root",
      traversalScopePolicyResolution: resolveTraversalScopePolicy("."),
      runtimeBudgetLimits: {
        maxVisitedEntries: 20,
        maxVisitedDirectories: 20,
        softTimeBudgetMs: 10_000,
      },
      inlineCandidateByteBudget: 10,
      fileMatcher: () => true,
    });

    expect(result.estimatedCandidateBytes).toBe(12);
    expect(result.matchedCandidateFiles).toBe(2);
    expect(result.probeTruncated).toBe(true);
  });

  it("marks the probe as truncated when the runtime traversal budget is exhausted before the next entry can execute", async () => {
    const createDirent = (name: string) => ({
      name,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isDirectory: () => false,
      isFIFO: () => false,
      isFile: () => true,
      isSocket: () => false,
      isSymbolicLink: () => false,
    });

    mockedReaddir.mockResolvedValue([
      createDirent("alpha.ts"),
      createDirent("beta.ts"),
    ]);
    mockedStat.mockResolvedValue({ size: 5 });

    const result = await collectTraversalCandidateWorkloadEvidence({
      validRootPath: "C:/workspace/root",
      traversalScopePolicyResolution: resolveTraversalScopePolicy("."),
      runtimeBudgetLimits: {
        maxVisitedEntries: 1,
        maxVisitedDirectories: 10,
        softTimeBudgetMs: 10_000,
      },
      inlineCandidateByteBudget: 100,
      fileMatcher: () => true,
    });

    expect(result.estimatedCandidateBytes).toBe(5);
    expect(result.matchedCandidateFiles).toBe(1);
    expect(result.probeTruncated).toBe(true);
  });
});
