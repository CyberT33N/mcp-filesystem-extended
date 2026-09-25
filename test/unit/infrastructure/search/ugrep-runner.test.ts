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
  runUgrepSearchStreaming,
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

  it("streams completed lines to the consumer and flushes the final unterminated line", async () => {
    const command = createUgrepCommand();
    const spawnedProcess = createMockSpawnedProcess();

    ugrepRunnerTestState.mockedSpawn.mockReturnValue(spawnedProcess);

    const deliveredLines: string[] = [];
    const resultPromise = new UgrepRunner().runSearchStreaming(command, (line) => {
      deliveredLines.push(line);
      return true;
    });

    spawnedProcess.stdout.emit("data", "alpha\nbe");
    spawnedProcess.stderr.emit("data", "backend warning\n");
    spawnedProcess.stdout.emit("data", "ta\ngamma\n");
    spawnedProcess.stdout.emit("data", "delta");
    spawnedProcess.emit("close", 0, null);

    const result = await resultPromise;

    expect(deliveredLines).toEqual(["alpha", "beta", "gamma", "delta"]);
    expect(result.stderr).toBe("backend warning\n");
    expect(result.terminatedEarly).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(result.signal).toBeNull();
  });

  it("terminates the spawned process when the consumer stops the stream and drops the partial tail", async () => {
    const command = createUgrepCommand();
    const spawnedProcess = createMockSpawnedProcess();

    ugrepRunnerTestState.mockedSpawn.mockReturnValue(spawnedProcess);

    const deliveredLines: string[] = [];
    const resultPromise = new UgrepRunner().runSearchStreaming(command, (line) => {
      deliveredLines.push(line);
      return line !== "stop";
    });

    spawnedProcess.stdout.emit("data", "alpha\nstop\npartial-tail");
    spawnedProcess.stdout.emit("data", "late-arrival\n");
    spawnedProcess.emit("close", null, "SIGTERM");

    const result = await resultPromise;

    expect(deliveredLines).toEqual(["alpha", "stop"]);
    expect(spawnedProcess.kill).toHaveBeenCalledWith("SIGTERM");
    expect(result.terminatedEarly).toBe(true);
  });

  it("marks timed out streaming executions and kills the spawned process", async () => {
    vi.useFakeTimers();

    const command = createUgrepCommand();
    const spawnedProcess = createMockSpawnedProcess();

    ugrepRunnerTestState.mockedSpawn.mockReturnValue(spawnedProcess);

    const deliveredLines: string[] = [];
    const resultPromise = new UgrepRunner({ timeoutMs: 25 }).runSearchStreaming(
      command,
      (line) => {
        deliveredLines.push(line);
        return true;
      },
    );

    await vi.advanceTimersByTimeAsync(25);

    expect(spawnedProcess.kill).toHaveBeenCalledWith("SIGTERM");

    spawnedProcess.emit("close", null, "SIGTERM");

    const result = await resultPromise;

    expect(deliveredLines).toEqual([]);
    expect(result.timedOut).toBe(true);
    expect(result.terminatedEarly).toBe(false);
  });

  it("captures spawn errors on the streaming surface", async () => {
    const command = createUgrepCommand();
    const spawnedProcess = createMockSpawnedProcess();

    ugrepRunnerTestState.mockedSpawn.mockReturnValue(spawnedProcess);

    const resultPromise = runUgrepSearchStreaming(command, () => true);

    spawnedProcess.emit("error", new Error("spawn ENOENT"));
    spawnedProcess.emit("close", 1, null);

    const result = await resultPromise;

    expect(result.spawnErrorMessage).toBe("spawn ENOENT");
    expect(result.terminatedEarly).toBe(false);
  });

  it("kills a timed out buffered execution with the default signal when none is configured", async () => {
    vi.useFakeTimers();

    const command = createUgrepCommand();
    const spawnedProcess = createMockSpawnedProcess();

    ugrepRunnerTestState.mockedSpawn.mockReturnValue(spawnedProcess);

    const resultPromise = new UgrepRunner({ timeoutMs: 25 }).runSearch(command);

    await vi.advanceTimersByTimeAsync(25);

    expect(spawnedProcess.kill).toHaveBeenCalledWith("SIGTERM");

    spawnedProcess.emit("close", null, "SIGTERM");

    const result = await resultPromise;

    expect(result.timedOut).toBe(true);
  });

  it("rejects spawn-failure formatting when no spawn error was captured", () => {
    expect(() =>
      formatUgrepSpawnFailure({
        executable: "C:/tools/ugrep.exe",
        spawnErrorMessage: null,
      }),
    ).toThrow("formatUgrepSpawnFailure requires a captured spawnErrorMessage.");
  });
});
