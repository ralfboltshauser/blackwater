import { describe, expect, it } from "vitest";
import {
  assertRulesInvariants,
  canonicalHash,
  connectedSectors,
  resolveRound,
  runClaimCheck,
  runForecast,
  type RulesState,
  type ThreePulseProgram,
} from "../../packages/game-core/src/index.js";
import { ark, createTestMatch, program } from "./helpers.js";

function reversibleNavigationPlans(
  state: RulesState,
): Record<string, ThreePulseProgram> {
  return Object.fromEntries(
    Object.keys(state.seats).map((seatId) => {
      const ownedArk = ark(state, seatId);
      const destination = connectedSectors(state.map, ownedArk.sectorId)[0]!;
      return [
        seatId,
        program(seatId, {
          1: {
            kind: "navigate",
            pulse: 1,
            assetId: ownedArk.id,
            requiredSectorId: ownedArk.sectorId,
            toSectorId: destination,
          },
          2: {
            kind: "navigate",
            pulse: 2,
            assetId: ownedArk.id,
            requiredSectorId: destination,
            toSectorId: ownedArk.sectorId,
          },
        }),
      ];
    }),
  );
}

function playNavigatingMatch(initial: RulesState): {
  state: RulesState;
  transitions: number;
  resolvedRounds: number;
} {
  let state = initial;
  let transitions = 0;
  let resolvedRounds = 0;
  while (state.phase !== "ended") {
    transitions += 1;
    if (transitions > 30) throw new Error("Full match exceeded transition cap");
    if (state.phase === "planning") {
      state = resolveRound(state, reversibleNavigationPlans(state)).stateAfter;
      resolvedRounds += 1;
    } else if (state.phase === "claim" || state.phase === "resolving") {
      state = runClaimCheck(state).stateAfter;
    } else {
      state = runForecast(state).stateAfter;
    }
    assertRulesInvariants(state);
  }
  return { state, transitions, resolvedRounds };
}

describe("1–6 player full-match completion", () => {
  for (const playerCount of [1, 2, 3, 4, 5, 6]) {
    it(`terminates deterministic ${playerCount}-player matches at the round cap`, () => {
      for (let seedIndex = 0; seedIndex < 6; seedIndex += 1) {
        const seed = `full-match-${playerCount}-${seedIndex}`;
        const first = playNavigatingMatch(createTestMatch(playerCount, seed));
        const second = playNavigatingMatch(createTestMatch(playerCount, seed));

        expect(first.transitions).toBe(20);
        expect(first.resolvedRounds).toBe(7);
        expect(first.state.phase).toBe("ended");
        expect(first.state.round).toBe(7);
        expect(first.state.winners).toEqual(
          Object.keys(first.state.seats).sort(),
        );
        expect(
          Object.values(first.state.winningCharters).every((charters) =>
            charters.includes("fallback"),
          ),
        ).toBe(true);
        expect(Object.values(first.state.fallbackScores)).toEqual(
          Array.from({ length: playerCount }, () => 0),
        );
        expect(canonicalHash(second.state)).toBe(canonicalHash(first.state));
      }
    });
  }
});
