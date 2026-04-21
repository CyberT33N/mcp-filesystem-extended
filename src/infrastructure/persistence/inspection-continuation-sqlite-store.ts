import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  INSPECTION_CONTINUATION_STATUSES,
  type InspectionContinuationSeed,
  type InspectionContinuationSessionRecord,
  type InspectionContinuationStatus,
} from "@domain/shared/continuation/inspection-continuation-contract";

const ACTIVE_TTL_DAYS = 30;
const TERMINAL_RETENTION_DAYS = 7;
const DATABASE_FILE_NAME = "inspection-continuations.sqlite";
const TABLE_NAME = "inspection_continuation_sessions";

interface InspectionContinuationRow {
  continuation_token: string;
  endpoint_name: string;
  family_member: string;
  request_payload_json: string;
  continuation_state_json: string;
  admission_outcome: string;
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
  row: InspectionContinuationRow,
): InspectionContinuationSessionRecord<TRequest, TState> {
  return {
    continuationToken: row.continuation_token,
    endpointName: row.endpoint_name,
    familyMember: row.family_member,
    requestPayload: JSON.parse(row.request_payload_json) as TRequest,
    continuationState: JSON.parse(row.continuation_state_json) as TState,
    admissionOutcome: row.admission_outcome as InspectionContinuationSessionRecord<TRequest, TState>["admissionOutcome"],
    status: row.status as InspectionContinuationStatus,
    createdAt: row.created_at,
    lastAccessedAt: row.last_accessed_at,
    expiresAt: row.expires_at,
  };
}

export class InspectionContinuationSqliteStore {
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
    seed: InspectionContinuationSeed<TRequest, TState>,
    now = new Date(),
  ): InspectionContinuationSessionRecord<TRequest, TState> {
    this.cleanupExpiredSessions(now);

    const continuationToken = `inscont_${randomUUID()}`;
    const createdAt = toIsoString(now);
    const expiresAt = toIsoString(addDays(now, ACTIVE_TTL_DAYS));
    const statement = this.database.prepare(
      `INSERT INTO ${TABLE_NAME} (
        continuation_token,
        endpoint_name,
        family_member,
        request_payload_json,
        continuation_state_json,
        admission_outcome,
        status,
        created_at,
        last_accessed_at,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    statement.run(
      continuationToken,
      seed.endpointName,
      seed.familyMember,
      JSON.stringify(seed.requestPayload),
      JSON.stringify(seed.continuationState),
      seed.admissionOutcome,
      INSPECTION_CONTINUATION_STATUSES.ACTIVE,
      createdAt,
      createdAt,
      expiresAt,
    );

    return {
      continuationToken,
      endpointName: seed.endpointName,
      familyMember: seed.familyMember,
      requestPayload: seed.requestPayload,
      continuationState: seed.continuationState,
      admissionOutcome: seed.admissionOutcome,
      status: INSPECTION_CONTINUATION_STATUSES.ACTIVE,
      createdAt,
      lastAccessedAt: createdAt,
      expiresAt,
    };
  }

  loadActiveSession<TRequest, TState>(
    continuationToken: string,
    endpointName: string,
    familyMember: string,
    now = new Date(),
  ): InspectionContinuationSessionRecord<TRequest, TState> | null {
    this.cleanupExpiredSessions(now);

    const statement = this.database.prepare(
      `SELECT * FROM ${TABLE_NAME}
       WHERE continuation_token = ? AND endpoint_name = ? AND family_member = ?`,
    );
    const row = statement.get(
      continuationToken,
      endpointName,
      familyMember,
    ) as InspectionContinuationRow | undefined;

    if (row === undefined) {
      return null;
    }

    if (row.status !== INSPECTION_CONTINUATION_STATUSES.ACTIVE) {
      return null;
    }

    if (Date.parse(row.expires_at) <= now.getTime()) {
      this.updateStatus(continuationToken, INSPECTION_CONTINUATION_STATUSES.EXPIRED, now);

      return null;
    }

    this.touchActiveSession(continuationToken, now);

    const refreshedRow = statement.get(
      continuationToken,
      endpointName,
      familyMember,
    ) as InspectionContinuationRow | undefined;

    if (refreshedRow === undefined) {
      return null;
    }

    return parseSessionRow<TRequest, TState>(refreshedRow);
  }

  touchActiveSession(continuationToken: string, now = new Date()): void {
    const touchedAt = toIsoString(now);
    const expiresAt = toIsoString(addDays(now, ACTIVE_TTL_DAYS));
    const statement = this.database.prepare(
      `UPDATE ${TABLE_NAME}
       SET last_accessed_at = ?, expires_at = ?
       WHERE continuation_token = ? AND status = ?`,
    );

    statement.run(
      touchedAt,
      expiresAt,
      continuationToken,
      INSPECTION_CONTINUATION_STATUSES.ACTIVE,
    );
  }

  updateContinuationState<TState>(
    continuationToken: string,
    continuationState: TState,
    now = new Date(),
  ): void {
    const touchedAt = toIsoString(now);
    const expiresAt = toIsoString(addDays(now, ACTIVE_TTL_DAYS));
    const statement = this.database.prepare(
      `UPDATE ${TABLE_NAME}
       SET continuation_state_json = ?, last_accessed_at = ?, expires_at = ?
       WHERE continuation_token = ? AND status = ?`,
    );

    statement.run(
      JSON.stringify(continuationState),
      touchedAt,
      expiresAt,
      continuationToken,
      INSPECTION_CONTINUATION_STATUSES.ACTIVE,
    );
  }

  markSessionCompleted(continuationToken: string, now = new Date()): void {
    this.updateStatus(continuationToken, INSPECTION_CONTINUATION_STATUSES.COMPLETED, now);
  }

  markSessionCancelled(continuationToken: string, now = new Date()): void {
    this.updateStatus(continuationToken, INSPECTION_CONTINUATION_STATUSES.CANCELLED, now);
  }

  private initializeSchema(): void {
    this.database.exec(
      `
        CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
          continuation_token TEXT PRIMARY KEY,
          endpoint_name TEXT NOT NULL,
          family_member TEXT NOT NULL,
          request_payload_json TEXT NOT NULL,
          continuation_state_json TEXT NOT NULL,
          admission_outcome TEXT NOT NULL,
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
    continuationToken: string,
    status: InspectionContinuationStatus,
    now = new Date(),
  ): void {
    const touchedAt = toIsoString(now);
    const expiresAt = toIsoString(addDays(now, TERMINAL_RETENTION_DAYS));
    const statement = this.database.prepare(
      `UPDATE ${TABLE_NAME}
       SET status = ?, last_accessed_at = ?, expires_at = ?
       WHERE continuation_token = ?`,
    );

    statement.run(status, touchedAt, expiresAt, continuationToken);
  }
}

