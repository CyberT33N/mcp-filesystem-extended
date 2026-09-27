import { homedir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockedMkdirSync, mockedDatabaseExec } = vi.hoisted(() => ({
  mockedDatabaseExec: vi.fn(),
  mockedMkdirSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  mkdirSync: mockedMkdirSync,
}));

vi.mock("node:sqlite", () => ({
  DatabaseSync: vi.fn(() => ({
    close: vi.fn(),
    exec: mockedDatabaseExec,
  })),
}));

vi.mock("@infrastructure/logging/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

import { InspectionContinuationSqliteStore } from "@infrastructure/persistence/inspection-continuation-sqlite-store";
import { InspectionResumeSessionSqliteStore } from "@infrastructure/persistence/inspection-resume-session-sqlite-store";

describe("persistence store path resolution", () => {
  const originalPlatform = process.platform;
  let stores: Array<{ close(): void }> = [];

  beforeEach(() => {
    stores = [];
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: originalPlatform,
    });
    vi.unstubAllEnvs();

    for (const store of stores) {
      store.close();
    }
  });

  it("resolves the Windows state directory from LOCALAPPDATA when available", () => {
    vi.stubEnv("LOCALAPPDATA", "C:/mock-local-app-data");

    const continuationStore = new InspectionContinuationSqliteStore();
    const resumeStore = new InspectionResumeSessionSqliteStore();
    stores.push(continuationStore, resumeStore);

    expect(continuationStore.getDatabasePath()).toBe(
      join("C:/mock-local-app-data", "mcp-filesystem-extended", "inspection-continuations.sqlite"),
    );
    expect(resumeStore.getDatabasePath()).toBe(
      join("C:/mock-local-app-data", "mcp-filesystem-extended", "inspection-resume-sessions.sqlite"),
    );
  });

  it("falls back to the home-based Windows state directory when LOCALAPPDATA is empty", () => {
    vi.stubEnv("LOCALAPPDATA", "");

    const continuationStore = new InspectionContinuationSqliteStore();
    const resumeStore = new InspectionResumeSessionSqliteStore();
    stores.push(continuationStore, resumeStore);

    expect(continuationStore.getDatabasePath()).toBe(
      join(homedir(), "AppData", "Local", "mcp-filesystem-extended", "inspection-continuations.sqlite"),
    );
    expect(resumeStore.getDatabasePath()).toBe(
      join(homedir(), "AppData", "Local", "mcp-filesystem-extended", "inspection-resume-sessions.sqlite"),
    );
  });

  it("resolves the macOS state directory inside the user library", () => {
    Object.defineProperty(process, "platform", { configurable: true, value: "darwin" });

    const continuationStore = new InspectionContinuationSqliteStore();
    const resumeStore = new InspectionResumeSessionSqliteStore();
    stores.push(continuationStore, resumeStore);

    expect(continuationStore.getDatabasePath()).toBe(
      join(
        homedir(),
        "Library",
        "Application Support",
        "mcp-filesystem-extended",
        "inspection-continuations.sqlite",
      ),
    );
    expect(resumeStore.getDatabasePath()).toBe(
      join(
        homedir(),
        "Library",
        "Application Support",
        "mcp-filesystem-extended",
        "inspection-resume-sessions.sqlite",
      ),
    );
  });

  it("resolves the Linux state directory from XDG_STATE_HOME when available", () => {
    Object.defineProperty(process, "platform", { configurable: true, value: "linux" });
    vi.stubEnv("XDG_STATE_HOME", "/mock-xdg-state");

    const continuationStore = new InspectionContinuationSqliteStore();
    const resumeStore = new InspectionResumeSessionSqliteStore();
    stores.push(continuationStore, resumeStore);

    expect(continuationStore.getDatabasePath()).toBe(
      join("/mock-xdg-state", "mcp-filesystem-extended", "inspection-continuations.sqlite"),
    );
    expect(resumeStore.getDatabasePath()).toBe(
      join("/mock-xdg-state", "mcp-filesystem-extended", "inspection-resume-sessions.sqlite"),
    );
  });

  it("falls back to the home-based Linux state directory when XDG_STATE_HOME is empty", () => {
    Object.defineProperty(process, "platform", { configurable: true, value: "linux" });
    vi.stubEnv("XDG_STATE_HOME", "");

    const continuationStore = new InspectionContinuationSqliteStore();
    const resumeStore = new InspectionResumeSessionSqliteStore();
    stores.push(continuationStore, resumeStore);

    expect(continuationStore.getDatabasePath()).toBe(
      join(homedir(), ".local", "state", "mcp-filesystem-extended", "inspection-continuations.sqlite"),
    );
    expect(resumeStore.getDatabasePath()).toBe(
      join(homedir(), ".local", "state", "mcp-filesystem-extended", "inspection-resume-sessions.sqlite"),
    );
  });
});
