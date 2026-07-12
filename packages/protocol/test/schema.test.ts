import { describe, expect, it } from "vitest";

import {
  BRIEFING_SLIDE_COUNT,
  BriefingControlRequestSchema,
  CommandEnvelopeSchema,
  ConfigureBotsRequestSchema,
  CreateLobbyRequestSchema,
  HostProjectionSchema,
  PlayerColorSchema,
  PlayerSessionBootstrapSchema,
  PrivateBeatSchema,
  PrivateSubmarineSchema,
  PublicCharterProgressSchema,
  PublicBeatSchema,
  ResolutionPresentationPlanSchema,
  RoomCodeSchema,
  SectorIdSchema,
  parseCommandMessage,
} from "../src";

const baseSeatCommand = {
  protocol: 1,
  commandId: "command_001",
  matchId: "match_001",
  phaseId: "phase_001",
  sessionEpoch: 0,
  clientInstanceId: "client_001",
  writerLeaseId: "writer-lease-with-24-characters",
  expected: { kind: "draft", revision: 0 },
} as const;

describe("protocol schemas", () => {
  it("requires every AI lineup to retain at least one human seat", () => {
    expect(
      CreateLobbyRequestSchema.parse({
        protocol: 1,
        playerCount: 1,
      }),
    ).toMatchObject({ playerCount: 1, botCount: 0 });
    expect(
      CreateLobbyRequestSchema.parse({
        protocol: 1,
        playerCount: 2,
        botCount: 1,
      }),
    ).toMatchObject({ playerCount: 2, botCount: 1 });
    expect(
      CreateLobbyRequestSchema.parse({
        protocol: 1,
        playerCount: 3,
        botCount: 2,
      }),
    ).toMatchObject({ botCount: 2, planningSeconds: 120 });
    expect(
      CreateLobbyRequestSchema.parse({ protocol: 1, playerCount: 3 }).botCount,
    ).toBe(0);
    expect(() =>
      CreateLobbyRequestSchema.parse({
        protocol: 1,
        playerCount: 3,
        botCount: 3,
      }),
    ).toThrow(/human-controlled/);
    expect(() =>
      CreateLobbyRequestSchema.parse({
        protocol: 1,
        playerCount: 1,
        botCount: 1,
      }),
    ).toThrow(/human-controlled/);
    expect(() =>
      CreateLobbyRequestSchema.parse({ protocol: 1, playerCount: 0 }),
    ).toThrow();
    expect(() =>
      CreateLobbyRequestSchema.parse({ protocol: 1, playerCount: 7 }),
    ).toThrow();
    expect(() =>
      ConfigureBotsRequestSchema.parse({
        protocol: 1,
        targetBotCount: 2,
        seatId: "cyan",
      }),
    ).toThrow();
  });

  it("bounds strict host briefing controls to the authored deck", () => {
    expect(
      BriefingControlRequestSchema.parse({
        protocol: 1,
        action: "open",
        expectedRevision: 0,
      }),
    ).toEqual({ protocol: 1, action: "open", expectedRevision: 0 });
    expect(
      BriefingControlRequestSchema.parse({
        protocol: 1,
        action: "go-to",
        expectedRevision: 1,
        slideIndex: BRIEFING_SLIDE_COUNT - 1,
      }).slideIndex,
    ).toBe(BRIEFING_SLIDE_COUNT - 1);
    expect(() =>
      BriefingControlRequestSchema.parse({
        protocol: 1,
        action: "go-to",
        expectedRevision: 0,
      }),
    ).toThrow();
    expect(() =>
      BriefingControlRequestSchema.parse({
        protocol: 1,
        action: "next",
        expectedRevision: 0,
        slideIndex: 2,
      }),
    ).toThrow();
    expect(() =>
      BriefingControlRequestSchema.parse({
        protocol: 1,
        action: "go-to",
        expectedRevision: 0,
        slideIndex: BRIEFING_SLIDE_COUNT,
      }),
    ).toThrow();
  });

  it("normalizes room codes while rejecting ambiguous characters", () => {
    expect(RoomCodeSchema.parse("ab2cd3")).toBe("AB2CD3");
    expect(() => RoomCodeSchema.parse("AB0CD3")).toThrow();
    expect(() => RoomCodeSchema.parse("ABICD3")).toThrow();
  });

  it("shares core sector, color, and hidden-charter vocabulary", () => {
    expect(SectorIdSchema.parse(24)).toBe(24);
    expect(() => SectorIdSchema.parse("24")).toThrow();
    expect(() => SectorIdSchema.parse(25)).toThrow();
    expect(PlayerColorSchema.parse("chalk")).toBe("chalk");
    expect(() => PlayerColorSchema.parse("blue")).toThrow();
    expect(
      PublicCharterProgressSchema.parse({
        charter: "dominion",
        progress: "sealed",
      }),
    ).toEqual({ charter: "dominion", progress: "sealed" });
    expect(() =>
      PublicCharterProgressSchema.parse({
        charter: "dominion",
        value: 2,
        target: 3,
        threatened: true,
        satisfied: false,
      }),
    ).toThrow();
  });

  it("models Silence per submarine including Quiet Current's third charge", () => {
    expect(
      PrivateSubmarineSchema.parse({
        assetId: "submarine_001",
        sectorId: 3,
        integrity: 2,
        state: "active",
        silence: 3,
        maxSilence: 3,
        usableFromRound: 1,
        returnAtRound: null,
        incomingSectorId: 2,
        cargo: [],
      }).silence,
    ).toBe(3);
  });

  it("accepts complete three-pulse drafts and rejects actor injection", () => {
    const command = {
      ...baseSeatCommand,
      type: "draft.replace",
      payload: {
        plan: {
          operations: [
            { pulse: 1, kind: "hold" },
            { pulse: 2, kind: "hold" },
            { pulse: 3, kind: "hold" },
          ],
        },
      },
    };
    expect(CommandEnvelopeSchema.parse(command).type).toBe("draft.replace");
    expect(() =>
      CommandEnvelopeSchema.parse({ ...command, seatId: "seat-1" }),
    ).toThrow();
    expect(() =>
      CommandEnvelopeSchema.parse({
        ...command,
        expected: { kind: "phase", epoch: 0 },
      }),
    ).toThrow();
  });

  it("enforces the raw command size limit before schema parsing", () => {
    const huge = JSON.stringify({
      ...baseSeatCommand,
      type: "draft.unlock",
      payload: { padding: "x".repeat(20_000) },
    });
    expect(() => parseCommandMessage(huge)).toThrow(/16 KiB/);
  });

  it("requires player bootstrap secrets only for player sessions", () => {
    const bootstrap = {
      protocol: 1,
      buildId: "build-1",
      sessionId: "session_001",
      matchId: "match_001",
      roomCode: "AB2CD3",
      sessionEpoch: 0,
      commandPrefix: "0123456789abcdef",
      expiresAtMs: 50_000,
      role: "player",
      seatId: "seat-1",
      writerLeaseId: "writer-lease-with-24-characters",
      clientInstanceId: "client_001",
      capabilities: ["player"],
    };
    expect(PlayerSessionBootstrapSchema.parse(bootstrap).seatId).toBe("seat-1");
    expect(() =>
      PlayerSessionBootstrapSchema.parse({
        ...bootstrap,
        writerLeaseId: undefined,
      }),
    ).toThrow();
  });

  it("keeps public and private presentation payloads structurally separate", () => {
    const publicBeat = {
      resolutionId: "resolution_001",
      beatId: "beat_001",
      timelineSeq: 1,
      pulse: 1,
      startsAtServerMs: 10_000,
      durationMs: 600,
      stream: "public",
      event: {
        kind: "wake",
        sectorId: 1,
        direction: "ne",
        strength: "faint",
      },
    };
    expect(PublicBeatSchema.parse(publicBeat).stream).toBe("public");
    expect(() =>
      PublicBeatSchema.parse({
        ...publicBeat,
        event: { ...publicBeat.event, exactSubmarineId: "submarine_001" },
      }),
    ).toThrow();

    const privateBeat = {
      resolutionId: "resolution_001",
      beatId: "beat_private_001",
      timelineSeq: 2,
      pulse: 1,
      startsAtServerMs: 10_600,
      durationMs: 300,
      stream: "private",
      seatId: "seat-1",
      event: {
        kind: "submarine.move",
        assetId: "submarine_001",
        path: [1, 2],
        silenceSpent: 1,
        finalSectorId: 2,
      },
    };
    expect(PrivateBeatSchema.parse(privateBeat).event.kind).toBe(
      "submarine.move",
    );
    expect(() => PublicBeatSchema.parse(privateBeat)).toThrow();
  });

  it("rejects overlapping presentation plans and duplicate event membership", () => {
    const plan = {
      resolutionId: "resolution_001",
      presentationSchemaVersion: 1,
      beats: [
        {
          beatId: "beat_001",
          eventIds: ["event_001"],
          startsAtMs: 0,
          durationMs: 500,
        },
        {
          beatId: "beat_002",
          eventIds: ["event_002"],
          startsAtMs: 400,
          durationMs: 500,
        },
      ],
    };
    expect(() => ResolutionPresentationPlanSchema.parse(plan)).toThrow(
      /overlap/,
    );
    expect(() =>
      ResolutionPresentationPlanSchema.parse({
        ...plan,
        beats: [
          {
            beatId: "beat_001",
            eventIds: ["event_001"],
            startsAtMs: 0,
            durationMs: 500,
          },
          {
            beatId: "beat_002",
            eventIds: ["event_001"],
            startsAtMs: 500,
            durationMs: 500,
          },
        ],
      }),
    ).toThrow(/only one beat/);
  });

  it("keeps host projections operational and rejects canonical game state", () => {
    const host = {
      matchId: "match_001",
      roomCode: "AB2CD3",
      lifecycle: "active",
      phase: {
        phaseId: "phase_001",
        epoch: 1,
        kind: "open-water",
        paused: false,
        endsAtServerMs: 20_000,
      },
      clients: [],
      displayReady: true,
      briefing: { active: false, slideIndex: 0, revision: 0 },
      actorQueueDepth: 0,
      persistence: {
        ready: true,
        quickCheck: "ok",
        databaseBytes: 32_768,
        walBytes: 0,
        lastBackupAtMs: null,
      },
      build: {
        buildId: "build-1",
        protocol: 1,
        rulesVersion: "rules-1",
        schemaVersion: 1,
        assetManifestHash: "a".repeat(64),
      },
      controls: {
        canPause: true,
        canResume: false,
        canExtend: true,
        canClosePlanning: true,
        canSkipPresentation: false,
      },
    };
    expect(HostProjectionSchema.parse(host).displayReady).toBe(true);
    expect(() =>
      HostProjectionSchema.parse({ ...host, rulesState: { submarines: [] } }),
    ).toThrow();
  });
});
