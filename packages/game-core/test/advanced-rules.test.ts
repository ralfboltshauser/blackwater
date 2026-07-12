import { describe, expect, it } from "vitest";
import {
  connectedSectors,
  createMatch,
  defaultProgram,
  resolveRound,
  runClaimCheck,
  runForecast,
  type Evidence,
  type Operation,
  type Platform,
  type Pulse,
  type RulesState,
  type SeatId,
  type Submarine,
  type ThreePulseProgram,
} from "../src/index.js";

const seats = [
  { id: "amber", name: "Amber" },
  { id: "cyan", name: "Cyan" },
  { id: "violet", name: "Violet" },
];

function state(seed: string): RulesState {
  return createMatch({ matchId: seed, seed, seats });
}

function sub(game: RulesState, seatId: SeatId): Submarine {
  return Object.values(game.assets).find(
    (asset): asset is Submarine =>
      asset.kind === "submarine" &&
      asset.ownerId === seatId &&
      asset.callSign === "A-1",
  )!;
}

function ark(game: RulesState, seatId: SeatId) {
  return Object.values(game.assets).find(
    (asset) => asset.kind === "ark" && asset.ownerId === seatId,
  )!;
}

function plan(
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

function allPlans(
  game: RulesState,
  overrides: Record<string, ThreePulseProgram>,
): Record<string, ThreePulseProgram> {
  return Object.fromEntries(
    Object.keys(game.seats).map((seatId) => [
      seatId,
      overrides[seatId] ?? defaultProgram(seatId),
    ]),
  );
}

function platform(
  game: RulesState,
  id: string,
  ownerId: SeatId,
  sectorId: number,
  module: Platform["module"],
): Platform {
  const value: Platform = {
    kind: "platform",
    id,
    ownerId,
    sectorId,
    module,
    state: "active",
    jammedThroughForecastRound: null,
    reactivatesAtForecastRound: null,
  };
  game.assets[id] = value;
  return value;
}

describe("faction powers", () => {
  it("Hadal Engineers pays two for its first successful platform", () => {
    const game = state("hadal");
    game.seats.amber!.faction = "hadal_engineers";
    const amberArk = ark(game, "amber");
    const result = resolveRound(
      game,
      allPlans(game, {
        amber: plan("amber", {
          1: {
            kind: "develop",
            pulse: 1,
            assetId: amberArk.id,
            requiredSectorId: amberArk.sectorId,
            project: { kind: "platform", module: "extractor" },
          },
        }),
      }),
    );
    expect(result.stateAfter.seats.amber!.supply).toBe(2);
    expect(result.stateAfter.seats.amber!.factionUses.hadalDiscountUsed).toBe(
      true,
    );
  });

  it("Roaming Atoll moves one platform with Navigate", () => {
    const game = state("tow");
    game.seats.amber!.faction = "roaming_atoll";
    const amberArk = ark(game, "amber");
    const origin = amberArk.sectorId;
    const destination = connectedSectors(game.map, origin)[0]!;
    const towed = platform(game, "platform-tow", "amber", origin, "extractor");
    const result = resolveRound(
      game,
      allPlans(game, {
        amber: plan("amber", {
          1: {
            kind: "navigate",
            pulse: 1,
            assetId: amberArk.id,
            requiredSectorId: origin,
            toSectorId: destination,
            towPlatformId: towed.id,
          },
        }),
      }),
    );
    expect((result.stateAfter.assets[towed.id] as Platform).sectorId).toBe(
      destination,
    );
    expect(result.stateAfter.seats.amber!.factionUses.towUsed).toBe(true);
  });

  it("Echo Cartographers' first Survey reaches connected sectors", () => {
    const game = state("echo");
    game.seats.amber!.faction = "echo_cartographers";
    sub(game, "amber").sectorId = 13;
    sub(game, "cyan").sectorId = 12;
    const result = resolveRound(
      game,
      allPlans(game, {
        amber: plan("amber", {
          1: {
            kind: "survey",
            pulse: 1,
            assetId: sub(game, "amber").id,
            requiredSectorId: 13,
          },
        }),
      }),
    );
    expect(
      Object.values(result.stateAfter.observations).some(
        (observation) =>
          observation.ownerId === "amber" &&
          observation.subjectId === sub(game, "cyan").id &&
          observation.sectorId === 12,
      ),
    ).toBe(true);
  });

  it("Second Dawn's disabled submarine returns at the next Forecast", () => {
    const game = state("second-dawn");
    game.seats.cyan!.faction = "second_dawn";
    sub(game, "amber").sectorId = 13;
    sub(game, "cyan").sectorId = 13;
    let next = resolveRound(
      game,
      allPlans(game, {
        amber: plan("amber", {
          1: {
            kind: "hunt",
            pulse: 1,
            assetId: sub(game, "amber").id,
            requiredSectorId: 13,
            targetSeatId: "cyan",
            signalCommitment: 2,
          },
        }),
      }),
    ).stateAfter;
    expect(sub(next, "cyan").status).toBe("disabled");
    expect(sub(next, "cyan").autoReturnRound).toBe(2);
    next = runClaimCheck(next).stateAfter;
    next = runForecast(next).stateAfter;
    expect(sub(next, "cyan").status).toBe("active");
    expect(sub(next, "cyan").integrity).toBe(1);
  });
});

describe("encounter edge cases", () => {
  it("a winning Screen blocks Hunt and applies its programmed counter", () => {
    const game = state("screen");
    sub(game, "amber").sectorId = 13;
    sub(game, "cyan").sectorId = 13;
    const result = resolveRound(
      game,
      allPlans(game, {
        amber: plan("amber", {
          1: {
            kind: "hunt",
            pulse: 1,
            assetId: sub(game, "amber").id,
            requiredSectorId: 13,
            targetSeatId: "cyan",
            signalCommitment: 0,
          },
        }),
        cyan: plan("cyan", {
          1: {
            kind: "screen",
            pulse: 1,
            assetId: sub(game, "cyan").id,
            requiredSectorId: 13,
            counterTargetSeatId: "amber",
            signalCommitment: 0,
          },
        }),
      }),
    );
    expect(
      (result.stateAfter.assets[sub(game, "cyan").id] as Submarine).integrity,
    ).toBe(2);
    expect(
      (result.stateAfter.assets[sub(game, "amber").id] as Submarine).integrity,
    ).toBe(1);
  });

  it("a conditional Hunt at an empty sector spends its commitment without public leakage", () => {
    const game = state("miss");
    sub(game, "amber").sectorId = 13;
    sub(game, "cyan").sectorId = 12;
    const result = resolveRound(
      game,
      allPlans(game, {
        amber: plan("amber", {
          1: {
            kind: "hunt",
            pulse: 1,
            assetId: sub(game, "amber").id,
            requiredSectorId: 13,
            targetSeatId: "cyan",
            signalCommitment: 1,
          },
        }),
      }),
    );
    expect(result.stateAfter.seats.amber!.signal).toBe(1);
    expect(
      result.events.some(
        (event) =>
          event.kind === "hunt.missed" && event.visibility === "private",
      ),
    ).toBe(true);
    expect(
      result.events.some(
        (event) =>
          event.kind.startsWith("conflict.") && event.visibility === "public",
      ),
    ).toBe(false);
  });

  it("Go Dark restores Silence and expires linked evidence next Forecast", () => {
    const game = state("dark");
    const amber = sub(game, "amber");
    amber.silence = 0;
    const wake: Evidence = {
      id: "wake-amber",
      kind: "wake",
      sectorId: amber.sectorId,
      fromSectorId: null,
      toSectorId: amber.sectorId,
      ownerId: null,
      subjectId: amber.id,
      observedRound: 1,
      observedPulse: 1,
      expiresAtForecastRound: 3,
      confidence: "partial",
    };
    game.evidence[wake.id] = wake;
    const result = resolveRound(
      game,
      allPlans(game, {
        amber: plan("amber", {
          1: {
            kind: "go_dark",
            pulse: 1,
            assetId: amber.id,
            requiredSectorId: amber.sectorId,
          },
        }),
      }),
    );
    expect((result.stateAfter.assets[amber.id] as Submarine).silence).toBe(2);
    expect(result.stateAfter.evidence[wake.id]!.expiresAtForecastRound).toBe(2);
  });

  it("a Decoy deployed in Pulse 1 starts its route in Pulse 2", () => {
    const game = state("decoy");
    const amber = sub(game, "amber");
    const destination = connectedSectors(game.map, amber.sectorId)[0]!;
    const result = resolveRound(
      game,
      allPlans(game, {
        amber: plan("amber", {
          1: {
            kind: "deploy",
            pulse: 1,
            assetId: amber.id,
            requiredSectorId: amber.sectorId,
            device: "decoy",
            decoyRoute: [destination],
            deviceId: "decoy-amber",
          },
        }),
      }),
    );
    expect(result.stateAfter.devices["decoy-amber"]?.sectorId).toBe(
      destination,
    );
    expect(
      Object.values(result.stateAfter.evidence).some(
        (item) => item.subjectId === "decoy-amber" && item.kind === "wake",
      ),
    ).toBe(true);
  });
});

describe("victory and ownership limits", () => {
  it("recognizes a four-platform connected Network spanning all regions", () => {
    const game = state("network-win");
    platform(game, "n1", "amber", 2, "extractor");
    platform(game, "n2", "amber", 7, "sonar");
    platform(game, "n3", "amber", 12, "laboratory");
    platform(game, "n4", "amber", 13, "extractor");
    game.phase = "claim";
    const result = runClaimCheck(game);
    expect(result.stateAfter.winners).toContain("amber");
    expect(result.stateAfter.winningCharters.amber).toContain("network");
  });

  it("does not transfer a fifth platform to a contender already at the cap", () => {
    const game = state("capture-cap");
    [2, 3, 7, 8].forEach((sectorId, index) =>
      platform(game, `owned:${index}`, "amber", sectorId, "laboratory"),
    );
    const target = platform(game, "target", "cyan", 13, "extractor");
    target.state = "contested";
    game.contests[target.id] = {
      platformId: target.id,
      contenderId: "amber",
      contestedSinceRound: 1,
      transferEligibleRound: 1,
    };
    sub(game, "amber").sectorId = 13;
    sub(game, "cyan").sectorId = 14;
    game.phase = "claim";
    const result = runClaimCheck(game);
    expect((result.stateAfter.assets[target.id] as Platform).ownerId).toBe(
      "cyan",
    );
  });

  it("uses simultaneous co-winners at the round-seven fallback", () => {
    const game = state("fallback");
    game.round = 7;
    game.phase = "claim";
    const result = runClaimCheck(game);
    expect(result.stateAfter.winners).toEqual(["amber", "cyan", "violet"]);
    expect(result.stateAfter.winningCharters.amber).toEqual(["fallback"]);
  });
});
