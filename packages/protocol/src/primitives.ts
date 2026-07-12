import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;
export const MAX_COMMAND_BYTES = 16 * 1024;

const boundedId = (label: string) =>
  z
    .string()
    .min(3, `${label} is too short`)
    .max(64, `${label} is too long`)
    .regex(/^[A-Za-z0-9_-]+$/, `${label} contains invalid characters`);

export const MatchIdSchema = boundedId("matchId");
export const PhaseIdSchema = boundedId("phaseId");
export const CommandIdSchema = boundedId("commandId");
export const SessionIdSchema = boundedId("sessionId");
export const ClientInstanceIdSchema = boundedId("clientInstanceId");
export const WriterLeaseIdSchema = z.string().min(24).max(256);
export const AssetIdSchema = boundedId("assetId");
export const SectorIdSchema = z.number().int().min(1).max(24);
export const PlatformIdSchema = boundedId("platformId");
export const ContactIdSchema = boundedId("contactId");
export const ReportIdSchema = boundedId("reportId");
export const OfferIdSchema = boundedId("offerId");
export const ResolutionIdSchema = boundedId("resolutionId");
export const BeatIdSchema = boundedId("beatId");
export const EventIdSchema = boundedId("eventId");
export const SpecimenIdSchema = boundedId("specimenId");
export const DeviceIdSchema = boundedId("deviceId");

export const RoomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-HJ-NP-Z2-9]{6}$/,
    "Room code must contain six unambiguous characters",
  );

export const DisplayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .refine(
    (value) => !/[\u0000-\u001f\u007f]/u.test(value),
    "Control characters are not allowed",
  );

export const SeatIdSchema = boundedId("seatId");

export const TimestampMsSchema = z.number().int().nonnegative().safe();
export const DurationMsSchema = z
  .number()
  .int()
  .min(0)
  .max(10 * 60 * 1000);
export const RevisionSchema = z.number().int().nonnegative();
export const EpochSchema = z.number().int().nonnegative();
export const StreamVersionSchema = z.number().int().nonnegative();
export const TimelineSeqSchema = z.number().int().nonnegative();
export const PulseNumberSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export const PlayerCountSchema = z.number().int().min(1).max(6);
export const NonEmptyTextSchema = z.string().trim().min(1).max(280);

export const SessionRoleSchema = z.enum(["host", "display", "player"]);
export const PresenceSchema = z.enum(["connected", "grace", "offline"]);
export const MatchLifecycleSchema = z.enum([
  "lobby",
  "active",
  "finished",
  "archived",
]);
export const PhaseKindSchema = z.enum([
  "lobby",
  "forecast",
  "open-water",
  "resolution",
  "claim-check",
  "game-over",
]);

export const PlayerColorSchema = z.enum([
  "cyan",
  "amber",
  "violet",
  "lime",
  "coral",
  "chalk",
]);
export const PlayerPatternSchema = z.enum([
  "solid",
  "stripe",
  "dot",
  "dash",
  "cross",
  "wave",
]);
export const ModuleKindSchema = z.enum(["extractor", "sonar", "laboratory"]);
export const FactionSchema = z.enum([
  "symmetric",
  "echo_cartographers",
  "quiet_current",
  "roaming_atoll",
  "hadal_engineers",
  "concord_relay",
  "second_dawn",
]);
export const RegionKindSchema = z.enum(["shelf", "rift", "blackwater"]);
export const ContactClassSchema = z.enum([
  "unknown",
  "vessel",
  "submarine",
  "decoy",
  "disturbance",
]);
export const ConfidenceSchema = z.enum(["low", "medium", "high", "exact"]);
export const DirectionSchema = z.enum([
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
]);
export const SpecimenTypeSchema = z.enum([
  "ribbon_filter",
  "prism_raft",
  "luminous_pollen",
]);

export const PointSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  })
  .strict();

export const PublicResourceSchema = z
  .object({
    supply: z.number().int().min(0).max(99),
  })
  .strict();

export const TransferBundleSchema = z
  .object({
    supply: z.number().int().min(0).max(99).default(0),
    signal: z.number().int().min(0).max(99).default(0),
    reportIds: z.array(ReportIdSchema).max(12).default([]),
    specimenIds: z.array(SpecimenIdSchema).max(2).default([]),
  })
  .strict()
  .superRefine((bundle, context) => {
    if (new Set(bundle.reportIds).size !== bundle.reportIds.length) {
      context.addIssue({
        code: "custom",
        message: "A report can appear only once in a transfer bundle",
      });
    }
    if (new Set(bundle.specimenIds).size !== bundle.specimenIds.length) {
      context.addIssue({
        code: "custom",
        message: "A specimen can appear only once in a transfer bundle",
      });
    }
  });

export const ReportFieldSchema = z.enum([
  "sectorId",
  "observedAtRound",
  "observedAtPulse",
  "contactCount",
  "contactClass",
  "direction",
  "identitySeatId",
  "confidence",
  "sensor",
  "specimenType",
  "statement",
]);

export const IntelReportSchema = z
  .object({
    reportId: ReportIdSchema,
    createdAtMs: TimestampMsSchema,
    observedAtRound: z.number().int().min(1).max(20),
    observedAtPulse: PulseNumberSchema.nullable(),
    sectorId: SectorIdSchema.nullable(),
    contactCount: z.number().int().min(0).max(12).nullable(),
    contactClass: ContactClassSchema.nullable(),
    direction: DirectionSchema.nullable(),
    identitySeatId: SeatIdSchema.nullable(),
    confidence: ConfidenceSchema.nullable(),
    sensor: z
      .enum(["passive-sonar", "active-survey", "trap", "visual", "statement"])
      .nullable(),
    specimenType: SpecimenTypeSchema.nullable(),
    statement: NonEmptyTextSchema.nullable(),
    verified: z.boolean(),
    redactedFields: z.array(ReportFieldSchema).max(10),
    authorSeatId: SeatIdSchema,
    custody: z
      .array(
        z
          .object({
            seatId: SeatIdSchema,
            transferredAtMs: TimestampMsSchema,
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();

export type SeatId = z.infer<typeof SeatIdSchema>;
export type SessionRole = z.infer<typeof SessionRoleSchema>;
export type IntelReport = z.infer<typeof IntelReportSchema>;
