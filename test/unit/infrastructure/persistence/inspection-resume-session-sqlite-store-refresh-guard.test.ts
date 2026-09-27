import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INSPECTION_RESUME_STATUSES } from "@domain/shared/resume/inspection-resume-contract";

/**
 * Hoisted node:sqlite mock state used to simulate a session row that disappears
 * between the access-timestamp touch and the refreshed re-read.
 */
const resumeRefreshGuardMockState: {
  selectGetCallCount: number;
  sessionRow?: Record<string, unknown>;
} = vi.hoisted(() => ({
  selectGetCallCount: 0,
}));

vi.mock("node:sqlite", () => {
  class FakeStatementSync {
    public run(): { changes: number } {
      return { changes: 1 };
    }

    public get(): unknown {
      resumeRefreshGuardMockState.selectGetCallCount += 1;

      return resumeRefreshGuardMockState.selectGetCallCount === 1
        ? resumeRefreshGuardMockState.sessionRow
        : undefined;
    }
  }

  class FakeDatabaseSync {
    public exec(): void {}

    public prepare(): FakeStatementSync {
      return new FakeStatementSync();
    }

    public close(): void {}
  }

  return { DatabaseSync: FakeDatabaseSync };
});

vi.mock("@infrastructure/logging/logger", () => ({
  createModuleLogger: () => ({
    info: () => {},
    warn: () => {},
  }),
}));

import { InspectionResumeSessionSqliteStore } from "@infrastructure/persistence/inspection-resume-session-sqlite-store";

describe("inspection_resume_session_sqlite_store refresh guard", () => {
  let sandboxRootPath = "";
  let databasePath = "";

  beforeEach(async () => {
    resumeRefreshGuardMockState.selectGetCallCount = 0;
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-resume-refresh-guard-"));
    databasePath = join(sandboxRootPath, "inspection-resume-sessions.sqlite");
    resumeRefreshGuardMockState.sessionRow = {
      resume_token: "insresume_refresh-guard",
      endpoint_name: "count_lines",
      family_member: "count-lines",
      request_payload_json: "{}",
      resume_state_json: "{}",
      admission_outcome: "PREVIEW_FIRST",
      last_requested_resume_mode: null,
      status: INSPECTION_RESUME_STATUSES.ACTIVE,
      created_at: "2026-01-01T00:00:00.000Z",
      last_accessed_at: "2026-01-01T00:00:00.000Z",
      expires_at: "2099-01-01T00:00:00.000Z",
    };
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("returns null when the refreshed row disappears between the access touch and the re-read", () => {
    const store = new InspectionResumeSessionSqliteStore(databasePath);

    try {
      expect(
        store.loadActiveSession(
          "insresume_refresh-guard",
          "count_lines",
          "count-lines",
          new Date("2026-06-01T00:00:00.000Z"),
        ),
      ).toBeNull();
    } finally {
      store.close();
    }
  });
});
