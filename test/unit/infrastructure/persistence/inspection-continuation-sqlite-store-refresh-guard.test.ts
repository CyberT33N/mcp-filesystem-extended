import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INSPECTION_CONTINUATION_STATUSES } from "@domain/shared/continuation/inspection-continuation-contract";

/**
 * Hoisted node:sqlite mock state used to simulate a session row that disappears
 * between the access-timestamp touch and the refreshed re-read.
 */
const continuationRefreshGuardMockState: {
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
      continuationRefreshGuardMockState.selectGetCallCount += 1;

      return continuationRefreshGuardMockState.selectGetCallCount === 1
        ? continuationRefreshGuardMockState.sessionRow
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

import { InspectionContinuationSqliteStore } from "@infrastructure/persistence/inspection-continuation-sqlite-store";

describe("inspection_continuation_sqlite_store refresh guard", () => {
  let sandboxRootPath = "";
  let databasePath = "";

  beforeEach(async () => {
    continuationRefreshGuardMockState.selectGetCallCount = 0;
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-continuation-refresh-guard-"));
    databasePath = join(sandboxRootPath, "inspection-continuations.sqlite");
    continuationRefreshGuardMockState.sessionRow = {
      continuation_token: "inscont_refresh-guard",
      endpoint_name: "count_lines",
      family_member: "count-lines",
      request_payload_json: "{}",
      continuation_state_json: "{}",
      admission_outcome: "PREVIEW_FIRST",
      status: INSPECTION_CONTINUATION_STATUSES.ACTIVE,
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
    const store = new InspectionContinuationSqliteStore(databasePath);

    try {
      expect(
        store.loadActiveSession(
          "inscont_refresh-guard",
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
