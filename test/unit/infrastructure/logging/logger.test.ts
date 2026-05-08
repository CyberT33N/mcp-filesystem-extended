import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const loggerTestState = vi.hoisted(() => ({
  child: vi.fn(),
  destination: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  pinoFactory: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("pino", () => {
  const mockedPino = Object.assign(loggerTestState.pinoFactory, {
    destination: loggerTestState.destination,
    stdTimeFunctions: {
      isoTime: "isoTime",
    },
  });

  return {
    default: mockedPino,
  };
});

vi.mock("fs", () => ({
  default: {
    existsSync: loggerTestState.existsSync,
    mkdirSync: loggerTestState.mkdirSync,
    writeFileSync: loggerTestState.writeFileSync,
  },
  existsSync: loggerTestState.existsSync,
  mkdirSync: loggerTestState.mkdirSync,
  writeFileSync: loggerTestState.writeFileSync,
}));

describe("logger", () => {
  beforeEach(() => {
    vi.resetModules();
    loggerTestState.child.mockReset();
    loggerTestState.destination.mockReset();
    loggerTestState.existsSync.mockReset();
    loggerTestState.mkdirSync.mockReset();
    loggerTestState.pinoFactory.mockReset();
    loggerTestState.writeFileSync.mockReset();

    loggerTestState.child.mockImplementation((bindings) => ({ bindings }));
    loggerTestState.destination.mockImplementation((destination) => ({ destination }));
    loggerTestState.existsSync.mockReturnValue(true);
    loggerTestState.mkdirSync.mockImplementation(() => undefined);
    loggerTestState.pinoFactory.mockReturnValue({ child: loggerTestState.child });
    loggerTestState.writeFileSync.mockImplementation(() => undefined);
  });

  it("creates the logs directory when it is missing and binds child loggers to the requested module", async () => {
    loggerTestState.existsSync.mockReturnValue(false);

    const loggerModule = await import("@infrastructure/logging/logger");
    const projectRootPath = path.resolve(process.cwd());
    const logsDirectoryPath = path.join(projectRootPath, "logs");
    const logFilePath = path.join(logsDirectoryPath, "log.txt");

    loggerModule.initializeLogger();

    expect(loggerTestState.mkdirSync).toHaveBeenCalledWith(logsDirectoryPath, {
      recursive: true,
    });
    expect(loggerTestState.writeFileSync).toHaveBeenCalledWith(logFilePath, "", {
      flag: "w",
    });
    expect(loggerTestState.destination).toHaveBeenCalledWith({
      dest: logFilePath,
      sync: false,
    });
    expect(loggerModule.createModuleLogger("filesystem")).toEqual({
      bindings: { module: "filesystem" },
    });
    expect(loggerTestState.child).toHaveBeenCalledWith({ module: "filesystem" });
  });

  it("falls back to stdout when the file destination cannot be created", async () => {
    loggerTestState.destination
      .mockImplementationOnce(() => {
        throw new Error("disk unavailable");
      })
      .mockImplementationOnce((destination) => ({ destination }));

    const loggerModule = await import("@infrastructure/logging/logger");

    loggerModule.initializeLogger();

    expect(loggerTestState.destination).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        dest: expect.stringContaining(path.join("logs", "log.txt")),
        sync: false,
      }),
    );
    expect(loggerTestState.destination).toHaveBeenNthCalledWith(2, 1);
  });
});
