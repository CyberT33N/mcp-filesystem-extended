import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stores hoisted startup-boundary mocks for the public root entrypoint test.
 */
const rootEntrypointTestState = vi.hoisted(() => {
  const connect = vi.fn(async () => undefined);
  const filesystemServerConstructor = vi.fn(() => ({ connect }));
  const initializeLogger = vi.fn();
  const initializeUgrepRuntimeDependency = vi.fn(async () => undefined);

  return {
    connect,
    filesystemServerConstructor,
    initializeLogger,
    initializeUgrepRuntimeDependency,
  };
});

vi.mock("@application/server/filesystem-server", () => ({
  FilesystemServer: rootEntrypointTestState.filesystemServerConstructor,
}));

vi.mock("@infrastructure/logging/logger", () => ({
  initializeLogger: rootEntrypointTestState.initializeLogger,
}));

vi.mock("@infrastructure/runtime/ugrep-runtime-dependency", () => ({
  initializeUgrepRuntimeDependency:
    rootEntrypointTestState.initializeUgrepRuntimeDependency,
}));

describe("public_root_entrypoint", () => {
  let originalArgv: string[] = [];

  beforeEach(() => {
    originalArgv = [...process.argv];
    process.argv = ["node", "src/index.ts", "C:/allowed", "D:/allowed"];
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  it("initializes startup dependencies and connects the filesystem server with the allowed directories", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await import(
      pathToFileURL(
        resolve(dirname(fileURLToPath(import.meta.url)), "../../src/index.ts"),
      ).href
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(rootEntrypointTestState.initializeLogger).toHaveBeenCalledOnce();
    expect(
      rootEntrypointTestState.initializeUgrepRuntimeDependency,
    ).toHaveBeenCalledOnce();
    expect(rootEntrypointTestState.filesystemServerConstructor).toHaveBeenCalledWith([
      "C:/allowed",
      "D:/allowed",
    ]);
    expect(rootEntrypointTestState.connect).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
