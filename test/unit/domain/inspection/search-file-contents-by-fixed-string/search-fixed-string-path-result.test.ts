import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hoisted native fixed-string search runner mock used to stabilize the path-result contract tests.
 */
const { mockedGetRequiredUgrepExecutablePath, mockedRunUgrepSearch, mockedRunUgrepSearchStreaming } = vi.hoisted(() => ({
  mockedGetRequiredUgrepExecutablePath: vi.fn(() => "C:/tools/ugrep.exe"),
  mockedRunUgrepSearch: vi.fn(),
  mockedRunUgrepSearchStreaming: vi.fn(),
}));

vi.mock("@infrastructure/search/ugrep-runner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@infrastructure/search/ugrep-runner")>();

  return {
    ...actual,
    runUgrepSearch: mockedRunUgrepSearch,
    runUgrepSearchStreaming: mockedRunUgrepSearchStreaming,
  };
});

vi.mock("@infrastructure/runtime/ugrep-runtime-dependency", () => ({
  getRequiredUgrepExecutablePath: mockedGetRequiredUgrepExecutablePath,
}));

import { getSearchFixedStringPathResult } from "@domain/inspection/search/search-file-contents-by-fixed-string/search-fixed-string-path-result";
import { INSPECTION_RESUME_MODES } from "@domain/shared/resume/inspection-resume-contract";
import { DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE } from "@domain/shared/runtime/io-capability-profile";
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import * as traversalRuntimeBudget from "@domain/shared/guardrails/traversal-runtime-budget";
import * as filesystemPreflight from "@domain/shared/guardrails/filesystem-preflight";
import {
  resolveExplicitFileScopeCsvFixturePaths,
  type ResolvedInspectionSearchFixturePaths,
} from "@test/shared/utils/inspection/search-fixture-loader";
import {
  assertDirectoryRootIncludeGlobFilteredResult,
  assertExplicitFileScopeSingleMatchResult,
  createExplicitFileScopeHeaderMatchContract,
  type ExpectedInspectionSearchMatchContract,
} from "@test/shared/utils/inspection/search-result-assertions";

/**
 * Absolute workspace root used to resolve shared inspection fixtures for the fixed-string path-result tests.
 */
const workspaceRootPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../",
);

/**
 * Resolved explicit file-scope fixture paths used by the shared fixed-string path-result contract tests.
 */
let explicitFileScopeFixturePaths: ResolvedInspectionSearchFixturePaths | undefined;

/**
 * Canonical single-match expectation derived from the shared explicit file-scope fixture.
 */
let explicitFileScopeMatchContract: ExpectedInspectionSearchMatchContract | undefined;

/**
 * Queues one streaming native-batch result whose stdout lines are driven through the consumer
 * callback exactly like the real streaming runner, including early-stop termination.
 */
function queueNativeStreamingBatchResult(stdout: string): void {
  mockedRunUgrepSearchStreaming.mockImplementationOnce(
    async (_command: unknown, onStdoutLine: (line: string) => boolean) => {
      let terminatedEarly = false;

      for (const line of stdout.split("\n")) {
        if (line.trim() === "") {
          continue;
        }

        if (!onStdoutLine(line)) {
          terminatedEarly = true;
          break;
        }
      }

      return {
        args: [],
        durationMs: 1,
        executable: "C:/tools/ugrep.exe",
        exitCode: 0,
        fixedStringMode: true,
        requiresPcre2: false,
        signal: terminatedEarly ? ("SIGTERM" as const) : null,
        spawnErrorMessage: null,
        stderr: "",
        syncCandidateBytesCap: 0,
        terminatedEarly,
        timedOut: false,
      };
    },
  );
}

describe("getSearchFixedStringPathResult", () => {
  beforeAll(async () => {
    const fixturePaths = resolveExplicitFileScopeCsvFixturePaths(workspaceRootPath);
    const fixtureContent = await readFile(fixturePaths.fileAbsolutePath, "utf8");
    const [headerLine] = fixtureContent.split(/\r?\n/u);

    if (headerLine === undefined || headerLine === "") {
      throw new Error(
        `Fixture '${fixturePaths.fileRelativePath}' must contain a non-empty CSV header line.`,
      );
    }

    explicitFileScopeFixturePaths = fixturePaths;
    explicitFileScopeMatchContract = createExplicitFileScopeHeaderMatchContract(
      fixturePaths,
      headerLine,
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockedRunUgrepSearch.mockResolvedValue({
      exitCode: 1,
      spawnErrorMessage: null,
      stderr: "",
      stdout: "",
      timedOut: false,
    });
    mockedRunUgrepSearchStreaming.mockImplementation(async () => ({
      args: [],
      durationMs: 1,
      executable: "C:/tools/ugrep.exe",
      exitCode: 1,
      fixedStringMode: true,
      requiresPcre2: false,
      signal: null,
      spawnErrorMessage: null,
      stderr: "",
      syncCandidateBytesCap: 0,
      terminatedEarly: false,
      timedOut: false,
    }));
  });

  it("resolves explicit file roots through the shared fixture registry and shared assertions", async () => {
    const fixturePaths = explicitFileScopeFixturePaths;
    const matchContract = explicitFileScopeMatchContract;

    if (fixturePaths === undefined || matchContract === undefined) {
      throw new Error("Expected shared explicit file-scope fixture state to be initialized.");
    }

    mockedRunUgrepSearch.mockResolvedValueOnce({
      exitCode: 0,
      spawnErrorMessage: null,
      stderr: "",
      stdout: `${matchContract.expectedFile}:${matchContract.expectedLine}:${matchContract.expectedContent}`,
      timedOut: false,
    });

    const result = await getSearchFixedStringPathResult({
      searchPath: fixturePaths.fileRelativePath,
      fixedString: fixturePaths.fixture.canonicalSearchToken,
      filePatterns: ["**/*.json"],
      excludePatterns: [],
      includeExcludedGlobs: [],
      respectGitIgnore: false,
      maxResults: 10,
      caseSensitive: true,
      allowedDirectories: [workspaceRootPath],
    });

    assertExplicitFileScopeSingleMatchResult(result, matchContract);
    expect(result.nextContinuationState).toBeNull();
    expect(mockedRunUgrepSearch).toHaveBeenCalledTimes(1);
  });

  it("keeps include globs active for directory roots through the shared fixture registry", async () => {
    const fixturePaths = explicitFileScopeFixturePaths;

    if (fixturePaths === undefined) {
      throw new Error("Expected shared explicit file-scope fixture state to be initialized.");
    }

    const result = await getSearchFixedStringPathResult({
      searchPath: fixturePaths.rootRelativePath,
      fixedString: fixturePaths.fixture.canonicalSearchToken,
      filePatterns: ["**/*.json"],
      excludePatterns: [],
      includeExcludedGlobs: [],
      respectGitIgnore: false,
      maxResults: 10,
      caseSensitive: true,
      allowedDirectories: [workspaceRootPath],
    });

    assertDirectoryRootIncludeGlobFilteredResult(result);
    expect(result.nextContinuationState).toBeNull();
    expect(mockedRunUgrepSearch).not.toHaveBeenCalled();
  });

  it("disables the local soft runtime timeout for preview-family complete-result traversal", async () => {
    const fixturePaths = explicitFileScopeFixturePaths;

    if (fixturePaths === undefined) {
      throw new Error("Expected shared explicit file-scope fixture state to be initialized.");
    }

    const assertTraversalRuntimeBudgetSpy = vi.spyOn(
      traversalRuntimeBudget,
      "assertTraversalRuntimeBudget",
    );
    const executionPolicy = {
      ...resolveSearchExecutionPolicy(DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE),
      traversalInlineEntryBudget: 0,
      traversalInlineDirectoryBudget: 0,
      traversalPreviewFirstEntryBudget: 100,
      traversalPreviewFirstDirectoryBudget: 100,
      traversalPreviewExecutionEntryBudget: 100,
      traversalPreviewExecutionDirectoryBudget: 100,
    };

    try {
      const result = await getSearchFixedStringPathResult({
        searchPath: fixturePaths.rootRelativePath,
        fixedString: fixturePaths.fixture.canonicalSearchToken,
        filePatterns: ["**/*.json"],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 10,
        caseSensitive: true,
        allowedDirectories: [workspaceRootPath],
        executionPolicy,
        requestedResumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      });

      expect(result.admissionOutcome).toBe("preview-first");
      expect(
        assertTraversalRuntimeBudgetSpy.mock.calls.some(([, , , , limits]) =>
          limits?.softTimeBudgetMs === null
        ),
      ).toBe(true);
    } finally {
      assertTraversalRuntimeBudgetSpy.mockRestore();
    }
  });

  it("uses native ugrep batching for complete-result traversal after preview-first admission", async () => {
    const sandboxRootPath = await mkdtemp(
      join(tmpdir(), "mcp-fs-fixed-string-complete-result-batch-"),
    );
    const primaryDirectoryPath = join(sandboxRootPath, "primary");
    const secondaryDirectoryPath = join(sandboxRootPath, "secondary", "nested");
    const executionPolicy = {
      ...resolveSearchExecutionPolicy(DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE),
      traversalInlineEntryBudget: 0,
      traversalInlineDirectoryBudget: 0,
      traversalPreviewFirstEntryBudget: 100,
      traversalPreviewFirstDirectoryBudget: 100,
      traversalPreviewExecutionEntryBudget: 100,
      traversalPreviewExecutionDirectoryBudget: 100,
    };

    try {
      await mkdir(primaryDirectoryPath, { recursive: true });
      await mkdir(secondaryDirectoryPath, { recursive: true });
      const filePaths = [
        ...Array.from({ length: 12 }, (_, index) =>
          join(primaryDirectoryPath, `alpha-${index + 1}.ts`)
        ),
        ...Array.from({ length: 8 }, (_, index) =>
          join(secondaryDirectoryPath, `beta-${index + 1}.ts`)
        ),
      ];

      await Promise.all(
        filePaths.map((filePath) =>
          writeFile(filePath, "export const needle = true;\n", "utf8")
        ),
      );

      queueNativeStreamingBatchResult(
        filePaths
          .map((filePath) => `${filePath}:1:export const needle = true;`)
          .join("\n"),
      );

      const result = await getSearchFixedStringPathResult({
        searchPath: sandboxRootPath,
        fixedString: "needle",
        filePatterns: ["**/*.ts"],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 50,
        caseSensitive: true,
        allowedDirectories: [sandboxRootPath],
        executionPolicy,
        requestedResumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      });

      expect(result.totalMatches).toBe(filePaths.length);
      expect(mockedRunUgrepSearchStreaming).toHaveBeenCalledTimes(1);
      expect(mockedRunUgrepSearchStreaming.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          args: expect.arrayContaining([expect.stringMatching(/^--from=/), "-J1"]),
        }),
      );
      expect(
        JSON.stringify(mockedRunUgrepSearchStreaming.mock.calls[0]?.[0]),
      ).not.toContain("--max-count");
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("delivers canonical content exactly once and attributes an alias registered before the deferred batch delivery", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-alias-after-"));

    try {
      await mkdir(join(sandboxRootPath, "real"), { recursive: true });
      const realTargetPath = join(sandboxRootPath, "real", "target.md");
      await writeFile(realTargetPath, "needle here\nneedle again\n", "utf8");
      await mkdir(join(sandboxRootPath, "zz-alias"), { recursive: true });
      const aliasPath = join(sandboxRootPath, "zz-alias", "alias.md");
      await symlink(realTargetPath, aliasPath, "file");

      queueNativeStreamingBatchResult(
        `${realTargetPath}:1:needle here\n${realTargetPath}:2:needle again`,
      );

      const result = await getSearchFixedStringPathResult({
        searchPath: sandboxRootPath,
        fixedString: "needle",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 10,
        caseSensitive: true,
        allowedDirectories: [sandboxRootPath],
      });

      expect(result.totalMatches).toBe(2);
      expect(result.matches.map((match) => match.file)).toEqual([realTargetPath, realTargetPath]);
      expect(result.matches[0]?.attributedAliases).toEqual(["zz-alias/alias.md"]);
      expect(result.matches[1]?.attributedAliases).toEqual(["zz-alias/alias.md"]);
      expect(result.aliasReferences).toBeUndefined();
      expect(
        JSON.stringify(mockedRunUgrepSearchStreaming.mock.calls.map((call) => call[0])),
      ).not.toContain("alias.md");
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("reports an alias encountered after an immediately delivered match as already delivered in the same pass", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-alias-event-"));
    const executionPolicy = {
      ...resolveSearchExecutionPolicy(DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE),
      traversalInlineEntryBudget: 0,
      traversalInlineDirectoryBudget: 0,
      traversalPreviewFirstEntryBudget: 100,
      traversalPreviewFirstDirectoryBudget: 100,
      traversalPreviewExecutionEntryBudget: 100,
      traversalPreviewExecutionDirectoryBudget: 100,
    };

    try {
      await mkdir(join(sandboxRootPath, "real"), { recursive: true });
      const realTargetPath = join(sandboxRootPath, "real", "target.md");
      await writeFile(realTargetPath, "needle here\nneedle again\n", "utf8");
      await mkdir(join(sandboxRootPath, "zz-alias"), { recursive: true });
      const aliasPath = join(sandboxRootPath, "zz-alias", "alias.md");
      await symlink(realTargetPath, aliasPath, "file");

      mockedRunUgrepSearch.mockResolvedValueOnce({
        exitCode: 0,
        spawnErrorMessage: null,
        stderr: "",
        stdout: `${realTargetPath}:1:needle here\n${realTargetPath}:2:needle again`,
        timedOut: false,
      });

      const result = await getSearchFixedStringPathResult({
        searchPath: sandboxRootPath,
        fixedString: "needle",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 10,
        caseSensitive: true,
        allowedDirectories: [sandboxRootPath],
        executionPolicy,
      });

      expect(result.totalMatches).toBe(2);
      expect(
        result.matches.every((match) => match.attributedAliases === undefined),
      ).toBe(true);
      expect(result.aliasReferences).toEqual([
        {
          aliasPath: "zz-alias/alias.md",
          disposition: "already-delivered",
          targetPath: "real/target.md",
        },
      ]);
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("attaches alias attribution to the canonical match when the alias came first", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-alias-first-"));

    try {
      await mkdir(join(sandboxRootPath, "real"), { recursive: true });
      const realTargetPath = join(sandboxRootPath, "real", "target.md");
      await writeFile(realTargetPath, "needle here\n", "utf8");
      await mkdir(join(sandboxRootPath, "aa-alias"), { recursive: true });
      const aliasPath = join(sandboxRootPath, "aa-alias", "alias.md");
      await symlink(realTargetPath, aliasPath, "file");

      queueNativeStreamingBatchResult(`${realTargetPath}:1:needle here`);

      const result = await getSearchFixedStringPathResult({
        searchPath: sandboxRootPath,
        fixedString: "needle",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 10,
        caseSensitive: true,
        allowedDirectories: [sandboxRootPath],
      });

      expect(result.totalMatches).toBe(1);
      expect(result.matches[0]?.attributedAliases).toEqual(["aa-alias/alias.md"]);
      expect(result.aliasReferences).toBeUndefined();
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("reports aliases whose targets escape the requested root as outside-scope events", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-alias-scope-"));
    const outsideRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-alias-outside-"));

    try {
      const outsideTargetPath = join(outsideRootPath, "secret.md");
      await writeFile(outsideTargetPath, "needle outside\n", "utf8");
      const aliasPath = join(sandboxRootPath, "escape.md");
      await symlink(outsideTargetPath, aliasPath, "file");

      const result = await getSearchFixedStringPathResult({
        searchPath: sandboxRootPath,
        fixedString: "needle",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 10,
        caseSensitive: true,
        allowedDirectories: [sandboxRootPath],
      });

      expect(result.totalMatches).toBe(0);
      expect(result.aliasReferences).toEqual([
        {
          aliasPath: "escape.md",
          disposition: "outside-scope",
          targetPath: outsideTargetPath,
        },
      ]);
      expect(mockedRunUgrepSearch).not.toHaveBeenCalled();
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
      await rm(outsideRootPath, { recursive: true, force: true });
    }
  });

  it("terminates cleanly when a directory alias points back into its own tree", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-alias-loop-"));

    try {
      await mkdir(join(sandboxRootPath, "loop"), { recursive: true });
      await symlink(join(sandboxRootPath, "loop"), join(sandboxRootPath, "loop", "inception"), "junction");
      const realTargetPath = join(sandboxRootPath, "real.md");
      await writeFile(realTargetPath, "needle here\n", "utf8");

      queueNativeStreamingBatchResult(`${realTargetPath}:1:needle here`);

      const result = await getSearchFixedStringPathResult({
        searchPath: sandboxRootPath,
        fixedString: "needle",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 10,
        caseSensitive: true,
        allowedDirectories: [sandboxRootPath],
      });

      expect(result.totalMatches).toBe(1);
      expect(result.matches.map((match) => match.file)).toEqual([realTargetPath]);
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("delivers canonical content exactly once through the materialized complete-result plan", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-alias-plan-"));
    const executionPolicy = {
      ...resolveSearchExecutionPolicy(DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE),
      traversalInlineEntryBudget: 0,
      traversalInlineDirectoryBudget: 0,
      traversalPreviewFirstEntryBudget: 100,
      traversalPreviewFirstDirectoryBudget: 100,
      traversalPreviewExecutionEntryBudget: 100,
      traversalPreviewExecutionDirectoryBudget: 100,
    };

    try {
      await mkdir(join(sandboxRootPath, "real"), { recursive: true });
      const realTargetPath = join(sandboxRootPath, "real", "target.md");
      await writeFile(realTargetPath, "needle here\nneedle again\n", "utf8");
      await mkdir(join(sandboxRootPath, "zz-alias"), { recursive: true });
      await symlink(realTargetPath, join(sandboxRootPath, "zz-alias", "alias.md"), "file");

      queueNativeStreamingBatchResult(
        `${realTargetPath}:1:needle here\n${realTargetPath}:2:needle again`,
      );

      const result = await getSearchFixedStringPathResult({
        searchPath: sandboxRootPath,
        fixedString: "needle",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 10,
        caseSensitive: true,
        allowedDirectories: [sandboxRootPath],
        executionPolicy,
        requestedResumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      });

      expect(result.totalMatches).toBe(2);
      expect(result.matches.map((match) => match.file)).toEqual([realTargetPath, realTargetPath]);
      expect(result.matches[0]?.attributedAliases).toEqual(["zz-alias/alias.md"]);
      expect(result.matches[1]?.attributedAliases).toEqual(["zz-alias/alias.md"]);
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("leaves batch matches without attribution when the backend reports an unmapped file", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-alias-unmapped-"));

    try {
      await mkdir(join(sandboxRootPath, "real"), { recursive: true });
      const realTargetPath = join(sandboxRootPath, "real", "target.md");
      await writeFile(realTargetPath, "needle here\n", "utf8");
      await mkdir(join(sandboxRootPath, "aa-alias"), { recursive: true });
      const aliasPath = join(sandboxRootPath, "aa-alias", "alias.md");
      await symlink(realTargetPath, aliasPath, "file");
      const unmappedBackendPath = join(sandboxRootPath, "real", "unmapped.md");

      queueNativeStreamingBatchResult(
        `${realTargetPath}:1:needle here\n${unmappedBackendPath}:1:needle here`,
      );

      const result = await getSearchFixedStringPathResult({
        searchPath: sandboxRootPath,
        fixedString: "needle",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 10,
        caseSensitive: true,
        allowedDirectories: [sandboxRootPath],
      });

      expect(result.totalMatches).toBe(2);
      expect(
        result.matches.find((match) => match.file === realTargetPath)?.attributedAliases,
      ).toEqual(["aa-alias/alias.md"]);
      expect(
        result.matches.find((match) => match.file === unmappedBackendPath)?.attributedAliases,
      ).toBeUndefined();
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("reports an alias encountered in a later pass as already delivered without re-delivering the match", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-alias-resume-"));
    const executionPolicy = {
      ...resolveSearchExecutionPolicy(DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE),
      traversalInlineEntryBudget: 0,
      traversalInlineDirectoryBudget: 0,
      traversalPreviewFirstEntryBudget: 100,
      traversalPreviewFirstDirectoryBudget: 100,
      traversalPreviewExecutionEntryBudget: 100,
      traversalPreviewExecutionDirectoryBudget: 100,
    };

    try {
      await mkdir(join(sandboxRootPath, "real"), { recursive: true });
      const realTargetPath = join(sandboxRootPath, "real", "target.md");
      await writeFile(realTargetPath, "needle here\n", "utf8");
      await mkdir(join(sandboxRootPath, "zz-alias"), { recursive: true });
      await symlink(realTargetPath, join(sandboxRootPath, "zz-alias", "alias.md"), "file");

      mockedRunUgrepSearch.mockResolvedValueOnce({
        exitCode: 0,
        spawnErrorMessage: null,
        stderr: "",
        stdout: `${realTargetPath}:1:needle here`,
        timedOut: false,
      });

      const firstPassResult = await getSearchFixedStringPathResult({
        searchPath: sandboxRootPath,
        fixedString: "needle",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 1,
        caseSensitive: true,
        allowedDirectories: [sandboxRootPath],
        executionPolicy,
      });

      expect(firstPassResult.totalMatches).toBe(1);
      expect(firstPassResult.nextContinuationState).not.toBeNull();
      expect(
        firstPassResult.nextContinuationState?.aliasAttribution?.deliveredCanonicalIdentities,
      ).toEqual(["real/target.md"]);

      const secondPassResult = await getSearchFixedStringPathResult({
        searchPath: sandboxRootPath,
        fixedString: "needle",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 1,
        caseSensitive: true,
        allowedDirectories: [sandboxRootPath],
        continuationState: firstPassResult.nextContinuationState,
        executionPolicy,
        requestedResumeMode: INSPECTION_RESUME_MODES.NEXT_CHUNK,
      });

      expect(secondPassResult.totalMatches).toBe(0);
      expect(secondPassResult.matches).toEqual([]);
      expect(secondPassResult.aliasReferences).toEqual([
        {
          aliasPath: "zz-alias/alias.md",
          disposition: "already-delivered",
          targetPath: "real/target.md",
        },
      ]);
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("attributes aliases on decoded-fallback units inside the materialized completion plan", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-alias-utf16-plan-"));
    const executionPolicy = {
      ...resolveSearchExecutionPolicy(DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE),
      traversalInlineEntryBudget: 0,
      traversalInlineDirectoryBudget: 0,
      traversalPreviewFirstEntryBudget: 100,
      traversalPreviewFirstDirectoryBudget: 100,
      traversalPreviewExecutionEntryBudget: 100,
      traversalPreviewExecutionDirectoryBudget: 100,
    };

    try {
      await mkdir(join(sandboxRootPath, "real"), { recursive: true });
      const legacyTargetPath = join(sandboxRootPath, "real", "legacy.md");
      await writeFile(legacyTargetPath, "\uFEFFneedle legacy\n", "utf16le");
      await mkdir(join(sandboxRootPath, "zz-alias"), { recursive: true });
      await symlink(legacyTargetPath, join(sandboxRootPath, "zz-alias", "alias.md"), "file");

      const result = await getSearchFixedStringPathResult({
        searchPath: sandboxRootPath,
        fixedString: "needle",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 10,
        caseSensitive: true,
        allowedDirectories: [sandboxRootPath],
        executionPolicy,
        requestedResumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      });

      expect(result.totalMatches).toBe(1);
      expect(result.matches[0]?.file).toBe(legacyTargetPath);
      expect(result.matches[0]?.attributedAliases).toEqual(["zz-alias/alias.md"]);
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("attributes aliases through the inline decoded-fallback branch of the traversal loop", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-alias-utf16-inline-"));

    try {
      await mkdir(join(sandboxRootPath, "real"), { recursive: true });
      const legacyTargetPath = join(sandboxRootPath, "real", "legacy.md");
      await writeFile(legacyTargetPath, "\uFEFFneedle legacy\n", "utf16le");
      await mkdir(join(sandboxRootPath, "aa-alias"), { recursive: true });
      await symlink(legacyTargetPath, join(sandboxRootPath, "aa-alias", "alias.md"), "file");

      const result = await getSearchFixedStringPathResult({
        searchPath: sandboxRootPath,
        fixedString: "needle",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 10,
        caseSensitive: true,
        allowedDirectories: [sandboxRootPath],
      });

      expect(result.totalMatches).toBe(1);
      expect(result.matches[0]?.file).toBe(legacyTargetPath);
      expect(result.matches[0]?.attributedAliases).toEqual(["aa-alias/alias.md"]);
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("fires the already-delivered event inside the materialization loop when a resumed completion pass meets the alias", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-alias-materialize-event-"));
    const executionPolicy = {
      ...resolveSearchExecutionPolicy(DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE),
      traversalInlineEntryBudget: 0,
      traversalInlineDirectoryBudget: 0,
      traversalPreviewFirstEntryBudget: 100,
      traversalPreviewFirstDirectoryBudget: 100,
      traversalPreviewExecutionEntryBudget: 100,
      traversalPreviewExecutionDirectoryBudget: 100,
    };

    try {
      await mkdir(join(sandboxRootPath, "real"), { recursive: true });
      const realTargetPath = join(sandboxRootPath, "real", "target.md");
      await writeFile(realTargetPath, "needle here\n", "utf8");
      await mkdir(join(sandboxRootPath, "zz-alias"), { recursive: true });
      await symlink(realTargetPath, join(sandboxRootPath, "zz-alias", "alias.md"), "file");

      mockedRunUgrepSearch.mockResolvedValueOnce({
        exitCode: 0,
        spawnErrorMessage: null,
        stderr: "",
        stdout: `${realTargetPath}:1:needle here`,
        timedOut: false,
      });

      const firstPassResult = await getSearchFixedStringPathResult({
        searchPath: sandboxRootPath,
        fixedString: "needle",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 1,
        caseSensitive: true,
        allowedDirectories: [sandboxRootPath],
        executionPolicy,
      });

      expect(firstPassResult.totalMatches).toBe(1);
      expect(firstPassResult.nextContinuationState).not.toBeNull();

      const secondPassResult = await getSearchFixedStringPathResult({
        searchPath: sandboxRootPath,
        fixedString: "needle",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 1,
        caseSensitive: true,
        allowedDirectories: [sandboxRootPath],
        continuationState: firstPassResult.nextContinuationState,
        executionPolicy,
        requestedResumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      });

      expect(secondPassResult.aliasReferences).toEqual([
        {
          aliasPath: "zz-alias/alias.md",
          disposition: "already-delivered",
          targetPath: "real/target.md",
        },
      ]);
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("enforces maxResults as a true total across files and resumes without loss across passes", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-total-budget-"));
    const executionPolicy = {
      ...resolveSearchExecutionPolicy(DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE),
      traversalInlineEntryBudget: 0,
      traversalInlineDirectoryBudget: 0,
      traversalPreviewFirstEntryBudget: 100,
      traversalPreviewFirstDirectoryBudget: 100,
      traversalPreviewExecutionEntryBudget: 100,
      traversalPreviewExecutionDirectoryBudget: 100,
    };

    try {
      const filePaths: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        const filePath = join(sandboxRootPath, `candidate-${index}.txt`);
        await writeFile(filePath, "needle one\nneedle two\n", "utf8");
        filePaths.push(filePath);
      }

      const [firstFilePath, secondFilePath, thirdFilePath] = filePaths;

      if (firstFilePath === undefined || secondFilePath === undefined || thirdFilePath === undefined) {
        throw new Error("Expected three candidate files for the total-budget pass chain.");
      }

      queueNativeStreamingBatchResult(
        filePaths
          .map((filePath) => `${filePath}:1:needle one\n${filePath}:2:needle two`)
          .join("\n"),
      );
      queueNativeStreamingBatchResult(
        `${secondFilePath}:1:needle one\n${secondFilePath}:2:needle two\n${thirdFilePath}:1:needle one\n${thirdFilePath}:2:needle two`,
      );
      queueNativeStreamingBatchResult(
        `${thirdFilePath}:1:needle one\n${thirdFilePath}:2:needle two`,
      );

      const allMatches: Array<{ file: string; line: number }> = [];
      let continuationState: Parameters<typeof getSearchFixedStringPathResult>[0]["continuationState"] = null;
      let isFirstPass = true;

      while (isFirstPass || continuationState !== null) {
        const passResult = await getSearchFixedStringPathResult({
          searchPath: sandboxRootPath,
          fixedString: "needle",
          filePatterns: [],
          excludePatterns: [],
          includeExcludedGlobs: [],
          respectGitIgnore: false,
          maxResults: 2,
          caseSensitive: true,
          allowedDirectories: [sandboxRootPath],
          executionPolicy,
          ...(isFirstPass ? {} : { continuationState }),
          requestedResumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
        });

        allMatches.push(...passResult.matches.map((match) => ({ file: match.file, line: match.line })));
        continuationState = passResult.nextContinuationState;
        isFirstPass = false;
      }

      const deliveredKeys = allMatches.map((match) => `${match.file}:${match.line}`);

      expect(allMatches).toHaveLength(6);
      expect(new Set(deliveredKeys).size).toBe(6);
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("keeps the per-file max-count flag on the single-file lane", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-single-file-maxcount-"));

    try {
      const targetFilePath = join(sandboxRootPath, "single.txt");
      await writeFile(targetFilePath, "needle one\nneedle two\n", "utf8");

      mockedRunUgrepSearch.mockResolvedValueOnce({
        exitCode: 0,
        spawnErrorMessage: null,
        stderr: "",
        stdout: `${targetFilePath}:1:needle one`,
        timedOut: false,
      });

      const result = await getSearchFixedStringPathResult({
        searchPath: targetFilePath,
        fixedString: "needle",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 1,
        caseSensitive: true,
        allowedDirectories: [sandboxRootPath],
      });

      expect(result.totalMatches).toBe(1);
      expect(mockedRunUgrepSearchStreaming).not.toHaveBeenCalled();
      expect(JSON.stringify(mockedRunUgrepSearch.mock.calls[0]?.[0])).toContain("--max-count=1");
      expect(JSON.stringify(mockedRunUgrepSearch.mock.calls[0]?.[0])).not.toContain("-J1");
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("returns an unstopped empty result when the batch backend reports no matches", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-batch-empty-"));

    try {
      await writeFile(join(sandboxRootPath, "candidate.txt"), "no match here\n", "utf8");

      const result = await getSearchFixedStringPathResult({
        searchPath: sandboxRootPath,
        fixedString: "needle",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 10,
        caseSensitive: true,
        allowedDirectories: [sandboxRootPath],
      });

      expect(result.totalMatches).toBe(0);
      expect(result.matches).toEqual([]);
      expect(result.truncated).toBe(false);
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("propagates native batch failures without converting them into truncation", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-batch-failure-"));

    const baseCall = {
      searchPath: sandboxRootPath,
      fixedString: "needle",
      filePatterns: [] as string[],
      excludePatterns: [] as string[],
      includeExcludedGlobs: [] as string[],
      respectGitIgnore: false,
      maxResults: 10,
      caseSensitive: true,
      allowedDirectories: [sandboxRootPath],
    };

    try {
      await writeFile(join(sandboxRootPath, "candidate.txt"), "needle here\n", "utf8");

      mockedRunUgrepSearchStreaming.mockImplementationOnce(async () => ({
        args: [],
        durationMs: 1,
        executable: "C:/tools/ugrep.exe",
        exitCode: null,
        fixedStringMode: true,
        requiresPcre2: false,
        signal: null,
        spawnErrorMessage: "spawn ENOENT",
        stderr: "",
        syncCandidateBytesCap: 0,
        terminatedEarly: false,
        timedOut: false,
      }));

      await expect(getSearchFixedStringPathResult(baseCall)).rejects.toThrow(
        "Native search runner failed to start",
      );

      mockedRunUgrepSearchStreaming.mockImplementationOnce(async () => ({
        args: [],
        durationMs: 1,
        executable: "C:/tools/ugrep.exe",
        exitCode: null,
        fixedStringMode: true,
        requiresPcre2: false,
        signal: "SIGTERM",
        spawnErrorMessage: null,
        stderr: "",
        syncCandidateBytesCap: 0,
        terminatedEarly: false,
        timedOut: true,
      }));

      await expect(getSearchFixedStringPathResult(baseCall)).rejects.toThrow(
        "Native search runner timed out before completion.",
      );

      mockedRunUgrepSearchStreaming.mockImplementationOnce(async () => ({
        args: [],
        durationMs: 1,
        executable: "C:/tools/ugrep.exe",
        exitCode: 2,
        fixedStringMode: true,
        requiresPcre2: false,
        signal: null,
        spawnErrorMessage: null,
        stderr: "backend exploded",
        syncCandidateBytesCap: 0,
        terminatedEarly: false,
        timedOut: false,
      }));

      await expect(getSearchFixedStringPathResult(baseCall)).rejects.toThrow("backend exploded");
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("runs no blocking admission probe on a resume pass", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-resume-no-probe-"));
    const executionPolicy = {
      ...resolveSearchExecutionPolicy(DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE),
      traversalInlineEntryBudget: 0,
      traversalInlineDirectoryBudget: 0,
      traversalPreviewFirstEntryBudget: 100,
      traversalPreviewFirstDirectoryBudget: 100,
      traversalPreviewExecutionEntryBudget: 100,
      traversalPreviewExecutionDirectoryBudget: 100,
    };

    try {
      await writeFile(join(sandboxRootPath, "candidate.txt"), "needle here\n", "utf8");

      const preflightContextSpy = vi.spyOn(filesystemPreflight, "resolveTraversalPreflightContext");
      const scopeContextSpy = vi.spyOn(filesystemPreflight, "resolveTraversalScopeContext");

      try {
        const result = await getSearchFixedStringPathResult({
          searchPath: sandboxRootPath,
          fixedString: "needle",
          filePatterns: [],
          excludePatterns: [],
          includeExcludedGlobs: [],
          respectGitIgnore: false,
          maxResults: 10,
          caseSensitive: true,
          allowedDirectories: [sandboxRootPath],
          continuationState: {
            traversalFrames: [{ directoryRelativePath: "", nextEntryIndex: 0 }],
            activeFileRelativePath: null,
            activeFileMatchOffset: 0,
          },
          executionPolicy,
          requestedResumeMode: INSPECTION_RESUME_MODES.NEXT_CHUNK,
        });

        expect(preflightContextSpy).not.toHaveBeenCalled();
        expect(scopeContextSpy).toHaveBeenCalled();
        expect(result.admissionOutcome).toBe("preview-first");
      } finally {
        preflightContextSpy.mockRestore();
        scopeContextSpy.mockRestore();
      }
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("skips structurally invalid native output lines inside the streaming batch", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-malformed-line-"));

    try {
      const candidatePath = join(sandboxRootPath, "candidate.txt");
      await writeFile(candidatePath, "needle here\n", "utf8");

      queueNativeStreamingBatchResult(
        `ugrep emitted a non-match diagnostic line\n${candidatePath}:1:needle here`,
      );

      const result = await getSearchFixedStringPathResult({
        searchPath: sandboxRootPath,
        fixedString: "needle",
        filePatterns: [],
        excludePatterns: [],
        includeExcludedGlobs: [],
        respectGitIgnore: false,
        maxResults: 10,
        caseSensitive: true,
        allowedDirectories: [sandboxRootPath],
      });

      expect(result.totalMatches).toBe(1);
      expect(result.matches.map((match) => match.file)).toEqual([candidatePath]);
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("falls back to the exit-code message when the native batch fails without stderr", async () => {
    const sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-fixed-string-empty-stderr-"));

    try {
      await writeFile(join(sandboxRootPath, "candidate.txt"), "needle here\n", "utf8");

      mockedRunUgrepSearchStreaming.mockImplementationOnce(async () => ({
        args: [],
        durationMs: 1,
        executable: "C:/tools/ugrep.exe",
        exitCode: 2,
        fixedStringMode: true,
        requiresPcre2: false,
        signal: null,
        spawnErrorMessage: null,
        stderr: "",
        syncCandidateBytesCap: 0,
        terminatedEarly: false,
        timedOut: false,
      }));

      await expect(
        getSearchFixedStringPathResult({
          searchPath: sandboxRootPath,
          fixedString: "needle",
          filePatterns: [],
          excludePatterns: [],
          includeExcludedGlobs: [],
          respectGitIgnore: false,
          maxResults: 10,
          caseSensitive: true,
          allowedDirectories: [sandboxRootPath],
        }),
      ).rejects.toThrow("Native search backend exited with code 2.");
    } finally {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });
});
