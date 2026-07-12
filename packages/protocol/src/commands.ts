import { z } from "zod";

import {
  AssetIdSchema,
  ClientInstanceIdSchema,
  CommandIdSchema,
  ContactIdSchema,
  EpochSchema,
  MAX_COMMAND_BYTES,
  MatchIdSchema,
  ModuleKindSchema,
  NonEmptyTextSchema,
  OfferIdSchema,
  PhaseIdSchema,
  PlatformIdSchema,
  PROTOCOL_VERSION,
  PulseNumberSchema,
  ReportFieldSchema,
  ReportIdSchema,
  RevisionSchema,
  SeatIdSchema,
  SectorIdSchema,
  SpecimenIdSchema,
  TransferBundleSchema,
  WriterLeaseIdSchema,
} from "./primitives";

const EmptyPayloadSchema = z.object({}).strict();
const SignalCommitmentSchema = z.number().int().min(0).max(2);

export const HoldOperationSchema = z
  .object({
    kind: z.literal("hold"),
    pulse: PulseNumberSchema,
    assetId: AssetIdSchema.optional(),
    requiredSectorId: SectorIdSchema.optional(),
  })
  .strict();
export const GlideOperationSchema = z
  .object({
    kind: z.literal("glide"),
    pulse: PulseNumberSchema,
    assetId: AssetIdSchema,
    requiredSectorId: SectorIdSchema,
    toSectorId: SectorIdSchema,
    silent: z.boolean(),
  })
  .strict();
export const SprintOperationSchema = z
  .object({
    kind: z.literal("sprint"),
    pulse: PulseNumberSchema,
    assetId: AssetIdSchema,
    requiredSectorId: SectorIdSchema,
    path: z.tuple([SectorIdSchema, SectorIdSchema]),
  })
  .strict();
export const NavigateOperationSchema = z
  .object({
    kind: z.literal("navigate"),
    pulse: PulseNumberSchema,
    assetId: AssetIdSchema,
    requiredSectorId: SectorIdSchema,
    toSectorId: SectorIdSchema,
    towPlatformId: AssetIdSchema.optional(),
  })
  .strict();
export const SurveyOperationSchema = z
  .object({
    kind: z.literal("survey"),
    pulse: PulseNumberSchema,
    assetId: AssetIdSchema,
    requiredSectorId: SectorIdSchema,
    suppressPublicContact: z.boolean().optional(),
  })
  .strict();
export const HarvestOperationSchema = z
  .object({
    kind: z.literal("harvest"),
    pulse: PulseNumberSchema,
    assetId: AssetIdSchema,
    requiredSectorId: SectorIdSchema,
    targetId: z.string().min(3).max(64),
    signalCommitment: SignalCommitmentSchema,
    suppressPublicContact: z.boolean().optional(),
  })
  .strict();
export const AnalyzeOperationSchema = z
  .object({
    kind: z.literal("analyze"),
    pulse: PulseNumberSchema,
    assetId: AssetIdSchema,
    requiredSectorId: SectorIdSchema,
    specimenId: SpecimenIdSchema,
  })
  .strict();

const DevelopProjectSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("platform"),
      module: ModuleKindSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("submarine"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("repair_submarine"),
      submarineId: AssetIdSchema,
    })
    .strict(),
]);

export const DevelopOperationSchema = z
  .object({
    kind: z.literal("develop"),
    pulse: PulseNumberSchema,
    assetId: AssetIdSchema,
    requiredSectorId: SectorIdSchema,
    project: DevelopProjectSchema,
  })
  .strict();
export const DeployOperationSchema = z
  .object({
    kind: z.literal("deploy"),
    pulse: PulseNumberSchema,
    assetId: AssetIdSchema,
    requiredSectorId: SectorIdSchema,
    device: z.enum(["snare", "decoy"]),
    snareMode: z.enum(["tag", "spill"]).optional(),
    decoyRoute: z.array(SectorIdSchema).max(3).optional(),
  })
  .strict()
  .superRefine((operation, context) => {
    if (operation.device === "snare" && operation.snareMode === undefined) {
      context.addIssue({
        code: "custom",
        path: ["snareMode"],
        message: "A snare requires a trigger",
      });
    }
    if (operation.device === "snare" && operation.decoyRoute !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["decoyRoute"],
        message: "A snare cannot have a decoy route",
      });
    }
    if (operation.device === "decoy" && operation.snareMode !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["snareMode"],
        message: "A decoy cannot have a snare trigger",
      });
    }
  });
export const HuntOperationSchema = z
  .object({
    kind: z.literal("hunt"),
    pulse: PulseNumberSchema,
    assetId: AssetIdSchema,
    requiredSectorId: SectorIdSchema,
    targetSeatId: SeatIdSchema.optional(),
    targetEvidenceId: ContactIdSchema.optional(),
    signalCommitment: SignalCommitmentSchema,
  })
  .strict();
export const RaidOperationSchema = z
  .object({
    kind: z.literal("raid"),
    pulse: PulseNumberSchema,
    assetId: AssetIdSchema,
    requiredSectorId: SectorIdSchema,
    targetPlatformId: PlatformIdSchema,
    signalCommitment: SignalCommitmentSchema,
  })
  .strict();
export const JamOperationSchema = z
  .object({
    kind: z.literal("jam"),
    pulse: PulseNumberSchema,
    assetId: AssetIdSchema,
    requiredSectorId: SectorIdSchema,
    targetPlatformId: PlatformIdSchema,
  })
  .strict();
export const GoDarkOperationSchema = z
  .object({
    kind: z.literal("go_dark"),
    pulse: PulseNumberSchema,
    assetId: AssetIdSchema,
    requiredSectorId: SectorIdSchema,
  })
  .strict();
export const ScreenOperationSchema = z
  .object({
    kind: z.literal("screen"),
    pulse: PulseNumberSchema,
    assetId: AssetIdSchema,
    requiredSectorId: SectorIdSchema,
    protectedAssetId: AssetIdSchema.optional(),
    counterTargetSeatId: SeatIdSchema.optional(),
    signalCommitment: SignalCommitmentSchema,
  })
  .strict();

export const OperationSchema = z.discriminatedUnion("kind", [
  HoldOperationSchema,
  GlideOperationSchema,
  SprintOperationSchema,
  NavigateOperationSchema,
  SurveyOperationSchema,
  HarvestOperationSchema,
  AnalyzeOperationSchema,
  DevelopOperationSchema,
  DeployOperationSchema,
  HuntOperationSchema,
  RaidOperationSchema,
  JamOperationSchema,
  GoDarkOperationSchema,
  ScreenOperationSchema,
]);

export const DraftPlanSchema = z
  .object({
    operations: z.tuple([OperationSchema, OperationSchema, OperationSchema]),
    secondDawnSalvagePriority: z
      .array(z.string().min(3).max(64))
      .max(12)
      .optional(),
  })
  .strict()
  .superRefine((plan, context) => {
    plan.operations.forEach((operation, index) => {
      if (operation.pulse !== index + 1) {
        context.addIssue({
          code: "custom",
          path: ["operations", index, "pulse"],
          message: `Operation ${index + 1} must be assigned to Pulse ${index + 1}`,
        });
      }
    });
  });

export const DraftExpectedSchema = z
  .object({
    kind: z.literal("draft"),
    revision: RevisionSchema,
  })
  .strict();
export const OfferExpectedSchema = z
  .object({
    kind: z.literal("offer"),
    offerId: OfferIdSchema,
    revision: RevisionSchema,
  })
  .strict();
export const PhaseExpectedSchema = z
  .object({
    kind: z.literal("phase"),
    epoch: EpochSchema,
  })
  .strict();
export const NoneExpectedSchema = z
  .object({ kind: z.literal("none") })
  .strict();
export const CommandExpectedSchema = z.discriminatedUnion("kind", [
  DraftExpectedSchema,
  OfferExpectedSchema,
  PhaseExpectedSchema,
  NoneExpectedSchema,
]);

const SeatCommandBase = {
  protocol: z.literal(PROTOCOL_VERSION),
  commandId: CommandIdSchema,
  matchId: MatchIdSchema,
  phaseId: PhaseIdSchema,
  sessionEpoch: EpochSchema,
  clientInstanceId: ClientInstanceIdSchema,
  writerLeaseId: WriterLeaseIdSchema,
} as const;

const HostCommandBase = {
  protocol: z.literal(PROTOCOL_VERSION),
  commandId: CommandIdSchema,
  matchId: MatchIdSchema,
  phaseId: PhaseIdSchema,
  sessionEpoch: EpochSchema,
  clientInstanceId: ClientInstanceIdSchema,
} as const;

const seatCommand = <
  T extends string,
  P extends z.ZodType,
  E extends z.ZodType,
>(
  type: T,
  payload: P,
  expected: E,
) =>
  z
    .object({
      ...SeatCommandBase,
      type: z.literal(type),
      expected,
      payload,
    })
    .strict();

const hostCommand = <T extends string, P extends z.ZodType>(
  type: T,
  payload: P,
) =>
  z
    .object({
      ...HostCommandBase,
      type: z.literal(type),
      expected: PhaseExpectedSchema,
      payload,
    })
    .strict();

export const ReplaceDraftCommandSchema = seatCommand(
  "draft.replace",
  z.object({ plan: DraftPlanSchema }).strict(),
  DraftExpectedSchema,
);
export const LockDraftCommandSchema = seatCommand(
  "draft.lock",
  z.object({ plan: DraftPlanSchema }).strict(),
  DraftExpectedSchema,
);
export const UnlockDraftCommandSchema = seatCommand(
  "draft.unlock",
  EmptyPayloadSchema,
  DraftExpectedSchema,
);

export const CreateDealCommandSchema = seatCommand(
  "deal.create",
  z
    .object({
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
        .max(2)
        .default([]),
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
      expiresAtPhaseId: PhaseIdSchema,
    })
    .strict(),
  NoneExpectedSchema,
);
export const AcceptDealCommandSchema = seatCommand(
  "deal.accept",
  z
    .object({
      specimenDestinations: z
        .array(
          z
            .object({
              specimenId: SpecimenIdSchema,
              toSubmarineId: AssetIdSchema,
            })
            .strict(),
        )
        .max(2)
        .default([]),
    })
    .strict(),
  OfferExpectedSchema,
);
export const WithdrawDealCommandSchema = seatCommand(
  "deal.withdraw",
  EmptyPayloadSchema,
  OfferExpectedSchema,
);

export const ForwardIntelCommandSchema = seatCommand(
  "intel.forward",
  z
    .object({
      reportId: ReportIdSchema,
      recipients: z.array(SeatIdSchema).min(1).max(5),
      redactedFields: z.array(ReportFieldSchema).max(10),
    })
    .strict()
    .superRefine((payload, context) => {
      if (new Set(payload.recipients).size !== payload.recipients.length) {
        context.addIssue({
          code: "custom",
          path: ["recipients"],
          message: "Recipients must be unique",
        });
      }
      if (
        new Set(payload.redactedFields).size !== payload.redactedFields.length
      ) {
        context.addIssue({
          code: "custom",
          path: ["redactedFields"],
          message: "Redacted fields must be unique",
        });
      }
    }),
  NoneExpectedSchema,
);
export const SealIntelCommandSchema = seatCommand(
  "intel.seal",
  z.object({ contactId: ContactIdSchema }).strict(),
  NoneExpectedSchema,
);
export const IntelStatementCommandSchema = seatCommand(
  "intel.statement",
  z
    .object({
      recipients: z.array(SeatIdSchema).min(1).max(5),
      statement: z
        .object({
          sectorId: SectorIdSchema.nullable(),
          contactCount: z.number().int().min(0).max(12).nullable(),
          contactClass: z
            .enum(["unknown", "vessel", "submarine", "decoy", "disturbance"])
            .nullable(),
          identitySeatId: SeatIdSchema.nullable(),
          direction: z
            .enum([
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw",
              "still",
              "unknown",
            ])
            .nullable(),
          note: NonEmptyTextSchema.nullable(),
        })
        .strict(),
    })
    .strict(),
  NoneExpectedSchema,
);
export const BroadcastIntelCommandSchema = seatCommand(
  "intel.broadcast",
  z
    .object({
      reportId: ReportIdSchema,
      redactedFields: z.array(ReportFieldSchema).max(10),
    })
    .strict(),
  NoneExpectedSchema,
);

export const PauseHostCommandSchema = hostCommand(
  "host.pause",
  z
    .object({
      reason: z.enum([
        "display-lost",
        "player-request",
        "technical",
        "host-choice",
      ]),
    })
    .strict(),
);
export const ResumeHostCommandSchema = hostCommand(
  "host.resume",
  EmptyPayloadSchema,
);
export const ExtendHostCommandSchema = hostCommand(
  "host.extend",
  z.object({ additionalMs: z.number().int().min(5_000).max(120_000) }).strict(),
);
export const ClosePlanningHostCommandSchema = hostCommand(
  "host.closePlanning",
  EmptyPayloadSchema,
);
export const SkipPresentationHostCommandSchema = hostCommand(
  "host.skipPresentation",
  EmptyPayloadSchema,
);
export const ReclaimSeatHostCommandSchema = hostCommand(
  "host.reclaimSeat",
  z.object({ seatId: SeatIdSchema }).strict(),
);

export const CommandEnvelopeSchema = z.discriminatedUnion("type", [
  ReplaceDraftCommandSchema,
  LockDraftCommandSchema,
  UnlockDraftCommandSchema,
  CreateDealCommandSchema,
  AcceptDealCommandSchema,
  WithdrawDealCommandSchema,
  SealIntelCommandSchema,
  ForwardIntelCommandSchema,
  IntelStatementCommandSchema,
  BroadcastIntelCommandSchema,
  PauseHostCommandSchema,
  ResumeHostCommandSchema,
  ExtendHostCommandSchema,
  ClosePlanningHostCommandSchema,
  SkipPresentationHostCommandSchema,
  ReclaimSeatHostCommandSchema,
]);
export const ClientCommandSchema = CommandEnvelopeSchema;

export const CommandRejectionCodeSchema = z.enum([
  "PHASE_CLOSED",
  "PHASE_PAUSED",
  "STALE_DRAFT",
  "STALE_OFFER",
  "SESSION_REVOKED",
  "WRITER_LEASE_REVOKED",
  "INVALID_INTENT",
  "INSUFFICIENT_AVAILABLE_RESOURCE",
  "IDEMPOTENCY_KEY_REUSE",
  "NOT_AUTHORIZED",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);

const AcceptedCommandResultSchema = z
  .object({
    status: z.enum(["accepted", "duplicate"]),
    commandId: CommandIdSchema,
    applied: z
      .object({
        kind: z.enum(["draft", "offer", "phase", "intel"]),
        revision: RevisionSchema,
      })
      .strict()
      .optional(),
    phaseClosed: z.boolean().optional(),
  })
  .strict();
const RejectedCommandResultSchema = z
  .object({
    status: z.literal("rejected"),
    commandId: CommandIdSchema,
    code: CommandRejectionCodeSchema,
    retryable: z.boolean(),
    currentRelevantRevision: RevisionSchema.optional(),
  })
  .strict();
export const CommandResultSchema = z.discriminatedUnion("status", [
  AcceptedCommandResultSchema,
  RejectedCommandResultSchema,
]);

export function parseCommandMessage(input: unknown): CommandEnvelope {
  let value = input;
  let byteLength: number;
  if (typeof input === "string") {
    byteLength = new TextEncoder().encode(input).byteLength;
    if (byteLength > MAX_COMMAND_BYTES)
      throw new Error("Command exceeds 16 KiB");
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      throw new Error("Command is not valid JSON");
    }
  } else {
    let serialized: string;
    try {
      serialized = JSON.stringify(input);
    } catch {
      throw new Error("Command is not JSON-serializable");
    }
    if (serialized === undefined)
      throw new Error("Command is not JSON-serializable");
    byteLength = new TextEncoder().encode(serialized).byteLength;
    if (byteLength > MAX_COMMAND_BYTES)
      throw new Error("Command exceeds 16 KiB");
  }
  return CommandEnvelopeSchema.parse(value);
}

export type Operation = z.infer<typeof OperationSchema>;
export type DraftPlan = z.infer<typeof DraftPlanSchema>;
export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;
export type ClientCommand = CommandEnvelope;
export type CommandResult = z.infer<typeof CommandResultSchema>;
