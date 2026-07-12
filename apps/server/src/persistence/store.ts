import { createHash } from "node:crypto";
import { chmodSync, createReadStream, mkdirSync } from "node:fs";
import {
  access,
  chmod,
  mkdir,
  open,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";
import { z } from "zod";

import {
  CommandIdSchema,
  DisplayNameSchema,
  EventIdSchema,
  MatchIdSchema,
  MatchLifecycleSchema,
  OfferIdSchema,
  ResolutionIdSchema,
  RoomCodeSchema,
  SeatIdSchema,
  SessionIdSchema,
  SessionRoleSchema,
  TimestampMsSchema,
} from "../../../../packages/protocol/src/primitives";
import {
  canonicalStringify,
  credentialHashMatches,
  hashCredential,
  parseStoredJson,
  sha256Hex,
} from "./canonical-json";
import { applyMigrations, currentSchemaVersion } from "./migrations";

interface MatchRow {
  match_id: string;
  room_code: string;
  lifecycle: "lobby" | "active" | "finished" | "archived";
  rules_version: string;
  rules_revision: number;
  rules_state_json: string;
  rules_state_hash: string;
  workflow_revision: number;
  workflow_json: string;
  workflow_hash: string;
  public_version: number;
  host_version: number;
  heartbeat_at_ms: number;
  created_at_ms: number;
  updated_at_ms: number;
}

interface SeatRow {
  match_id: string;
  seat_id: string;
  display_name: string;
  private_version: number;
  controller_epoch: number;
  writer_instance_id: string | null;
  writer_lease_hash: Buffer | null;
  joined_at_ms: number;
}

interface SessionRow {
  session_id: string;
  credential_hash: Buffer;
  role: "host" | "display" | "player";
  match_id: string;
  seat_id: string | null;
  session_epoch: number;
  expires_at_ms: number;
  last_seen_at_ms: number;
  revoked_at_ms: number | null;
}

interface ReceiptRow {
  request_hash: string;
  terminal_result_json: string;
  created_at_ms: number;
}

export interface MatchRecord<TRules, TWorkflow> {
  matchId: string;
  roomCode: string;
  lifecycle: "lobby" | "active" | "finished" | "archived";
  rulesVersion: string;
  rulesRevision: number;
  rulesState: TRules;
  rulesStateHash: string;
  workflowRevision: number;
  workflow: TWorkflow;
  workflowHash: string;
  publicVersion: number;
  hostVersion: number;
  heartbeatAtMs: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface SeatRecord {
  matchId: string;
  seatId: string;
  displayName: string;
  privateVersion: number;
  controllerEpoch: number;
  writerInstanceId: string | null;
  hasWriterLease: boolean;
  joinedAtMs: number;
}

export interface SessionRecord {
  sessionId: string;
  role: "host" | "display" | "player";
  matchId: string;
  seatId: string | null;
  sessionEpoch: number;
  expiresAtMs: number;
  lastSeenAtMs: number;
  revokedAtMs: number | null;
}

export interface CanonicalEventInput {
  eventId: string;
  eventType: string;
  payload: unknown;
  commandId?: string | null;
  createdAtMs?: number;
}

export interface CanonicalEventRecord extends CanonicalEventInput {
  matchId: string;
  eventSeq: number;
  rulesRevision: number;
  eventHash: string;
  createdAtMs: number;
}

export interface StoreOpenOptions<TRules, TWorkflow> {
  filename: string;
  rulesSchema: z.ZodType<TRules>;
  workflowSchema: z.ZodType<TWorkflow>;
  now?: () => number;
}

export interface CreateMatchInput<TRules, TWorkflow> {
  matchId: string;
  roomCode: string;
  lifecycle?: "lobby" | "active" | "finished" | "archived";
  rulesVersion: string;
  rulesState: TRules;
  workflow: TWorkflow;
  createdAtMs?: number;
}

export interface CommitMatchInput<TRules, TWorkflow> {
  matchId: string;
  expectedRulesRevision: number;
  expectedWorkflowRevision: number;
  rulesState: TRules;
  workflow: TWorkflow;
  lifecycle?: "lobby" | "active" | "finished" | "archived";
  publicVersion?: number;
  hostVersion?: number;
  heartbeatAtMs?: number;
  events?: readonly CanonicalEventInput[];
}

export interface BackupManifest {
  path: string;
  manifestPath: string;
  sha256: string;
  sizeBytes: number;
  schemaVersion: number;
  createdAtMs: number;
  quickCheck: "ok";
}

export class PersistenceConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PersistenceConflictError";
  }
}

export class IdempotencyKeyReuseError extends Error {
  public constructor() {
    super("Command ID was reused with a different request");
    this.name = "IdempotencyKeyReuseError";
  }
}

export class PersistenceIntegrityError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PersistenceIntegrityError";
  }
}

export class BlackwaterStore<TRules, TWorkflow> {
  readonly #database: Database.Database;
  readonly #rulesSchema: z.ZodType<TRules>;
  readonly #workflowSchema: z.ZodType<TWorkflow>;
  readonly #now: () => number;
  readonly #filename: string;
  #closed = false;

  private constructor(options: StoreOpenOptions<TRules, TWorkflow>) {
    this.#filename = options.filename;
    this.#rulesSchema = options.rulesSchema;
    this.#workflowSchema = options.workflowSchema;
    this.#now = options.now ?? Date.now;
    this.#database = new Database(options.filename, { timeout: 5_000 });
    this.#database.pragma("journal_mode = WAL");
    this.#database.pragma("synchronous = FULL");
    this.#database.pragma("foreign_keys = ON");
    this.#database.pragma("busy_timeout = 5000");
    this.#database.pragma("wal_autocheckpoint = 200");
    this.#database.pragma("trusted_schema = OFF");
    applyMigrations(this.#database, this.#now());
    if (options.filename !== ":memory:") chmodSync(options.filename, 0o600);
  }

  public static open<TRules, TWorkflow>(
    options: StoreOpenOptions<TRules, TWorkflow>,
  ): BlackwaterStore<TRules, TWorkflow> {
    if (options.filename !== ":memory:")
      mkdirSync(dirname(resolve(options.filename)), {
        recursive: true,
        mode: 0o700,
      });
    return new BlackwaterStore(options);
  }

  public static async openFile<TRules, TWorkflow>(
    options: StoreOpenOptions<TRules, TWorkflow>,
  ): Promise<BlackwaterStore<TRules, TWorkflow>> {
    return BlackwaterStore.open(options);
  }

  public get schemaVersion(): number {
    return currentSchemaVersion();
  }

  public pragmaState(): {
    journalMode: string;
    synchronous: number;
    foreignKeys: number;
    trustedSchema: number;
  } {
    this.#assertOpen();
    return {
      journalMode: String(
        this.#database.pragma("journal_mode", { simple: true }),
      ),
      synchronous: Number(
        this.#database.pragma("synchronous", { simple: true }),
      ),
      foreignKeys: Number(
        this.#database.pragma("foreign_keys", { simple: true }),
      ),
      trustedSchema: Number(
        this.#database.pragma("trusted_schema", { simple: true }),
      ),
    };
  }

  public createMatch(
    input: CreateMatchInput<TRules, TWorkflow>,
  ): MatchRecord<TRules, TWorkflow> {
    this.#assertOpen();
    const matchId = MatchIdSchema.parse(input.matchId);
    const roomCode = RoomCodeSchema.parse(input.roomCode);
    const lifecycle = MatchLifecycleSchema.parse(input.lifecycle ?? "lobby");
    const rulesVersion = z.string().min(1).max(64).parse(input.rulesVersion);
    const rulesState = this.#rulesSchema.parse(input.rulesState);
    const workflow = this.#workflowSchema.parse(input.workflow);
    const rulesStateJson = canonicalStringify(rulesState);
    const workflowJson = canonicalStringify(workflow);
    const createdAtMs = TimestampMsSchema.parse(
      input.createdAtMs ?? this.#now(),
    );

    const create = this.#database.transaction(() => {
      this.#database
        .prepare(
          `INSERT INTO matches (
            match_id, room_code, lifecycle, rules_version, rules_revision, rules_state_json,
            rules_state_hash, workflow_revision, workflow_json, workflow_hash, public_version,
            host_version, heartbeat_at_ms, created_at_ms, updated_at_ms
          ) VALUES (?, ?, ?, ?, 0, ?, ?, 0, ?, ?, 0, 0, ?, ?, ?)`,
        )
        .run(
          matchId,
          roomCode,
          lifecycle,
          rulesVersion,
          rulesStateJson,
          sha256Hex(rulesStateJson),
          workflowJson,
          sha256Hex(workflowJson),
          createdAtMs,
          createdAtMs,
          createdAtMs,
        );
      this.#database
        .prepare(
          `INSERT INTO snapshots (
            match_id, rules_revision, rules_state_json, rules_state_hash, last_event_seq, created_at_ms
          ) VALUES (?, 0, ?, ?, 0, ?)`,
        )
        .run(matchId, rulesStateJson, sha256Hex(rulesStateJson), createdAtMs);
    });
    create.immediate();
    return this.#requireMatch(matchId);
  }

  public getMatch(matchIdInput: string): MatchRecord<TRules, TWorkflow> | null {
    this.#assertOpen();
    const matchId = MatchIdSchema.parse(matchIdInput);
    const row = this.#database
      .prepare("SELECT * FROM matches WHERE match_id = ?")
      .get(matchId) as MatchRow | undefined;
    return row ? this.#deserializeMatch(row) : null;
  }

  public getMatchByRoomCode(
    roomCodeInput: string,
  ): MatchRecord<TRules, TWorkflow> | null {
    this.#assertOpen();
    const roomCode = RoomCodeSchema.parse(roomCodeInput);
    const row = this.#database
      .prepare("SELECT * FROM matches WHERE room_code = ?")
      .get(roomCode) as MatchRow | undefined;
    return row ? this.#deserializeMatch(row) : null;
  }

  public listMatches(
    lifecycles?: readonly MatchRecord<TRules, TWorkflow>["lifecycle"][],
  ): MatchRecord<TRules, TWorkflow>[] {
    this.#assertOpen();
    const rows = this.#database
      .prepare("SELECT * FROM matches ORDER BY created_at_ms")
      .all() as MatchRow[];
    const filter = lifecycles ? new Set(lifecycles) : null;
    return rows
      .filter((row) => !filter || filter.has(row.lifecycle))
      .map((row) => this.#deserializeMatch(row));
  }

  public commitMatch(
    input: CommitMatchInput<TRules, TWorkflow>,
  ): MatchRecord<TRules, TWorkflow> {
    this.#assertOpen();
    const matchId = MatchIdSchema.parse(input.matchId);
    const nextRules = this.#rulesSchema.parse(input.rulesState);
    const nextWorkflow = this.#workflowSchema.parse(input.workflow);
    const rulesJson = canonicalStringify(nextRules);
    const workflowJson = canonicalStringify(nextWorkflow);
    const events = [...(input.events ?? [])];

    const commit = this.#database.transaction(() => {
      const current = this.#requireMatch(matchId);
      if (
        current.rulesRevision !== input.expectedRulesRevision ||
        current.workflowRevision !== input.expectedWorkflowRevision
      ) {
        throw new PersistenceConflictError(
          "Match aggregate revisions are stale",
        );
      }

      const rulesHash = sha256Hex(rulesJson);
      const workflowHash = sha256Hex(workflowJson);
      const rulesChanged = rulesHash !== current.rulesStateHash;
      const workflowChanged = workflowHash !== current.workflowHash;
      if (rulesChanged !== events.length > 0) {
        throw new PersistenceIntegrityError(
          rulesChanged
            ? "A rules-state mutation requires at least one canonical event"
            : "Canonical events cannot be appended without a rules-state mutation",
        );
      }

      const rulesRevision = current.rulesRevision + (rulesChanged ? 1 : 0);
      const workflowRevision =
        current.workflowRevision + (workflowChanged ? 1 : 0);
      const publicVersion = input.publicVersion ?? current.publicVersion;
      const hostVersion = input.hostVersion ?? current.hostVersion;
      if (
        publicVersion < current.publicVersion ||
        hostVersion < current.hostVersion
      ) {
        throw new PersistenceConflictError(
          "Projection versions cannot move backwards",
        );
      }
      const lifecycle = MatchLifecycleSchema.parse(
        input.lifecycle ?? current.lifecycle,
      );
      const nowMs = TimestampMsSchema.parse(input.heartbeatAtMs ?? this.#now());

      this.#database
        .prepare(
          `UPDATE matches SET
            lifecycle = ?, rules_revision = ?, rules_state_json = ?, rules_state_hash = ?,
            workflow_revision = ?, workflow_json = ?, workflow_hash = ?, public_version = ?,
            host_version = ?, heartbeat_at_ms = ?, updated_at_ms = ?
          WHERE match_id = ?`,
        )
        .run(
          lifecycle,
          rulesRevision,
          rulesJson,
          rulesHash,
          workflowRevision,
          workflowJson,
          workflowHash,
          publicVersion,
          hostVersion,
          nowMs,
          nowMs,
          matchId,
        );

      if (events.length > 0)
        this.#appendEventsRaw(matchId, rulesRevision, events, nowMs);
    });
    commit.immediate();
    return this.#requireMatch(matchId);
  }

  public createSnapshot(matchIdInput: string, createdAtMs = this.#now()): void {
    this.#assertOpen();
    const match = this.#requireMatch(MatchIdSchema.parse(matchIdInput));
    const lastEvent = this.#database
      .prepare(
        "SELECT COALESCE(MAX(event_seq), 0) AS event_seq FROM match_events WHERE match_id = ?",
      )
      .get(match.matchId) as { event_seq: number };
    this.#database
      .prepare(
        `INSERT INTO snapshots (
          match_id, rules_revision, rules_state_json, rules_state_hash, last_event_seq, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        match.matchId,
        match.rulesRevision,
        canonicalStringify(match.rulesState),
        match.rulesStateHash,
        lastEvent.event_seq,
        TimestampMsSchema.parse(createdAtMs),
      );
  }

  public listEvents(
    matchIdInput: string,
    afterEventSeq = 0,
  ): CanonicalEventRecord[] {
    this.#assertOpen();
    const matchId = MatchIdSchema.parse(matchIdInput);
    const rows = this.#database
      .prepare(
        "SELECT * FROM match_events WHERE match_id = ? AND event_seq > ? ORDER BY event_seq",
      )
      .all(
        matchId,
        z.number().int().nonnegative().parse(afterEventSeq),
      ) as Array<{
      match_id: string;
      event_seq: number;
      event_id: string;
      command_id: string | null;
      rules_revision: number;
      event_type: string;
      event_json: string;
      event_hash: string;
      created_at_ms: number;
    }>;
    return rows.map((row) => {
      if (sha256Hex(row.event_json) !== row.event_hash) {
        throw new PersistenceIntegrityError(
          `Event hash mismatch for ${row.match_id}:${row.event_seq}`,
        );
      }
      return {
        matchId: row.match_id,
        eventSeq: row.event_seq,
        eventId: row.event_id,
        eventType: row.event_type,
        payload: parseStoredJson(row.event_json),
        commandId: row.command_id,
        rulesRevision: row.rules_revision,
        eventHash: row.event_hash,
        createdAtMs: row.created_at_ms,
      };
    });
  }

  public upsertSeat(input: {
    matchId: string;
    seatId: string;
    displayName: string;
    privateVersion?: number;
    joinedAtMs?: number;
  }): SeatRecord {
    this.#assertOpen();
    const matchId = MatchIdSchema.parse(input.matchId);
    const seatId = SeatIdSchema.parse(input.seatId);
    const displayName = DisplayNameSchema.parse(input.displayName);
    const privateVersion = z
      .number()
      .int()
      .nonnegative()
      .parse(input.privateVersion ?? 0);
    const joinedAtMs = TimestampMsSchema.parse(input.joinedAtMs ?? this.#now());
    this.#database
      .prepare(
        `INSERT INTO seats (
          match_id, seat_id, display_name, private_version, controller_epoch, joined_at_ms
        ) VALUES (?, ?, ?, ?, 0, ?)
        ON CONFLICT (match_id, seat_id) DO UPDATE SET
          display_name = excluded.display_name,
          private_version = MAX(seats.private_version, excluded.private_version)`,
      )
      .run(matchId, seatId, displayName, privateVersion, joinedAtMs);
    return this.#requireSeat(matchId, seatId);
  }

  public setSeatPrivateVersion(
    matchIdInput: string,
    seatIdInput: string,
    expected: number,
    next: number,
  ): SeatRecord {
    this.#assertOpen();
    const matchId = MatchIdSchema.parse(matchIdInput);
    const seatId = SeatIdSchema.parse(seatIdInput);
    const result = this.#database
      .prepare(
        "UPDATE seats SET private_version = ? WHERE match_id = ? AND seat_id = ? AND private_version = ?",
      )
      .run(
        z.number().int().nonnegative().parse(next),
        matchId,
        seatId,
        z.number().int().nonnegative().parse(expected),
      );
    if (result.changes !== 1)
      throw new PersistenceConflictError(
        "Seat private projection version is stale",
      );
    return this.#requireSeat(matchId, seatId);
  }

  public rotateWriterLease(input: {
    matchId: string;
    seatId: string;
    clientInstanceId: string;
    writerLeaseId: string;
  }): SeatRecord {
    this.#assertOpen();
    const matchId = MatchIdSchema.parse(input.matchId);
    const seatId = SeatIdSchema.parse(input.seatId);
    const clientInstanceId = z
      .string()
      .min(3)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/)
      .parse(input.clientInstanceId);
    const leaseHash = hashCredential(input.writerLeaseId);
    const result = this.#database
      .prepare(
        `UPDATE seats SET
          controller_epoch = controller_epoch + 1,
          writer_instance_id = ?, writer_lease_hash = ?
        WHERE match_id = ? AND seat_id = ?`,
      )
      .run(clientInstanceId, leaseHash, matchId, seatId);
    if (result.changes !== 1) throw new Error("Seat not found");
    return this.#requireSeat(matchId, seatId);
  }

  public listSeats(matchIdInput: string): SeatRecord[] {
    this.#assertOpen();
    const matchId = MatchIdSchema.parse(matchIdInput);
    const rows = this.#database
      .prepare("SELECT * FROM seats WHERE match_id = ? ORDER BY seat_id")
      .all(matchId) as SeatRow[];
    return rows.map((row) => this.#deserializeSeat(row));
  }

  public verifyWriterLease(input: {
    matchId: string;
    seatId: string;
    clientInstanceId: string;
    writerLeaseId: string;
    controllerEpoch: number;
  }): boolean {
    this.#assertOpen();
    const row = this.#database
      .prepare(
        `SELECT controller_epoch, writer_instance_id, writer_lease_hash
         FROM seats WHERE match_id = ? AND seat_id = ?`,
      )
      .get(
        MatchIdSchema.parse(input.matchId),
        SeatIdSchema.parse(input.seatId),
      ) as
      | Pick<
          SeatRow,
          "controller_epoch" | "writer_instance_id" | "writer_lease_hash"
        >
      | undefined;
    if (!row?.writer_lease_hash) return false;
    if (
      row.controller_epoch !== input.controllerEpoch ||
      row.writer_instance_id !== input.clientInstanceId
    )
      return false;
    return credentialHashMatches(input.writerLeaseId, row.writer_lease_hash);
  }

  public createSession(input: {
    sessionId: string;
    credential: string;
    role: "host" | "display" | "player";
    matchId: string;
    seatId?: string | null;
    sessionEpoch?: number;
    expiresAtMs: number;
    lastSeenAtMs?: number;
  }): SessionRecord {
    this.#assertOpen();
    const sessionId = SessionIdSchema.parse(input.sessionId);
    const role = SessionRoleSchema.parse(input.role);
    const matchId = MatchIdSchema.parse(input.matchId);
    const seatId =
      input.seatId == null ? null : SeatIdSchema.parse(input.seatId);
    if ((role === "player") !== (seatId !== null))
      throw new TypeError("Only player sessions have a seat");
    const sessionEpoch = z
      .number()
      .int()
      .nonnegative()
      .parse(input.sessionEpoch ?? 0);
    const expiresAtMs = TimestampMsSchema.parse(input.expiresAtMs);
    const lastSeenAtMs = TimestampMsSchema.parse(
      input.lastSeenAtMs ?? this.#now(),
    );
    this.#database
      .prepare(
        `INSERT INTO sessions (
          session_id, credential_hash, role, match_id, seat_id, session_epoch,
          expires_at_ms, last_seen_at_ms, revoked_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        sessionId,
        hashCredential(input.credential),
        role,
        matchId,
        seatId,
        sessionEpoch,
        expiresAtMs,
        lastSeenAtMs,
      );
    return this.#requireSession(sessionId);
  }

  public getSessionByCredential(credential: string): SessionRecord | null {
    this.#assertOpen();
    const row = this.#database
      .prepare("SELECT * FROM sessions WHERE credential_hash = ?")
      .get(hashCredential(credential)) as SessionRow | undefined;
    return row ? this.#deserializeSession(row) : null;
  }

  public getSession(sessionIdInput: string): SessionRecord | null {
    this.#assertOpen();
    const sessionId = SessionIdSchema.parse(sessionIdInput);
    const row = this.#database
      .prepare("SELECT * FROM sessions WHERE session_id = ?")
      .get(sessionId) as SessionRow | undefined;
    return row ? this.#deserializeSession(row) : null;
  }

  public listSessions(matchIdInput: string): SessionRecord[] {
    this.#assertOpen();
    const rows = this.#database
      .prepare(
        "SELECT * FROM sessions WHERE match_id = ? ORDER BY last_seen_at_ms DESC",
      )
      .all(MatchIdSchema.parse(matchIdInput)) as SessionRow[];
    return rows.map((row) => this.#deserializeSession(row));
  }

  public touchSession(
    sessionIdInput: string,
    lastSeenAtMs = this.#now(),
  ): SessionRecord {
    this.#assertOpen();
    const sessionId = SessionIdSchema.parse(sessionIdInput);
    const result = this.#database
      .prepare("UPDATE sessions SET last_seen_at_ms = ? WHERE session_id = ?")
      .run(TimestampMsSchema.parse(lastSeenAtMs), sessionId);
    if (result.changes !== 1) throw new Error("Session not found");
    return this.#requireSession(sessionId);
  }

  public revokeSession(
    sessionIdInput: string,
    revokedAtMs = this.#now(),
  ): SessionRecord {
    this.#assertOpen();
    const sessionId = SessionIdSchema.parse(sessionIdInput);
    const result = this.#database
      .prepare(
        `UPDATE sessions
         SET revoked_at_ms = COALESCE(revoked_at_ms, ?), session_epoch = session_epoch + CASE WHEN revoked_at_ms IS NULL THEN 1 ELSE 0 END
         WHERE session_id = ?`,
      )
      .run(TimestampMsSchema.parse(revokedAtMs), sessionId);
    if (result.changes !== 1) throw new Error("Session not found");
    return this.#requireSession(sessionId);
  }

  public executeIdempotentCommand<TResult>(input: {
    matchId: string;
    sessionId: string;
    commandId: string;
    request: unknown;
    resultSchema: z.ZodType<TResult>;
    nowMs?: number;
    handler: (store: BlackwaterStore<TRules, TWorkflow>) => TResult;
  }): { disposition: "applied" | "duplicate"; result: TResult } {
    this.#assertOpen();
    const matchId = MatchIdSchema.parse(input.matchId);
    const sessionId = SessionIdSchema.parse(input.sessionId);
    const commandId = CommandIdSchema.parse(input.commandId);
    const requestJson = canonicalStringify(input.request);
    const requestHash = sha256Hex(requestJson);
    const nowMs = TimestampMsSchema.parse(input.nowMs ?? this.#now());

    const execute = this.#database.transaction(() => {
      const existing = this.#database
        .prepare(
          `SELECT request_hash, terminal_result_json, created_at_ms
           FROM command_receipts WHERE match_id = ? AND session_id = ? AND command_id = ?`,
        )
        .get(matchId, sessionId, commandId) as ReceiptRow | undefined;
      if (existing) {
        if (existing.request_hash !== requestHash)
          throw new IdempotencyKeyReuseError();
        return {
          disposition: "duplicate" as const,
          result: input.resultSchema.parse(
            parseStoredJson(existing.terminal_result_json),
          ),
        };
      }

      const session = this.#requireSession(sessionId);
      if (
        session.matchId !== matchId ||
        session.revokedAtMs !== null ||
        session.expiresAtMs <= nowMs
      ) {
        throw new PersistenceConflictError(
          "Session is not active for this match",
        );
      }
      const result = input.resultSchema.parse(input.handler(this));
      const resultJson = canonicalStringify(result);
      this.#database
        .prepare(
          `INSERT INTO command_receipts (
            match_id, session_id, command_id, request_hash, terminal_result_json, created_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(matchId, sessionId, commandId, requestHash, resultJson, nowMs);
      return { disposition: "applied" as const, result };
    });
    return execute.immediate();
  }

  public putRoundInput(input: {
    resolutionId: string;
    matchId: string;
    roundNumber: number;
    payload: unknown;
    createdAtMs?: number;
  }): string {
    this.#assertOpen();
    const resolutionId = ResolutionIdSchema.parse(input.resolutionId);
    const matchId = MatchIdSchema.parse(input.matchId);
    const payloadJson = canonicalStringify(input.payload);
    const payloadHash = sha256Hex(payloadJson);
    this.#database
      .prepare(
        `INSERT INTO round_inputs (
          resolution_id, match_id, round_number, status, input_json, input_hash, created_at_ms
        ) VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
      )
      .run(
        resolutionId,
        matchId,
        z.number().int().positive().max(20).parse(input.roundNumber),
        payloadJson,
        payloadHash,
        TimestampMsSchema.parse(input.createdAtMs ?? this.#now()),
      );
    return payloadHash;
  }

  public commitRoundInput(
    resolutionIdInput: string,
    outputHashInput: string,
    committedAtMs = this.#now(),
  ): void {
    this.#assertOpen();
    const resolutionId = ResolutionIdSchema.parse(resolutionIdInput);
    const outputHash = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(outputHashInput);
    const transaction = this.#database.transaction(() => {
      const row = this.#database
        .prepare(
          `SELECT status, output_hash, match_id, round_number
           FROM round_inputs WHERE resolution_id = ?`,
        )
        .get(resolutionId) as
        | {
            status: "pending" | "committed";
            output_hash: string | null;
            match_id: string;
            round_number: number;
          }
        | undefined;
      if (!row) throw new Error("Round input not found");
      if (row.status === "committed") {
        if (row.output_hash !== outputHash)
          throw new PersistenceConflictError("Resolution output hash differs");
      } else {
        this.#database
          .prepare(
            `UPDATE round_inputs SET status = 'committed', output_hash = ?, committed_at_ms = ?
             WHERE resolution_id = ? AND status = 'pending'`,
          )
          .run(
            outputHash,
            TimestampMsSchema.parse(committedAtMs),
            resolutionId,
          );
      }
      // A failed transition may have frozen the same deterministic round more
      // than once before the actor was paused. Once one result commits, those
      // sibling pending records can never be authoritative and only waste
      // storage/recovery work.
      this.#database
        .prepare(
          `DELETE FROM round_inputs
           WHERE match_id = ? AND round_number = ?
             AND status = 'pending' AND resolution_id <> ?`,
        )
        .run(row.match_id, row.round_number, resolutionId);
    });
    transaction.immediate();
  }

  public putResolutionBatch(input: {
    resolutionId: string;
    matchId: string;
    schemaVersion: number;
    payload: unknown;
    createdAtMs?: number;
  }): string {
    this.#assertOpen();
    const payloadJson = canonicalStringify(input.payload);
    const payloadHash = sha256Hex(payloadJson);
    this.#database
      .prepare(
        `INSERT INTO resolution_batches (
          resolution_id, match_id, schema_version, batch_json, batch_hash, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ResolutionIdSchema.parse(input.resolutionId),
        MatchIdSchema.parse(input.matchId),
        z.number().int().positive().parse(input.schemaVersion),
        payloadJson,
        payloadHash,
        TimestampMsSchema.parse(input.createdAtMs ?? this.#now()),
      );
    return payloadHash;
  }

  public listPendingRoundInputs(matchIdInput?: string): Array<{
    resolutionId: string;
    matchId: string;
    roundNumber: number;
    payload: unknown;
    inputHash: string;
    createdAtMs: number;
  }> {
    this.#assertOpen();
    const rows = (
      matchIdInput === undefined
        ? this.#database
            .prepare(
              "SELECT * FROM round_inputs WHERE status = 'pending' ORDER BY created_at_ms",
            )
            .all()
        : this.#database
            .prepare(
              "SELECT * FROM round_inputs WHERE status = 'pending' AND match_id = ? ORDER BY created_at_ms",
            )
            .all(MatchIdSchema.parse(matchIdInput))
    ) as Array<{
      resolution_id: string;
      match_id: string;
      round_number: number;
      input_json: string;
      input_hash: string;
      created_at_ms: number;
    }>;
    return rows.map((row) => {
      if (sha256Hex(row.input_json) !== row.input_hash) {
        throw new PersistenceIntegrityError(
          `Round-input hash mismatch for ${row.resolution_id}`,
        );
      }
      return {
        resolutionId: row.resolution_id,
        matchId: row.match_id,
        roundNumber: row.round_number,
        payload: parseStoredJson(row.input_json),
        inputHash: row.input_hash,
        createdAtMs: row.created_at_ms,
      };
    });
  }

  public getResolutionBatch(
    resolutionIdInput: string,
  ): { payload: unknown; hash: string; schemaVersion: number } | null {
    this.#assertOpen();
    const row = this.#database
      .prepare(
        "SELECT schema_version, batch_json, batch_hash FROM resolution_batches WHERE resolution_id = ?",
      )
      .get(ResolutionIdSchema.parse(resolutionIdInput)) as
      | { schema_version: number; batch_json: string; batch_hash: string }
      | undefined;
    if (!row) return null;
    if (sha256Hex(row.batch_json) !== row.batch_hash)
      throw new PersistenceIntegrityError("Resolution batch hash mismatch");
    return {
      payload: parseStoredJson(row.batch_json),
      hash: row.batch_hash,
      schemaVersion: row.schema_version,
    };
  }

  public quickCheck(): string[] {
    this.#assertOpen();
    const rows = this.#database.pragma("quick_check") as Array<{
      quick_check: string;
    }>;
    return rows.map((row) => row.quick_check);
  }

  public checkpoint(mode: "PASSIVE" | "FULL" | "TRUNCATE" = "PASSIVE"): void {
    this.#assertOpen();
    this.#database.pragma(`wal_checkpoint(${mode})`);
  }

  public async backup(
    destinationInput: string,
    createdAtMs = this.#now(),
  ): Promise<BackupManifest> {
    this.#assertOpen();
    if (this.#filename === ":memory:")
      throw new Error("Online backup requires a filesystem database");
    const destination = resolve(destinationInput);
    if (destination === resolve(this.#filename))
      throw new Error("Backup destination cannot be the live database");
    const manifestPath = `${destination}.json`;
    const partial = `${destination}.partial`;
    const manifestPartial = `${manifestPath}.partial`;
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    await assertAbsent(destination);
    await assertAbsent(manifestPath);
    await assertAbsent(partial);
    await assertAbsent(manifestPartial);

    try {
      await this.#database.backup(partial);
      await chmod(partial, 0o600);
      const verifier = new Database(partial, {
        readonly: true,
        fileMustExist: true,
      });
      try {
        const quickCheck = verifier.pragma("quick_check") as Array<{
          quick_check: string;
        }>;
        if (quickCheck.length !== 1 || quickCheck[0]?.quick_check !== "ok") {
          throw new PersistenceIntegrityError(
            `Backup quick_check failed: ${quickCheck.map((row) => row.quick_check).join(", ")}`,
          );
        }
      } finally {
        verifier.close();
      }
      const fileStat = await stat(partial);
      const digest = await hashFile(partial);
      const manifest: BackupManifest = {
        path: destination,
        manifestPath,
        sha256: digest,
        sizeBytes: fileStat.size,
        schemaVersion: currentSchemaVersion(),
        createdAtMs: TimestampMsSchema.parse(createdAtMs),
        quickCheck: "ok",
      };
      await writeFile(manifestPartial, `${canonicalStringify(manifest)}\n`, {
        flag: "wx",
        mode: 0o600,
      });
      await rename(partial, destination);
      await rename(manifestPartial, manifestPath);
      await fsyncDirectory(dirname(destination));
      return manifest;
    } catch (error) {
      await Promise.all([safeUnlink(partial), safeUnlink(manifestPartial)]);
      throw error;
    }
  }

  public close(): void {
    if (this.#closed) return;
    this.#database.close();
    this.#closed = true;
  }

  #appendEventsRaw(
    matchId: string,
    rulesRevision: number,
    events: readonly CanonicalEventInput[],
    fallbackNowMs: number,
  ): void {
    const current = this.#database
      .prepare(
        "SELECT COALESCE(MAX(event_seq), 0) AS event_seq FROM match_events WHERE match_id = ?",
      )
      .get(matchId) as { event_seq: number };
    const insert = this.#database.prepare(
      `INSERT INTO match_events (
        match_id, event_seq, event_id, command_id, rules_revision, event_type,
        event_json, event_hash, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    events.forEach((event, index) => {
      const eventId = EventIdSchema.parse(event.eventId);
      const eventType = z
        .string()
        .min(1)
        .max(96)
        // Canonical game event namespaces use dots between domains and
        // underscores inside a name (for example
        // `develop.anchor_interference`). Keep the persisted grammar aligned
        // with the game-core event vocabulary.
        .regex(/^[a-z0-9._-]+$/)
        .parse(event.eventType);
      const commandId =
        event.commandId == null ? null : CommandIdSchema.parse(event.commandId);
      const eventJson = canonicalStringify(event.payload);
      insert.run(
        matchId,
        current.event_seq + index + 1,
        eventId,
        commandId,
        rulesRevision,
        eventType,
        eventJson,
        sha256Hex(eventJson),
        TimestampMsSchema.parse(event.createdAtMs ?? fallbackNowMs),
      );
    });
  }

  #requireMatch(matchId: string): MatchRecord<TRules, TWorkflow> {
    const row = this.#database
      .prepare("SELECT * FROM matches WHERE match_id = ?")
      .get(matchId) as MatchRow | undefined;
    if (!row) throw new Error("Match not found");
    return this.#deserializeMatch(row);
  }

  #deserializeMatch(row: MatchRow): MatchRecord<TRules, TWorkflow> {
    if (sha256Hex(row.rules_state_json) !== row.rules_state_hash) {
      throw new PersistenceIntegrityError(
        `Rules-state hash mismatch for ${row.match_id}`,
      );
    }
    if (sha256Hex(row.workflow_json) !== row.workflow_hash) {
      throw new PersistenceIntegrityError(
        `Workflow hash mismatch for ${row.match_id}`,
      );
    }
    return {
      matchId: row.match_id,
      roomCode: row.room_code,
      lifecycle: row.lifecycle,
      rulesVersion: row.rules_version,
      rulesRevision: row.rules_revision,
      rulesState: this.#rulesSchema.parse(
        parseStoredJson(row.rules_state_json),
      ),
      rulesStateHash: row.rules_state_hash,
      workflowRevision: row.workflow_revision,
      workflow: this.#workflowSchema.parse(parseStoredJson(row.workflow_json)),
      workflowHash: row.workflow_hash,
      publicVersion: row.public_version,
      hostVersion: row.host_version,
      heartbeatAtMs: row.heartbeat_at_ms,
      createdAtMs: row.created_at_ms,
      updatedAtMs: row.updated_at_ms,
    };
  }

  #requireSeat(matchId: string, seatId: string): SeatRecord {
    const row = this.#database
      .prepare("SELECT * FROM seats WHERE match_id = ? AND seat_id = ?")
      .get(matchId, seatId) as SeatRow | undefined;
    if (!row) throw new Error("Seat not found");
    return this.#deserializeSeat(row);
  }

  #deserializeSeat(row: SeatRow): SeatRecord {
    return {
      matchId: row.match_id,
      seatId: row.seat_id,
      displayName: row.display_name,
      privateVersion: row.private_version,
      controllerEpoch: row.controller_epoch,
      writerInstanceId: row.writer_instance_id,
      hasWriterLease: row.writer_lease_hash !== null,
      joinedAtMs: row.joined_at_ms,
    };
  }

  #requireSession(sessionId: string): SessionRecord {
    const row = this.#database
      .prepare("SELECT * FROM sessions WHERE session_id = ?")
      .get(sessionId) as SessionRow | undefined;
    if (!row) throw new Error("Session not found");
    return this.#deserializeSession(row);
  }

  #deserializeSession(row: SessionRow): SessionRecord {
    return {
      sessionId: row.session_id,
      role: row.role,
      matchId: row.match_id,
      seatId: row.seat_id,
      sessionEpoch: row.session_epoch,
      expiresAtMs: row.expires_at_ms,
      lastSeenAtMs: row.last_seen_at_ms,
      revokedAtMs: row.revoked_at_ms,
    };
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error("Persistence store is closed");
  }
}

async function assertAbsent(path: string): Promise<void> {
  try {
    await access(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Refusing to overwrite ${path}`);
}

async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path))
    hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function fsyncDirectory(path: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
