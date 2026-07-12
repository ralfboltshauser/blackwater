import { z } from "zod";

import {
  ClientInstanceIdSchema,
  DisplayNameSchema,
  EpochSchema,
  MatchIdSchema,
  MatchLifecycleSchema,
  PlayerColorSchema,
  PlayerCountSchema,
  PlayerPatternSchema,
  PresenceSchema,
  PROTOCOL_VERSION,
  RoomCodeSchema,
  SeatIdSchema,
  SessionIdSchema,
  TimestampMsSchema,
  WriterLeaseIdSchema,
} from "./primitives";

export const SeatControllerSchema = z.enum(["human", "bot"]);
export const BotStrategySchema = z.enum([
  "network",
  "discovery",
  "dominion",
  "interdictor",
  "adaptive",
]);

export const CreateLobbyRequestSchema = z
  .object({
    protocol: z.literal(PROTOCOL_VERSION),
    playerCount: PlayerCountSchema,
    planningSeconds: z.number().int().min(60).max(240).default(120),
    clientInstanceId: ClientInstanceIdSchema.optional(),
    factionsEnabled: z.boolean().default(false),
    botCount: z.number().int().min(0).max(5).default(0),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.botCount >= request.playerCount) {
      context.addIssue({
        code: "custom",
        path: ["botCount"],
        message: "At least one expedition seat must remain human-controlled",
      });
    }
  });

export const ConfigureBotsRequestSchema = z
  .object({
    protocol: z.literal(PROTOCOL_VERSION),
    targetBotCount: z.number().int().min(0).max(5),
  })
  .strict();

export const RemoveLobbyPlayerRequestSchema = z
  .object({
    protocol: z.literal(PROTOCOL_VERSION),
    seatId: SeatIdSchema,
  })
  .strict();

export const JoinLobbyRequestSchema = z
  .object({
    protocol: z.literal(PROTOCOL_VERSION),
    roomCode: RoomCodeSchema,
    displayName: DisplayNameSchema,
    clientInstanceId: ClientInstanceIdSchema,
  })
  .strict();

export const ClaimSeatRequestSchema = z
  .object({
    protocol: z.literal(PROTOCOL_VERSION),
    roomCode: RoomCodeSchema,
    seatId: SeatIdSchema,
    displayName: DisplayNameSchema,
    clientInstanceId: ClientInstanceIdSchema,
  })
  .strict();

export const ResumeSessionRequestSchema = z
  .object({
    protocol: z.literal(PROTOCOL_VERSION),
    clientInstanceId: ClientInstanceIdSchema,
  })
  .strict();

export const TakeOverControllerRequestSchema = z
  .object({
    protocol: z.literal(PROTOCOL_VERSION),
    clientInstanceId: ClientInstanceIdSchema,
    confirmationCode: z.string().regex(/^\d{4}$/),
  })
  .strict();

export const LobbySeatSchema = z
  .object({
    seatId: SeatIdSchema,
    displayName: DisplayNameSchema.nullable(),
    color: PlayerColorSchema,
    pattern: PlayerPatternSchema,
    presence: PresenceSchema,
    claimed: z.boolean(),
    ready: z.boolean(),
    controller: SeatControllerSchema.nullable(),
    botStrategy: BotStrategySchema.nullable(),
  })
  .strict();

export const LobbySnapshotSchema = z
  .object({
    matchId: MatchIdSchema,
    roomCode: RoomCodeSchema,
    lifecycle: MatchLifecycleSchema,
    playerCount: PlayerCountSchema,
    seats: z.array(LobbySeatSchema).min(1).max(6),
    displayConnected: z.boolean(),
    canStart: z.boolean(),
    createdAtMs: TimestampMsSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.seats.length !== snapshot.playerCount) {
      context.addIssue({
        code: "custom",
        path: ["seats"],
        message: "Seat count must match player count",
      });
    }
    const seatIds = snapshot.seats.map((seat) => seat.seatId);
    if (new Set(seatIds).size !== seatIds.length) {
      context.addIssue({
        code: "custom",
        path: ["seats"],
        message: "Seat IDs must be unique",
      });
    }
  });

const SessionBootstrapBase = {
  protocol: z.literal(PROTOCOL_VERSION),
  buildId: z.string().min(1).max(128),
  sessionId: SessionIdSchema,
  matchId: MatchIdSchema,
  roomCode: RoomCodeSchema,
  sessionEpoch: EpochSchema,
  commandPrefix: z.string().min(16).max(64),
  expiresAtMs: TimestampMsSchema,
} as const;

export const HostSessionBootstrapSchema = z
  .object({
    ...SessionBootstrapBase,
    role: z.literal("host"),
    capabilities: z.tuple([z.literal("host")]),
  })
  .strict();

export const DisplaySessionBootstrapSchema = z
  .object({
    ...SessionBootstrapBase,
    role: z.literal("display"),
    capabilities: z.tuple([z.literal("display")]),
  })
  .strict();

export const PlayerSessionBootstrapSchema = z
  .object({
    ...SessionBootstrapBase,
    role: z.literal("player"),
    seatId: SeatIdSchema,
    writerLeaseId: WriterLeaseIdSchema,
    clientInstanceId: ClientInstanceIdSchema,
    capabilities: z.tuple([z.literal("player")]),
  })
  .strict();

export const SessionBootstrapSchema = z.discriminatedUnion("role", [
  HostSessionBootstrapSchema,
  DisplaySessionBootstrapSchema,
  PlayerSessionBootstrapSchema,
]);

export const SessionStatusSchema = z
  .object({
    sessionId: SessionIdSchema,
    role: z.enum(["host", "display", "player"]),
    matchId: MatchIdSchema,
    seatId: SeatIdSchema.nullable(),
    sessionEpoch: EpochSchema,
    expiresAtMs: TimestampMsSchema,
    lastSeenAtMs: TimestampMsSchema,
    revokedAtMs: TimestampMsSchema.nullable(),
  })
  .strict();

export const LobbyErrorCodeSchema = z.enum([
  "ROOM_NOT_FOUND",
  "ROOM_CLOSED",
  "ROOM_FULL",
  "SEAT_TAKEN",
  "INVALID_NAME",
  "SESSION_REVOKED",
  "CONTROLLER_ACTIVE",
  "PROTOCOL_MISMATCH",
]);

export type CreateLobbyRequest = z.infer<typeof CreateLobbyRequestSchema>;
export type ConfigureBotsRequest = z.infer<typeof ConfigureBotsRequestSchema>;
export type RemoveLobbyPlayerRequest = z.infer<
  typeof RemoveLobbyPlayerRequestSchema
>;
export type JoinLobbyRequest = z.infer<typeof JoinLobbyRequestSchema>;
export type LobbySnapshot = z.infer<typeof LobbySnapshotSchema>;
export type SeatController = z.infer<typeof SeatControllerSchema>;
export type BotStrategy = z.infer<typeof BotStrategySchema>;
export type SessionBootstrap = z.infer<typeof SessionBootstrapSchema>;
export type PlayerSessionBootstrap = z.infer<
  typeof PlayerSessionBootstrapSchema
>;
export type HostSessionBootstrap = z.infer<typeof HostSessionBootstrapSchema>;
export type DisplaySessionBootstrap = z.infer<
  typeof DisplaySessionBootstrapSchema
>;
export type SessionStatus = z.infer<typeof SessionStatusSchema>;
