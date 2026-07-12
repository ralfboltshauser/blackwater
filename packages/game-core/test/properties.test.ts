import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  assertRulesInvariants,
  canonicalHash,
  createMatch,
  defaultProgram,
  externalId,
  projectForSeat,
  projectPublic,
  resolveRound,
  runClaimCheck,
  runForecast,
  type RulesState,
} from "../src/index.js";

const seats = [
  { id: "amber", name: "Amber" },
  { id: "cyan", name: "Cyan" },
  { id: "violet", name: "Violet" },
  { id: "lime", name: "Lime" },
];

function created(seed: string): RulesState {
  return createMatch({
    matchId: externalId("property", seed),
    seed,
    seats,
    factionsEnabled: true,
  });
}

describe("rules properties", () => {
  it("is deterministic and invariant-safe across setup seeds", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 48 }), (seed) => {
        const first = created(seed);
        const second = created(seed);
        assertRulesInvariants(first);
        expect(canonicalHash(first)).toBe(canonicalHash(second));
      }),
      { numRuns: 100 },
    );
  });

  it("seven all-Hold rounds terminate in a valid simultaneous fallback", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 24 }), (seed) => {
        let game = created(seed);
        while (game.phase !== "ended") {
          if (game.phase === "planning") {
            game = resolveRound(
              game,
              Object.fromEntries(
                Object.keys(game.seats).map((seatId) => [
                  seatId,
                  defaultProgram(seatId),
                ]),
              ),
            ).stateAfter;
          } else if (game.phase === "claim" || game.phase === "resolving")
            game = runClaimCheck(game).stateAfter;
          else if (game.phase === "forecast")
            game = runForecast(game).stateAfter;
          assertRulesInvariants(game);
        }
        expect(game.round).toBe(7);
        expect(game.winners.length).toBeGreaterThan(0);
        expect(
          Object.values(game.winningCharters).every((charters) =>
            charters.includes("fallback"),
          ),
        ).toBe(true);
      }),
      { numRuns: 30 },
    );
  });

  it("opponent hidden-state changes cannot alter public or another seat's projection", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }),
        fc.constantFrom(12, 13, 18),
        (signal, hiddenSector) => {
          const baseline = created("noninterference");
          const changed = structuredClone(baseline);
          changed.seats.amber!.signal = signal;
          const hiddenSubmarine = Object.values(changed.assets).find(
            (asset) => asset.kind === "submarine" && asset.ownerId === "amber",
          )!;
          hiddenSubmarine.sectorId = hiddenSector;
          expect(canonicalHash(projectPublic(changed))).toBe(
            canonicalHash(projectPublic(baseline)),
          );
          expect(canonicalHash(projectForSeat(changed, "cyan"))).toBe(
            canonicalHash(projectForSeat(baseline, "cyan")),
          );
        },
      ),
      { numRuns: 60 },
    );
  });

  it("object insertion order cannot change a resolved round", () => {
    const game = created("iteration-order");
    const reordered = structuredClone(game);
    reordered.seats = Object.fromEntries(
      Object.entries(reordered.seats).reverse(),
    );
    reordered.assets = Object.fromEntries(
      Object.entries(reordered.assets).reverse(),
    );
    reordered.sites = Object.fromEntries(
      Object.entries(reordered.sites).reverse(),
    ) as RulesState["sites"];
    const plans = Object.fromEntries(
      Object.keys(game.seats).map((seatId) => [seatId, defaultProgram(seatId)]),
    );
    expect(canonicalHash(resolveRound(game, plans))).toBe(
      canonicalHash(resolveRound(reordered, plans)),
    );
  });
});
