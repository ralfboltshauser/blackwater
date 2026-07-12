import { describe, expect, it } from "vitest";
import {
  assertRulesInvariants,
  connectedSectors,
  projectForSeat,
  recordHandshake,
  reserveProgram,
  resolveRound,
  runClaimCheck,
  runForecast,
  settleAtomicTrade,
  validateProgram,
  type CanonicalEvent,
} from "../../packages/game-core/src/index.js";
import {
  CreateDealCommandSchema,
  DraftPlanSchema,
  PROTOCOL_VERSION,
} from "../../packages/protocol/src/index.js";
import {
  allPrograms,
  ark,
  createTestMatch,
  program,
  submarine,
} from "./helpers.js";

function eventOrder(event: CanonicalEvent): [number, number, number] {
  return [event.pulse ?? 0, event.stage, event.ordinal];
}

describe("three-pulse operation lifecycle", () => {
  it("validates, reserves, resolves, claims, and forecasts one complete round", () => {
    let state = createTestMatch(3, "complete-operation-lifecycle");
    const amberSub = submarine(state, "amber");
    amberSub.sectorId = 12;
    const initialSilence = amberSub.silence;
    const stockId = state.sites[13]!.stockSpecimenId!;
    const amberPlan = program("amber", {
      1: {
        kind: "glide",
        pulse: 1,
        assetId: amberSub.id,
        requiredSectorId: 12,
        toSectorId: 13,
        silent: true,
      },
      2: {
        kind: "survey",
        pulse: 2,
        assetId: amberSub.id,
        requiredSectorId: 13,
      },
      3: {
        kind: "harvest",
        pulse: 3,
        assetId: amberSub.id,
        requiredSectorId: 13,
        targetId: "site:13",
        signalCommitment: 1,
      },
    });

    expect(
      DraftPlanSchema.safeParse({ operations: amberPlan.operations }).success,
    ).toBe(true);
    expect(validateProgram(state, "amber", amberPlan)).toMatchObject({
      valid: true,
      reservedSupply: 0,
      reservedSignal: 2,
    });
    expect(reserveProgram(state, amberPlan).valid).toBe(true);
    expect(state.programEscrows.amber).toEqual({ signal: 2, supply: 0 });

    const resolved = resolveRound(
      state,
      allPrograms(state, { amber: amberPlan }),
    );
    state = resolved.stateAfter;
    expect(state.phase).toBe("claim");
    expect(submarine(state, "amber")).toMatchObject({
      sectorId: 13,
      silence: initialSilence - 1,
      cargo: [stockId],
    });
    expect(state.seats.amber!.signal).toBe(0);
    expect(state.sites[13]!.stockSpecimenId).toBeNull();
    expect(resolved.events.some((event) => event.kind === "survey.ping")).toBe(
      true,
    );
    expect(
      resolved.events.some((event) => event.kind === "harvest.acquired"),
    ).toBe(true);
    for (let index = 1; index < resolved.events.length; index += 1) {
      const previous = eventOrder(resolved.events[index - 1]!);
      const current = eventOrder(resolved.events[index]!);
      expect(
        previous[0] < current[0] ||
          (previous[0] === current[0] && previous[1] <= current[1]),
      ).toBe(true);
    }
    assertRulesInvariants(state);

    state = runClaimCheck(state).stateAfter;
    expect(state.phase).toBe("forecast");
    expect(state.round).toBe(2);
    state = runForecast(state).stateAfter;
    expect(state.phase).toBe("planning");
    expect(state.sites[13]!.stockSpecimenId).not.toBeNull();
    expect(submarine(state, "amber").cargo).toEqual([stockId]);
    expect(state.seats.amber!.signal).toBe(1);
    assertRulesInvariants(state);
  });

  it("uses the last accepted program and defaults every missing seat to Hold", () => {
    const state = createTestMatch(3, "accepted-plan-and-offline-hold");
    const amberSub = submarine(state, "amber");
    const cyanSub = submarine(state, "cyan");
    const amberOrigin = amberSub.sectorId;
    const destination = connectedSectors(state.map, amberOrigin)[0]!;
    const cyanOrigin = cyanSub.sectorId;
    const accepted = program("amber", {
      1: {
        kind: "glide",
        pulse: 1,
        assetId: amberSub.id,
        requiredSectorId: amberOrigin,
        toSectorId: destination,
        silent: true,
      },
    });

    expect(reserveProgram(state, accepted).valid).toBe(true);
    const resolved = resolveRound(state);
    expect(submarine(resolved.stateAfter, "amber").sectorId).toBe(destination);
    expect(submarine(resolved.stateAfter, "cyan").sectorId).toBe(cyanOrigin);
    expect(resolved.stateAfter.programs.cyan!.operations).toEqual([
      { kind: "hold", pulse: 1 },
      { kind: "hold", pulse: 2 },
      { kind: "hold", pulse: 3 },
    ]);
  });

  it("does not spend later commitments after an earlier pulse disables the asset", () => {
    const state = createTestMatch(3, "mid-round-invalidation");
    const amberSub = submarine(state, "amber");
    const cyanSub = submarine(state, "cyan");
    amberSub.sectorId = 13;
    cyanSub.sectorId = 13;

    const resolved = resolveRound(
      state,
      allPrograms(state, {
        amber: program("amber", {
          1: {
            kind: "hunt",
            pulse: 1,
            assetId: amberSub.id,
            requiredSectorId: 13,
            targetSeatId: "cyan",
            signalCommitment: 2,
          },
        }),
        cyan: program("cyan", {
          2: {
            kind: "survey",
            pulse: 2,
            assetId: cyanSub.id,
            requiredSectorId: 13,
          },
        }),
      }),
    );

    const cyanAfter = submarine(resolved.stateAfter, "cyan");
    expect(cyanAfter.status).toBe("disabled");
    expect(cyanAfter.invalidatedForRound).toBe(1);
    expect(resolved.stateAfter.seats.cyan!.signal).toBe(2);
    expect(
      resolved.events.some(
        (event) =>
          event.kind === "survey.ping" && event.data.ownerId === "cyan",
      ),
    ).toBe(false);
  });
});

describe("physical specimen handoff prerequisites", () => {
  it("moves a specimen atomically only between co-located submarines with capacity", () => {
    const state = createTestMatch(3, "specimen-handoff-success");
    const amberSub = submarine(state, "amber");
    const cyanSub = submarine(state, "cyan");
    amberSub.sectorId = 13;
    cyanSub.sectorId = 13;
    const specimenId = state.sites[12]!.stockSpecimenId!;
    state.sites[12]!.stockSpecimenId = null;
    amberSub.cargo.push(specimenId);
    state.specimens[specimenId]!.knownTo = ["amber"];

    const transition = settleAtomicTrade(state, "trade-specimen-handoff", [
      {
        kind: "specimen",
        fromSeatId: "amber",
        toSeatId: "cyan",
        fromSubmarineId: amberSub.id,
        toSubmarineId: cyanSub.id,
        specimenId,
      },
    ]);

    expect(submarine(transition.stateAfter, "amber").cargo).not.toContain(
      specimenId,
    );
    expect(submarine(transition.stateAfter, "cyan").cargo).toContain(
      specimenId,
    );
    expect(transition.stateAfter.specimens[specimenId]!.knownTo).toEqual([
      "amber",
      "cyan",
    ]);
    expect(submarine(state, "amber").cargo).toContain(specimenId);
  });

  it("rejects handoff when submarines are not co-located or the receiver is full", () => {
    const separated = createTestMatch(3, "specimen-handoff-separated");
    const amberSub = submarine(separated, "amber");
    const cyanSub = submarine(separated, "cyan");
    amberSub.sectorId = 12;
    cyanSub.sectorId = 13;
    const specimenId = separated.sites[12]!.stockSpecimenId!;
    separated.sites[12]!.stockSpecimenId = null;
    amberSub.cargo.push(specimenId);
    expect(() =>
      settleAtomicTrade(separated, "trade-separated", [
        {
          kind: "specimen",
          fromSeatId: "amber",
          toSeatId: "cyan",
          fromSubmarineId: amberSub.id,
          toSubmarineId: cyanSub.id,
          specimenId,
        },
      ]),
    ).toThrow(/not currently legal/);

    const full = createTestMatch(3, "specimen-handoff-full");
    const fullAmber = submarine(full, "amber");
    const fullCyan = submarine(full, "cyan");
    fullAmber.sectorId = 13;
    fullCyan.sectorId = 13;
    const stock = Object.values(full.sites).map(
      (site) => site.stockSpecimenId!,
    );
    for (const site of Object.values(full.sites)) site.stockSpecimenId = null;
    fullAmber.cargo = [stock[0]!];
    fullCyan.cargo = [stock[1]!, stock[2]!];
    expect(() =>
      settleAtomicTrade(full, "trade-full-cargo", [
        {
          kind: "specimen",
          fromSeatId: "amber",
          toSeatId: "cyan",
          fromSubmarineId: fullAmber.id,
          toSubmarineId: fullCyan.id,
          specimenId: stock[0]!,
        },
      ]),
    ).toThrow(/not currently legal/);
  });

  it("rejects a three-party attempt to clone one physical specimen atomically", () => {
    const state = createTestMatch(3, "specimen-cloning-rejected");
    state.seats.amber!.faction = "concord_relay";
    const amberSub = submarine(state, "amber");
    const cyanSub = submarine(state, "cyan");
    const violetSub = submarine(state, "violet");
    amberSub.sectorId = 13;
    cyanSub.sectorId = 13;
    violetSub.sectorId = 13;
    const specimenId = state.sites[12]!.stockSpecimenId!;
    state.sites[12]!.stockSpecimenId = null;
    amberSub.cargo = [specimenId];

    expect(() =>
      settleAtomicTrade(state, "trade-clone-attempt", [
        {
          kind: "specimen",
          fromSeatId: "amber",
          toSeatId: "cyan",
          fromSubmarineId: amberSub.id,
          toSubmarineId: cyanSub.id,
          specimenId,
        },
        {
          kind: "specimen",
          fromSeatId: "amber",
          toSeatId: "violet",
          fromSubmarineId: amberSub.id,
          toSubmarineId: violetSub.id,
          specimenId,
        },
      ]),
    ).toThrow(/only once/);
    expect(submarine(state, "amber").cargo).toEqual([specimenId]);
    expect(submarine(state, "cyan").cargo).toEqual([]);
    expect(submarine(state, "violet").cargo).toEqual([]);
  });
});

describe("deal command contract", () => {
  it("allows a no-payment Handshake while recording binding public terms", () => {
    const command = CreateDealCommandSchema.parse({
      protocol: PROTOCOL_VERSION,
      commandId: "command-handshake-empty",
      matchId: "match-handshake-empty",
      phaseId: "planning-round-1",
      sessionEpoch: 0,
      clientInstanceId: "client-instance-amber",
      writerLeaseId: "writer-lease-amber-000000000000",
      type: "deal.create",
      expected: { kind: "none" },
      payload: {
        recipientSeatId: "cyan",
        mode: "handshake",
        give: {},
        receive: {},
        term: {
          kind: "safe-passage",
          sectorIds: [13],
          note: null,
        },
        expiresAtPhaseId: "planning-round-2",
      },
    });
    expect(command.payload.give).toEqual({
      reportIds: [],
      signal: 0,
      specimenIds: [],
      supply: 0,
    });
    expect(command.payload.receive).toEqual({
      reportIds: [],
      signal: 0,
      specimenIds: [],
      supply: 0,
    });

    const transition = recordHandshake(
      createTestMatch(3, "no-payment-handshake"),
      "handshake-no-payment",
      ["amber", "cyan"],
      [13],
      { prohibitHunt: false, prohibitRaid: false, safePassageDevices: true },
    );
    expect(transition.stateAfter.deals["handshake-no-payment"]).toMatchObject({
      kind: "handshake",
      status: "active",
      partyIds: ["amber", "cyan"],
      safePassageDevices: true,
    });
    expect(transition.events[0]).toMatchObject({
      kind: "handshake.recorded",
      visibility: "public",
    });
  });

  it("rejects combined incoming transfers above the authoritative resource cap", () => {
    const state = createTestMatch(3, "combined-resource-cap");
    state.seats.amber!.supply = 98;
    state.seats.cyan!.supply = 4;
    expect(() =>
      settleAtomicTrade(state, "trade-over-resource-cap", [
        {
          kind: "supply",
          fromSeatId: "cyan",
          toSeatId: "amber",
          amount: 1,
        },
        {
          kind: "supply",
          fromSeatId: "cyan",
          toSeatId: "amber",
          amount: 1,
        },
      ]),
    ).toThrow(/balance cap/);
    expect(state.seats.amber!.supply).toBe(98);

    const boundary = settleAtomicTrade(state, "trade-at-resource-cap", [
      {
        kind: "supply",
        fromSeatId: "cyan",
        toSeatId: "amber",
        amount: 1,
      },
    ]).stateAfter;
    expect(boundary.seats.amber!.supply).toBe(99);
    assertRulesInvariants(boundary);
  });

  it("clamps Forecast production and Concord's trade bonus at 99", () => {
    const forecastState = createTestMatch(3, "forecast-resource-cap");
    forecastState.round = 2;
    forecastState.phase = "forecast";
    forecastState.seats.amber!.supply = 99;
    forecastState.seats.amber!.signal = 99;
    const forecast = runForecast(forecastState);
    expect(forecast.stateAfter.seats.amber).toMatchObject({
      signal: 99,
      supply: 99,
    });
    expect(
      forecast.events.find(
        (event) =>
          event.kind === "production.received" && event.data.seatId === "amber",
      )?.data.supply,
    ).toBe(0);
    expect(
      forecast.events.find(
        (event) =>
          event.kind === "production.signal" && event.data.seatId === "amber",
      )?.data.signal,
    ).toBe(0);

    const tradeState = createTestMatch(3, "concord-resource-cap");
    tradeState.seats.amber!.faction = "concord_relay";
    tradeState.seats.amber!.signal = 99;
    const traded = settleAtomicTrade(tradeState, "trade-concord-at-cap", [
      {
        kind: "supply",
        fromSeatId: "amber",
        toSeatId: "cyan",
        amount: 1,
      },
    ]).stateAfter;
    expect(traded.seats.amber!.signal).toBe(99);
    expect(traded.seats.amber!.factionUses.concordTradeUsed).toBe(true);
    assertRulesInvariants(traded);
  });
});

describe("adversarial operation hardening", () => {
  it("validates repair ownership, need, and projected co-location", () => {
    const state = createTestMatch(3, "repair-known-facts");
    const amberArk = ark(state, "amber");
    const amberSub = submarine(state, "amber");
    const cyanSub = submarine(state, "cyan");
    const destination = connectedSectors(state.map, amberArk.sectorId)[0]!;
    amberSub.integrity = 1;
    amberSub.sectorId = destination;

    const separated = program("amber", {
      1: {
        kind: "develop",
        pulse: 1,
        assetId: amberArk.id,
        requiredSectorId: amberArk.sectorId,
        project: { kind: "repair_submarine", submarineId: amberSub.id },
      },
    });
    expect(validateProgram(state, "amber", separated).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "REPAIR_NOT_COLOCATED" }),
      ]),
    );

    cyanSub.sectorId = amberArk.sectorId;
    cyanSub.integrity = 1;
    const hostile = program("amber", {
      1: {
        kind: "develop",
        pulse: 1,
        assetId: amberArk.id,
        requiredSectorId: amberArk.sectorId,
        project: { kind: "repair_submarine", submarineId: cyanSub.id },
      },
    });
    expect(validateProgram(state, "amber", hostile).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "REPAIR_TARGET_NOT_OWNED" }),
      ]),
    );

    amberSub.sectorId = amberArk.sectorId;
    amberSub.integrity = 2;
    const healthy = program("amber", {
      1: {
        kind: "develop",
        pulse: 1,
        assetId: amberArk.id,
        requiredSectorId: amberArk.sectorId,
        project: { kind: "repair_submarine", submarineId: amberSub.id },
      },
    });
    expect(validateProgram(state, "amber", healthy).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "REPAIR_NOT_NEEDED" }),
      ]),
    );

    amberSub.integrity = 1;
    const projected = program("amber", {
      1: {
        kind: "glide",
        pulse: 1,
        assetId: amberSub.id,
        requiredSectorId: amberSub.sectorId,
        toSectorId: destination,
        silent: false,
      },
      2: {
        kind: "navigate",
        pulse: 2,
        assetId: amberArk.id,
        requiredSectorId: amberArk.sectorId,
        toSectorId: destination,
      },
      3: {
        kind: "develop",
        pulse: 3,
        assetId: amberArk.id,
        requiredSectorId: destination,
        project: { kind: "repair_submarine", submarineId: amberSub.id },
      },
    });
    expect(validateProgram(state, "amber", projected).valid).toBe(true);
  });

  it("never lets a requested project ID overwrite an existing asset", () => {
    const state = createTestMatch(3, "project-id-collision");
    const amberArk = ark(state, "amber");
    const cyanArk = ark(state, "cyan");
    const resolved = resolveRound(
      state,
      allPrograms(state, {
        amber: program("amber", {
          1: {
            kind: "develop",
            pulse: 1,
            assetId: amberArk.id,
            requiredSectorId: amberArk.sectorId,
            project: {
              kind: "platform",
              module: "extractor",
              projectId: cyanArk.id,
            },
          },
        }),
      }),
    );

    expect(resolved.stateAfter.assets[cyanArk.id]).toMatchObject({
      kind: "ark",
      ownerId: "cyan",
    });
    const amberPlatforms = Object.values(resolved.stateAfter.assets).filter(
      (asset) => asset.kind === "platform" && asset.ownerId === "amber",
    );
    expect(amberPlatforms).toHaveLength(1);
    expect(amberPlatforms[0]!.id).not.toBe(cyanArk.id);
    assertRulesInvariants(resolved.stateAfter);
  });

  it("prunes consumed device history at Claim while retaining live charges", () => {
    const state = createTestMatch(3, "consumed-device-pruning");
    const sectorId = submarine(state, "amber").sectorId;
    state.devices["device-amber-consumed"] = {
      kind: "snare",
      id: "device-amber-consumed",
      ownerId: "amber",
      sectorId,
      mode: "tag",
      state: "consumed",
      armedFromPulse: null,
      armedFromRound: 1,
    };
    state.devices["device-amber-live"] = {
      kind: "decoy",
      id: "device-amber-live",
      ownerId: "amber",
      sectorId,
      route: [],
      routeIndex: 0,
      state: "armed",
      armedFromPulse: null,
      armedFromRound: 1,
      expiresAfterRound: 2,
    };
    state.seats.amber!.deviceInventory.decoy = 0;
    state.phase = "claim";
    assertRulesInvariants(state);

    const claimed = runClaimCheck(state).stateAfter;
    expect(claimed.devices["device-amber-consumed"]).toBeUndefined();
    expect(claimed.devices["device-amber-live"]).toBeDefined();
    assertRulesInvariants(claimed);
  });

  it("never lets a requested device ID overwrite a hidden opponent device", () => {
    const state = createTestMatch(3, "device-id-collision");
    const amberSub = submarine(state, "amber");
    state.devices["device-cyan-hidden"] = {
      kind: "snare",
      id: "device-cyan-hidden",
      ownerId: "cyan",
      sectorId: 13,
      mode: "spill",
      state: "armed",
      armedFromPulse: null,
      armedFromRound: 1,
    };
    state.seats.cyan!.deviceInventory.snare = 0;
    const resolved = resolveRound(
      state,
      allPrograms(state, {
        amber: program("amber", {
          1: {
            kind: "deploy",
            pulse: 1,
            assetId: amberSub.id,
            requiredSectorId: amberSub.sectorId,
            device: "snare",
            snareMode: "tag",
            deviceId: "device-cyan-hidden",
          },
        }),
      }),
    );

    expect(resolved.stateAfter.devices["device-cyan-hidden"]).toMatchObject({
      ownerId: "cyan",
      mode: "spill",
    });
    const amberDevices = Object.values(resolved.stateAfter.devices).filter(
      (device) => device.ownerId === "amber",
    );
    expect(amberDevices).toHaveLength(1);
    expect(amberDevices[0]!.id).not.toBe("device-cyan-hidden");
    assertRulesInvariants(resolved.stateAfter);
  });

  it("projects analyzed specimen types as a distinct semantic set", () => {
    const state = createTestMatch(3, "distinct-analyzed-types");
    const specimenIds = Object.keys(state.specimens);
    state.seats.amber!.analyzedSpecimenIds = [
      specimenIds[0]!,
      specimenIds[1]!,
      specimenIds[0]!,
      specimenIds[2]!,
      specimenIds[1]!,
      specimenIds[2]!,
      specimenIds[0]!,
    ];

    expect(projectForSeat(state, "amber").seat.analyzedTypes).toEqual(
      [
        ...new Set(
          Object.values(state.specimens).map((specimen) => specimen.type),
        ),
      ].sort(),
    );
    expect(
      projectForSeat(state, "amber").seat.analyzedTypes.length,
    ).toBeLessThanOrEqual(3);
  });
});
