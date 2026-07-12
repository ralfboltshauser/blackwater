import { describe, expect, it } from "vitest";
import {
  connectedSectors,
  createMatch,
  createStatement,
  externalId,
  resolveRound,
  sealObservation,
  type Snare,
} from "../../packages/game-core/src/index.js";
import {
  AssetIdSchema,
  ContactIdSchema,
  DeviceIdSchema,
  DraftPlanSchema,
  EventIdSchema,
  MatchIdSchema,
  PlatformIdSchema,
  ReportIdSchema,
  SeatIdSchema,
  SpecimenIdSchema,
} from "../../packages/protocol/src/index.js";
import {
  allPrograms,
  ark,
  createTestMatch,
  program,
  submarine,
} from "./helpers.js";

const BOUNDED_ID = /^[A-Za-z0-9_-]{3,64}$/;

describe("game-core and wire identifier contract", () => {
  it("keeps every generated, externally addressable identifier wire-safe", () => {
    const state = createTestMatch(3, "generated-id-contract");
    const targetSector = 13;
    const originSector = connectedSectors(state.map, targetSector)[0]!;
    const amberSub = submarine(state, "amber");
    amberSub.sectorId = originSector;

    const cargoId = state.sites[12]!.stockSpecimenId!;
    state.sites[12]!.stockSpecimenId = null;
    amberSub.cargo.push(cargoId);
    state.specimens[cargoId]!.knownTo.push("amber");

    const cyanSnare: Snare = {
      kind: "snare",
      id: "device-cyan-snare",
      ownerId: "cyan",
      sectorId: targetSector,
      mode: "spill",
      state: "armed",
      armedFromPulse: null,
      armedFromRound: 1,
    };
    state.devices[cyanSnare.id] = cyanSnare;
    state.seats.cyan!.deviceInventory.snare = 0;

    const cyanArk = ark(state, "cyan");
    const plans = allPrograms(state, {
      amber: program("amber", {
        1: {
          kind: "glide",
          pulse: 1,
          assetId: amberSub.id,
          requiredSectorId: originSector,
          toSectorId: targetSector,
          silent: false,
        },
        2: {
          kind: "deploy",
          pulse: 2,
          assetId: amberSub.id,
          requiredSectorId: targetSector,
          device: "decoy",
          decoyRoute: [],
        },
        3: {
          kind: "survey",
          pulse: 3,
          assetId: amberSub.id,
          requiredSectorId: targetSector,
        },
      }),
      cyan: program("cyan", {
        1: {
          kind: "develop",
          pulse: 1,
          assetId: cyanArk.id,
          requiredSectorId: cyanArk.sectorId,
          project: { kind: "platform", module: "sonar" },
        },
      }),
    });

    expect(() =>
      DraftPlanSchema.parse({ operations: plans.amber!.operations }),
    ).not.toThrow();
    const result = resolveRound(state, plans);

    expect(MatchIdSchema.parse(result.stateAfter.matchId)).toBe(
      result.stateAfter.matchId,
    );
    for (const seatId of Object.keys(result.stateAfter.seats))
      expect(SeatIdSchema.parse(seatId)).toBe(seatId);
    for (const asset of Object.values(result.stateAfter.assets)) {
      expect(AssetIdSchema.parse(asset.id)).toBe(asset.id);
      if (asset.kind === "platform")
        expect(PlatformIdSchema.parse(asset.id)).toBe(asset.id);
    }
    for (const device of Object.values(result.stateAfter.devices))
      expect(DeviceIdSchema.parse(device.id)).toBe(device.id);
    for (const specimen of Object.values(result.stateAfter.specimens))
      expect(SpecimenIdSchema.parse(specimen.id)).toBe(specimen.id);
    for (const evidence of Object.values(result.stateAfter.evidence))
      expect(ContactIdSchema.parse(evidence.id)).toBe(evidence.id);
    for (const observation of Object.values(result.stateAfter.observations))
      expect(ContactIdSchema.parse(observation.id)).toBe(observation.id);
    for (const item of Object.values(result.stateAfter.salvage))
      expect(item.id).toMatch(BOUNDED_ID);
    for (const event of result.events)
      expect(EventIdSchema.parse(event.id)).toBe(event.id);

    const observation = Object.values(result.stateAfter.observations)[0]!;
    const sealed = sealObservation(
      result.stateAfter,
      observation.ownerId,
      observation.id,
    );
    const reportId = Object.keys(sealed.stateAfter.reports)[0]!;
    expect(ReportIdSchema.parse(reportId)).toBe(reportId);
    for (const event of sealed.events)
      expect(EventIdSchema.parse(event.id)).toBe(event.id);

    const statement = createStatement(
      sealed.stateAfter,
      "amber",
      ["cyan"],
      "Possible contact near the central trench.",
      13,
    );
    const statementId = Object.keys(statement.stateAfter.reports).find(
      (id) => !sealed.stateAfter.reports[id],
    )!;
    expect(ReportIdSchema.parse(statementId)).toBe(statementId);
  });

  it("hash-compacts derived IDs when valid 64-character seat IDs are used", () => {
    const seatIds = ["a", "b", "c"].map(
      (letter) => `seat-${letter.repeat(59)}`,
    );
    const state = createMatch({
      matchId: externalId("match", "long-seat-derived-ids"),
      seed: "long-seat-derived-ids",
      seats: seatIds.map((id, index) => ({ id, name: `Player ${index + 1}` })),
    });

    expect(new Set(Object.keys(state.assets)).size).toBe(6);
    for (const seatId of seatIds)
      expect(SeatIdSchema.parse(seatId)).toBe(seatId);
    for (const assetId of Object.keys(state.assets)) {
      expect(assetId.length).toBeLessThanOrEqual(64);
      expect(AssetIdSchema.parse(assetId)).toBe(assetId);
    }
  });

  it("rejects setup identifiers that the protocol could never address", () => {
    expect(() =>
      createMatch({
        matchId: "match:unsafe",
        seed: "unsafe",
        seats: [
          { id: "amber", name: "Amber" },
          { id: "cyan", name: "Cyan" },
          { id: "violet", name: "Violet" },
        ],
      }),
    ).toThrow(/protocol ID contract/);
  });
});
