import { EventEmitter } from "node:events";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockedAccess,
  mockedSpawn,
  mockedStat,
} = vi.hoisted(() => ({
  mockedAccess: vi.fn(),
  mockedSpawn: vi.fn(),
  mockedStat: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    access: mockedAccess,
    stat: mockedStat,
  },
}));

vi.mock("node:child_process", () => ({
  spawn: mockedSpawn,
}));

import {
  getRequiredUgrepExecutablePath,
  getUgrepRuntimeDependency,
  initializeUgrepRuntimeDependency,
  resolveUgrepRuntimeDependency,
} from "@infrastructure/runtime/ugrep-runtime-dependency";

/**
 * Minimal child-process test double for the shell-free startup probe surface.
 */
interface FakeChildProcess {
  readonly stderr: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
  readonly kill: ReturnType<typeof vi.fn>;
  readonly on: EventEmitter["on"];
  readonly emit: EventEmitter["emit"];
}

const createFakeChildProcess = (): FakeChildProcess => {
  const stderrEmitter = new EventEmitter() as EventEmitter & {
    setEncoding: ReturnType<typeof vi.fn>;
  };
  stderrEmitter.setEncoding = vi.fn();

  const child = new EventEmitter() as EventEmitter & {
    stderr: typeof stderrEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stderr = stderrEmitter;
  child.kill = vi.fn();

  return child;
};

const resolveWithExitCode = (exitCode: number, stderrText = ""): void => {
  mockedSpawn.mockImplementation(() => {
    const child = createFakeChildProcess();

    queueMicrotask(() => {
      if (stderrText !== "") {
        child.stderr.emit("data", stderrText);
      }

      child.emit("close", exitCode);
    });

    return child;
  });
};

describe("ugrep_runtime_dependency", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedAccess.mockResolvedValue(undefined);
    mockedStat.mockResolvedValue({ isFile: () => true });
    resolveWithExitCode(0);
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: originalPlatform,
    });
    vi.useRealTimers();
  });

  it("resolves an absolute environment override through a successful startup probe", async () => {
    const dependency = await resolveUgrepRuntimeDependency({
      env: { UGREP_EXECUTABLE_PATH: "C:/tools/ugrep.exe" },
    });

    expect(dependency).toEqual({
      executablePath: "C:\\tools\\ugrep.exe",
      resolutionSource: "environment_override",
    });
    expect(mockedSpawn).toHaveBeenCalledWith(
      "C:\\tools\\ugrep.exe",
      ["--version"],
      expect.objectContaining({ shell: false }),
    );
  });

  it("resolves a relative environment override against the supplied working directory", async () => {
    const dependency = await resolveUgrepRuntimeDependency({
      cwd: "C:/tools",
      env: { UGREP_EXECUTABLE_PATH: "bin/ugrep.exe" },
    });

    expect(dependency.executablePath).toBe("C:\\tools\\bin\\ugrep.exe");
    expect(dependency.resolutionSource).toBe("environment_override");
  });

  it("rejects a Windows shell-proxy override before any launch attempt", async () => {
    await expect(
      resolveUgrepRuntimeDependency({
        env: { UGREP_EXECUTABLE_PATH: "C:/tools/ugrep.cmd" },
      }),
    ).rejects.toThrow("is a shell proxy");

    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it("rejects an override whose path cannot be read", async () => {
    mockedAccess.mockRejectedValueOnce(
      Object.assign(new Error("no such file"), { code: "ENOENT" }),
    );

    await expect(
      resolveUgrepRuntimeDependency({
        env: { UGREP_EXECUTABLE_PATH: "C:/tools/ugrep.exe" },
      }),
    ).rejects.toThrow("could not use it");
  });

  it("rejects an override whose path is not a regular file", async () => {
    mockedStat.mockResolvedValueOnce({ isFile: () => false });

    await expect(
      resolveUgrepRuntimeDependency({
        env: { UGREP_EXECUTABLE_PATH: "C:/tools/ugrep.exe" },
      }),
    ).rejects.toThrow("is not a regular file");
  });

  it("rejects an override whose startup probe fails to launch", async () => {
    mockedSpawn.mockImplementation(() => {
      const child = createFakeChildProcess();

      queueMicrotask(() => {
        child.emit("error", new Error("spawn ENOENT"));
        child.emit("close", -2);
      });

      return child;
    });

    await expect(
      resolveUgrepRuntimeDependency({
        env: { UGREP_EXECUTABLE_PATH: "C:/tools/ugrep.exe" },
      }),
    ).rejects.toThrow("could not be launched shell-free");
  });

  it("rejects an override whose startup probe exits non-zero with stderr evidence", async () => {
    resolveWithExitCode(1, "ugrep: unrecognized option");

    await expect(
      resolveUgrepRuntimeDependency({
        env: { UGREP_EXECUTABLE_PATH: "C:/tools/ugrep.exe" },
      }),
    ).rejects.toThrow("failed startup probe '--version': ugrep: unrecognized option");
  });

  it("rejects an override whose startup probe exits non-zero without stderr evidence", async () => {
    resolveWithExitCode(1);

    await expect(
      resolveUgrepRuntimeDependency({
        env: { UGREP_EXECUTABLE_PATH: "C:/tools/ugrep.exe" },
      }),
    ).rejects.toThrow("failed startup probe '--version' with exit code 1");
  });

  it("rejects an override whose startup probe exceeds the probe timeout", async () => {
    vi.useFakeTimers();

    let spawnedChild: FakeChildProcess | null = null;
    mockedSpawn.mockImplementation(() => {
      spawnedChild = createFakeChildProcess();
      return spawnedChild;
    });

    const pendingResolution = resolveUgrepRuntimeDependency({
      env: { UGREP_EXECUTABLE_PATH: "C:/tools/ugrep.exe" },
    });

    await vi.advanceTimersByTimeAsync(5_000);
    spawnedChild?.emit("close", null);

    await expect(pendingResolution).rejects.toThrow("did not complete startup probe");
  });

  it("stringifies non-Error override validation failures", async () => {
    mockedAccess.mockRejectedValueOnce("raw access failure");

    await expect(
      resolveUgrepRuntimeDependency({
        env: { UGREP_EXECUTABLE_PATH: "C:/tools/ugrep.exe" },
      }),
    ).rejects.toThrow("raw access failure");
  });

  it("resolves the first launchable PATH candidate after skipping unusable candidates", async () => {
    mockedAccess.mockImplementation(async (candidatePath: string) => {
      if (candidatePath === "C:\\bin\\ugrep.exe") {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      }

      return undefined;
    });

    const dependency = await resolveUgrepRuntimeDependency({
      env: { PATH: 'C:\\bin;"C:\\tools";C:\\bin' },
    });

    expect(dependency).toEqual({
      executablePath: "C:\\tools\\ugrep.exe",
      resolutionSource: "process_path",
    });
  });

  it("reads the PATH surface case-insensitively and fails closed when no candidate launches", async () => {
    mockedAccess.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));

    await expect(
      resolveUgrepRuntimeDependency({
        env: { path: "C:\\bin" },
      }),
    ).rejects.toThrow("Unable to resolve the required native 'ugrep' executable");
  });

  it("fails closed when the environment carries no PATH surface at all", async () => {
    await expect(resolveUgrepRuntimeDependency({ env: {} })).rejects.toThrow(
      "Unable to resolve the required native 'ugrep' executable",
    );
  });

  it("fails closed when the PATH surface is blank whitespace", async () => {
    await expect(
      resolveUgrepRuntimeDependency({ env: { PATH: "   " } }),
    ).rejects.toThrow("Unable to resolve the required native 'ugrep' executable");
  });

  it("falls back to the process environment and working directory when no options are provided", async () => {
    const dependency = await resolveUgrepRuntimeDependency();

    expect(dependency.resolutionSource).toBe("process_path");
  });

  it("accepts a .cmd override on non-Windows platforms where the shell-proxy guard is inert", async () => {
    Object.defineProperty(process, "platform", { configurable: true, value: "linux" });

    const dependency = await resolveUgrepRuntimeDependency({
      env: { UGREP_EXECUTABLE_PATH: "/opt/tools/ugrep.cmd" },
    });

    expect(dependency.resolutionSource).toBe("environment_override");
    expect(mockedSpawn).toHaveBeenCalledOnce();
  });

  it("derives bare executable names from PATH on non-Windows platforms", async () => {
    Object.defineProperty(process, "platform", { configurable: true, value: "linux" });

    const dependency = await resolveUgrepRuntimeDependency({
      env: { PATH: "/usr/bin" },
    });

    expect(dependency.resolutionSource).toBe("process_path");
    expect(mockedSpawn).toHaveBeenCalledWith(
      path.resolve(path.join("/usr/bin", "ugrep")),
      ["--version"],
      expect.objectContaining({ shell: false }),
    );
  });

  it("returns the cached process-owned dependency for repeated initialization", async () => {
    vi.resetModules();
    const freshModule = await import("@infrastructure/runtime/ugrep-runtime-dependency");

    const first = await freshModule.initializeUgrepRuntimeDependency({
      env: { UGREP_EXECUTABLE_PATH: "C:/tools/ugrep.exe" },
    });
    const second = await freshModule.initializeUgrepRuntimeDependency();

    expect(second).toBe(first);
    expect(freshModule.getUgrepRuntimeDependency()).toBe(first);
    expect(freshModule.getRequiredUgrepExecutablePath()).toBe("C:\\tools\\ugrep.exe");
  });

  it("fails closed when the runtime dependency is read before initialization", async () => {
    vi.resetModules();
    const freshModule = await import("@infrastructure/runtime/ugrep-runtime-dependency");

    expect(() => freshModule.getUgrepRuntimeDependency()).toThrow("has not been initialized");
    expect(() => freshModule.getRequiredUgrepExecutablePath()).toThrow(
      "has not been initialized",
    );
  });
});
