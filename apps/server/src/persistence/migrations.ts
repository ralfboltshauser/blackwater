import { createHash } from "node:crypto";

import type Database from "better-sqlite3";

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "initial_match_store",
    sql: `
      CREATE TABLE matches (
        match_id             TEXT PRIMARY KEY,
        room_code            TEXT NOT NULL UNIQUE,
        lifecycle            TEXT NOT NULL CHECK (lifecycle IN ('lobby', 'active', 'finished', 'archived')),
        rules_version        TEXT NOT NULL,
        rules_revision       INTEGER NOT NULL CHECK (rules_revision >= 0),
        rules_state_json     TEXT NOT NULL,
        rules_state_hash     TEXT NOT NULL,
        workflow_revision    INTEGER NOT NULL CHECK (workflow_revision >= 0),
        workflow_json        TEXT NOT NULL,
        workflow_hash        TEXT NOT NULL,
        public_version       INTEGER NOT NULL CHECK (public_version >= 0),
        host_version         INTEGER NOT NULL CHECK (host_version >= 0),
        heartbeat_at_ms      INTEGER NOT NULL CHECK (heartbeat_at_ms >= 0),
        created_at_ms        INTEGER NOT NULL CHECK (created_at_ms >= 0),
        updated_at_ms        INTEGER NOT NULL CHECK (updated_at_ms >= 0)
      ) STRICT;

      CREATE TABLE seats (
        match_id             TEXT NOT NULL,
        seat_id              TEXT NOT NULL,
        display_name         TEXT NOT NULL,
        private_version      INTEGER NOT NULL DEFAULT 0 CHECK (private_version >= 0),
        controller_epoch     INTEGER NOT NULL DEFAULT 0 CHECK (controller_epoch >= 0),
        writer_instance_id   TEXT,
        writer_lease_hash    BLOB,
        joined_at_ms         INTEGER NOT NULL CHECK (joined_at_ms >= 0),
        PRIMARY KEY (match_id, seat_id),
        FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE,
        CHECK ((writer_instance_id IS NULL) = (writer_lease_hash IS NULL))
      ) STRICT;

      CREATE TABLE sessions (
        session_id           TEXT PRIMARY KEY,
        credential_hash      BLOB NOT NULL UNIQUE,
        role                 TEXT NOT NULL CHECK (role IN ('host', 'display', 'player')),
        match_id             TEXT NOT NULL,
        seat_id              TEXT,
        session_epoch        INTEGER NOT NULL CHECK (session_epoch >= 0),
        expires_at_ms        INTEGER NOT NULL CHECK (expires_at_ms >= 0),
        last_seen_at_ms      INTEGER NOT NULL CHECK (last_seen_at_ms >= 0),
        revoked_at_ms        INTEGER,
        FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE,
        FOREIGN KEY (match_id, seat_id) REFERENCES seats(match_id, seat_id) ON DELETE CASCADE,
        CHECK ((role = 'player' AND seat_id IS NOT NULL) OR (role != 'player' AND seat_id IS NULL))
      ) STRICT;

      CREATE TABLE command_receipts (
        match_id              TEXT NOT NULL,
        session_id            TEXT NOT NULL,
        command_id            TEXT NOT NULL,
        request_hash          TEXT NOT NULL,
        terminal_result_json  TEXT NOT NULL,
        created_at_ms         INTEGER NOT NULL CHECK (created_at_ms >= 0),
        PRIMARY KEY (match_id, session_id, command_id),
        FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE match_events (
        match_id              TEXT NOT NULL,
        event_seq             INTEGER NOT NULL CHECK (event_seq > 0),
        event_id              TEXT NOT NULL,
        command_id            TEXT,
        rules_revision        INTEGER NOT NULL CHECK (rules_revision >= 0),
        event_type            TEXT NOT NULL,
        event_json            TEXT NOT NULL,
        event_hash            TEXT NOT NULL,
        created_at_ms         INTEGER NOT NULL CHECK (created_at_ms >= 0),
        PRIMARY KEY (match_id, event_seq),
        UNIQUE (match_id, event_id),
        FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE snapshots (
        match_id              TEXT NOT NULL,
        rules_revision        INTEGER NOT NULL CHECK (rules_revision >= 0),
        rules_state_json      TEXT NOT NULL,
        rules_state_hash      TEXT NOT NULL,
        last_event_seq        INTEGER NOT NULL CHECK (last_event_seq >= 0),
        created_at_ms         INTEGER NOT NULL CHECK (created_at_ms >= 0),
        PRIMARY KEY (match_id, rules_revision),
        FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE round_inputs (
        resolution_id         TEXT PRIMARY KEY,
        match_id              TEXT NOT NULL,
        round_number          INTEGER NOT NULL CHECK (round_number > 0),
        status                TEXT NOT NULL CHECK (status IN ('pending', 'committed')),
        input_json            TEXT NOT NULL,
        input_hash            TEXT NOT NULL,
        output_hash           TEXT,
        created_at_ms         INTEGER NOT NULL CHECK (created_at_ms >= 0),
        committed_at_ms       INTEGER,
        FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE resolution_batches (
        resolution_id         TEXT PRIMARY KEY,
        match_id              TEXT NOT NULL,
        schema_version        INTEGER NOT NULL CHECK (schema_version > 0),
        batch_json            TEXT NOT NULL,
        batch_hash            TEXT NOT NULL,
        created_at_ms         INTEGER NOT NULL CHECK (created_at_ms >= 0),
        FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE,
        FOREIGN KEY (resolution_id) REFERENCES round_inputs(resolution_id) ON DELETE CASCADE
      ) STRICT;

      CREATE INDEX sessions_expiry ON sessions(expires_at_ms);
      CREATE INDEX sessions_match ON sessions(match_id, seat_id);
      CREATE INDEX match_events_revision ON match_events(match_id, rules_revision);
      CREATE INDEX command_receipts_created ON command_receipts(match_id, created_at_ms);
      CREATE INDEX round_inputs_match ON round_inputs(match_id, round_number);
    `,
  },
] as const;

const MIGRATION_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version       INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    applied_at_ms INTEGER NOT NULL CHECK (applied_at_ms >= 0),
    checksum      TEXT NOT NULL
  ) STRICT;
`;

export function migrationChecksum(migration: Migration): string {
  return createHash("sha256")
    .update(`${migration.version}\0${migration.name}\0${migration.sql}`, "utf8")
    .digest("hex");
}

export function applyMigrations(
  database: Database.Database,
  nowMs = Date.now(),
): void {
  database.exec(MIGRATION_TABLE_SQL);

  const appliedRows = database
    .prepare(
      "SELECT version, name, checksum FROM schema_migrations ORDER BY version",
    )
    .all() as Array<{ version: number; name: string; checksum: string }>;
  const knownVersions = new Set(
    MIGRATIONS.map((migration) => migration.version),
  );

  for (const applied of appliedRows) {
    const expected = MIGRATIONS.find(
      (migration) => migration.version === applied.version,
    );
    if (!expected)
      throw new Error(
        `Database contains unknown migration ${applied.version} (${applied.name})`,
      );
    const checksum = migrationChecksum(expected);
    if (applied.name !== expected.name || applied.checksum !== checksum) {
      throw new Error(
        `Migration ${applied.version} does not match the application checksum`,
      );
    }
  }

  const migrate = database.transaction((migration: Migration) => {
    database.exec(migration.sql);
    database
      .prepare(
        "INSERT INTO schema_migrations (version, name, applied_at_ms, checksum) VALUES (?, ?, ?, ?)",
      )
      .run(
        migration.version,
        migration.name,
        nowMs,
        migrationChecksum(migration),
      );
  });

  for (const migration of MIGRATIONS) {
    if (!appliedRows.some((applied) => applied.version === migration.version))
      migrate.immediate(migration);
  }

  const finalRows = database
    .prepare("SELECT version FROM schema_migrations")
    .all() as Array<{ version: number }>;
  if (finalRows.some((row) => !knownVersions.has(row.version))) {
    throw new Error("Database schema is newer than this application");
  }
}

export function currentSchemaVersion(): number {
  return MIGRATIONS.at(-1)?.version ?? 0;
}
