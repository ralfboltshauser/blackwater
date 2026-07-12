import { describe, expect, it } from "vitest";
import {
  assertRulesInvariants,
  canonicalHash,
  connectedSectors,
  createMatch,
  defaultProgram,
  externalId,
  forwardReport,
  projectForSeat,
  projectPublic,
  resolveRound,
  runClaimCheck,
  runForecast,
  sealObservation,
  settleAtomicTrade,
  type Operation,
  type Platform,
  type Pulse,
  type RulesState,
  type SeatId,
  type Submarine,
  type ThreePulseProgram,
} from "../src/index.js";

const SEATS = [
  { id: "amber", name: "Amber" },
  { id: "cyan", name: "Cyan" },
  { id: "violet", name: "Violet" },
];

function match(seed = "golden-seed"): RulesState {
  return createMatch({
    matchId: externalId("match", seed),
    seed,
    seats: SEATS,
  });
}

function sub(state: RulesState, seatId: SeatId): Submarine {
  return Object.values(state.assets).find(
    (asset): asset is Submarine =>
      asset.kind === "submarine" &&
      asset.ownerId === seatId &&
      asset.callSign === "A-1",
  )!;
}

function ark(state: RulesState, seatId: SeatId) {
  return Object.values(state.assets).find(
    (asset) => asset.kind === "ark" && asset.ownerId === seatId,
  )!;
}

function program(
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

function programsFor(
  state: RulesState,
  override: Record<SeatId, ThreePulseProgram>,
): Record<SeatId, ThreePulseProgram> {
  return Object.fromEntries(
    Object.keys(state.seats).map((seatId) => [
      seatId,
      override[seatId] ?? defaultProgram(seatId),
    ]),
  );
}

function addPlatform(
  state: RulesState,
  id: string,
  ownerId: SeatId,
  sectorId: number,
  module: Platform["module"],
): Platform {
  const platform: Platform = {
    kind: "platform",
    id,
    ownerId,
    sectorId,
    module,
    state: "active",
    jammedThroughForecastRound: null,
    reactivatesAtForecastRound: null,
  };
  state.assets[id] = platform;
  return platform;
}

describe("setup and invariants", () => {
  it("creates complete one- and two-player basin layouts", () => {
    for (const playerCount of [1, 2]) {
      const state = createMatch({
        matchId: `low-count-${playerCount}`,
        seed: `low-count-${playerCount}`,
        seats: SEATS.slice(0, playerCount),
      });
      expect(Object.keys(state.seats)).toHaveLength(playerCount);
      expect(Object.keys(state.map.sectors)).toHaveLength(13);
      expect(
        Object.values(state.map.homeSectors).sort((a, b) => a - b),
      ).toEqual(playerCount === 1 ? [3] : [6, 10]);
      expect(state.map.dominionRequiredSiteIds).toEqual([12, 18]);
      expect(() => assertRulesInvariants(state)).not.toThrow();
    }
  });

  it("rejects empty and oversized expedition lineups", () => {
    expect(() =>
      createMatch({ matchId: "empty", seed: "empty", seats: [] }),
    ).toThrow(/1–6 seats/);
    expect(() =>
      createMatch({
        matchId: "seven",
        seed: "seven",
        seats: Array.from({ length: 7 }, (_, index) => ({
          id: `seat-${index}`,
          name: `P${index}`,
        })),
      }),
    ).toThrow(/1–6 seats/);
  });

  it("creates a deterministic, complete 3-player match", () => {
    const first = match();
    const second = match();
    expect(canonicalHash(first)).toBe(canonicalHash(second));
    expect(Object.keys(first.map.sectors)).toHaveLength(13);
    expect(first.map.coordinateScale).toBe(1000);
    expect(first.map.deepSiteIds).toEqual([12, 13, 18]);
    for (const seat of Object.values(first.seats)) {
      expect(seat.supply).toBe(4);
      expect(seat.signal).toBe(2);
      expect(
        Object.values(first.assets).filter(
          (asset) => asset.ownerId === seat.id,
        ),
      ).toHaveLength(2);
    }
    expect(() => assertRulesInvariants(first)).not.toThrow();
  });

  it("uses all 19 sectors for five and six players", () => {
    const seats = Array.from({ length: 6 }, (_, index) => ({
      id: `seat-${index}`,
      name: `P${index}`,
    }));
    const state = createMatch({ matchId: "six", seed: "six", seats });
    expect(Object.keys(state.map.sectors)).toHaveLength(19);
    expect(state.map.dominionRequiredSiteIds).toEqual([12, 13, 18]);
  });
});

describe("movement, sensing and traps", () => {
  it("Silent Glide emits no wake and bypasses passive Sonar", () => {
    const state = match("silent");
    const amber = sub(state, "amber");
    const destination = connectedSectors(state.map, amber.sectorId)[0]!;
    addPlatform(state, "sonar:cyan", "cyan", destination, "sonar");
    const amberPlan = program("amber", {
      1: {
        kind: "glide",
        pulse: 1,
        assetId: amber.id,
        requiredSectorId: amber.sectorId,
        toSectorId: destination,
        silent: true,
      },
    });
    const result = resolveRound(
      state,
      programsFor(state, { amber: amberPlan }),
    );
    expect(
      Object.values(result.stateAfter.evidence).filter(
        (item) => item.subjectId === amber.id,
      ),
    ).toHaveLength(0);
    expect(
      Object.values(result.stateAfter.observations).filter(
        (item) => item.ownerId === "cyan" && item.subjectId === amber.id,
      ),
    ).toHaveLength(0);
    expect((result.stateAfter.assets[amber.id] as Submarine).silence).toBe(1);
  });

  it("a Spill Snare affects every hostile simultaneous entrant", () => {
    const state = match("snare");
    const target = 13;
    const origin = connectedSectors(state.map, target)[0]!;
    sub(state, "cyan").sectorId = origin;
    sub(state, "violet").sectorId = origin;
    state.devices["snare-amber"] = {
      kind: "snare",
      id: "snare-amber",
      ownerId: "amber",
      sectorId: target,
      mode: "spill",
      state: "armed",
      armedFromPulse: null,
      armedFromRound: 1,
    };
    state.seats.amber!.deviceInventory.snare = 0;
    const plans = programsFor(state, {
      cyan: program("cyan", {
        1: {
          kind: "glide",
          pulse: 1,
          assetId: sub(state, "cyan").id,
          requiredSectorId: origin,
          toSectorId: target,
          silent: false,
        },
      }),
      violet: program("violet", {
        1: {
          kind: "glide",
          pulse: 1,
          assetId: sub(state, "violet").id,
          requiredSectorId: origin,
          toSectorId: target,
          silent: false,
        },
      }),
    });
    const result = resolveRound(state, plans);
    const trigger = result.events.find(
      (event) => event.kind === "snare.triggered",
    );
    expect(trigger?.data.contactCount).toBe(2);
    expect(result.stateAfter.devices["snare-amber"]?.state).toBe("consumed");
  });

  it("Survey is suppressed by a same-Pulse Jam but still spends Signal", () => {
    const state = match("jam");
    const sector = 13;
    const sonar = addPlatform(state, "sonar:cyan", "cyan", sector, "sonar");
    sub(state, "amber").sectorId = sector;
    const result = resolveRound(
      state,
      programsFor(state, {
        amber: program("amber", {
          1: {
            kind: "jam",
            pulse: 1,
            assetId: sub(state, "amber").id,
            requiredSectorId: sector,
            targetPlatformId: sonar.id,
          },
        }),
        cyan: program("cyan", {
          1: {
            kind: "survey",
            pulse: 1,
            assetId: sonar.id,
            requiredSectorId: sector,
          },
        }),
      }),
    );
    expect(
      result.events.some((event) => event.kind === "survey.suppressed"),
    ).toBe(true);
    expect(result.stateAfter.seats.cyan!.signal).toBe(1);
    expect((result.stateAfter.assets[sonar.id] as Platform).state).toBe(
      "jammed",
    );
  });
});

describe("projects, conflicts and harvesting", () => {
  it("simultaneous platform builds at one global anchor all fail for free", () => {
    const state = match("anchor");
    const sector = 8;
    const amberArk = ark(state, "amber");
    const cyanArk = ark(state, "cyan");
    amberArk.sectorId = sector;
    cyanArk.sectorId = sector;
    const result = resolveRound(
      state,
      programsFor(state, {
        amber: program("amber", {
          1: {
            kind: "develop",
            pulse: 1,
            assetId: amberArk.id,
            requiredSectorId: sector,
            project: { kind: "platform", module: "extractor" },
          },
        }),
        cyan: program("cyan", {
          1: {
            kind: "develop",
            pulse: 1,
            assetId: cyanArk.id,
            requiredSectorId: sector,
            project: { kind: "platform", module: "sonar" },
          },
        }),
      }),
    );
    expect(
      Object.values(result.stateAfter.assets).filter(
        (asset) => asset.kind === "platform" && asset.sectorId === sector,
      ),
    ).toHaveLength(0);
    expect(result.stateAfter.seats.amber!.supply).toBe(4);
    expect(result.stateAfter.seats.cyan!.supply).toBe(4);
  });

  it("an uncommitted Raid ties an active platform; one Signal wins by one", () => {
    const state = match("raid");
    const sector = 13;
    const platform = addPlatform(
      state,
      "platform-cyan",
      "cyan",
      sector,
      "extractor",
    );
    sub(state, "amber").sectorId = sector;
    const noCommit = resolveRound(
      state,
      programsFor(state, {
        amber: program("amber", {
          1: {
            kind: "raid",
            pulse: 1,
            assetId: sub(state, "amber").id,
            requiredSectorId: sector,
            targetPlatformId: platform.id,
            signalCommitment: 0,
          },
        }),
      }),
    );
    expect(noCommit.stateAfter.contests[platform.id]).toBeUndefined();

    const committed = resolveRound(
      state,
      programsFor(state, {
        amber: program("amber", {
          1: {
            kind: "raid",
            pulse: 1,
            assetId: sub(state, "amber").id,
            requiredSectorId: sector,
            targetPlatformId: platform.id,
            signalCommitment: 1,
          },
        }),
      }),
    );
    expect(committed.stateAfter.contests[platform.id]?.contenderId).toBe(
      "amber",
    );
    expect((committed.stateAfter.assets[platform.id] as Platform).state).toBe(
      "contested",
    );
  });

  it("equal Harvest force leaves site stock and exposes participants", () => {
    const state = match("harvest");
    const sector = 12;
    sub(state, "amber").sectorId = sector;
    sub(state, "cyan").sectorId = sector;
    const stock = state.sites[sector]!.stockSpecimenId;
    const result = resolveRound(
      state,
      programsFor(state, {
        amber: program("amber", {
          1: {
            kind: "harvest",
            pulse: 1,
            assetId: sub(state, "amber").id,
            requiredSectorId: sector,
            targetId: `site:${sector}`,
            signalCommitment: 0,
          },
        }),
        cyan: program("cyan", {
          1: {
            kind: "harvest",
            pulse: 1,
            assetId: sub(state, "cyan").id,
            requiredSectorId: sector,
            targetId: `site:${sector}`,
            signalCommitment: 0,
          },
        }),
      }),
    );
    expect(result.stateAfter.sites[sector]!.stockSpecimenId).toBe(stock);
    expect(
      result.events.find((event) => event.kind === "harvest.tied")?.data
        .participantIds,
    ).toEqual(["amber", "cyan"]);
  });
});

describe("Forecast, capture and victory", () => {
  it("Forecast produces capped infrastructure income and replenishes sites", () => {
    const state = match("forecast");
    state.round = 2;
    state.phase = "forecast";
    const home = ark(state, "amber").sectorId;
    addPlatform(state, "extractor:amber", "amber", home, "extractor");
    const other = connectedSectors(state.map, home)[0]!;
    addPlatform(state, "sonar:amber", "amber", other, "sonar");
    state.sites[12]!.stockSpecimenId = null;
    const result = runForecast(state);
    expect(result.stateAfter.seats.amber!.supply).toBe(7);
    expect(result.stateAfter.seats.amber!.signal).toBe(4);
    expect(result.stateAfter.sites[12]!.stockSpecimenId).not.toBeNull();
    expect(result.stateAfter.phase).toBe("planning");
  });

  it("eligible Contested platform transfers only under unique contender control", () => {
    const state = match("capture");
    const sector = 13;
    const platform = addPlatform(
      state,
      "platform-cyan",
      "cyan",
      sector,
      "laboratory",
    );
    platform.state = "contested";
    state.contests[platform.id] = {
      platformId: platform.id,
      contenderId: "amber",
      contestedSinceRound: 1,
      transferEligibleRound: 1,
    };
    sub(state, "amber").sectorId = sector;
    sub(state, "cyan").sectorId = connectedSectors(state.map, sector)[0]!;
    state.phase = "claim";
    const result = runClaimCheck(state);
    expect((result.stateAfter.assets[platform.id] as Platform).ownerId).toBe(
      "amber",
    );
    expect((result.stateAfter.assets[platform.id] as Platform).state).toBe(
      "inactive",
    );
  });

  it("Discovery checks distinct hidden types and allows simultaneous winners", () => {
    const state = match("victory");
    const sector = 13;
    for (const seatId of ["amber", "cyan"] as const) {
      const specimenIds = state.map.deepSiteIds.map(
        (siteId) => state.sites[siteId]!.stockSpecimenId!,
      );
      state.seats[seatId]!.analyzedSpecimenIds = [...specimenIds];
      const seatArk = ark(state, seatId);
      seatArk.sectorId = sector + (seatId === "amber" ? 0 : 1);
      addPlatform(
        state,
        `lab-${seatId}`,
        seatId,
        seatArk.sectorId,
        "laboratory",
      );
    }
    state.phase = "claim";
    const result = runClaimCheck(state);
    expect(result.stateAfter.winners).toEqual(["amber", "cyan"]);
    expect(result.stateAfter.winningCharters.amber).toContain("discovery");
    expect(result.stateAfter.winningCharters.cyan).toContain("discovery");
  });
});

describe("information boundaries and social actions", () => {
  it("public and opponent projections never contain hidden sub positions or Signal", () => {
    const state = match("projection");
    sub(state, "amber").sectorId = 13;
    state.seats.amber!.signal = 9;
    state.devices.secret = {
      kind: "snare",
      id: "secret",
      ownerId: "amber",
      sectorId: 13,
      mode: "tag",
      state: "armed",
      armedFromPulse: null,
      armedFromRound: 1,
    };
    state.seats.amber!.deviceInventory.snare = 0;
    const publicText = JSON.stringify(projectPublic(state));
    const opponentText = JSON.stringify(projectForSeat(state, "cyan"));
    expect(publicText).not.toContain(sub(state, "amber").id);
    expect(publicText).not.toContain('"signal":9');
    expect(opponentText).not.toContain(sub(state, "amber").id);
    expect(opponentText).not.toContain('"signal":9');
    expect(
      projectForSeat(state, "amber").assets.some(
        (asset) => asset.id === sub(state, "amber").id,
      ),
    ).toBe(true);
  });

  it("aliases canonical contact subjects before projecting low-confidence Sonar", () => {
    const state = match("contact-alias");
    state.observations["observation-opaque"] = {
      id: "observation-opaque",
      ownerId: "cyan",
      source: "passive_sonar",
      sectorId: 13,
      observedRound: 1,
      observedPulse: 1,
      contactClass: "submarine",
      subjectId: sub(state, "amber").id,
      identitySeatId: null,
      specimenType: null,
      contactCount: 1,
      direction: "unknown",
      confidence: 50,
    };
    const projection = projectForSeat(state, "cyan");
    expect(projection.observations[0]?.contactId).toBe("observation-opaque");
    expect(JSON.stringify(projection.observations)).not.toContain(
      sub(state, "amber").id,
    );
  });

  it("sealed forwarding copies custody and an atomic trade respects resources", () => {
    let state = match("social");
    state.seats.amber!.faction = "concord_relay";
    state.observations.obs = {
      id: "obs",
      ownerId: "amber",
      source: "active_survey",
      sectorId: 13,
      observedRound: 1,
      observedPulse: 1,
      contactClass: "submarine",
      subjectId: sub(state, "cyan").id,
      identitySeatId: "cyan",
      specimenType: null,
      contactCount: 1,
      direction: "still",
      confidence: 100,
    };
    state = sealObservation(state, "amber", "obs").stateAfter;
    const reportId = Object.keys(state.reports)[0]!;
    state = forwardReport(state, "amber", "cyan", reportId).stateAfter;
    expect(
      state.reportGrants
        .filter((grant) => grant.reportId === reportId)
        .map((grant) => grant.seatId)
        .sort(),
    ).toEqual(["amber", "cyan"]);
    const cyanReport = projectForSeat(state, "cyan").reports.find(
      (report) => report.reportId === reportId,
    );
    expect(cyanReport?.verified).toBe(true);
    expect(cyanReport?.fields.identitySeatId).toBe("cyan");
    expect(JSON.stringify(cyanReport)).not.toContain(sub(state, "cyan").id);
    state = settleAtomicTrade(state, "trade-1", [
      { kind: "supply", fromSeatId: "amber", toSeatId: "cyan", amount: 2 },
      { kind: "report", fromSeatId: "amber", toSeatId: "violet", reportId },
    ]).stateAfter;
    expect(state.seats.amber!.supply).toBe(2);
    expect(state.seats.cyan!.supply).toBe(6);
    expect(
      state.reportGrants.some(
        (grant) => grant.reportId === reportId && grant.seatId === "violet",
      ),
    ).toBe(true);
  });
});

describe("determinism", () => {
  it("resolves the same immutable round input byte-identically", () => {
    const state = match("repeat");
    const amber = sub(state, "amber");
    const destination = connectedSectors(state.map, amber.sectorId)[0]!;
    const allPrograms = programsFor(state, {
      amber: program("amber", {
        1: {
          kind: "glide",
          pulse: 1,
          assetId: amber.id,
          requiredSectorId: amber.sectorId,
          toSectorId: destination,
          silent: false,
        },
      }),
    });
    const first = resolveRound(state, allPrograms);
    const second = resolveRound(state, allPrograms);
    expect(canonicalHash(first)).toBe(canonicalHash(second));
    expect(() => assertRulesInvariants(first.stateAfter)).not.toThrow();
  });
});
