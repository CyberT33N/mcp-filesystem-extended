import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hoisted child-process mock state used by the native `ugrep` runner tests.
 */
const ugrepRunnerTestState = vi.hoisted(() => ({
  mockedSpawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: ugrepRunnerTestState.mockedSpawn,
}));

import type { UgrepCommand } from "@infrastructure/search/ugrep-command-builder";
import {
  formatUgrepSpawnFailure,
  runUgrepSearch,
  UgrepRunner,
} from "@infrastructure/search/ugrep-runner";

/**
 * Creates one structured native-search command plan for runner tests.
 *
 * @returns One canonical `ugrep` command surface.
 */
function createUgrepCommand(): UgrepCommand {
  return {
    args: ["--fixed-strings", "PRAXIS1", "test/fixtures/patients.csv"],
    executable: "C:/tools/ugrep.exe",
    fixedStringMode: true,
    hybridLiteralSearchLane: false,
    requiresPcre2: false,
    syncCandidateBytesCap: 48 * 1_024 * 1_024,
  };
}

/**
 * Creates one mocked shell-free spawned process surface for native-search runner tests.
 *
 * @returns One event-driven child-process double with stdout, stderr, and kill support.
 */
function createMockSpawnedProcess() {
  const stdout = Object.assign(new EventEmitter(), {
    setEncoding: vi.fn(),
  });
  const stderr = Object.assign(new EventEmitter(), {
    setEncoding: vi.fn(),
  });

  return Object.assign(new EventEmitter(), {
    kill: vi.fn(),
    stderr,
    stdout,
  });
}

describe("ugrep_runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("captures stdout, stderr, exit metadata, and runner options for shell-free execution", async () => {
    const command = createUgrepCommand();
    const spawnedProcess = createMockSpawnedProcess();

    ugrepRunnerTestState.mockedSpawn.mockReturnValue(spawnedProcess);

    const resultPromise = new UgrepRunner({
      cwd: "C:/workspace",
      env: { PATH: "C:/tools" },
      timeoutMs: 500,
    }).runSearch(command);

    spawnedProcess.stdout.emit("data", "alpha\n");
    spawnedProcess.stderr.emit("data", "warning\n");
    spawnedProcess.emit("close", 0, null);

    const result = await resultPromise;

    expect(ugrepRunnerTestState.mockedSpawn).toHaveBeenCalledWith(
      command.executable,
      command.args,
      {
        cwd: "C:/workspace",
        env: { PATH: "C:/tools" },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    expect(spawnedProcess.stdout.setEncoding).toHaveBeenCalledWith("utf8");
    expect(spawnedProcess.stderr.setEncoding).toHaveBeenCalledWith("utf8");
    expect(result).toMatchObject({
      args: command.args,
      executable: command.executable,
      exitCode: 0,
      fixedStringMode: true,
      requiresPcre2: false,
      signal: null,
      spawnErrorMessage: null,
      stderr: "warning\n",
      stdout: "alpha\n",
      syncCandidateBytesCap: command.syncCandidateBytesCap,
      timedOut: false,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("marks timed out executions and kills the spawned process with the configured signal", async () => {
    vi.useFakeTimers();

    const command = createUgrepCommand();
    const spawnedProcess = createMockSpawnedProcess();

    ugrepRunnerTestState.mockedSpawn.mockReturnValue(spawnedProcess);

    const resultPromise = new UgrepRunner({
      killSignal: "SIGKILL",
      timeoutMs: 25,
    }).runSearch(command);

    await vi.advanceTimersByTimeAsync(25);

    expect(spawnedProcess.kill).toHaveBeenCalledWith("SIGKILL");

    spawnedProcess.emit("close", null, "SIGKILL");

    const result = await resultPromise;

    expect(result).toMatchObject({
      exitCode: null,
      signal: "SIGKILL",
      timedOut: true,
    });
  });

  it("formats spawn failures and exposes the convenience wrapper for one-off execution", async () => {
    const command = createUgrepCommand();
    const spawnedProcess = createMockSpawnedProcess();

    ugrepRunnerTestState.mockedSpawn.mockReturnValue(spawnedProcess);

    const resultPromise = runUgrepSearch(command);

    spawnedProcess.emit("error", new Error("spawn ENOENT"));
    spawnedProcess.emit("close", 1, null);

    const result = await resultPromise;

    expect(result.spawnErrorMessage).toBe("spawn ENOENT");
    expect(formatUgrepSpawnFailure(result)).toBe(
      "Native search runner failed to start for executable 'C:/tools/ugrep.exe': spawn ENOENT",
    );
  });
});
