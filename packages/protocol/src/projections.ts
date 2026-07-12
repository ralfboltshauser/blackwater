import { z } from "zod";

import { BriefingStateSchema } from "./briefing";
import { DraftPlanSchema, SubmittedPulsesSchema } from "./commands";
import { BotStrategySchema, SeatControllerSchema } from "./lobby";
import { PresentationClockSchema } from "./presentation";
import {
  AssetIdSchema,
  ConfidenceSchema,
  ContactClassSchema,
  ContactIdSchema,
  DeviceIdSchema,
  DirectionSchema,
  DisplayNameSchema,
  EpochSchema,
  FactionSchema,
  IntelReportSchema,
  MatchIdSchema,
  MatchLifecycleSchema,
  ModuleKindSchema,
  NonEmptyTextSchema,
  OfferIdSchema,
  PhaseIdSchema,
  PhaseKindSchema,
  PlatformIdSchema,
  PlayerColorSchema,
  PlayerPatternSchema,
  PointSchema,
  PresenceSchema,
  PROTOCOL_VERSION,
  PublicResourceSchema,
  PulseNumberSchema,
  RegionKindSchema,
  ReportIdSchema,
  RevisionSchema,
  RoomCodeSchema,
  SeatIdSchema,
  SectorIdSchema,
  SessionIdSchema,
  SessionRoleSchema,
  SpecimenIdSchema,
  SpecimenTypeSchema,
  StreamVersionSchema,
  TimestampMsSchema,
  TransferBundleSchema,
} from "./primitives";

export const PhaseProjectionSchema = z
  .object({
    phaseId: PhaseIdSchema,
    epoch: EpochSchema,
    kind: PhaseKindSchema,
    round: z.number().int().min(0).max(20),
    pulse: PulseNumberSchema.nullable(),
    paused: z.boolean(),
    pauseReason: z
      .enum([
        "display-lost",
        "technical",
        "host-choice",
        "restart",
        "runtime-gap",
      ])
      .nullable(),
    endsAtServerMs: TimestampMsSchema.nullable(),
    finalLockAtServerMs: TimestampMsSchema.nullable(),
  })
  .strict();

export const BasinSectorSchema = z
  .object({
    sectorId: SectorIdSchema,
    name: z.string().trim().min(1).max(32),
    region: RegionKindSchema,
    position: PointSchema,
    buildSite: z.boolean(),
    deepSite: z.boolean(),
  })
  .strict();

export const BasinEdgeSchema = z
  .object({
    edgeId: z.string().regex(/^[A-Za-z0-9_-]{3,64}$/),
    a: SectorIdSchema,
    b: SectorIdSchema,
    current: z
      .object({
        from: SectorIdSchema,
        to: SectorIdSchema,
        strength: z.enum(["gentle", "strong"]),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine(
    (edge) => edge.a !== edge.b,
    "An edge cannot connect a sector to itself",
  );

export const BasinTopologySchema = z
  .object({
    basinId: z.string().regex(/^[A-Za-z0-9_-]{3,64}$/),
    sectors: z.array(BasinSectorSchema).min(7).max(24),
    edges: z.array(BasinEdgeSchema).min(7).max(60),
  })
  .strict()
  .superRefine((topology, context) => {
    const sectorIds = topology.sectors.map((sector) => sector.sectorId);
    const known = new Set(sectorIds);
    if (known.size !== sectorIds.length) {
      context.addIssue({
        code: "custom",
        path: ["sectors"],
        message: "Sector IDs must be unique",
      });
    }
    const edgeIds = topology.edges.map((edge) => edge.edgeId);
    if (new Set(edgeIds).size !== edgeIds.length) {
      context.addIssue({
        code: "custom",
        path: ["edges"],
        message: "Edge IDs must be unique",
      });
    }
    topology.edges.forEach((edge, index) => {
      if (!known.has(edge.a) || !known.has(edge.b)) {
        context.addIssue({
          code: "custom",
          path: ["edges", index],
          message: "Edge references an unknown sector",
        });
      }
      if (
        edge.current &&
        edge.current.from !== edge.a &&
        edge.current.from !== edge.b
      ) {
        context.addIssue({
          code: "custom",
          path: ["edges", index, "current"],
          message: "Current must follow this edge",
        });
      }
    });
  });

export const PublicCharterProgressSchema = z.discriminatedUnion("charter", [
  z
    .object({
      charter: z.literal("network"),
      value: z.number().int().min(0).max(20),
      target: z.number().int().min(1).max(20),
      threatened: z.boolean(),
      satisfied: z.boolean(),
    })
    .strict(),
  z
    .object({
      charter: z.literal("discovery"),
      value: z.number().int().min(0).max(20),
      target: z.number().int().min(1).max(20),
      threatened: z.boolean(),
      satisfied: z.boolean(),
    })
    .strict(),
  z
    .object({
      charter: z.literal("dominion"),
      progress: z.literal("sealed"),
    })
    .strict(),
]);

export const PublicExpeditionSchema = z
  .object({
    seatId: SeatIdSchema,
    displayName: DisplayNameSchema,
    color: PlayerColorSchema,
    pattern: PlayerPatternSchema,
    factionName: z.string().trim().min(1).max(40),
    factionPower: z.string().trim().min(1).max(160),
    presence: PresenceSchema,
    ready: z.boolean(),
    controller: SeatControllerSchema,
    botStrategy: BotStrategySchema.nullable(),
    supply: z.number().int().min(0).max(99),
    platformCount: z.number().int().min(0).max(4),
    submarineCount: z.number().int().min(0).max(2),
    analyzedSpecimenCount: z.number().int().min(0).max(20),
    charters: z.array(PublicCharterProgressSchema).length(3),
    winner: z.boolean(),
  })
  .strict()
  .superRefine((expedition, context) => {
    const charters = new Set(
      expedition.charters.map((charter) => charter.charter),
    );
    if (
      charters.size !== 3 ||
      !charters.has("network") ||
      !charters.has("discovery") ||
      !charters.has("dominion")
    ) {
      context.addIssue({
        code: "custom",
        path: ["charters"],
        message:
          "Every expedition requires Network, Discovery, and sealed Dominion status",
      });
    }
  });

export const PublicArkSchema = z
  .object({
    assetId: AssetIdSchema,
    ownerSeatId: SeatIdSchema,
    sectorId: SectorIdSchema,
    jammed: z.boolean(),
  })
  .strict();

export const PublicPlatformSchema = z
  .object({
    platformId: PlatformIdSchema,
    ownerSeatId: SeatIdSchema,
    sectorId: SectorIdSchema,
    module: ModuleKindSchema,
    state: z.enum(["active", "jammed", "contested", "inactive"]),
    contenderSeatId: SeatIdSchema.nullable(),
    contestEligibleRound: z.number().int().min(1).max(20).nullable(),
  })
  .strict();

export const PublicContactSchema = z
  .object({
    contactId: ContactIdSchema,
    evidenceKind: z.enum([
      "wake",
      "contact",
      "identified-contact",
      "disturbance",
    ]),
    sectorId: SectorIdSchema,
    class: ContactClassSchema,
    confidence: ConfidenceSchema,
    identifiedSeatId: SeatIdSchema.nullable(),
    direction: DirectionSchema,
    observedRound: z.number().int().min(1).max(20),
    observedPulse: PulseNumberSchema.nullable(),
    age: z.enum(["fresh", "fading"]),
  })
  .strict();

export const PublicDeepSiteSchema = z
  .object({
    sectorId: SectorIdSchema,
    dominionObjective: z.boolean(),
    specimenAvailable: z.boolean(),
    activity: z.enum(["quiet", "surveyed", "harvested"]),
  })
  .strict();

export const PublicSalvageSchema = z
  .object({
    salvageId: z.string().regex(/^[A-Za-z0-9_-]{3,64}$/),
    sectorId: SectorIdSchema,
  })
  .strict();

export const PublicCommissionSchema = z
  .object({
    targetSeatId: SeatIdSchema,
    rewardSupply: z.number().int().min(1).max(9),
  })
  .strict();

export const PublicConstructionProjectSchema = z
  .object({
    projectId: AssetIdSchema,
    ownerSeatId: SeatIdSchema,
    sectorId: SectorIdSchema,
    kind: z.literal("submarine"),
    usableFromRound: z.number().int().min(1).max(20),
  })
  .strict();

export const PublicAgreementSchema = z
  .object({
    offerId: OfferIdSchema,
    mode: z.enum(["contract", "handshake"]),
    participants: z.array(SeatIdSchema).min(2).max(3),
    termKind: z.enum(["ceasefire", "safe-passage", "conditional-payment"]),
    sectorIds: z.array(SectorIdSchema).max(4),
    status: z.enum(["active", "fulfilled", "breached", "expired"]),
    breachSeatId: SeatIdSchema.nullable(),
  })
  .strict();

export const PublicMatchOutcomeSchema = z
  .object({
    winnerSeatIds: z.array(SeatIdSchema).min(1).max(6),
    winningCharters: z
      .array(
        z
          .object({
            seatId: SeatIdSchema,
            charters: z
              .array(z.enum(["network", "discovery", "dominion", "fallback"]))
              .min(1)
              .max(4),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    // Populated for every expedition when the round-cap fallback decides the
    // match. An empty list means at least one normal charter was completed.
    fallbackScores: z
      .array(
        z
          .object({
            seatId: SeatIdSchema,
            score: z.number().int().min(0).max(99),
          })
          .strict(),
      )
      .max(6),
  })
  .strict()
  .superRefine((outcome, context) => {
    const winners = new Set(outcome.winnerSeatIds);
    if (
      winners.size !== outcome.winnerSeatIds.length ||
      outcome.winningCharters.some((entry) => !winners.has(entry.seatId)) ||
      new Set(outcome.winningCharters.map((entry) => entry.seatId)).size !==
        winners.size
    ) {
      context.addIssue({
        code: "custom",
        path: ["winningCharters"],
        message: "Winning charter rows must match the unique winner seats",
      });
    }
    if (
      new Set(outcome.fallbackScores.map((entry) => entry.seatId)).size !==
      outcome.fallbackScores.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["fallbackScores"],
        message: "Fallback score seats must be unique",
      });
    }
  });

export const PublicProjectionSchema = z
  .object({
    matchId: MatchIdSchema,
    roomCode: RoomCodeSchema,
    lifecycle: MatchLifecycleSchema,
    phase: PhaseProjectionSchema,
    topology: BasinTopologySchema,
    expeditions: z.array(PublicExpeditionSchema).min(1).max(6),
    arks: z.array(PublicArkSchema).min(1).max(6),
    platforms: z.array(PublicPlatformSchema).max(24),
    contacts: z.array(PublicContactSchema).max(256),
    deepSites: z.array(PublicDeepSiteSchema).max(12),
    salvage: z.array(PublicSalvageSchema).max(24),
    commissions: z.array(PublicCommissionSchema).max(6),
    broadcastReports: z.array(IntelReportSchema).max(64),
    constructionProjects: z.array(PublicConstructionProjectSchema).max(6),
    agreements: z.array(PublicAgreementSchema).max(24),
    presentation: PresentationClockSchema,
    currentCaption: NonEmptyTextSchema.nullable(),
    outcome: PublicMatchOutcomeSchema.nullable(),
  })
  .strict();

export const PrivateSubmarineSchema = z
  .object({
    assetId: AssetIdSchema,
    sectorId: SectorIdSchema,
    integrity: z.number().int().min(0).max(2),
    state: z.enum(["active", "disabled", "constructing"]),
    silence: z.number().int().min(0).max(3),
    maxSilence: z.union([z.literal(2), z.literal(3)]),
    usableFromRound: z.number().int().min(1).max(20),
    returnAtRound: z.number().int().min(1).max(20).nullable(),
    incomingSectorId: SectorIdSchema.nullable(),
    cargo: z
      .array(
        z
          .object({
            specimenId: SpecimenIdSchema,
            type: SpecimenTypeSchema,
          })
          .strict(),
      )
      .max(2),
  })
  .strict();

export const PrivateDeviceSchema = z
  .object({
    deviceId: DeviceIdSchema,
    kind: z.enum(["snare", "decoy"]),
    state: z.enum(["inventory", "deployed", "triggered", "expired"]),
    sectorId: SectorIdSchema.nullable(),
    trigger: z.enum(["tag", "spill"]).nullable(),
    expiresAtRound: z.number().int().min(1).max(20).nullable(),
  })
  .strict();

export const PrivateObservationSchema = z
  .object({
    contactId: ContactIdSchema,
    sealedReportId: ReportIdSchema.nullable(),
    sectorId: SectorIdSchema,
    observedAtRound: z.number().int().min(1).max(20),
    observedAtPulse: PulseNumberSchema,
    contactClass: z.enum(["submarine", "decoy", "snare", "site"]),
    direction: DirectionSchema,
    identitySeatId: SeatIdSchema.nullable(),
    specimenType: SpecimenTypeSchema.nullable(),
    contactCount: z.number().int().min(0).max(12),
    confidence: z.union([z.literal(50), z.literal(70), z.literal(100)]),
    sensor: z.enum(["passive-sonar", "active-survey", "trap", "harvest"]),
  })
  .strict();

export const PrivateDealSchema = z
  .object({
    offerId: OfferIdSchema,
    revision: RevisionSchema,
    proposerSeatId: SeatIdSchema,
    recipientSeatId: SeatIdSchema,
    mode: z.enum(["trade", "contract", "handshake"]),
    give: TransferBundleSchema,
    receive: TransferBundleSchema,
    proposerSpecimenDestinations: z
      .array(
        z
          .object({
            specimenId: SpecimenIdSchema,
            toSubmarineId: AssetIdSchema,
          })
          .strict(),
      )
      .max(2),
    term: z
      .object({
        kind: z.enum([
          "immediate",
          "ceasefire",
          "safe-passage",
          "conditional-payment",
        ]),
        sectorIds: z.array(SectorIdSchema).max(4),
        note: NonEmptyTextSchema.nullable(),
      })
      .strict(),
    status: z.enum([
      "pending",
      "accepted",
      "withdrawn",
      "fulfilled",
      "breached",
      "expired",
    ]),
    expiresAtPhaseId: PhaseIdSchema,
  })
  .strict();

export const PrivateResultCardSchema = z
  .object({
    resultId: z.string().regex(/^[A-Za-z0-9_-]{3,64}$/),
    round: z.number().int().min(1).max(20),
    pulse: PulseNumberSchema,
    title: z.string().trim().min(1).max(80),
    detail: z.string().trim().min(1).max(400),
    reportId: ReportIdSchema.nullable(),
    acknowledged: z.boolean(),
  })
  .strict();

export const PlayerProjectionSchema = z
  .object({
    public: PublicProjectionSchema,
    seatId: SeatIdSchema,
    faction: FactionSchema,
    resources: z
      .object({
        supply: z.number().int().min(0).max(99),
        signal: z.number().int().min(0).max(99),
      })
      .strict(),
    deviceInventory: z
      .object({
        snare: z.number().int().min(0).max(2),
        decoy: z.number().int().min(0).max(2),
      })
      .strict(),
    submarines: z.array(PrivateSubmarineSchema).max(2),
    devices: z.array(PrivateDeviceSchema).max(2),
    analyzedTypes: z.array(SpecimenTypeSchema).max(6),
    observations: z.array(PrivateObservationSchema).max(512),
    reports: z.array(IntelReportSchema).max(512),
    draft: z
      .object({
        revision: RevisionSchema,
        locked: z.boolean(),
        plan: DraftPlanSchema,
        reservedSupply: z.number().int().min(0).max(99),
        reservedSignal: z.number().int().min(0).max(99),
        valid: z.boolean(),
        invalidReasons: z.array(z.string().trim().min(1).max(160)).max(12),
        submittedPulses: SubmittedPulsesSchema,
      })
      .strict(),
    deals: z.array(PrivateDealSchema).max(32),
    resultCards: z.array(PrivateResultCardSchema).max(64),
  })
  .strict();
export const PrivateProjectionSchema = PlayerProjectionSchema;

export const HostClientStatusSchema = z
  .object({
    sessionId: SessionIdSchema,
    role: SessionRoleSchema,
    seatId: SeatIdSchema.nullable(),
    presence: PresenceSchema,
    transport: z.enum(["polling", "websocket", "disconnected"]),
    rttMs: z.number().int().min(0).max(120_000).nullable(),
    buildId: z.string().min(1).max(128),
    protocol: z.number().int().min(1).max(99),
    lastSeenAtMs: TimestampMsSchema,
  })
  .strict();

export const HostProjectionSchema = z
  .object({
    matchId: MatchIdSchema,
    roomCode: RoomCodeSchema,
    lifecycle: MatchLifecycleSchema,
    phase: z
      .object({
        phaseId: PhaseIdSchema,
        epoch: EpochSchema,
        kind: PhaseKindSchema,
        paused: z.boolean(),
        endsAtServerMs: TimestampMsSchema.nullable(),
      })
      .strict(),
    clients: z.array(HostClientStatusSchema).max(10),
    displayReady: z.boolean(),
    briefing: BriefingStateSchema,
    actorQueueDepth: z.number().int().min(0).max(1_000),
    persistence: z
      .object({
        ready: z.boolean(),
        quickCheck: z.enum(["ok", "failed", "pending"]),
        databaseBytes: z.number().int().nonnegative(),
        walBytes: z.number().int().nonnegative(),
        lastBackupAtMs: TimestampMsSchema.nullable(),
      })
      .strict(),
    build: z
      .object({
        buildId: z.string().min(1).max(128),
        protocol: z.number().int().min(1).max(99),
        rulesVersion: z.string().min(1).max(64),
        schemaVersion: z.number().int().positive(),
        assetManifestHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    controls: z
      .object({
        canPause: z.boolean(),
        canResume: z.boolean(),
        canExtend: z.boolean(),
        canClosePlanning: z.boolean(),
        canSkipPresentation: z.boolean(),
      })
      .strict(),
  })
  .strict();

const ProjectionEnvelopeBase = {
  protocol: z.literal(PROTOCOL_VERSION),
  buildId: z.string().min(1).max(128),
  version: StreamVersionSchema,
  phaseId: PhaseIdSchema,
  serverNowMs: TimestampMsSchema,
} as const;

export const PublicProjectionEnvelopeSchema = z
  .object({
    ...ProjectionEnvelopeBase,
    stream: z.literal("public"),
    payload: PublicProjectionSchema,
  })
  .strict();
export const PlayerProjectionEnvelopeSchema = z
  .object({
    ...ProjectionEnvelopeBase,
    stream: z.literal("private"),
    payload: PlayerProjectionSchema,
  })
  .strict();
export const HostProjectionEnvelopeSchema = z
  .object({
    ...ProjectionEnvelopeBase,
    stream: z.literal("host"),
    payload: HostProjectionSchema,
  })
  .strict();

export const ProjectionEnvelopeSchema = z.discriminatedUnion("stream", [
  PublicProjectionEnvelopeSchema,
  PlayerProjectionEnvelopeSchema,
  HostProjectionEnvelopeSchema,
]);

export type PhaseProjection = z.infer<typeof PhaseProjectionSchema>;
export type PublicProjection = z.infer<typeof PublicProjectionSchema>;
export type PlayerProjection = z.infer<typeof PlayerProjectionSchema>;
export type PrivateProjection = PlayerProjection;
export type HostProjection = z.infer<typeof HostProjectionSchema>;
export type ProjectionEnvelope = z.infer<typeof ProjectionEnvelopeSchema>;
