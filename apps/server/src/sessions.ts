import { randomBytes, randomInt } from "node:crypto";

import "@fastify/cookie";
import type { FastifyReply, FastifyRequest } from "fastify";

import type {
  PlayerSessionBootstrap,
  SessionBootstrap,
} from "@blackwater/protocol";

import type { BlackwaterStore, SessionRecord } from "./persistence";
import type { PersistedRules, WorkflowState } from "./state";

export const SESSION_COOKIE = "blackwater_session";
const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1_000;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomId(prefix: string, bytes = 12): string {
  return `${prefix}-${randomBytes(bytes).toString("hex")}`;
}

export function randomSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function roomCode(): string {
  return Array.from(
    { length: 6 },
    () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)],
  ).join("");
}

export function setSessionCookie(
  reply: FastifyReply,
  credential: string,
  secure = false,
): void {
  reply.setCookie(SESSION_COOKIE, credential, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure,
    maxAge: SESSION_LIFETIME_MS / 1_000,
  });
}

export function credentialFromCookieHeader(
  header: string | undefined,
): string | null {
  if (!header) return null;
  for (const item of header.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    const name = item.slice(0, separator).trim();
    if (name !== SESSION_COOKIE) continue;
    try {
      return decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function activeSession(
  store: BlackwaterStore<PersistedRules, WorkflowState>,
  credential: string | null,
  nowMs = Date.now(),
): SessionRecord | null {
  if (!credential) return null;
  const session = store.getSessionByCredential(credential);
  if (!session || session.revokedAtMs !== null || session.expiresAtMs <= nowMs)
    return null;
  return session;
}

export function requestSession(
  request: FastifyRequest,
  store: BlackwaterStore<PersistedRules, WorkflowState>,
): SessionRecord | null {
  return activeSession(store, request.cookies[SESSION_COOKIE] ?? null);
}

export function createSession(input: {
  store: BlackwaterStore<PersistedRules, WorkflowState>;
  role: "host" | "display" | "player";
  matchId: string;
  seatId?: string;
  nowMs: number;
}): { session: SessionRecord; credential: string } {
  const credential = randomSecret();
  const session = input.store.createSession({
    sessionId: randomId("session"),
    credential,
    role: input.role,
    matchId: input.matchId,
    ...(input.seatId ? { seatId: input.seatId } : {}),
    expiresAtMs: input.nowMs + SESSION_LIFETIME_MS,
    lastSeenAtMs: input.nowMs,
  });
  return { session, credential };
}

export function playerBootstrap(input: {
  store: BlackwaterStore<PersistedRules, WorkflowState>;
  session: SessionRecord;
  roomCode: string;
  clientInstanceId: string;
  buildId: string;
}): PlayerSessionBootstrap {
  if (input.session.role !== "player" || !input.session.seatId)
    throw new Error("Player session required");
  const writerLeaseId = randomSecret();
  input.store.rotateWriterLease({
    matchId: input.session.matchId,
    seatId: input.session.seatId,
    clientInstanceId: input.clientInstanceId,
    writerLeaseId,
  });
  return {
    protocol: 1,
    buildId: input.buildId,
    sessionId: input.session.sessionId,
    matchId: input.session.matchId,
    roomCode: input.roomCode,
    sessionEpoch: input.session.sessionEpoch,
    commandPrefix: randomBytes(12).toString("hex"),
    expiresAtMs: input.session.expiresAtMs,
    role: "player",
    seatId: input.session.seatId,
    writerLeaseId,
    clientInstanceId: input.clientInstanceId,
    capabilities: ["player"],
  };
}

export function nonPlayerBootstrap(input: {
  session: SessionRecord;
  roomCode: string;
  buildId: string;
}): SessionBootstrap {
  if (input.session.role === "player")
    throw new Error("Non-player session required");
  return {
    protocol: 1,
    buildId: input.buildId,
    sessionId: input.session.sessionId,
    matchId: input.session.matchId,
    roomCode: input.roomCode,
    sessionEpoch: input.session.sessionEpoch,
    commandPrefix: randomBytes(12).toString("hex"),
    expiresAtMs: input.session.expiresAtMs,
    role: input.session.role,
    capabilities: [input.session.role],
  } as SessionBootstrap;
}
