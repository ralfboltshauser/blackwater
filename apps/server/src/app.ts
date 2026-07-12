import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

import compress from "@fastify/compress";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import ipaddr from "ipaddr.js";
import { Server as SocketServer, type Socket } from "socket.io";
import { z } from "zod";

import {
  BriefingControlRequestSchema,
  ClaimSeatRequestSchema,
  ConfigureBotsRequestSchema,
  CreateLobbyRequestSchema,
  JoinLobbyRequestSchema,
  RemoveLobbyPlayerRequestSchema,
  SetLobbyColorRequestSchema,
  PROTOCOL_VERSION,
  ResumeSessionRequestSchema,
  parseCommandMessage,
  type CommandResult,
  type BriefingState,
  type HostProjection,
  type PlayerProjection,
  type PublicProjection,
} from "@blackwater/protocol";

import type { MatchActor } from "./actor";
import { MatchManager } from "./manager";
import { BlackwaterStore } from "./persistence";
import {
  SESSION_COOKIE,
  activeSession,
  createSession,
  credentialFromCookieHeader,
  playerBootstrap,
  requestSession,
  setSessionCookie,
} from "./sessions";
import {
  PersistedRulesSchema,
  WorkflowStateSchema,
  type PersistedRules,
  type WorkflowState,
} from "./state";

export interface ServerConfig {
  bind: string;
  port: number;
  publicUrl: string;
  lanUrl: string;
  allowedCidrs: string[];
  dataDir: string;
  webRoot: string;
  buildId: string;
  assetManifestHash: string;
  logger?: boolean;
}

export interface BlackwaterApplication {
  fastify: FastifyInstance;
  io: SocketServer;
  store: BlackwaterStore<PersistedRules, WorkflowState>;
  manager: MatchManager;
  start(): Promise<void>;
  close(): Promise<void>;
}

type ViewerRole = "public" | "player" | "host";

interface Subscription {
  actor: MatchActor;
  role: ViewerRole;
  sessionId: string | null;
  seatId: string | null;
}

interface ProjectionCacheEntry {
  serialized: string;
  version: number;
}

export async function createApplication(
  config: ServerConfig,
): Promise<BlackwaterApplication> {
  const securePublicOrigin = new URL(config.publicUrl).protocol === "https:";
  const fastify = Fastify({
    logger: config.logger ?? false,
    trustProxy: false,
    bodyLimit: 64 * 1024,
    requestTimeout: 10_000,
  });
  await fastify.register(cookie);
  await fastify.register(compress, { global: true, threshold: 1_024 });
  await fastify.register(rateLimit, {
    global: true,
    // A game night can put the host, TV and several browser tabs behind one
    // address. Only state-changing HTTP traffic shares this budget: static
    // files, health/projection reads and Socket.IO transport must never starve
    // the command path simply because clients loaded at the same time.
    max: 360,
    timeWindow: "1 minute",
    allowList: (request) =>
      request.method === "GET" ||
      request.method === "HEAD" ||
      request.method === "OPTIONS" ||
      request.url.startsWith("/socket.io/"),
  });
  await fastify.register(helmet, {
    global: true,
    contentSecurityPolicy: {
      // Keep this policy explicit and identical in secure production and
      // localhost tests. Assets, APIs, and realtime connections are all
      // same-origin, so no implicit external source or upgrade is needed.
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", "data:"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    },
    hsts: securePublicOrigin
      ? { maxAge: 15_552_000, includeSubDomains: false }
      : false,
    crossOriginEmbedderPolicy: false,
  });

  const allowedNetworks = config.allowedCidrs.map((cidr) =>
    ipaddr.parseCIDR(cidr),
  );
  fastify.addHook("onRequest", async (request, reply) => {
    if (!addressAllowed(request.ip, allowedNetworks)) {
      await reply.code(403).send({
        error: "This server accepts only the configured local network",
        code: "NETWORK_DENIED",
      });
      return;
    }
    const origin = request.headers.origin;
    if (
      origin &&
      !originAllowed(origin, request.headers.host, config.publicUrl)
    ) {
      await reply
        .code(403)
        .send({ error: "Origin is not allowed", code: "ORIGIN_DENIED" });
    }
  });

  fastify.addHook("onSend", async (request, reply, payload) => {
    const url = request.url.split("?")[0] ?? request.url;
    if (/\/assets\/.*[.-][a-f0-9]{8,}\./i.test(url)) {
      reply.header("cache-control", "public, max-age=31536000, immutable");
    } else if (url === "/sw.js" || url === "/manifest.webmanifest") {
      reply.header("cache-control", "no-cache");
      if (url === "/sw.js") reply.header("service-worker-allowed", "/");
    } else if (url.startsWith("/sprites/") || url.startsWith("/water/")) {
      reply.header("cache-control", "public, max-age=3600, must-revalidate");
    } else if (
      url.endsWith(".html") ||
      ["/", "/host", "/display", "/play"].includes(url)
    ) {
      reply.header("cache-control", "no-cache");
    }
    return payload;
  });

  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error: "The request did not match the Blackwater protocol",
        code: "INVALID_REQUEST",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    const message = error instanceof Error ? error.message : "Request failed";
    const known = classifyExpectedError(message);
    if (known) {
      return reply
        .code(known.status)
        .send({ error: message, code: known.code });
    }
    const errorRecord =
      error && typeof error === "object"
        ? (error as { statusCode?: unknown })
        : null;
    const statusCode =
      typeof errorRecord?.statusCode === "number" &&
      errorRecord.statusCode >= 400 &&
      errorRecord.statusCode < 500
        ? errorRecord.statusCode
        : 500;
    if (statusCode === 500) request.log.error({ err: error }, "request failed");
    return reply.code(statusCode).send({
      error: statusCode === 500 ? "An internal server error occurred" : message,
      code: statusCode === 500 ? "INTERNAL_ERROR" : "REQUEST_REJECTED",
    });
  });

  const databaseFile = join(config.dataDir, "blackwater.sqlite3");
  const store = BlackwaterStore.open({
    filename: databaseFile,
    rulesSchema: PersistedRulesSchema,
    workflowSchema: WorkflowStateSchema,
  });
  const manager = new MatchManager(store, {
    buildId: config.buildId,
    assetManifestHash: config.assetManifestHash,
    databaseBytes: () => {
      try {
        return statSync(databaseFile).size;
      } catch {
        return 0;
      }
    },
    onActorError: ({ actor, error, operation }) => {
      fastify.log.error(
        {
          err: error,
          matchId: actor.matchId,
          roomCode: actor.roomCode,
          operation,
        },
        "match actor background operation failed",
      );
    },
  });

  const io = new SocketServer(fastify.server, {
    path: "/socket.io",
    transports: ["polling", "websocket"],
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 10_000,
    pingTimeout: 20_000,
    perMessageDeflate: false,
    connectionStateRecovery: {
      maxDisconnectionDuration: 120_000,
      skipMiddlewares: false,
    },
    allowRequest: (request, callback) => {
      const address = request.socket.remoteAddress ?? "";
      const origin = request.headers.origin;
      callback(
        null,
        addressAllowed(address, allowedNetworks) &&
          (!origin ||
            originAllowed(origin, request.headers.host, config.publicUrl)),
      );
    },
  });
  const subscriptions = new Map<string, Subscription>();
  const projectionCache = new Map<string, ProjectionCacheEntry>();
  const beatCache = new Map<string, number>();
  const briefingRevisionCache = new Map<string, number>();

  const envelope = <
    T extends PublicProjection | PlayerProjection | HostProjection,
  >(
    stream: "public" | "private" | "host",
    actor: MatchActor,
    payload: T,
    key: string,
  ) => ({
    protocol: PROTOCOL_VERSION,
    buildId: config.buildId,
    stream,
    version: versionFor(projectionCache, key, payload),
    phaseId: actor.match.workflow.phase.phaseId,
    serverNowMs: Date.now(),
    payload,
  });

  const publishActor = (actor: MatchActor) => {
    const briefing = actor.briefingView();
    if (briefingRevisionCache.get(actor.matchId) !== briefing.revision) {
      briefingRevisionCache.set(actor.matchId, briefing.revision);
      io.to(publicRoom(actor)).emit("briefing:state", briefing);
      io.to(hostRoom(actor)).emit("briefing:state", briefing);
    }
    const publicView = actor.publicView();
    if (publicView) {
      const key = `${actor.matchId}:public`;
      if (projectionChanged(projectionCache, key, publicView)) {
        io.to(publicRoom(actor)).emit(
          "projection",
          envelope("public", actor, publicView, key),
        );
      }
      const beat = actor.presentationBeat();
      if (beat && beatCache.get(key) !== beat.timelineSeq) {
        beatCache.set(key, beat.timelineSeq);
        io.to(publicRoom(actor)).emit("presentation:beat", beat);
      }
    }
    for (const seat of actor.match.workflow.seats) {
      if (!seat.displayName) continue;
      const privateView = actor.playerView(seat.seatId);
      if (!privateView) continue;
      const key = `${actor.matchId}:seat:${seat.seatId}`;
      if (projectionChanged(projectionCache, key, privateView)) {
        io.to(seatRoom(actor, seat.seatId)).emit(
          "projection",
          envelope("private", actor, privateView, key),
        );
      }
      const beat = actor.presentationBeat(seat.seatId);
      if (beat && beatCache.get(key) !== beat.timelineSeq) {
        beatCache.set(key, beat.timelineSeq);
        io.to(seatRoom(actor, seat.seatId)).emit("presentation:beat", beat);
      }
    }
    const hostView = actor.hostView();
    const hostKey = `${actor.matchId}:host`;
    if (projectionChanged(projectionCache, hostKey, hostView)) {
      io.to(hostRoom(actor)).emit(
        "projection",
        envelope("host", actor, hostView, hostKey),
      );
    }
  };
  manager.setPublisher(publishActor);
  await manager.initialize();

  registerApiRoutes(fastify, io, manager, store, config);
  await registerStaticRoutes(fastify, config.webRoot);

  io.on("connection", (socket) => {
    socket.on(
      "viewer:subscribe",
      async (
        raw: unknown,
        acknowledge: (result: { ok: boolean; error?: string }) => void,
      ) => {
        try {
          const request = z
            .object({
              role: z.enum(["public", "player", "host"]),
              roomCode: z.string().length(6),
            })
            .strict()
            .parse(raw);
          const actor = manager.byRoom(request.roomCode);
          if (!actor) throw new Error("Room not found");
          const credential = credentialFromCookieHeader(
            socket.handshake.headers.cookie,
          );
          const session = activeSession(store, credential);
          if (
            request.role === "player" &&
            (session?.role !== "player" || session.matchId !== actor.matchId)
          ) {
            throw new Error("Player session is missing or expired");
          }
          if (
            request.role === "host" &&
            (session?.role !== "host" || session.matchId !== actor.matchId)
          ) {
            throw new Error("Host session is missing or expired");
          }
          const previous = subscriptions.get(socket.id);
          if (
            previous?.actor === actor &&
            previous.role === request.role &&
            previous.sessionId === (session?.sessionId ?? null)
          ) {
            emitInitial(socket, previous, envelope, projectionCache);
            acknowledge({ ok: true });
            return;
          }
          if (previous) {
            await socket.leave(roomFor(previous));
            await previous.actor.disconnect(socket.id);
          }
          const subscription: Subscription = {
            actor,
            role: request.role,
            sessionId: session?.sessionId ?? null,
            seatId: session?.seatId ?? null,
          };
          subscriptions.set(socket.id, subscription);
          const room =
            request.role === "public"
              ? publicRoom(actor)
              : request.role === "host"
                ? hostRoom(actor)
                : seatRoom(actor, session!.seatId!);
          await socket.join(room);
          await actor.connect({
            connectionId: socket.id,
            role: request.role === "public" ? "display" : request.role,
            sessionId: session?.sessionId ?? `display-${socket.id}`,
            seatId: session?.seatId ?? null,
            transport:
              socket.conn.transport.name === "websocket"
                ? "websocket"
                : "polling",
          });
          emitInitial(socket, subscription, envelope, projectionCache);
          acknowledge({ ok: true });
        } catch (error) {
          acknowledge({
            ok: false,
            error:
              error instanceof Error ? error.message : "Could not subscribe",
          });
        }
      },
    );

    socket.on(
      "command",
      async (raw: unknown, acknowledge: (result: CommandResult) => void) => {
        try {
          const subscription = subscriptions.get(socket.id);
          if (!subscription?.sessionId)
            throw new Error("Authenticated subscription required");
          const session = store.getSession(subscription.sessionId);
          if (!session) throw new Error("Session expired");
          const command = parseCommandMessage(raw);
          acknowledge(await subscription.actor.handleCommand(session, command));
        } catch (error) {
          acknowledge({
            status: "rejected",
            commandId: commandIdFrom(raw),
            code: "INVALID_INTENT",
            retryable: false,
          });
          socket.emit("session:error", {
            message:
              error instanceof Error ? error.message : "Command rejected",
          });
        }
      },
    );

    socket.on("disconnect", () => {
      const subscription = subscriptions.get(socket.id);
      subscriptions.delete(socket.id);
      if (subscription) void subscription.actor.disconnect(socket.id);
    });
  });

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await manager.close();
    await new Promise<void>((resolveClose) => io.close(() => resolveClose()));
    // Socket.IO closes the shared HTTP server. Fastify still needs its close
    // lifecycle to run so plugin teardown and onClose hooks are not skipped.
    await fastify.close();
    try {
      store.checkpoint("TRUNCATE");
    } finally {
      store.close();
    }
  };

  return {
    fastify,
    io,
    store,
    manager,
    start: async () => {
      await fastify.listen({ host: config.bind, port: config.port });
    },
    close,
  };
}

function registerApiRoutes(
  fastify: FastifyInstance,
  io: SocketServer,
  manager: MatchManager,
  store: BlackwaterStore<PersistedRules, WorkflowState>,
  config: ServerConfig,
): void {
  const publicOrigin = new URL(config.publicUrl);
  const securePublicOrigin = publicOrigin.protocol === "https:";
  const cookieIsSecure = (request: FastifyRequest): boolean =>
    securePublicOrigin &&
    request.headers.host?.toLowerCase() === publicOrigin.host.toLowerCase();
  fastify.get("/health/live", async () => ({ status: "live" }));
  fastify.get("/health/ready", async (_request, reply) => {
    const check = store.quickCheck();
    return check.length === 1 && check[0] === "ok"
      ? { status: "ready", schemaVersion: store.schemaVersion }
      : reply.code(503).send({ status: "not-ready", check });
  });
  fastify.get("/api/v1/meta", async () => ({
    protocol: PROTOCOL_VERSION,
    buildId: config.buildId,
    rulesVersion: "1.0.0",
    schemaVersion: store.schemaVersion,
    publicUrl: config.publicUrl,
    lanUrl: config.lanUrl,
  }));

  fastify.post("/api/v1/matches", async (request, reply) => {
    const input = CreateLobbyRequestSchema.parse(request.body);
    const actor = manager.create({
      playerCount: input.playerCount,
      botCount: input.botCount,
      planningSeconds: input.planningSeconds,
      factionsEnabled: input.factionsEnabled,
    });
    const created = createSession({
      store,
      role: "host",
      matchId: actor.matchId,
      nowMs: Date.now(),
    });
    setSessionCookie(reply, created.credential, cookieIsSecure(request));
    const origin = config.publicUrl.replace(/\/$/, "");
    const lanOrigin = config.lanUrl.replace(/\/$/, "");
    return reply.code(201).send({
      roomCode: actor.roomCode,
      matchId: actor.matchId,
      joinUrl: `${origin}/j/${actor.roomCode}`,
      lanJoinUrl: `${lanOrigin}/j/${actor.roomCode}`,
      displayUrl: `${origin}/display/${actor.roomCode}`,
    });
  });

  fastify.get<{ Params: { roomCode: string } }>(
    "/api/v1/matches/:roomCode/lobby",
    async (request, reply) => {
      const actor = manager.byRoom(request.params.roomCode);
      return actor
        ? actor.lobby()
        : reply
            .code(404)
            .send({ error: "Room not found", code: "ROOM_NOT_FOUND" });
    },
  );

  fastify.put<{ Params: { roomCode: string } }>(
    "/api/v1/matches/:roomCode/bots",
    async (request, reply) => {
      const input = ConfigureBotsRequestSchema.parse(request.body);
      const actor = manager.byRoom(request.params.roomCode);
      const session = requestSession(request, store);
      if (!actor) return reply.code(404).send({ error: "Room not found" });
      if (
        !session ||
        session.role !== "host" ||
        session.matchId !== actor.matchId
      )
        return reply.code(401).send({ error: "Host session required" });
      return actor.configureBots(session, input.targetBotCount);
    },
  );

  fastify.delete<{ Params: { roomCode: string } }>(
    "/api/v1/matches/:roomCode/players",
    async (request, reply) => {
      const input = RemoveLobbyPlayerRequestSchema.parse(request.body);
      const actor = manager.byRoom(request.params.roomCode);
      const session = requestSession(request, store);
      if (!actor) return reply.code(404).send({ error: "Room not found" });
      if (
        !session ||
        session.role !== "host" ||
        session.matchId !== actor.matchId
      )
        return reply.code(401).send({ error: "Host session required" });
      const snapshot = await actor.removeLobbyPlayer(session, input.seatId);
      io.to(seatRoom(actor, input.seatId)).emit("session:error", {
        message: "The host removed this phone from the expedition.",
      });
      io.in(seatRoom(actor, input.seatId)).disconnectSockets(true);
      return snapshot;
    },
  );

  fastify.post<{ Params: { roomCode: string } }>(
    "/api/v1/matches/:roomCode/join",
    async (request, reply) => {
      const input = JoinLobbyRequestSchema.parse(request.body);
      const actor = manager.byRoom(request.params.roomCode);
      if (!actor || input.roomCode !== actor.roomCode)
        return reply.code(404).send({ error: "Room not found" });
      const existing = requestSession(request, store);
      if (existing?.role === "player" && existing.matchId === actor.matchId) {
        return playerBootstrap({
          store,
          session: existing,
          roomCode: actor.roomCode,
          clientInstanceId: input.clientInstanceId,
          buildId: config.buildId,
        });
      }
      const seatId = await actor.join(input.displayName);
      const created = createSession({
        store,
        role: "player",
        matchId: actor.matchId,
        seatId,
        nowMs: Date.now(),
      });
      setSessionCookie(reply, created.credential, cookieIsSecure(request));
      return playerBootstrap({
        store,
        session: created.session,
        roomCode: actor.roomCode,
        clientInstanceId: input.clientInstanceId,
        buildId: config.buildId,
      });
    },
  );

  fastify.post<{ Params: { roomCode: string } }>(
    "/api/v1/matches/:roomCode/ready",
    async (request, reply) => {
      const body = z
        .object({
          protocol: z.literal(PROTOCOL_VERSION),
          ready: z.boolean(),
          clientInstanceId: z.string().min(3).max(64),
        })
        .strict()
        .parse(request.body);
      const actor = manager.byRoom(request.params.roomCode);
      const session = requestSession(request, store);
      if (!actor) return reply.code(404).send({ error: "Room not found" });
      if (
        !session ||
        session.role !== "player" ||
        session.matchId !== actor.matchId
      )
        return reply.code(401).send({ error: "Player session required" });
      await actor.setReady(session, body.ready);
      return { ok: true };
    },
  );

  fastify.patch<{ Params: { roomCode: string } }>(
    "/api/v1/matches/:roomCode/color",
    async (request, reply) => {
      const input = SetLobbyColorRequestSchema.parse(request.body);
      const actor = manager.byRoom(request.params.roomCode);
      const session = requestSession(request, store);
      if (!actor) return reply.code(404).send({ error: "Room not found" });
      if (
        !session ||
        session.role !== "player" ||
        session.matchId !== actor.matchId
      )
        return reply.code(401).send({ error: "Player session required" });
      return actor.setLobbyColor(session, input.color);
    },
  );

  fastify.post("/api/v1/sessions/resume", async (request, reply) => {
    const body = ResumeSessionRequestSchema.parse(request.body);
    const session = requestSession(request, store);
    if (!session || session.role !== "player")
      return reply.code(401).send({ error: "Session expired" });
    const actor = manager.byId(session.matchId);
    if (!actor) return reply.code(404).send({ error: "Match not found" });
    store.touchSession(session.sessionId);
    return playerBootstrap({
      store,
      session,
      roomCode: actor.roomCode,
      clientInstanceId: body.clientInstanceId,
      buildId: config.buildId,
    });
  });

  fastify.post<{ Params: { roomCode: string } }>(
    "/api/v1/matches/:roomCode/start",
    async (request, reply) => {
      z.object({ protocol: z.literal(PROTOCOL_VERSION) })
        .strict()
        .parse(request.body);
      const actor = manager.byRoom(request.params.roomCode);
      const session = requestSession(request, store);
      if (!actor) return reply.code(404).send({ error: "Room not found" });
      if (
        !session ||
        session.role !== "host" ||
        session.matchId !== actor.matchId
      )
        return reply.code(401).send({ error: "Host session required" });
      await actor.start(session);
      return { ok: true };
    },
  );

  fastify.post<{ Params: { roomCode: string } }>(
    "/api/v1/matches/:roomCode/host/briefing",
    async (request, reply) => {
      const input = BriefingControlRequestSchema.parse(request.body);
      const actor = manager.byRoom(request.params.roomCode);
      const session = requestSession(request, store);
      if (!actor) return reply.code(404).send({ error: "Room not found" });
      if (
        !session ||
        session.role !== "host" ||
        session.matchId !== actor.matchId
      )
        return reply.code(401).send({ error: "Host session required" });
      return {
        ok: true,
        briefing: await actor.controlBriefing(session, input),
      };
    },
  );

  fastify.post<{ Params: { roomCode: string; action: string } }>(
    "/api/v1/matches/:roomCode/host/:action",
    async (request, reply) => {
      const actor = manager.byRoom(request.params.roomCode);
      const session = requestSession(request, store);
      if (!actor) return reply.code(404).send({ error: "Room not found" });
      if (
        !session ||
        session.role !== "host" ||
        session.matchId !== actor.matchId
      )
        return reply.code(401).send({ error: "Host session required" });
      const action = z
        .enum([
          "pause",
          "resume",
          "extend",
          "close-planning",
          "skip-presentation",
        ])
        .parse(request.params.action);
      const body = z
        .object({
          protocol: z.literal(PROTOCOL_VERSION),
          additionalMs: z.number().int().optional(),
        })
        .passthrough()
        .parse(request.body);
      await actor.hostControl(session, action, body.additionalMs ?? 0);
      return { ok: true };
    },
  );
}

async function registerStaticRoutes(
  fastify: FastifyInstance,
  webRootInput: string,
): Promise<void> {
  const webRoot = resolve(webRootInput);
  if (existsSync(webRoot)) {
    await fastify.register(fastifyStatic, {
      root: webRoot,
      prefix: "/",
      wildcard: true,
      index: false,
    });
  }
  const send =
    (file: string) =>
    async (
      _request: unknown,
      reply: {
        sendFile?: (name: string) => unknown;
        code: (n: number) => { send: (v: unknown) => unknown };
      },
    ) =>
      existsSync(join(webRoot, file)) && reply.sendFile
        ? reply.sendFile(file)
        : reply.code(503).send({ error: "Web client has not been built" });
  fastify.get("/", send("index.html"));
  fastify.get("/host", send("host.html"));
  fastify.get("/host.html", send("host.html"));
  fastify.get("/display", send("display.html"));
  fastify.get("/display.html", send("display.html"));
  fastify.get("/display/:room", send("display.html"));
  fastify.get("/play", send("play.html"));
  fastify.get("/play.html", send("play.html"));
  fastify.get("/play/:room", send("play.html"));
  fastify.get("/j/:room", send("play.html"));
}

function publicRoom(actor: MatchActor): string {
  return `match-${actor.matchId}-public`;
}

function hostRoom(actor: MatchActor): string {
  return `match-${actor.matchId}-host`;
}

function seatRoom(actor: MatchActor, seatId: string): string {
  return `match-${actor.matchId}-seat-${seatId}`;
}

function roomFor(subscription: Subscription): string {
  return subscription.role === "public"
    ? publicRoom(subscription.actor)
    : subscription.role === "host"
      ? hostRoom(subscription.actor)
      : seatRoom(subscription.actor, subscription.seatId!);
}

function versionFor(
  cache: Map<string, ProjectionCacheEntry>,
  key: string,
  payload: unknown,
): number {
  const serialized = JSON.stringify(payload);
  const current = cache.get(key);
  if (!current) {
    cache.set(key, { serialized, version: 1 });
    return 1;
  }
  if (current.serialized !== serialized) {
    current.serialized = serialized;
    current.version += 1;
  }
  return current.version;
}

function projectionChanged(
  cache: Map<string, ProjectionCacheEntry>,
  key: string,
  payload: unknown,
): boolean {
  return cache.get(key)?.serialized !== JSON.stringify(payload);
}

function emitInitial(
  socket: Socket,
  subscription: Subscription,
  makeEnvelope: <
    T extends PublicProjection | PlayerProjection | HostProjection,
  >(
    stream: "public" | "private" | "host",
    actor: MatchActor,
    payload: T,
    key: string,
  ) => unknown,
  cache: Map<string, ProjectionCacheEntry>,
): void {
  const { actor } = subscription;
  if (subscription.role === "public" || subscription.role === "host")
    socket.emit("briefing:state", actor.briefingView() satisfies BriefingState);
  if (subscription.role === "public") {
    const payload = actor.publicView();
    if (payload)
      socket.emit(
        "projection",
        makeEnvelope("public", actor, payload, `${actor.matchId}:public`),
      );
  } else if (subscription.role === "host") {
    socket.emit(
      "projection",
      makeEnvelope("host", actor, actor.hostView(), `${actor.matchId}:host`),
    );
  } else if (subscription.seatId) {
    const payload = actor.playerView(subscription.seatId);
    if (payload)
      socket.emit(
        "projection",
        makeEnvelope(
          "private",
          actor,
          payload,
          `${actor.matchId}:seat:${subscription.seatId}`,
        ),
      );
  }
  void cache;
}

function commandIdFrom(raw: unknown): string {
  if (
    raw &&
    typeof raw === "object" &&
    "commandId" in raw &&
    typeof raw.commandId === "string"
  ) {
    return /^[A-Za-z0-9_-]{3,64}$/.test(raw.commandId)
      ? raw.commandId
      : "invalid-command";
  }
  return "invalid-command";
}

function addressAllowed(
  rawAddress: string,
  networks: Array<[ipaddr.IPv4 | ipaddr.IPv6, number]>,
): boolean {
  try {
    let address = ipaddr.parse(rawAddress.replace(/^\[|\]$/g, ""));
    if (
      address.kind() === "ipv6" &&
      (address as ipaddr.IPv6).isIPv4MappedAddress()
    ) {
      address = (address as ipaddr.IPv6).toIPv4Address();
    }
    return networks.some(
      ([network, prefix]) =>
        address.kind() === network.kind() && address.match(network, prefix),
    );
  } catch {
    return false;
  }
}

function originAllowed(
  origin: string,
  host: string | undefined,
  publicUrl: string,
): boolean {
  try {
    const parsed = new URL(origin);
    const publicOrigin = new URL(publicUrl).origin;
    return (
      parsed.origin === publicOrigin ||
      parsed.host === host ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

function classifyExpectedError(
  message: string,
): { status: number; code: string } | null {
  if (
    /session (?:required|expired)|player session|required host/i.test(message)
  )
    return { status: 401, code: "SESSION_REQUIRED" };
  if (/room is full/i.test(message)) return { status: 409, code: "ROOM_FULL" };
  if (/already started|lobby is closed|room has already started/i.test(message))
    return { status: 409, code: "ROOM_CLOSED" };
  if (/must join and ready|seat is missing/i.test(message))
    return { status: 409, code: "LOBBY_NOT_READY" };
  if (/bot count must leave room/i.test(message))
    return { status: 409, code: "BOT_COUNT_CONFLICT" };
  if (/color is already claimed/i.test(message))
    return { status: 409, code: "COLOR_CLAIMED" };
  if (/AI seats use the AI controls|seat is open/i.test(message))
    return { status: 409, code: "SEAT_NOT_REMOVABLE" };
  if (/briefing/i.test(message)) return { status: 409, code: "BRIEFING_STATE" };
  if (/planning is not active|phase/i.test(message))
    return { status: 409, code: "PHASE_CLOSED" };
  if (/extension must/i.test(message))
    return { status: 400, code: "INVALID_REQUEST" };
  return null;
}

export function configFromEnvironment(): ServerConfig {
  const dataDir = process.env.BLACKWATER_DATA_DIR ?? resolve("data");
  const webRoot = resolve("dist/web");
  let assetManifestHash = "0".repeat(64);
  for (const manifestPath of [
    join(webRoot, "manifest.json"),
    resolve("assets/generated/manifest.json"),
  ]) {
    try {
      const manifest = readFileSync(manifestPath);
      assetManifestHash = createHash("sha256").update(manifest).digest("hex");
      break;
    } catch {
      // Try the source-tree fallback used by the development server.
    }
  }
  return {
    bind: process.env.BLACKWATER_BIND ?? "0.0.0.0",
    port: Number(process.env.BLACKWATER_PORT ?? 8787),
    publicUrl: process.env.BLACKWATER_PUBLIC_URL ?? "http://127.0.0.1:8787",
    lanUrl: process.env.BLACKWATER_LAN_URL ?? "http://127.0.0.1:8787",
    allowedCidrs: (process.env.BLACKWATER_ALLOWED_CIDRS ?? "127.0.0.0/8")
      .split(",")
      .map((item) => item.trim()),
    dataDir,
    webRoot,
    buildId: process.env.BLACKWATER_BUILD_ID ?? "dev-local",
    assetManifestHash,
    logger: process.env.NODE_ENV === "production",
  };
}
