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
  type ListDirectoryEntriesResult,
} from "@domain/inspection/list-directory-entries/handler";
import { DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION } from "@domain/inspection/shared/filesystem-entry-metadata-contract";
import { TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES } from "@domain/shared/guardrails/traversal-workload-admission";
import { TraversalRuntimeBudgetExceededError } from "@domain/shared/guardrails/traversal-runtime-budget";
import { INSPECTION_RESUME_MODES } from "@domain/shared/resume/inspection-resume-contract";
import { InspectionResumeSessionSqliteStore } from "@infrastructure/persistence/inspection-resume-session-sqlite-store";

const LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER = "list_directory_entries";

/**
 * Entry-visit ceiling that forces every root pass to abort after two delivered entries, so the
 * sandbox chain produces multiple bounded chunks per root without relying on text budgets.
 */
const PREVIEW_PASS_ENTRY_VISIT_LIMIT = 3;

/**
 * Minimal persisted resume-state shape asserted by this regression test.
 *
 * @remarks
 * Mirrors the handler-internal continuation state structurally so the persisted frontier and the
 * persisted delivery accounting can be asserted without reaching into handler-private types.
 */
interface PersistedListDirectoryEntriesResumeState {
  /**
   * Per-root traversal frontier frames persisted between passes.
   */
  rootTraversalStates: Record<
    string,
    {
      traversalFrames: Array<{
        directoryRelativePath: string;
        nextEntryIndex: number;
      }>;
    }
  >;

  /**
   * Session-cumulative delivered-entry accounting persisted between passes.
   */
  deliveredTotals?: {
    entryCount: number;
  };
}

/**
 * Returns the relative entry paths one listing pass delivered for one requested root.
 *
 * @param result - Structured result of one listing pass.
 * @param requestedPath - Requested root path whose delivered entries are collected.
 * @returns Relative paths of the entries delivered for the requested root in delivery order.
 */
function collectDeliveredEntryPaths(
  result: ListDirectoryEntriesResult,
  requestedPath: string,
): string[] {
  const rootResult = result.roots.find((root) => root.requestedPath === requestedPath);

  if (rootResult === undefined) {
    throw new Error(`Expected a listing root for '${requestedPath}' in the current pass.`);
  }

  return rootResult.entries.map((entry) => entry.path);
}

describe("list_directory_entries multi-root preview resume gaplessness", () => {
  let sandboxRootPath = "";
  let storeDirectoryPath = "";
  let rootAlphaPath = "";
  let rootBetaPath = "";
  let store: InspectionResumeSessionSqliteStore | undefined;

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-list-gapless-"));
    storeDirectoryPath = await mkdtemp(join(tmpdir(), "mcp-fs-list-gapless-store-"));
    store = new InspectionResumeSessionSqliteStore(
      join(storeDirectoryPath, "sessions.sqlite"),
    );

    rootAlphaPath = join(sandboxRootPath, "root-alpha");
    rootBetaPath = join(sandboxRootPath, "root-beta");

    await mkdir(join(rootAlphaPath, "bridge"), { recursive: true });
    await writeFile(join(rootAlphaPath, "alpha.txt"), "alpha");
    await writeFile(join(rootAlphaPath, "bridge", "bridge-1.txt"), "bridge-1");
    await writeFile(join(rootAlphaPath, "bridge", "bridge-2.txt"), "bridge-2");
    await writeFile(join(rootAlphaPath, "zulu.txt"), "zulu");

    await mkdir(join(rootBetaPath, "delta"), { recursive: true });
    await writeFile(join(rootBetaPath, "beta.txt"), "beta");
    await writeFile(join(rootBetaPath, "delta", "delta-1.txt"), "delta-1");
    await writeFile(join(rootBetaPath, "gamma.txt"), "gamma");

    mockedResolveTraversalWorkloadAdmissionDecision.mockReturnValue({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      guidanceText: null,
    });
    mockedAssertTraversalRuntimeBudget.mockImplementation((toolName: string, state: { visitedEntries: number }) => {
      // The candidate-workload probe runs under its own tool name and passes through; only the
      // directory-listing preview chunk is bounded by the forced per-pass entry-visit budget.
      if (toolName !== LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER) {
        return;
      }

      if (state.visitedEntries >= PREVIEW_PASS_ENTRY_VISIT_LIMIT) {
        throw new TraversalRuntimeBudgetExceededError(
          "Traversal runtime budget exhausted for the current listing pass.",
          LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
          "traversal entries visited",
          state.visitedEntries,
          PREVIEW_PASS_ENTRY_VISIT_LIMIT - 1,
          "entries",
        );
      }
    });
  });

  afterEach(async () => {
    store?.close();
    store = undefined;
    await rm(sandboxRootPath, { recursive: true, force: true });
    await rm(storeDirectoryPath, { recursive: true, force: true });
  });

  it("delivers every entry of every truncating root exactly once and in order across the next-chunk chain", async () => {
    const activeStore = store;

    if (activeStore === undefined) {
      throw new Error("Expected the resume session store to be initialized.");
    }

    const expectedRootAlphaEntries = [
      "alpha.txt",
      "bridge",
      "bridge/bridge-1.txt",
      "bridge/bridge-2.txt",
      "zulu.txt",
    ] as const;
    const expectedRootBetaEntries = [
      "beta.txt",
      "delta",
      "delta/delta-1.txt",
      "gamma.txt",
    ] as const;
    const deliveredRootAlphaEntries: string[] = [];
    const deliveredRootBetaEntries: string[] = [];

    const baseResult = await getListDirectoryEntriesResult(
      undefined,
      undefined,
      [rootAlphaPath, rootBetaPath],
      true,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
      [],
      [],
      false,
      [rootAlphaPath, rootBetaPath],
      activeStore,
    );

    expect(baseResult.resume.resumable).toBe(true);
    expect(baseResult.sessionDelivery).toEqual({
      continuationPass: false,
      previouslyDeliveredCount: 0,
      sessionTotalCount: 4,
    });

    const baseRootAlphaEntries = collectDeliveredEntryPaths(baseResult, rootAlphaPath);
    const baseRootBetaEntries = collectDeliveredEntryPaths(baseResult, rootBetaPath);

    expect(baseRootAlphaEntries).toEqual(["alpha.txt", "bridge"]);
    expect(baseRootBetaEntries).toEqual(["beta.txt", "delta"]);

    deliveredRootAlphaEntries.push(...baseRootAlphaEntries);
    deliveredRootBetaEntries.push(...baseRootBetaEntries);

    const resumeToken = baseResult.resume.resumeToken;

    if (resumeToken === null) {
      throw new Error("Expected an active resume token after the preview-first base pass.");
    }

    // Both roots still carry undelivered content, so both frontier states must persist.
    const stateAfterBasePass = activeStore.loadActiveSession<
      unknown,
      PersistedListDirectoryEntriesResumeState
    >(
      resumeToken,
      LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
      LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
    );

    expect(stateAfterBasePass?.resumeState.deliveredTotals?.entryCount).toBe(4);
    expect(Object.keys(stateAfterBasePass?.resumeState.rootTraversalStates ?? {}).sort()).toEqual(
      [rootAlphaPath, rootBetaPath].sort(),
    );

    const firstResumeResult = await getListDirectoryEntriesResult(
      resumeToken,
      INSPECTION_RESUME_MODES.NEXT_CHUNK,
      [],
      true,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
      [],
      [],
      false,
      [rootAlphaPath, rootBetaPath],
      activeStore,
    );

    expect(firstResumeResult.resume.resumable).toBe(true);
    expect(firstResumeResult.sessionDelivery).toEqual({
      continuationPass: true,
      previouslyDeliveredCount: 4,
      sessionTotalCount: 8,
    });

    const firstResumeRootAlphaEntries = collectDeliveredEntryPaths(firstResumeResult, rootAlphaPath);
    const firstResumeRootBetaEntries = collectDeliveredEntryPaths(firstResumeResult, rootBetaPath);

    expect(firstResumeRootAlphaEntries).toEqual(["bridge/bridge-1.txt", "bridge/bridge-2.txt"]);
    expect(firstResumeRootBetaEntries).toEqual(["delta/delta-1.txt", "gamma.txt"]);

    deliveredRootAlphaEntries.push(...firstResumeRootAlphaEntries);
    deliveredRootBetaEntries.push(...firstResumeRootBetaEntries);

    // root-beta is fully delivered now and must leave the persisted frontier; root-alpha remains.
    const stateAfterFirstResume = activeStore.loadActiveSession<
      unknown,
      PersistedListDirectoryEntriesResumeState
    >(
      resumeToken,
      LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
      LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
    );

    expect(stateAfterFirstResume?.resumeState.deliveredTotals?.entryCount).toBe(8);
    expect(Object.keys(stateAfterFirstResume?.resumeState.rootTraversalStates ?? {})).toEqual([rootAlphaPath]);

    const terminalOutput = await handleListDirectoryEntries(
      resumeToken,
      INSPECTION_RESUME_MODES.NEXT_CHUNK,
      [],
      true,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
      [],
      [],
      false,
      [rootAlphaPath, rootBetaPath],
      activeStore,
    );

    expect(terminalOutput).toContain(
      "Directory-listing completion finished for 1 root: 1 additional entries in this final pass; session total 9 entries (8 already delivered in prior preview-chunk payloads).",
    );
    expect(terminalOutput).toContain("zulu.txt");

    deliveredRootAlphaEntries.push("zulu.txt");

    // The terminal pass closes the session: no active session may remain for the token.
    expect(
      activeStore.loadActiveSession(
        resumeToken,
        LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
        LIST_DIRECTORY_ENTRIES_FAMILY_MEMBER,
      ),
    ).toBeNull();

    // Full-chain reconstruction: every entry exactly once, in deterministic lexicographic order.
    expect(deliveredRootAlphaEntries).toEqual([...expectedRootAlphaEntries]);
    expect(deliveredRootBetaEntries).toEqual([...expectedRootBetaEntries]);
    expect(new Set(deliveredRootAlphaEntries).size).toBe(deliveredRootAlphaEntries.length);
    expect(new Set(deliveredRootBetaEntries).size).toBe(deliveredRootBetaEntries.length);
  });
});
