import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { createModuleLogger } from "@infrastructure/logging/logger";
import {
  INSPECTION_RESUME_STATUSES,
  type InspectionResumeMode,
  type InspectionResumeSessionRecord,
  type InspectionResumeSessionSeed,
  type InspectionResumeStatus,
} from "@domain/shared/resume/inspection-resume-contract";

const ACTIVE_TTL_DAYS = 30;
const TERMINAL_RETENTION_DAYS = 7;
const DATABASE_FILE_NAME = "inspection-resume-sessions.sqlite";
const TABLE_NAME = "inspection_resume_sessions";

const logger = createModuleLogger("inspection-resume-session-sqlite-store");

interface InspectionResumeRow {
  resume_token: string;
  endpoint_name: string;
  family_member: string;
  request_payload_json: string;
  resume_state_json: string;
  admission_outcome: string;
  last_requested_resume_mode: string | null;
  status: string;
  created_at: string;
  last_accessed_at: string;
  expires_at: string;
}

function addDays(baseDate: Date, days: number): Date {
  return new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1_000);
}

function toIsoString(date: Date): string {
  return date.toISOString();
}

function resolveServerStateDirectory(): string {
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;

    if (localAppData !== undefined && localAppData !== "") {
      return path.join(localAppData, "mcp-filesystem-extended");
    }

    return path.join(homedir(), "AppData", "Local", "mcp-filesystem-extended");
  }

  if (process.platform === "darwin") {
    return path.join(homedir(), "Library", "Application Support", "mcp-filesystem-extended");
  }

  const xdgStateHome = process.env.XDG_STATE_HOME;

  if (xdgStateHome !== undefined && xdgStateHome !== "") {
    return path.join(xdgStateHome, "mcp-filesystem-extended");
  }

  return path.join(homedir(), ".local", "state", "mcp-filesystem-extended");
}

function resolveDefaultDatabasePath(): string {
  return path.join(resolveServerStateDirectory(), DATABASE_FILE_NAME);
}

function parseSessionRow<TRequest, TState>(
  row: InspectionResumeRow,
): InspectionResumeSessionRecord<TRequest, TState> {
  return {
    resumeToken: row.resume_token,
    endpointName: row.endpoint_name,
    familyMember: row.family_member,
    requestPayload: JSON.parse(row.request_payload_json) as TRequest,
    resumeState: JSON.parse(row.resume_state_json) as TState,
    admissionOutcome: row.admission_outcome as InspectionResumeSessionRecord<TRequest, TState>["admissionOutcome"],
    lastRequestedResumeMode: row.last_requested_resume_mode as InspectionResumeMode | null,
    status: row.status as InspectionResumeStatus,
    createdAt: row.created_at,
    lastAccessedAt: row.last_accessed_at,
    expiresAt: row.expires_at,
  };
}

export class InspectionResumeSessionSqliteStore {
  private readonly database: DatabaseSync;
  private readonly databasePath: string;

  constructor(databasePath = resolveDefaultDatabasePath()) {
    this.databasePath = databasePath;
    mkdirSync(path.dirname(this.databasePath), { recursive: true });
    this.database = new DatabaseSync(this.databasePath, {
      allowExtension: false,
      defensive: true,
      enableForeignKeyConstraints: true,
      timeout: 1_000,
    });
    this.initializeSchema();
  }

  getDatabasePath(): string {
    return this.databasePath;
  }

  cleanupExpiredSessions(now = new Date()): number {
    const statement = this.database.prepare(
      `DELETE FROM ${TABLE_NAME} WHERE expires_at <= ?`,
    );
    const result = statement.run(toIsoString(now));

    return Number(result.changes);
  }

  createSession<TRequest, TState>(
    seed: InspectionResumeSessionSeed<TRequest, TState>,
    now = new Date(),
  ): InspectionResumeSessionRecord<TRequest, TState> {
    this.cleanupExpiredSessions(now);

    const resumeToken = `insresume_${randomUUID()}`;
    const createdAt = toIsoString(now);
    const expiresAt = toIsoString(addDays(now, ACTIVE_TTL_DAYS));
    const statement = this.database.prepare(
      `INSERT INTO ${TABLE_NAME} (
        resume_token,
        endpoint_name,
        family_member,
        request_payload_json,
        resume_state_json,
        admission_outcome,
        last_requested_resume_mode,
        status,
        created_at,
        last_accessed_at,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    statement.run(
      resumeToken,
      seed.endpointName,
      seed.familyMember,
      JSON.stringify(seed.requestPayload),
      JSON.stringify(seed.resumeState),
      seed.admissionOutcome,
      seed.lastRequestedResumeMode ?? null,
      INSPECTION_RESUME_STATUSES.ACTIVE,
      createdAt,
      createdAt,
      expiresAt,
    );

    logger.info(
      {
        resumeToken,
        endpointName: seed.endpointName,
        familyMember: seed.familyMember,
        admissionOutcome: seed.admissionOutcome,
        expiresAt,
        databasePath: this.databasePath,
      },
      "Resume session created",
    );

    return {
      resumeToken,
      endpointName: seed.endpointName,
      familyMember: seed.familyMember,
      requestPayload: seed.requestPayload,
      resumeState: seed.resumeState,
      admissionOutcome: seed.admissionOutcome,
      lastRequestedResumeMode: seed.lastRequestedResumeMode ?? null,
      status: INSPECTION_RESUME_STATUSES.ACTIVE,
      createdAt,
      lastAccessedAt: createdAt,
      expiresAt,
    };
  }

  loadActiveSession<TRequest, TState>(
    resumeToken: string,
    endpointName: string,
    familyMember: string,
    now = new Date(),
  ): InspectionResumeSessionRecord<TRequest, TState> | null {
    this.cleanupExpiredSessions(now);

    logger.info({ resumeToken, endpointName, familyMember, databasePath: this.databasePath }, "Resume session lookup requested");

    const statement = this.database.prepare(
      `SELECT * FROM ${TABLE_NAME}
       WHERE resume_token = ? AND endpoint_name = ? AND family_member = ?`,
    );
    const row = statement.get(
      resumeToken,
      endpointName,
      familyMember,
    ) as InspectionResumeRow | undefined;

    if (row === undefined) {
      logger.warn(
        { resumeToken, endpointName, familyMember, databasePath: this.databasePath },
        "Resume session not found in database — token may originate from a different server process or database file",
      );
      return null;
    }

    if (row.status !== INSPECTION_RESUME_STATUSES.ACTIVE) {
      logger.warn(
        { resumeToken, endpointName, familyMember, status: row.status, databasePath: this.databasePath },
        "Resume session found but status is not active — session may have been completed, cancelled, or expired in a prior call",
      );
      return null;
    }

    if (Date.parse(row.expires_at) <= now.getTime()) {
      logger.warn(
        { resumeToken, endpointName, familyMember, expiresAt: row.expires_at, databasePath: this.databasePath },
        "Resume session found but has expired — marking as expired and returning null",
      );
      this.updateStatus(resumeToken, INSPECTION_RESUME_STATUSES.EXPIRED, now);

      return null;
    }

    logger.info(
      { resumeToken, endpointName, familyMember, status: row.status, expiresAt: row.expires_at, databasePath: this.databasePath },
      "Resume session found and active — refreshing access timestamp",
    );
    this.touchActiveSession(resumeToken, now);

    const refreshedRow = statement.get(
      resumeToken,
      endpointName,
      familyMember,
    ) as InspectionResumeRow | undefined;

    if (refreshedRow === undefined) {
      return null;
    }

    return parseSessionRow<TRequest, TState>(refreshedRow);
  }

  touchActiveSession(resumeToken: string, now = new Date()): void {
    const touchedAt = toIsoString(now);
    const expiresAt = toIsoString(addDays(now, ACTIVE_TTL_DAYS));
    const statement = this.database.prepare(
      `UPDATE ${TABLE_NAME}
       SET last_accessed_at = ?, expires_at = ?
       WHERE resume_token = ? AND status = ?`,
    );

    statement.run(
      touchedAt,
      expiresAt,
      resumeToken,
      INSPECTION_RESUME_STATUSES.ACTIVE,
    );
  }

  updateResumeState<TState>(
    resumeToken: string,
    resumeState: TState,
    now = new Date(),
    lastRequestedResumeMode: InspectionResumeMode | null = null,
  ): void {
    const touchedAt = toIsoString(now);
    const expiresAt = toIsoString(addDays(now, ACTIVE_TTL_DAYS));
    const statement = this.database.prepare(
      `UPDATE ${TABLE_NAME}
       SET resume_state_json = ?, last_requested_resume_mode = ?, last_accessed_at = ?, expires_at = ?
       WHERE resume_token = ? AND status = ?`,
    );

    logger.info({ resumeToken, lastRequestedResumeMode }, "Resume session state updated with new traversal progress");

    statement.run(
      JSON.stringify(resumeState),
      lastRequestedResumeMode,
      touchedAt,
      expiresAt,
      resumeToken,
      INSPECTION_RESUME_STATUSES.ACTIVE,
    );
  }

  markSessionCompleted(resumeToken: string, now = new Date()): void {
    logger.info({ resumeToken }, "Resume session marked as completed");
    this.updateStatus(resumeToken, INSPECTION_RESUME_STATUSES.COMPLETED, now);
  }

  markSessionCancelled(resumeToken: string, now = new Date()): void {
    logger.info({ resumeToken }, "Resume session marked as cancelled");
    this.updateStatus(resumeToken, INSPECTION_RESUME_STATUSES.CANCELLED, now);
  }

  private initializeSchema(): void {
    this.database.exec(
      `
        CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
          resume_token TEXT PRIMARY KEY,
          endpoint_name TEXT NOT NULL,
          family_member TEXT NOT NULL,
          request_payload_json TEXT NOT NULL,
          resume_state_json TEXT NOT NULL,
          admission_outcome TEXT NOT NULL,
          last_requested_resume_mode TEXT,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          last_accessed_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        ) STRICT;
        CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_status_expires_at
          ON ${TABLE_NAME} (status, expires_at);
        CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_endpoint_family_status
          ON ${TABLE_NAME} (endpoint_name, family_member, status);
      `,
    );
  }

  private updateStatus(
    resumeToken: string,
    status: InspectionResumeStatus,
    now = new Date(),
  ): void {
    const touchedAt = toIsoString(now);
    const expiresAt = toIsoString(addDays(now, TERMINAL_RETENTION_DAYS));
    const statement = this.database.prepare(
      `UPDATE ${TABLE_NAME}
       SET status = ?, last_accessed_at = ?, expires_at = ?
       WHERE resume_token = ?`,
    );

    statement.run(status, touchedAt, expiresAt, resumeToken);
  }
}
