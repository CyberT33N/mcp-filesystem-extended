import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hoisted logger mock state used by the inspection resume-session SQLite store tests.
 */
const inspectionResumeSessionStoreTestState = vi.hoisted(() => {
  const mockedInfo = vi.fn();
  const mockedWarn = vi.fn();

  return {
    mockedCreateModuleLogger: vi.fn(() => ({
      info: mockedInfo,
      warn: mockedWarn,
    })),
    mockedInfo,
    mockedWarn,
  };
});

vi.mock("@infrastructure/logging/logger", () => ({
  createModuleLogger:
    inspectionResumeSessionStoreTestState.mockedCreateModuleLogger,
}));

import {
  INSPECTION_RESUME_ADMISSION_OUTCOMES,
  INSPECTION_RESUME_MODES,
} from "@domain/shared/resume/inspection-resume-contract";
import { InspectionResumeSessionSqliteStore } from "@infrastructure/persistence/inspection-resume-session-sqlite-store";

describe("inspection_resume_session_sqlite_store", () => {
  const databasePath = ":memory:";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates, updates, and reloads active resume sessions with the latest requested resume mode", () => {
    const store = new InspectionResumeSessionSqliteStore(databasePath);
    const createdAt = new Date("2026-05-01T00:00:00.000Z");
    const updatedAt = new Date("2026-05-02T00:00:00.000Z");
    const createdSession = store.createSession(
      {
        admissionOutcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
        endpointName: "search_file_contents_by_regex",
        familyMember: "regex-search",
        lastRequestedResumeMode: INSPECTION_RESUME_MODES.NEXT_CHUNK,
        requestPayload: { roots: ["src"] },
        resumeState: { traversalCursor: "cursor:10" },
      },
      createdAt,
    );

    store.updateResumeState(
      createdSession.resumeToken,
      { traversalCursor: "cursor:20" },
      updatedAt,
      INSPECTION_RESUME_MODES.COMPLETE_RESULT,
    );

    const loadedSession = store.loadActiveSession<{ roots: string[] }, { traversalCursor: string }>(
      createdSession.resumeToken,
      createdSession.endpointName,
      createdSession.familyMember,
      updatedAt,
    );

    expect(store.getDatabasePath()).toBe(databasePath);
    expect(loadedSession).toMatchObject({
      admissionOutcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      createdAt: createdAt.toISOString(),
      endpointName: "search_file_contents_by_regex",
      familyMember: "regex-search",
      lastAccessedAt: updatedAt.toISOString(),
      lastRequestedResumeMode: INSPECTION_RESUME_MODES.COMPLETE_RESULT,
      requestPayload: { roots: ["src"] },
      resumeState: { traversalCursor: "cursor:20" },
    });
    expect(loadedSession?.resumeToken).toBe(createdSession.resumeToken);
    expect(loadedSession?.expiresAt).toBe("2026-06-01T00:00:00.000Z");
    expect(
      inspectionResumeSessionStoreTestState.mockedInfo,
    ).toHaveBeenCalled();
  });

  it("treats completed, cancelled, and expired resume sessions as inactive and logs warning transitions", () => {
    const store = new InspectionResumeSessionSqliteStore(databasePath);
    const createdAt = new Date("2026-01-01T00:00:00.000Z");

    const completedSession = store.createSession(
      {
        admissionOutcome:
          INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
        endpointName: "count_lines",
        familyMember: "count-lines",
        requestPayload: { roots: ["src"] },
        resumeState: { completed: false },
      },
      createdAt,
    );
    const cancelledSession = store.createSession(
      {
        admissionOutcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
        endpointName: "search_file_contents_by_fixed_string",
        familyMember: "fixed-string-search",
        requestPayload: { roots: ["src"] },
        resumeState: { completed: false },
      },
      createdAt,
    );
    const expiredSession = store.createSession(
      {
        admissionOutcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
        endpointName: "find_files_by_glob",
        familyMember: "glob-discovery",
        requestPayload: { roots: ["src"] },
        resumeState: { completed: false },
      },
      createdAt,
    );

    store.markSessionCompleted(
      completedSession.resumeToken,
      new Date("2026-01-03T00:00:00.000Z"),
    );
    store.markSessionCancelled(
      cancelledSession.resumeToken,
      new Date("2026-01-04T00:00:00.000Z"),
    );

    expect(
      store.loadActiveSession(
        completedSession.resumeToken,
        completedSession.endpointName,
        completedSession.familyMember,
        new Date("2026-01-05T00:00:00.000Z"),
      ),
    ).toBeNull();
    expect(
      store.loadActiveSession(
        cancelledSession.resumeToken,
        cancelledSession.endpointName,
        cancelledSession.familyMember,
        new Date("2026-01-05T00:00:00.000Z"),
      ),
    ).toBeNull();
    expect(
      store.loadActiveSession(
        expiredSession.resumeToken,
        expiredSession.endpointName,
        expiredSession.familyMember,
        new Date("2026-02-05T00:00:00.000Z"),
      ),
    ).toBeNull();
    expect(store.cleanupExpiredSessions(new Date("2026-02-15T00:00:00.000Z"))).toBe(3);
    expect(
      inspectionResumeSessionStoreTestState.mockedWarn,
    ).toHaveBeenCalled();
  });
});
