import { describe, expect, it } from "vitest";
import type { DraftPlan, PlayerProjection } from "@blackwater/protocol";
import {
  OPERATION_META,
  blankEditor,
  buildOperation,
  operationMenuForAsset,
  playableAssets,
  replacePulse,
} from "./operations";

const holdPlan: DraftPlan = {
  operations: [
    { kind: "hold", pulse: 1, assetId: "sub_amber_a", requiredSectorId: 1 },
    { kind: "hold", pulse: 2 },
    { kind: "hold", pulse: 3 },
  ],
};

function projection(): PlayerProjection {
  return {
    seatId: "seat_amber",
    faction: "symmetric",
    resources: { supply: 4, signal: 2 },
    deviceInventory: { snare: 1, decoy: 1 },
    submarines: [
      {
        assetId: "sub_amber_a",
        sectorId: 1,
        integrity: 2,
        state: "active",
        silence: 2,
        maxSilence: 2,
        usableFromRound: 1,
        returnAtRound: null,
        incomingSectorId: null,
        cargo: [],
      },
      {
        assetId: "sub_amber_b",
        sectorId: 1,
        integrity: 1,
        state: "active",
        silence: 1,
        maxSilence: 2,
        usableFromRound: 1,
        returnAtRound: null,
        incomingSectorId: null,
        cargo: [],
      },
    ],
    devices: [],
    analyzedTypes: [],
    observations: [],
    reports: [],
    deals: [],
    resultCards: [],
    draft: {
      revision: 0,
      locked: false,
      plan: holdPlan,
      reservedSupply: 0,
      reservedSignal: 0,
      valid: true,
      invalidReasons: [],
      submittedPulses: [],
    },
    public: {
      matchId: "match_test",
      roomCode: "ABC234",
      lifecycle: "active",
      phase: {
        phaseId: "phase_test",
        epoch: 1,
        kind: "open-water",
        round: 1,
        pulse: null,
        paused: false,
        pauseReason: null,
        endsAtServerMs: null,
        finalLockAtServerMs: null,
      },
      topology: {
        basinId: "basin_test",
        sectors: [
          {
            sectorId: 1,
            name: "Shelf",
            region: "shelf",
            position: { x: 0.2, y: 0.2 },
            buildSite: true,
            deepSite: false,
          },
          {
            sectorId: 2,
            name: "Rift",
            region: "rift",
            position: { x: 0.5, y: 0.5 },
            buildSite: true,
            deepSite: false,
          },
          {
            sectorId: 3,
            name: "Deep",
            region: "blackwater",
            position: { x: 0.8, y: 0.8 },
            buildSite: true,
            deepSite: true,
          },
          {
            sectorId: 4,
            name: "Four",
            region: "shelf",
            position: { x: 0.1, y: 0.8 },
            buildSite: true,
            deepSite: false,
          },
          {
            sectorId: 5,
            name: "Five",
            region: "rift",
            position: { x: 0.3, y: 0.8 },
            buildSite: true,
            deepSite: false,
          },
          {
            sectorId: 6,
            name: "Six",
            region: "rift",
            position: { x: 0.6, y: 0.2 },
            buildSite: true,
            deepSite: false,
          },
          {
            sectorId: 7,
            name: "Seven",
            region: "blackwater",
            position: { x: 0.9, y: 0.2 },
            buildSite: true,
            deepSite: false,
          },
        ],
        edges: [
          { edgeId: "edge_1_2", a: 1, b: 2, current: null },
          { edgeId: "edge_2_3", a: 2, b: 3, current: null },
          { edgeId: "edge_3_4", a: 3, b: 4, current: null },
          { edgeId: "edge_4_5", a: 4, b: 5, current: null },
          { edgeId: "edge_5_6", a: 5, b: 6, current: null },
          { edgeId: "edge_6_7", a: 6, b: 7, current: null },
          { edgeId: "edge_7_1", a: 7, b: 1, current: null },
        ],
      },
      expeditions: [
        {
          seatId: "seat_amber",
          displayName: "Amber",
          color: "amber",
          pattern: "solid",
          factionName: "Survey",
          factionPower: "None",
          presence: "connected",
          ready: false,
          controller: "human",
          botStrategy: null,
          supply: 4,
          platformCount: 0,
          submarineCount: 2,
          analyzedSpecimenCount: 0,
          charters: [
            {
              charter: "network",
              value: 0,
              target: 4,
              threatened: false,
              satisfied: false,
            },
            {
              charter: "discovery",
              value: 0,
              target: 3,
              threatened: false,
              satisfied: false,
            },
            { charter: "dominion", progress: "sealed" },
          ],
          winner: false,
        },
        {
          seatId: "seat_cyan",
          displayName: "Cyan",
          color: "cyan",
          pattern: "stripe",
          factionName: "Survey",
          factionPower: "None",
          presence: "connected",
          ready: false,
          controller: "human",
          botStrategy: null,
          supply: 4,
          platformCount: 0,
          submarineCount: 1,
          analyzedSpecimenCount: 0,
          charters: [
            {
              charter: "network",
              value: 0,
              target: 4,
              threatened: false,
              satisfied: false,
            },
            {
              charter: "discovery",
              value: 0,
              target: 3,
              threatened: false,
              satisfied: false,
            },
            { charter: "dominion", progress: "sealed" },
          ],
          winner: false,
        },
        {
          seatId: "seat_lime",
          displayName: "Lime",
          color: "lime",
          pattern: "dot",
          factionName: "Survey",
          factionPower: "None",
          presence: "connected",
          ready: false,
          controller: "human",
          botStrategy: null,
          supply: 4,
          platformCount: 0,
          submarineCount: 1,
          analyzedSpecimenCount: 0,
          charters: [
            {
              charter: "network",
              value: 0,
              target: 4,
              threatened: false,
              satisfied: false,
            },
            {
              charter: "discovery",
              value: 0,
              target: 3,
              threatened: false,
              satisfied: false,
            },
            { charter: "dominion", progress: "sealed" },
          ],
          winner: false,
        },
      ],
      arks: [
        {
          assetId: "ark_amber",
          ownerSeatId: "seat_amber",
          sectorId: 1,
          jammed: false,
        },
        {
          assetId: "ark_cyan",
          ownerSeatId: "seat_cyan",
          sectorId: 3,
          jammed: false,
        },
        {
          assetId: "ark_lime",
          ownerSeatId: "seat_lime",
          sectorId: 5,
          jammed: false,
        },
      ],
      platforms: [],
      contacts: [],
      deepSites: [],
      salvage: [],
      commissions: [],
      broadcastReports: [],
      constructionProjects: [],
      agreements: [],
      presentation: {
        resolutionId: null,
        cursor: 0,
        beatCount: 0,
        timelineSeq: 0,
        currentBeatId: null,
        currentBeatEndsAtServerMs: null,
        paused: false,
      },
      currentCaption: null,
      outcome: null,
    },
  };
}

describe("phone operation intent builder", () => {
  it("rejects Hunt without exactly one explicit target", () => {
    const editor = { ...blankEditor("sub_amber_a"), kind: "hunt" as const };
    expect(buildOperation(projection(), holdPlan, 1, editor).error).toMatch(
      /exactly one named contact/i,
    );
  });

  it("emits an observation contact as the Hunt target", () => {
    const editor = {
      ...blankEditor("sub_amber_a"),
      kind: "hunt" as const,
      targetEvidenceId: "contact_private",
    };
    expect(
      buildOperation(projection(), holdPlan, 1, editor).operation,
    ).toMatchObject({ kind: "hunt", targetEvidenceId: "contact_private" });
  });

  it("requires an explicit repair target when several submarines exist", () => {
    const editor = {
      ...blankEditor("ark_amber"),
      kind: "develop" as const,
      developKind: "repair_submarine" as const,
    };
    expect(buildOperation(projection(), holdPlan, 1, editor).error).toMatch(
      /choose which/i,
    );
  });

  it("rejects a repair target that is not co-located with the Ark", () => {
    const state = projection();
    state.submarines[1]!.sectorId = 2;
    const editor = {
      ...blankEditor("ark_amber"),
      kind: "develop" as const,
      developKind: "repair_submarine" as const,
      repairSubmarineId: "sub_amber_b",
    };
    expect(buildOperation(state, holdPlan, 1, editor).error).toMatch(
      /co-located/i,
    );
  });

  it("requires an explicit public Harvest target when site and salvage coexist", () => {
    const state = projection();
    state.public.deepSites = [
      {
        sectorId: 1,
        dominionObjective: false,
        specimenAvailable: true,
        activity: "quiet",
      },
    ];
    state.public.salvage = [{ salvageId: "salvage_alpha", sectorId: 1 }];
    const editor = { ...blankEditor("sub_amber_a"), kind: "harvest" as const };
    expect(buildOperation(state, holdPlan, 1, editor).error).toMatch(
      /stocked site or a specific salvage/i,
    );
    expect(
      buildOperation(state, holdPlan, 1, {
        ...editor,
        harvestTargetId: "salvage_alpha",
      }).operation,
    ).toMatchObject({ kind: "harvest", targetId: "salvage_alpha" });
  });

  it("preserves Second Dawn salvage priority while replacing a Pulse", () => {
    const plan: DraftPlan = {
      ...holdPlan,
      secondDawnSalvagePriority: ["salvage_a", "salvage_b"],
    };
    expect(
      replacePulse(plan, 2, { kind: "hold", pulse: 2 })
        .secondDawnSalvagePriority,
    ).toEqual(["salvage_a", "salvage_b"]);
  });
});

describe("progressive phone operation menu", () => {
  it("starts a submarine with four foundational choices instead of twelve", () => {
    const state = projection();
    const asset = playableAssets(state).find(
      (candidate) => candidate.id === "sub_amber_a",
    );
    const menu = operationMenuForAsset(state, asset, holdPlan, 1);
    expect(menu.core).toEqual(["glide", "sprint", "survey", "hold"]);
    expect(menu.opportunities).toEqual([]);
    expect(menu.tactics).toEqual([]);
  });

  it("reveals Harvest at the sector reached by an earlier Pulse", () => {
    const state = projection();
    state.public.deepSites = [
      {
        sectorId: 2,
        dominionObjective: false,
        specimenAvailable: true,
        activity: "quiet",
      },
    ];
    const plan: DraftPlan = {
      operations: [
        {
          kind: "glide",
          pulse: 1,
          assetId: "sub_amber_a",
          requiredSectorId: 1,
          toSectorId: 2,
          silent: false,
        },
        { kind: "hold", pulse: 2 },
        { kind: "hold", pulse: 3 },
      ],
    };
    const asset = playableAssets(state).find(
      (candidate) => candidate.id === "sub_amber_a",
    );
    expect(
      operationMenuForAsset(state, asset, plan, 2).opportunities,
    ).toContainEqual({ kind: "harvest", reason: "Cargo available here" });
  });

  it("reveals Analyze only when cargo and an active Lab are co-located", () => {
    const state = projection();
    state.submarines[0]!.cargo = [
      { specimenId: "specimen_alpha", type: "prism_raft" },
    ];
    state.public.platforms = [
      {
        platformId: "platform_lab",
        ownerSeatId: state.seatId,
        sectorId: 1,
        module: "laboratory",
        state: "active",
        contenderSeatId: null,
        contestEligibleRound: null,
      },
    ];
    const asset = playableAssets(state).find(
      (candidate) => candidate.id === "sub_amber_a",
    );
    expect(
      operationMenuForAsset(state, asset, holdPlan, 1).opportunities,
    ).toContainEqual({ kind: "analyze", reason: "Lab and cargo ready" });
    state.submarines[0]!.cargo = [];
    expect(
      operationMenuForAsset(state, asset, holdPlan, 1).opportunities,
    ).toEqual([]);
  });

  it("opens one tactical chapter in Round 2 and keeps local attacks contextual", () => {
    const state = projection();
    state.public.phase.round = 2;
    const asset = playableAssets(state).find(
      (candidate) => candidate.id === "sub_amber_a",
    );
    expect(operationMenuForAsset(state, asset, holdPlan, 1).tactics).toEqual([
      "deploy",
      "go_dark",
      "hunt",
      "screen",
    ]);
    state.public.platforms = [
      {
        platformId: "platform_rival",
        ownerSeatId: "seat_cyan",
        sectorId: 1,
        module: "extractor",
        state: "active",
        contenderSeatId: null,
        contestEligibleRound: null,
      },
    ];
    expect(operationMenuForAsset(state, asset, holdPlan, 1).tactics).toEqual([
      "deploy",
      "go_dark",
      "hunt",
      "screen",
      "raid",
      "jam",
    ]);
  });

  it("keeps an existing later-stage order reachable while editing", () => {
    const state = projection();
    const asset = playableAssets(state).find(
      (candidate) => candidate.id === "sub_amber_a",
    );
    expect(
      operationMenuForAsset(state, asset, holdPlan, 1, "hunt").current,
    ).toBe("hunt");
  });

  it("ships complete help copy for every operation", () => {
    for (const meta of Object.values(OPERATION_META)) {
      expect(meta.short.length).toBeGreaterThan(10);
      expect(meta.when.length).toBeGreaterThan(20);
      expect(meta.how.length).toBeGreaterThan(20);
      expect(meta.trace.length).toBeGreaterThan(10);
    }
  });
});
