import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  INSPECTION_CONTINUATION_ADMISSION_OUTCOMES,
} from "@domain/shared/continuation/inspection-continuation-contract";
import { InspectionContinuationSqliteStore } from "@infrastructure/persistence/inspection-continuation-sqlite-store";

describe("inspection_continuation_sqlite_store", () => {
  let sandboxRootPath = "";
  let databasePath = "";
  let stores: InspectionContinuationSqliteStore[] = [];

  function createStore(): InspectionContinuationSqliteStore {
    const store = new InspectionContinuationSqliteStore(databasePath);
    stores.push(store);
    return store;
  }

  beforeEach(async () => {
    stores = [];
    sandboxRootPath = await mkdtemp(
      join(tmpdir(), "mcp-fs-inspection-continuation-store-"),
    );
    databasePath = join(sandboxRootPath, "inspection-continuations.sqlite");
  });

  afterEach(async () => {
    for (const store of stores) {
      store.close();
    }

    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("creates, updates, and reloads active continuation sessions from the SQLite store", () => {
    const store = createStore();
    const createdAt = new Date("2026-05-01T00:00:00.000Z");
    const updatedAt = new Date("2026-05-02T00:00:00.000Z");
    const createdSession = store.createSession(
      {
        admissionOutcome:
          INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
        continuationState: { offset: 1 },
        endpointName: "search_file_contents_by_fixed_string",
        familyMember: "fixed-string-search",
        requestPayload: { roots: ["src"] },
      },
      createdAt,
    );

    store.updateContinuationState(
      createdSession.continuationToken,
      { offset: 2 },
      updatedAt,
    );

    const loadedSession = store.loadActiveSession<{ roots: string[] }, { offset: number }>(
      createdSession.continuationToken,
      createdSession.endpointName,
      createdSession.familyMember,
      updatedAt,
    );

    expect(store.getDatabasePath()).toBe(databasePath);
    expect(loadedSession).toMatchObject({
      admissionOutcome:
        INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      continuationState: { offset: 2 },
      createdAt: createdAt.toISOString(),
      endpointName: "search_file_contents_by_fixed_string",
      familyMember: "fixed-string-search",
      lastAccessedAt: updatedAt.toISOString(),
      requestPayload: { roots: ["src"] },
    });
    expect(loadedSession?.continuationToken).toBe(createdSession.continuationToken);
    expect(loadedSession?.expiresAt).toBe("2026-06-01T00:00:00.000Z");
  });

  it("treats completed, cancelled, and expired continuation sessions as inactive", () => {
    const store = createStore();
    const createdAt = new Date("2026-01-01T00:00:00.000Z");

    const completedSession = store.createSession(
      {
        admissionOutcome:
          INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.TASK_BACKED_REQUIRED,
        continuationState: { page: 1 },
        endpointName: "list_directory_entries",
        familyMember: "directory-listing",
        requestPayload: { roots: ["src"] },
      },
      createdAt,
    );
    const cancelledSession = store.createSession(
      {
        admissionOutcome:
          INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
        continuationState: { page: 1 },
        endpointName: "search_file_contents_by_regex",
        familyMember: "regex-search",
        requestPayload: { roots: ["src"] },
      },
      createdAt,
    );
    const expiredSession = store.createSession(
      {
        admissionOutcome:
          INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
        continuationState: { page: 1 },
        endpointName: "find_files_by_glob",
        familyMember: "glob-discovery",
        requestPayload: { roots: ["src"] },
      },
      createdAt,
    );

    store.markSessionCompleted(
      completedSession.continuationToken,
      new Date("2026-01-03T00:00:00.000Z"),
    );
    store.markSessionCancelled(
      cancelledSession.continuationToken,
      new Date("2026-01-04T00:00:00.000Z"),
    );

    expect(
      store.loadActiveSession(
        completedSession.continuationToken,
        completedSession.endpointName,
        completedSession.familyMember,
        new Date("2026-01-05T00:00:00.000Z"),
      ),
    ).toBeNull();
    expect(
      store.loadActiveSession(
        cancelledSession.continuationToken,
        cancelledSession.endpointName,
        cancelledSession.familyMember,
        new Date("2026-01-05T00:00:00.000Z"),
      ),
    ).toBeNull();
    expect(
      store.loadActiveSession(
        expiredSession.continuationToken,
        expiredSession.endpointName,
        expiredSession.familyMember,
        new Date("2026-02-05T00:00:00.000Z"),
      ),
    ).toBeNull();
    expect(store.cleanupExpiredSessions(new Date("2026-02-15T00:00:00.000Z"))).toBe(3);
  });
});
