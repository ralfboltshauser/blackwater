# Blackwater architecture

This document describes the running implementation. The protocol is
server-authoritative: a browser sends intent, the match actor validates it
against authorized state, SQLite commits it, and only then do clients receive a
new projection.

## Boundaries

```text
phone intent ──> strict protocol ──> serialized MatchActor ──> game-core
                       │                    │                     │
                       │                    └── atomic SQLite ─────┘
                       │
                       ├── public projection ──> TV
                       ├── seat projection ────> one phone
                       └── host projection ────> host console
```

`packages/game-core` owns canonical rules state, setup, forecasts, validation,
resolution, social transitions, victory, invariant checks, and viewer-safe core
projections. Resolution is deterministic from canonical state, all submitted
programs, and the seeded setup PRNG. The core does not know about HTTP, React,
cookies, Socket.IO, or SQLite.

`packages/protocol` owns every wire object as a strict Zod schema. Command
envelopes include protocol, match, phase, session epoch, writer lease, client
instance, command ID, and the expected domain revision. They never include an
acting seat chosen by the browser. Public and private schemas are structurally
different rather than one large object with fields hidden in CSS.

`apps/server` owns authenticated sessions, rotating player writer leases, lobby
state, per-match serialization, deadlines, presentation beats, persistence,
recovery, and authorized Socket.IO rooms. One process may host several matches;
each match processes mutations through its own promise queue.

AI rivals are persisted workflow controllers, not fake clients. They have no
session, cookie, writer lease, Socket.IO connection, or SQL seat row. The live
policy accepts only the same viewer-safe `PlayerProjection` a phone would
receive, produces one strict three-Pulse draft, and then passes through the
ordinary canonical legality check. Bot profiles and locked drafts share the
match aggregate transaction and survive restarts; a safety failure becomes
three Holds rather than a second information-dependent planning attempt.

`apps/web` owns presentation only. All map views share the same normalized basin
coordinates and code-native identity/evidence grammar. The TV has no route to a
private projection. The phone keeps only a local editor copy; accepted drafts,
locks, resources, Intel, offers, and results come back from the server.

## Persistence and recovery

SQLite runs in WAL mode with foreign keys, `synchronous=FULL`, checksummed
migrations, canonical JSON hashes, and idempotent command receipts. A command's
state changes, events, stream revisions, and terminal receipt share one
transaction. Reusing a command ID with different bytes is rejected.

The store persists:

- match metadata and lifecycle;
- canonical rules and workflow revisions;
- sessions and hashed credentials/writer leases;
- immutable canonical events;
- accepted command receipts;
- round inputs and resolution recovery batches;
- heartbeats used to detect restart/runtime gaps.

On restart, active matches are reconstructed and paused so downtime never burns
a planning clock. The public display reconnects to a full current projection;
projection sequence numbers are process-local and may restart at 1.

## Realtime and presentation

Socket.IO uses one public room, one host room, and one private room per occupied
seat. Projection publishing is change-detected. Canonical resolution happens
immediately, then four fixed presentation beats expose Pulse 1, Pulse 2, Pulse
3, and Claim Check snapshots. Each snapshot is projected again for its viewer;
the animation timeline never gains access to final or secret state early.

World travel uses transform-only FLIP motion. UI feedback stays short and
interruptible; reduced-motion substitutes stable crossfades. Offline Blender
renders provide physical vessel/module/specimen sprites, while routes, labels,
contacts, ownership, confidence, status, and effects remain code-native.

## Safe extension order

For a new rule or object:

1. Add the canonical type and deterministic transition in `game-core`.
2. Add invariants plus focused and property tests.
3. Decide exactly which facts are public, private to which seats, or host-only.
4. Extend strict protocol schemas and add unknown-field/wrong-viewer rejection
   tests.
5. Persist any new authoritative workflow state and add a migration if the
   database shape changes.
6. Route the command through the actor with an expected revision and an
   idempotent receipt.
7. Add the smallest contextual phone editor and public presentation necessary.
8. Exercise restart, reconnect, deadline, duplicate-command, and projection
   secrecy paths before shipping.

Do not derive authoritative outcomes in React, accept client-generated entity
IDs, put hidden fields in public objects, or add a second mutation path around
the actor queue.

## Operational security

Blackwater is designed for a trusted local subnet, not direct exposure to the
public internet. Session credentials are HttpOnly/SameSite cookies, player
commands also require the current writer lease, request bodies and Socket.IO
messages are bounded, and the Docker runtime is non-root, read-only,
capability-free, and limited in memory and PIDs.

The same origin must serve the phone manifest, API, first-party session cookie,
and Socket.IO connection; a separately hosted PWA shell is intentionally not
supported. Browser play works over local HTTP. An installable PWA requires a
stable hostname, trusted HTTPS certificate, and a reverse proxy restricted to
the LAN. Keep the backend private, reserve its LAN address, and allow only the
local subnet through the host firewall and proxy.
The residential Connect Box 3 Fiber cannot advertise a custom resolver through
DHCP. Participating Apple clients therefore select this resolver explicitly;
Android clients may bypass Sunrise filtering through encrypted public DNS.
Keeping CoreDNS in a separate Compose project prevents normal game shutdown
from removing DNS for clients that opted into it. Browser-only LAN mode remains
available on port 8787 without DNS or secure-PWA guarantees.
