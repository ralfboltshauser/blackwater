# Persistence boundary

`BlackwaterStore` owns one synchronous SQLite connection and is intended to run
behind the server's serialized MatchActor queues.

```ts
const store = BlackwaterStore.open({
  filename: "/var/lib/blackwater/blackwater.sqlite3",
  rulesSchema: RulesStateSchema,
  workflowSchema: WorkflowStateSchema,
});
```

It applies checksum-verified migrations and configures WAL, `synchronous=FULL`,
foreign keys, a five-second busy timeout, bounded auto-checkpointing, and an
untrusted schema. Live database files, credential hashes, writer-lease hashes,
and backup files are never exposed through returned records.

Correct command processing uses `executeIdempotentCommand`. Its handler and the
terminal receipt share one `BEGIN IMMEDIATE` transaction. A handler failure or
invalid result rolls back both. A duplicate command returns its persisted result;
reuse of the same command ID with different canonical request bytes fails.

`commitMatch` enforces these aggregate invariants:

- expected rules/workflow revisions must match;
- a rules-state hash change requires canonical events;
- canonical events cannot exist without a rules-state hash change;
- public and host stream versions never decrease;
- rules, workflow, events, hashes, versions, and heartbeat commit atomically.

Round inputs and resolution batches are immutable, independently hashed recovery
artifacts. `listPendingRoundInputs` is the restart queue. `backup` uses SQLite's
online backup API, verifies `quick_check`, hashes the result, writes a sidecar
manifest, sets mode `0600`, and refuses overwrite.

Do not delete expired sessions independently: command receipts refer to them and
must survive for the archived lifetime of their match.
