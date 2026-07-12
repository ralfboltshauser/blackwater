import {
  assertRulesInvariants,
  type CanonicalEvent,
  type RulesState,
} from "@blackwater/game-core";
import {
  BriefingStateSchema,
  BotStrategySchema,
  DEFAULT_BRIEFING_STATE,
  DraftPlanSchema,
  PhaseIdSchema,
  PlayerColorSchema,
  PlayerPatternSchema,
  PrivateResultCardSchema,
  PROTOCOL_VERSION,
  SeatIdSchema,
  TimestampMsSchema,
  TransferBundleSchema,
} from "@blackwater/protocol";
import { z } from "zod";

const PhaseSchema = z
  .object({
    phaseId: PhaseIdSchema,
    epoch: z.number().int().nonnegative(),
    kind: z.enum([
      "lobby",
      "forecast",
      "open-water",
      "resolution",
      "claim-check",
      "game-over",
    ]),
    round: z.number().int().min(0).max(20),
    pulse: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
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
    remainingMs: z.number().int().nonnegative().nullable(),
  })
  .strict();

const LobbySeatStateSchema = z
  .object({
    seatId: SeatIdSchema,
    color: PlayerColorSchema,
    pattern: PlayerPatternSchema,
    displayName: z.string().min(1).max(24).nullable(),
    ready: z.boolean(),
    joinedAtMs: TimestampMsSchema.nullable(),
  })
  .strict();

const BotStateSchema = z
  .object({
    policyVersion: z.literal(1),
    strategy: BotStrategySchema,
  })
  .strict();

const DraftStateSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    locked: z.boolean(),
    plan: DraftPlanSchema,
    valid: z.boolean(),
    invalidReasons: z.array(z.string().min(1).max(160)).max(12),
    reservedSupply: z.number().int().nonnegative(),
    reservedSignal: z.number().int().nonnegative(),
  })
  .strict();

const OfferTermSchema = z
  .object({
    kind: z.enum([
      "immediate",
      "ceasefire",
      "safe-passage",
      "conditional-payment",
    ]),
    sectorIds: z.array(z.number().int().min(1).max(24)).max(4),
    note: z.string().min(1).max(280).nullable(),
  })
  .strict();

const PendingOfferSchema = z
  .object({
    offerId: z.string().regex(/^[A-Za-z0-9_-]{3,64}$/),
    revision: z.number().int().nonnegative(),
    proposerSeatId: SeatIdSchema,
    recipientSeatId: SeatIdSchema,
    mode: z.enum(["trade", "contract", "handshake"]),
    give: TransferBundleSchema,
    receive: TransferBundleSchema,
    proposerSpecimenDestinations: z
      .array(
        z
          .object({ specimenId: z.string(), toSubmarineId: z.string() })
          .strict(),
      )
      .max(2),
    term: OfferTermSchema,
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

const RulesSnapshotSchema = z.custom<RulesState>((value) => {
  if (!value || typeof value !== "object") return false;
  try {
    assertRulesInvariants(value as RulesState);
    return true;
  } catch {
    return false;
  }
});

const PresentationSchema = z
  .object({
    resolutionId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{3,64}$/)
      .nullable(),
    cursor: z.number().int().nonnegative(),
    beatCount: z.number().int().nonnegative(),
    timelineSeq: z.number().int().nonnegative(),
    paused: z.boolean(),
    currentBeatId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{3,64}$/)
      .nullable(),
    currentBeatEndsAtServerMs: TimestampMsSchema.nullable(),
    stateBefore: RulesSnapshotSchema.nullable(),
    pulseStates: z
      .object({
        1: RulesSnapshotSchema,
        2: RulesSnapshotSchema,
        3: RulesSnapshotSchema,
      })
      .strict()
      .nullable(),
    claimState: RulesSnapshotSchema.nullable(),
    events: z.custom<CanonicalEvent[]>(),
  })
  .strict();

export const WorkflowStateSchema = z
  .object({
    protocol: z.literal(PROTOCOL_VERSION),
    playerCount: z.number().int().min(1).max(6),
    planningSeconds: z.number().int().min(60).max(240),
    factionsEnabled: z.boolean(),
    createdAtMs: TimestampMsSchema,
    phase: PhaseSchema,
    seats: z.array(LobbySeatStateSchema).min(1).max(6),
    // Bots are authoritative workflow actors, not browser sessions. Defaulting
    // keeps pre-bot databases readable without a SQL migration.
    bots: z.record(SeatIdSchema, BotStateSchema).default({}),
    drafts: z.record(SeatIdSchema, DraftStateSchema),
    offers: z.record(z.string(), PendingOfferSchema),
    socialCommands: z.record(SeatIdSchema, z.number().int().nonnegative()),
    // Defaulting keeps pre-briefing databases readable. The next aggregate
    // commit writes the explicit state back in the current shape.
    briefing: BriefingStateSchema.default({ ...DEFAULT_BRIEFING_STATE }),
    presentation: PresentationSchema,
    resultCards: z.record(
      SeatIdSchema,
      z.array(PrivateResultCardSchema).max(64),
    ),
  })
  .strict()
  .superRefine((workflow, context) => {
    const seatIds = new Set(workflow.seats.map((seat) => seat.seatId));
    const botSeatIds = Object.keys(workflow.bots);
    if (botSeatIds.length >= workflow.playerCount) {
      context.addIssue({
        code: "custom",
        path: ["bots"],
        message: "At least one expedition seat must remain human-controlled",
      });
    }
    for (const seatId of botSeatIds) {
      const seat = workflow.seats.find(
        (candidate) => candidate.seatId === seatId,
      );
      if (!seatIds.has(seatId) || !seat || seat.displayName === null) {
        context.addIssue({
          code: "custom",
          path: ["bots", seatId],
          message: "A bot controller must own one configured, claimed seat",
        });
      }
    }
  });

export type WorkflowState = z.infer<typeof WorkflowStateSchema>;
export type BotState = z.infer<typeof BotStateSchema>;
export type DraftState = z.infer<typeof DraftStateSchema>;
export type PendingOffer = z.infer<typeof PendingOfferSchema>;

export const PersistedRulesSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unstarted") }).strict(),
  z
    .object({
      kind: z.literal("active"),
      state: z.custom<RulesState>((value) => {
        if (!value || typeof value !== "object") return false;
        try {
          assertRulesInvariants(value as RulesState);
          return true;
        } catch {
          return false;
        }
      }),
    })
    .strict(),
]);

export type PersistedRules = z.infer<typeof PersistedRulesSchema>;

export const SEAT_IDENTITIES = [
  { seatId: "cyan", color: "cyan", pattern: "solid" },
  { seatId: "amber", color: "amber", pattern: "stripe" },
  { seatId: "violet", color: "violet", pattern: "dot" },
  { seatId: "lime", color: "lime", pattern: "dash" },
  { seatId: "coral", color: "coral", pattern: "cross" },
  { seatId: "chalk", color: "chalk", pattern: "wave" },
] as const;

export const BOT_IDENTITIES = [
  { displayName: "Manta", strategy: "network" },
  { displayName: "Lantern", strategy: "discovery" },
  { displayName: "Trench", strategy: "dominion" },
  { displayName: "Pike", strategy: "interdictor" },
  { displayName: "Atlas", strategy: "adaptive" },
] as const;

export function configureWorkflowBots(
  workflow: WorkflowState,
  targetBotCount: number,
  nowMs: number,
): void {
  const humanSeats = workflow.seats.filter(
    (seat) => seat.displayName !== null && !workflow.bots[seat.seatId],
  );
  const maximum = workflow.playerCount - Math.max(1, humanSeats.length);
  if (targetBotCount < 0 || targetBotCount > maximum) {
    throw new Error(
      `Bot count must leave room for every joined human and at least one human seat`,
    );
  }

  for (const seat of workflow.seats) {
    if (!workflow.bots[seat.seatId]) continue;
    seat.displayName = null;
    seat.ready = false;
    seat.joinedAtMs = null;
    delete workflow.drafts[seat.seatId];
    delete workflow.resultCards[seat.seatId];
    delete workflow.socialCommands[seat.seatId];
  }
  workflow.bots = {};

  const humanSeatIds = new Set(humanSeats.map((seat) => seat.seatId));
  const selected = workflow.seats
    .filter((seat) => !humanSeatIds.has(seat.seatId))
    .slice()
    .reverse()
    .slice(0, targetBotCount)
    .reverse();
  for (const [index, seat] of selected.entries()) {
    const identity = BOT_IDENTITIES[index];
    if (!identity) throw new Error("Bot identity is missing");
    seat.displayName = identity.displayName;
    seat.ready = true;
    seat.joinedAtMs = nowMs;
    workflow.bots[seat.seatId] = {
      policyVersion: 1,
      strategy: identity.strategy,
    };
  }
}

export function emptyPlan(): z.infer<typeof DraftPlanSchema> {
  return {
    operations: [
      { kind: "hold", pulse: 1 },
      { kind: "hold", pulse: 2 },
      { kind: "hold", pulse: 3 },
    ],
  };
}

export function newWorkflow(input: {
  playerCount: number;
  botCount?: number;
  planningSeconds: number;
  factionsEnabled: boolean;
  phaseId: string;
  nowMs: number;
}): WorkflowState {
  const botCount = input.botCount ?? 0;
  if (botCount < 0 || botCount >= input.playerCount)
    throw new Error(
      "At least one expedition seat must remain human-controlled",
    );
  const workflow = WorkflowStateSchema.parse({
    protocol: PROTOCOL_VERSION,
    playerCount: input.playerCount,
    planningSeconds: input.planningSeconds,
    factionsEnabled: input.factionsEnabled,
    createdAtMs: input.nowMs,
    phase: {
      phaseId: input.phaseId,
      epoch: 0,
      kind: "lobby",
      round: 0,
      pulse: null,
      paused: false,
      pauseReason: null,
      endsAtServerMs: null,
      finalLockAtServerMs: null,
      remainingMs: null,
    },
    seats: SEAT_IDENTITIES.slice(0, input.playerCount).map((seat) => ({
      ...seat,
      displayName: null,
      ready: false,
      joinedAtMs: null,
    })),
    bots: {},
    drafts: {},
    offers: {},
    socialCommands: {},
    briefing: { ...DEFAULT_BRIEFING_STATE },
    presentation: {
      resolutionId: null,
      cursor: 0,
      beatCount: 0,
      timelineSeq: 0,
      paused: false,
      currentBeatId: null,
      currentBeatEndsAtServerMs: null,
      stateBefore: null,
      pulseStates: null,
      claimState: null,
      events: [],
    },
    resultCards: {},
  });
  configureWorkflowBots(workflow, botCount, input.nowMs);
  return WorkflowStateSchema.parse(workflow);
}
