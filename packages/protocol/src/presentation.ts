import { z } from "zod";

import {
  AssetIdSchema,
  BeatIdSchema,
  ConfidenceSchema,
  ContactClassSchema,
  ContactIdSchema,
  DeviceIdSchema,
  DirectionSchema,
  DurationMsSchema,
  EventIdSchema,
  IntelReportSchema,
  ModuleKindSchema,
  NonEmptyTextSchema,
  OfferIdSchema,
  PlatformIdSchema,
  PulseNumberSchema,
  ResolutionIdSchema,
  SeatIdSchema,
  SectorIdSchema,
  SpecimenIdSchema,
  SpecimenTypeSchema,
  TimelineSeqSchema,
  TimestampMsSchema,
} from "./primitives";

const BeatTimingFields = {
  resolutionId: ResolutionIdSchema,
  beatId: BeatIdSchema,
  timelineSeq: TimelineSeqSchema,
  pulse: PulseNumberSchema.nullable(),
  startsAtServerMs: TimestampMsSchema,
  durationMs: DurationMsSchema,
} as const;

export const PublicBeatEventSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("pulse.open"), pulse: PulseNumberSchema })
    .strict(),
  z
    .object({
      kind: z.literal("ark.move"),
      seatId: SeatIdSchema,
      assetId: AssetIdSchema,
      fromSectorId: SectorIdSchema,
      toSectorId: SectorIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("wake"),
      sectorId: SectorIdSchema,
      direction: DirectionSchema,
      strength: z.enum(["faint", "clear"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("contact.update"),
      contactId: ContactIdSchema,
      sectorId: SectorIdSchema,
      class: ContactClassSchema,
      confidence: ConfidenceSchema,
      identifiedSeatId: SeatIdSchema.nullable(),
      state: z.enum(["appeared", "refined", "faded", "removed"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("sonar.sweep"),
      sourceSectorId: SectorIdSchema,
      coveredSectorIds: z.array(SectorIdSchema).min(1).max(8),
      contactIds: z.array(ContactIdSchema).max(12),
    })
    .strict(),
  z
    .object({
      kind: z.literal("disturbance"),
      sectorId: SectorIdSchema,
      effect: z.enum(["jam", "interference", "signal-loss"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("trap.reveal"),
      deviceId: DeviceIdSchema,
      device: z.enum(["snare", "decoy"]),
      sectorId: SectorIdSchema,
      ownerSeatId: SeatIdSchema.nullable(),
      outcome: z.enum(["triggered", "disarmed", "expired"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("encounter"),
      sectorId: SectorIdSchema,
      objective: z.enum(["hunt", "raid", "harvest", "screen"]),
      participants: z.array(SeatIdSchema).min(1).max(6),
      winnerSeatId: SeatIdSchema.nullable(),
      outcome: z.enum([
        "attack-failed",
        "retreat",
        "damaged",
        "disabled",
        "contested",
        "harvested",
        "stalemate",
      ]),
      margin: z.number().int().min(0).max(12).nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("platform.update"),
      platformId: PlatformIdSchema,
      sectorId: SectorIdSchema,
      ownerSeatId: SeatIdSchema,
      module: ModuleKindSchema,
      change: z.enum([
        "built",
        "disabled",
        "contested",
        "repaired",
        "transferred",
      ]),
      contenderSeatId: SeatIdSchema.nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("specimen.analyzed"),
      seatId: SeatIdSchema,
      analyzedCount: z.number().int().min(0).max(20),
    })
    .strict(),
  z
    .object({
      kind: z.literal("supply.update"),
      seatId: SeatIdSchema,
      delta: z.number().int().min(-99).max(99),
      total: z.number().int().min(0).max(99),
      reason: z.enum([
        "production",
        "build",
        "repair",
        "trade",
        "raid",
        "contract",
      ]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("agreement.update"),
      offerId: OfferIdSchema,
      participants: z.array(SeatIdSchema).min(2).max(3),
      change: z.enum(["accepted", "fulfilled", "breached", "expired"]),
      caption: NonEmptyTextSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("charter.progress"),
      seatId: SeatIdSchema,
      charter: z.enum(["network", "discovery"]),
      value: z.number().int().min(0).max(20),
      target: z.number().int().min(1).max(20),
    })
    .strict(),
  z
    .object({
      kind: z.literal("charter.claim"),
      winners: z.array(SeatIdSchema).min(1).max(6),
      charters: z
        .array(z.enum(["network", "discovery", "dominion", "fallback"]))
        .min(1)
        .max(4),
    })
    .strict(),
  z
    .object({
      kind: z.literal("caption"),
      tone: z.enum(["neutral", "warning", "success"]),
      text: NonEmptyTextSchema,
      sectorId: SectorIdSchema.nullable(),
    })
    .strict(),
]);

export const PublicBeatSchema = z
  .object({
    ...BeatTimingFields,
    stream: z.literal("public"),
    event: PublicBeatEventSchema,
  })
  .strict();

export const PrivateBeatEventSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("submarine.move"),
      assetId: AssetIdSchema,
      path: z.array(SectorIdSchema).min(2).max(3),
      silenceSpent: z.number().int().min(0).max(1),
      finalSectorId: SectorIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("operation.result"),
      operationKind: z.enum([
        "hold",
        "glide",
        "sprint",
        "navigate",
        "survey",
        "harvest",
        "analyze",
        "develop",
        "deploy",
        "hunt",
        "raid",
        "jam",
        "go_dark",
        "screen",
      ]),
      status: z.enum([
        "succeeded",
        "failed",
        "converted-to-hold",
        "partially-succeeded",
      ]),
      reason: NonEmptyTextSchema,
      assetId: AssetIdSchema.nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("intel.received"),
      report: IntelReportSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("cargo.update"),
      assetId: AssetIdSchema,
      specimenId: SpecimenIdSchema,
      specimenType: SpecimenTypeSchema,
      change: z.enum([
        "harvested",
        "dropped",
        "stolen",
        "transferred",
        "analyzed",
      ]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("trap.status"),
      deviceId: DeviceIdSchema,
      device: z.enum(["snare", "decoy"]),
      sectorId: SectorIdSchema,
      change: z.enum(["deployed", "triggered", "disarmed", "expired"]),
      affectedAssetId: AssetIdSchema.nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("resource.private"),
      signalDelta: z.number().int().min(-99).max(99),
      newSignalTotal: z.number().int().min(0).max(99),
      reason: NonEmptyTextSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("deal.private"),
      offerId: OfferIdSchema,
      counterpartySeatId: SeatIdSchema,
      change: z.enum([
        "received",
        "accepted",
        "withdrawn",
        "fulfilled",
        "breached",
        "expired",
      ]),
      caption: NonEmptyTextSchema,
    })
    .strict(),
]);

export const PrivateBeatSchema = z
  .object({
    ...BeatTimingFields,
    stream: z.literal("private"),
    seatId: SeatIdSchema,
    event: PrivateBeatEventSchema,
  })
  .strict();

export const AuthorizedPresentationBeatSchema = z.discriminatedUnion("stream", [
  PublicBeatSchema,
  PrivateBeatSchema,
]);

export const PresentationClockSchema = z
  .object({
    resolutionId: ResolutionIdSchema.nullable(),
    cursor: z.number().int().nonnegative(),
    beatCount: z.number().int().nonnegative(),
    timelineSeq: TimelineSeqSchema,
    paused: z.boolean(),
    currentBeatId: BeatIdSchema.nullable(),
    currentBeatEndsAtServerMs: TimestampMsSchema.nullable(),
  })
  .strict()
  .superRefine((clock, context) => {
    if (clock.cursor > clock.beatCount) {
      context.addIssue({
        code: "custom",
        path: ["cursor"],
        message: "Cursor cannot exceed beat count",
      });
    }
    if (
      clock.resolutionId === null &&
      (clock.cursor !== 0 ||
        clock.beatCount !== 0 ||
        clock.currentBeatId !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "An idle clock cannot contain presentation progress",
      });
    }
  });

export const PresentationBeatTimingSchema = z
  .object({
    beatId: BeatIdSchema,
    eventIds: z.array(EventIdSchema).min(1).max(32),
    startsAtMs: DurationMsSchema,
    durationMs: DurationMsSchema,
  })
  .strict();

export const ResolutionPresentationPlanSchema = z
  .object({
    resolutionId: ResolutionIdSchema,
    presentationSchemaVersion: z.literal(1),
    beats: z.array(PresentationBeatTimingSchema).max(256),
  })
  .strict()
  .superRefine((plan, context) => {
    const eventIds = plan.beats.flatMap((beat) => beat.eventIds);
    if (new Set(eventIds).size !== eventIds.length) {
      context.addIssue({
        code: "custom",
        path: ["beats"],
        message: "An event can belong to only one beat",
      });
    }
    for (let index = 1; index < plan.beats.length; index += 1) {
      const previous = plan.beats[index - 1];
      const current = plan.beats[index];
      if (
        previous &&
        current &&
        current.startsAtMs < previous.startsAtMs + previous.durationMs
      ) {
        context.addIssue({
          code: "custom",
          path: ["beats", index],
          message: "Presentation beats cannot overlap",
        });
      }
    }
  });

export type PublicBeat = z.infer<typeof PublicBeatSchema>;
export type PrivateBeat = z.infer<typeof PrivateBeatSchema>;
export type AuthorizedPresentationBeat = z.infer<
  typeof AuthorizedPresentationBeatSchema
>;
export type PresentationClock = z.infer<typeof PresentationClockSchema>;
