# Blackwater protocol boundary

This package is the only wire-format contract shared by the server and browser
clients. Every exported Zod object is strict: unknown fields are rejected rather
than silently stripped.

The important boundaries are:

- `lobby.ts` — join, seat claim, session bootstrap, and lobby snapshots;
- `commands.ts` — complete client command envelopes, three-Pulse programs,
  domain-specific expected revisions, and post-commit results;
- `projections.ts` — separate public, player-private, and operational host
  projections;
- `presentation.ts` — separate public and seat-authorized just-in-time beats;
- `primitives.ts` — IDs, fixed vocabulary, reports, and resource transfers.

Rules that must stay true:

1. A client command never contains its acting seat. Authentication supplies it.
2. Player commands require a writer lease; host commands do not accept one.
3. The phone sends all three Operations when replacing or locking a draft.
4. Public and host schemas have no fields for hidden routes, Signal, cargo,
   traps, reports, drafts, or private offers.
5. Private beats identify their authorized seat, while public beats cannot carry
   private event variants.
6. Sector IDs and Operation shapes match `packages/game-core/src/types.ts`.
7. `parseCommandMessage` rejects messages larger than 16 KiB before validation.

Additions should come with a rejection test for unexpected fields and, when
secrecy is involved, a wrong-viewer/public rejection test.
