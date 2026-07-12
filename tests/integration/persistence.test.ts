import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  BlackwaterStore,
  IdempotencyKeyReuseError,
  PersistenceConflictError,
  PersistenceIntegrityError,
  canonicalStringify,
  sha256Hex,
} from "../../apps/server/src/persistence";

const RulesSchema = z
  .object({ counter: z.number().int().nonnegative() })
  .strict();
const WorkflowSchema = z
  .object({ phase: z.string().min(1), paused: z.boolean() })
  .strict();
type Rules = z.infer<typeof RulesSchema>;
type Workflow = z.infer<typeof WorkflowSchema>;

const temporaryDirectories: string[] = [];

async function makeStore(now = 1_000): Promise<{
  directory: string;
  filename: string;
  store: BlackwaterStore<Rules, Workflow>;
}> {
  const directory = await mkdtemp(join(tmpdir(), "blackwater-persistence-"));
  temporaryDirectories.push(directory);
  const filename = join(directory, "blackwater.sqlite3");
  return {
    directory,
    filename,
    store: BlackwaterStore.open({
      filename,
      rulesSchema: RulesSchema,
      workflowSchema: WorkflowSchema,
      now: () => now,
    }),
  };
}

function seedMatch(store: BlackwaterStore<Rules, Workflow>): void {
  store.createMatch({
    matchId: "match_alpha",
    roomCode: "AB2CD3",
    rulesVersion: "rules-1",
    rulesState: { counter: 0 },
    workflow: { phase: "lobby", paused: false },
    createdAtMs: 1_000,
  });
  store.upsertSeat({
    matchId: "match_alpha",
    seatId: "seat-1",
    displayName: "Mara",
    joinedAtMs: 1_001,
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("BlackwaterStore", () => {
  it("applies hardened SQLite pragmas and persists versioned aggregates", async () => {
    const { filename, store } = await makeStore();
    try {
      expect(store.pragmaState()).toEqual({
        journalMode: "wal",
        synchronous: 2,
        foreignKeys: 1,
        trustedSchema: 0,
      });
      seedMatch(store);

      const initial = store.getMatchByRoomCode("ab2cd3");
      expect(initial).toMatchObject({
        matchId: "match_alpha",
        rulesRevision: 0,
        workflowRevision: 0,
        rulesState: { counter: 0 },
        workflow: { phase: "lobby", paused: false },
      });

      const committed = store.commitMatch({
        matchId: "match_alpha",
        expectedRulesRevision: 0,
        expectedWorkflowRevision: 0,
        rulesState: { counter: 1 },
        workflow: { phase: "open-water", paused: false },
        lifecycle: "active",
        publicVersion: 1,
        hostVersion: 1,
        heartbeatAtMs: 1_100,
        events: [
          {
            eventId: "event_counter_1",
            eventType: "counter.value_changed",
            payload: { to: 1 },
          },
        ],
      });
      expect(committed).toMatchObject({
        lifecycle: "active",
        rulesRevision: 1,
        workflowRevision: 1,
        publicVersion: 1,
        hostVersion: 1,
      });
      expect(store.listEvents("match_alpha")).toMatchObject([
        {
          eventSeq: 1,
          eventId: "event_counter_1",
          eventType: "counter.value_changed",
          rulesRevision: 1,
          payload: { to: 1 },
        },
      ]);
      expect(store.quickCheck()).toEqual(["ok"]);
    } finally {
      store.close();
    }

    const reopened = BlackwaterStore.open({
      filename,
      rulesSchema: RulesSchema,
      workflowSchema: WorkflowSchema,
      now: () => 2_000,
    });
    try {
      expect(reopened.getMatch("match_alpha")?.rulesState).toEqual({
        counter: 1,
      });
      expect(reopened.schemaVersion).toBe(1);
    } finally {
      reopened.close();
    }
  });

  it("rejects stale writes and enforces the event/state invariant atomically", async () => {
    const { store } = await makeStore();
    try {
      seedMatch(store);
      expect(() =>
        store.commitMatch({
          matchId: "match_alpha",
          expectedRulesRevision: 0,
          expectedWorkflowRevision: 0,
          rulesState: { counter: 1 },
          workflow: { phase: "lobby", paused: false },
        }),
      ).toThrow(PersistenceIntegrityError);
      expect(store.getMatch("match_alpha")?.rulesState).toEqual({ counter: 0 });

      store.commitMatch({
        matchId: "match_alpha",
        expectedRulesRevision: 0,
        expectedWorkflowRevision: 0,
        rulesState: { counter: 1 },
        workflow: { phase: "lobby", paused: false },
        events: [
          {
            eventId: "event_counter_1",
            eventType: "counter.changed",
            payload: { to: 1 },
          },
        ],
      });
      expect(() =>
        store.commitMatch({
          matchId: "match_alpha",
          expectedRulesRevision: 0,
          expectedWorkflowRevision: 0,
          rulesState: { counter: 2 },
          workflow: { phase: "lobby", paused: false },
          events: [
            {
              eventId: "event_counter_2",
              eventType: "counter.changed",
              payload: { to: 2 },
            },
          ],
        }),
      ).toThrow(PersistenceConflictError);
      expect(store.getMatch("match_alpha")?.rulesState).toEqual({ counter: 1 });
    } finally {
      store.close();
    }
  });

  it("stores only hashes for credentials and fences controller leases", async () => {
    const { filename, store } = await makeStore();
    const credential = "session-credential-that-never-enters-sqlite";
    try {
      seedMatch(store);
      const seat = store.rotateWriterLease({
        matchId: "match_alpha",
        seatId: "seat-1",
        clientInstanceId: "client_phone_1",
        writerLeaseId: "writer-lease-that-is-long-enough",
      });
      expect(seat).toMatchObject({
        controllerEpoch: 1,
        hasWriterLease: true,
        writerInstanceId: "client_phone_1",
      });
      expect(
        store.verifyWriterLease({
          matchId: "match_alpha",
          seatId: "seat-1",
          clientInstanceId: "client_phone_1",
          writerLeaseId: "writer-lease-that-is-long-enough",
          controllerEpoch: 1,
        }),
      ).toBe(true);
      expect(
        store.verifyWriterLease({
          matchId: "match_alpha",
          seatId: "seat-1",
          clientInstanceId: "client_phone_1",
          writerLeaseId: "wrong-writer-lease-long-enough",
          controllerEpoch: 1,
        }),
      ).toBe(false);

      const session = store.createSession({
        sessionId: "session_player_1",
        credential,
        role: "player",
        matchId: "match_alpha",
        seatId: "seat-1",
        expiresAtMs: 50_000,
        lastSeenAtMs: 1_002,
      });
      expect(session).not.toHaveProperty("credential");
      expect(store.getSessionByCredential(credential)?.sessionId).toBe(
        "session_player_1",
      );
      expect(store.revokeSession("session_player_1", 1_500)).toMatchObject({
        revokedAtMs: 1_500,
        sessionEpoch: 1,
      });
    } finally {
      store.close();
    }

    const raw = new Database(filename, { readonly: true, fileMustExist: true });
    try {
      const row = raw
        .prepare("SELECT credential_hash FROM sessions WHERE session_id = ?")
        .get("session_player_1") as {
        credential_hash: Buffer;
      };
      expect(Buffer.isBuffer(row.credential_hash)).toBe(true);
      expect(row.credential_hash).toHaveLength(32);
      expect(row.credential_hash.toString("utf8")).not.toContain(credential);
      const lease = raw
        .prepare("SELECT writer_lease_hash FROM seats WHERE seat_id = 'seat-1'")
        .get() as {
        writer_lease_hash: Buffer;
      };
      expect(lease.writer_lease_hash).toHaveLength(32);
    } finally {
      raw.close();
    }
  });

  it("commits mutations and terminal receipts together and deduplicates retries", async () => {
    const { store } = await makeStore();
    const ResultSchema = z
      .object({ accepted: z.literal(true), revision: z.number().int() })
      .strict();
    try {
      seedMatch(store);
      store.createSession({
        sessionId: "session_player_1",
        credential: "session-credential-at-least-24-characters",
        role: "player",
        matchId: "match_alpha",
        seatId: "seat-1",
        expiresAtMs: 50_000,
      });
      const handler = vi.fn(() => {
        store.commitMatch({
          matchId: "match_alpha",
          expectedRulesRevision: 0,
          expectedWorkflowRevision: 0,
          rulesState: { counter: 1 },
          workflow: { phase: "lobby", paused: false },
          events: [
            {
              eventId: "event_command_1",
              eventType: "counter.changed",
              commandId: "command_player_1",
              payload: { to: 1 },
            },
          ],
        });
        return { accepted: true as const, revision: 1 };
      });
      const first = store.executeIdempotentCommand({
        matchId: "match_alpha",
        sessionId: "session_player_1",
        commandId: "command_player_1",
        request: { type: "test", value: 1 },
        resultSchema: ResultSchema,
        nowMs: 1_100,
        handler,
      });
      const duplicate = store.executeIdempotentCommand({
        matchId: "match_alpha",
        sessionId: "session_player_1",
        commandId: "command_player_1",
        request: { value: 1, type: "test" },
        resultSchema: ResultSchema,
        nowMs: 1_200,
        handler,
      });
      expect(first).toEqual({
        disposition: "applied",
        result: { accepted: true, revision: 1 },
      });
      expect(duplicate).toEqual({
        disposition: "duplicate",
        result: { accepted: true, revision: 1 },
      });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(store.getMatch("match_alpha")?.rulesRevision).toBe(1);

      expect(() =>
        store.executeIdempotentCommand({
          matchId: "match_alpha",
          sessionId: "session_player_1",
          commandId: "command_player_1",
          request: { type: "test", value: 2 },
          resultSchema: ResultSchema,
          nowMs: 1_300,
          handler,
        }),
      ).toThrow(IdempotencyKeyReuseError);

      expect(() =>
        store.executeIdempotentCommand({
          matchId: "match_alpha",
          sessionId: "session_player_1",
          commandId: "command_invalid_result",
          request: { type: "test", value: 2 },
          resultSchema: ResultSchema,
          nowMs: 1_400,
          handler: () => {
            store.commitMatch({
              matchId: "match_alpha",
              expectedRulesRevision: 1,
              expectedWorkflowRevision: 0,
              rulesState: { counter: 2 },
              workflow: { phase: "lobby", paused: false },
              events: [
                {
                  eventId: "event_rolled_back",
                  eventType: "counter.changed",
                  payload: { to: 2 },
                },
              ],
            });
            return { accepted: false, revision: 2 } as never;
          },
        }),
      ).toThrow();
      expect(store.getMatch("match_alpha")?.rulesState).toEqual({ counter: 1 });
      expect(
        store.listEvents("match_alpha").map((event) => event.eventId),
      ).not.toContain("event_rolled_back");
    } finally {
      store.close();
    }
  });

  it("stores immutable resolution inputs/batches and creates a verified online backup", async () => {
    const { directory, store } = await makeStore();
    try {
      seedMatch(store);
      const inputPayload = {
        round: 1,
        stateBeforeHash: "a".repeat(64),
        plans: [1, 2, 3],
      };
      const inputHash = store.putRoundInput({
        resolutionId: "resolution_round_1",
        matchId: "match_alpha",
        roundNumber: 1,
        payload: inputPayload,
        createdAtMs: 1_100,
      });
      expect(inputHash).toBe(sha256Hex(canonicalStringify(inputPayload)));
      expect(store.listPendingRoundInputs("match_alpha")).toMatchObject([
        {
          resolutionId: "resolution_round_1",
          roundNumber: 1,
          payload: inputPayload,
          inputHash,
        },
      ]);
      store.putRoundInput({
        resolutionId: "resolution_round_1_retry",
        matchId: "match_alpha",
        roundNumber: 1,
        payload: inputPayload,
        createdAtMs: 1_150,
      });
      expect(store.listPendingRoundInputs("match_alpha")).toHaveLength(2);

      const batch = {
        stateAfterHash: "b".repeat(64),
        beats: [{ id: "beat_1" }],
      };
      store.putResolutionBatch({
        resolutionId: "resolution_round_1",
        matchId: "match_alpha",
        schemaVersion: 1,
        payload: batch,
        createdAtMs: 1_200,
      });
      expect(store.getResolutionBatch("resolution_round_1")?.payload).toEqual(
        batch,
      );
      store.commitRoundInput("resolution_round_1", "b".repeat(64), 1_300);
      // Committing the authoritative result also removes stale retry inputs
      // for that match/round.
      expect(store.listPendingRoundInputs("match_alpha")).toEqual([]);

      const backupPath = join(directory, "backups", "manual.sqlite3");
      const manifest = await store.backup(backupPath, 1_400);
      expect(manifest).toMatchObject({
        path: backupPath,
        schemaVersion: 1,
        quickCheck: "ok",
        createdAtMs: 1_400,
      });
      expect(
        JSON.parse(await readFile(`${backupPath}.json`, "utf8")),
      ).toMatchObject({ sha256: manifest.sha256 });

      const backupStore = BlackwaterStore.open({
        filename: backupPath,
        rulesSchema: RulesSchema,
        workflowSchema: WorkflowSchema,
        now: () => 2_000,
      });
      try {
        expect(backupStore.quickCheck()).toEqual(["ok"]);
        expect(backupStore.getMatch("match_alpha")?.rulesState).toEqual({
          counter: 0,
        });
        expect(
          backupStore.getResolutionBatch("resolution_round_1")?.payload,
        ).toEqual(batch);
      } finally {
        backupStore.close();
      }
    } finally {
      store.close();
    }
  });
});
