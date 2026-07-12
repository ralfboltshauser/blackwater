import {
  createMatch,
  defaultProgram,
  externalId,
  resolveRound,
  runClaimCheck,
  runForecast,
  type Ark,
  type Operation,
  type Pulse,
  type RulesState,
  type SeatId,
  type Submarine,
  type ThreePulseProgram,
} from "../../packages/game-core/src/index.js";

export const TEST_SEAT_IDS = [
  "amber",
  "cyan",
  "violet",
  "lime",
  "coral",
  "chalk",
] as const;

export function createTestMatch(
  playerCount = 3,
  seed = "audit-seed",
): RulesState {
  return createMatch({
    matchId: externalId("match", playerCount, seed),
    seed,
    factionsEnabled: true,
    seats: TEST_SEAT_IDS.slice(0, playerCount).map((id) => ({
      id,
      name: id[0]!.toUpperCase() + id.slice(1),
    })),
  });
}

export function submarine(state: RulesState, seatId: SeatId): Submarine {
  const found = Object.values(state.assets).find(
    (asset): asset is Submarine =>
      asset.kind === "submarine" &&
      asset.ownerId === seatId &&
      asset.callSign === "A-1",
  );
  if (!found) throw new Error(`Missing submarine for ${seatId}`);
  return found;
}

export function ark(state: RulesState, seatId: SeatId): Ark {
  const found = Object.values(state.assets).find(
    (asset): asset is Ark => asset.kind === "ark" && asset.ownerId === seatId,
  );
  if (!found) throw new Error(`Missing Ark for ${seatId}`);
  return found;
}

export function program(
  seatId: SeatId,
  operations: Partial<Record<Pulse, Operation>>,
): ThreePulseProgram {
  return {
    seatId,
    operations: [1, 2, 3].map(
      (pulse) =>
        operations[pulse as Pulse] ?? ({ kind: "hold", pulse } as Operation),
    ) as [Operation, Operation, Operation],
  };
}

export function allPrograms(
  state: RulesState,
  overrides: Partial<Record<SeatId, ThreePulseProgram>> = {},
): Record<SeatId, ThreePulseProgram> {
  return Object.fromEntries(
    Object.keys(state.seats).map((seatId) => [
      seatId,
      overrides[seatId] ?? defaultProgram(seatId),
    ]),
  );
}

export function playHoldMatchToEnd(initial: RulesState): RulesState {
  let state = initial;
  let transitions = 0;
  while (state.phase !== "ended") {
    transitions += 1;
    if (transitions > 30) throw new Error("Match failed to terminate");
    if (state.phase === "planning") {
      state = resolveRound(state, allPrograms(state)).stateAfter;
    } else if (state.phase === "claim" || state.phase === "resolving") {
      state = runClaimCheck(state).stateAfter;
    } else {
      state = runForecast(state).stateAfter;
    }
  }
  return state;
}
