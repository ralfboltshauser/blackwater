import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { io as connectSocket, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CommandEnvelopeSchema,
  DraftPlanSchema,
  PlayerProjectionEnvelopeSchema,
  PlayerSessionBootstrapSchema,
  PublicProjectionEnvelopeSchema,
  type BriefingState,
  type CommandResult,
  type PlayerSessionBootstrap,
  type ProjectionEnvelope,
} from "@blackwater/protocol";
import { validateProgram, type ThreePulseProgram } from "@blackwater/game-core";
import { planBotTurn } from "../../apps/server/src/bots";
import {
  createApplication,
  type BlackwaterApplication,
  type ServerConfig,
} from "../../apps/server/src/app";

interface StartedMatch {
  roomCode: string;
  matchId: string;
  hostCookie: string;
  displayConnectionId: string;
  players: Array<{
    cookie: string;
    bootstrap: PlayerSessionBootstrap;
  }>;
}

const applications: BlackwaterApplication[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const application of applications.splice(0).reverse()) {
    await application.close();
  }
  for (const directory of temporaryDirectories.splice(0).reverse()) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function testConfig(port = 0): Promise<ServerConfig> {
  const directory = await mkdtemp(join(tmpdir(), "blackwater-server-"));
  temporaryDirectories.push(directory);
  return {
    bind: "127.0.0.1",
    port,
    publicUrl: "http://192.168.50.4:8787",
    lanUrl: "http://192.168.50.4:8787",
    allowedCidrs: ["127.0.0.0/8"],
    dataDir: directory,
    webRoot: join(directory, "web-not-built"),
    buildId: "integration-test",
    assetManifestHash: "a".repeat(64),
    logger: false,
  };
}

async function openApplication(
  config: ServerConfig,
): Promise<BlackwaterApplication> {
  const application = await createApplication(config);
  applications.push(application);
  return application;
}

function cookieFrom(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error("Expected a session cookie");
  return value.split(";", 1)[0]!;
}

async function startThreePlayerMatch(
  application: BlackwaterApplication,
): Promise<StartedMatch> {
  const created = await application.fastify.inject({
    method: "POST",
    url: "/api/v1/matches",
    payload: {
      protocol: 1,
      playerCount: 3,
      planningSeconds: 60,
      factionsEnabled: false,
    },
  });
  expect(created.statusCode).toBe(201);
  expect(String(created.headers["set-cookie"])).toContain("HttpOnly");
  expect(String(created.headers["set-cookie"])).toContain("SameSite=Strict");
  const body = created.json<{
    roomCode: string;
    matchId: string;
    joinUrl: string;
    lanJoinUrl: string;
    displayUrl: string;
  }>();
  expect(body.joinUrl).toBe(`http://192.168.50.4:8787/j/${body.roomCode}`);
  expect(body.lanJoinUrl).toBe(`http://192.168.50.4:8787/j/${body.roomCode}`);
  expect(body.displayUrl).toBe(
    `http://192.168.50.4:8787/display/${body.roomCode}`,
  );
  const hostCookie = cookieFrom(created.headers["set-cookie"]);
  const displayConnectionId = `integration-display-${body.matchId}`;
  await application.manager.byRoom(body.roomCode)!.connect({
    connectionId: displayConnectionId,
    role: "display",
    sessionId: displayConnectionId,
    seatId: null,
    transport: "websocket",
  });

  const players: StartedMatch["players"] = [];
  for (const [index, displayName] of ["Nora", "Miro", "June"].entries()) {
    const clientInstanceId = `phone-${index + 1}`;
    const joined = await application.fastify.inject({
      method: "POST",
      url: `/api/v1/matches/${body.roomCode}/join`,
      payload: {
        protocol: 1,
        roomCode: body.roomCode,
        displayName,
        clientInstanceId,
      },
    });
    expect(joined.statusCode).toBe(200);
    const bootstrap = PlayerSessionBootstrapSchema.parse(joined.json());
    const cookie = cookieFrom(joined.headers["set-cookie"]);
    players.push({ cookie, bootstrap });
    const readied = await application.fastify.inject({
      method: "POST",
      url: `/api/v1/matches/${body.roomCode}/ready`,
      headers: { cookie },
      payload: { protocol: 1, ready: true, clientInstanceId },
    });
    expect(readied.statusCode).toBe(200);
  }

  const lobby = await application.fastify.inject({
    method: "GET",
    url: `/api/v1/matches/${body.roomCode}/lobby`,
  });
  expect(lobby.json()).toMatchObject({ canStart: true, playerCount: 3 });

  const started = await application.fastify.inject({
    method: "POST",
    url: `/api/v1/matches/${body.roomCode}/start`,
    headers: { cookie: hostCookie },
    payload: { protocol: 1 },
  });
  expect(started.statusCode).toBe(200);
  return { ...body, hostCookie, displayConnectionId, players };
}

async function runBotPolicyMatch(
  application: BlackwaterApplication,
  playerCount: number,
  factionsEnabled: boolean,
): Promise<void> {
  const created = await application.fastify.inject({
    method: "POST",
    url: "/api/v1/matches",
    payload: {
      protocol: 1,
      playerCount,
      botCount: playerCount - 1,
      planningSeconds: 60,
      factionsEnabled,
    },
  });
  expect(created.statusCode).toBe(201);
  const room = created.json<{ roomCode: string; matchId: string }>();
  const hostCookie = cookieFrom(created.headers["set-cookie"]);
  const actor = application.manager.byRoom(room.roomCode)!;
  await actor.connect({
    connectionId: `matrix-display-${room.matchId}`,
    role: "display",
    sessionId: `matrix-display-${room.matchId}`,
    seatId: null,
    transport: "websocket",
  });
  const joined = await application.fastify.inject({
    method: "POST",
    url: `/api/v1/matches/${room.roomCode}/join`,
    payload: {
      protocol: 1,
      roomCode: room.roomCode,
      displayName: "Matrix Human",
      clientInstanceId: `matrix-phone-${playerCount}-${Number(factionsEnabled)}`,
    },
  });
  const human = PlayerSessionBootstrapSchema.parse(joined.json());
  const playerCookie = cookieFrom(joined.headers["set-cookie"]);
  expect(
    (
      await application.fastify.inject({
        method: "POST",
        url: `/api/v1/matches/${room.roomCode}/ready`,
        headers: { cookie: playerCookie },
        payload: {
          protocol: 1,
          ready: true,
          clientInstanceId: human.clientInstanceId,
        },
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await application.fastify.inject({
        method: "POST",
        url: `/api/v1/matches/${room.roomCode}/start`,
        headers: { cookie: hostCookie },
        payload: { protocol: 1 },
      })
    ).statusCode,
  ).toBe(200);

  const humanSession = application.store.getSession(human.sessionId)!;
  for (let round = 1; round <= 7; round += 1) {
    if (actor.match.lifecycle === "finished") break;
    const rules = actor.match.rulesState;
    if (rules.kind !== "active") throw new Error("Bot matrix lost rules state");
    for (const [seatId, bot] of Object.entries(actor.match.workflow.bots)) {
      const generated = planBotTurn(actor.playerView(seatId)!, bot.strategy);
      expect(actor.match.workflow.drafts[seatId]).toMatchObject({
        locked: true,
        valid: true,
        plan: generated,
      });
      expect(
        validateProgram(rules.state, seatId, {
          seatId,
          operations:
            generated.operations as unknown as ThreePulseProgram["operations"],
          ...(generated.secondDawnSalvagePriority
            ? {
                secondDawnSalvagePriority: generated.secondDawnSalvagePriority,
              }
            : {}),
        }).valid,
      ).toBe(true);
    }
    const humanView = actor.playerView(human.seatId)!;
    expect(humanView.public.phase).toMatchObject({
      kind: "open-water",
      round,
    });
    expect(
      await actor.handleCommand(
        humanSession,
        CommandEnvelopeSchema.parse({
          protocol: 1,
          commandId: `matrix-${playerCount}-${Number(factionsEnabled)}-${round}`,
          matchId: room.matchId,
          phaseId: humanView.public.phase.phaseId,
          sessionEpoch: human.sessionEpoch,
          clientInstanceId: human.clientInstanceId,
          writerLeaseId: human.writerLeaseId,
          type: "draft.lock",
          expected: { kind: "draft", revision: humanView.draft.revision },
          payload: { plan: humanView.draft.plan },
        }),
      ),
    ).toMatchObject({ status: "accepted" });
    expect(
      (
        await application.fastify.inject({
          method: "POST",
          url: `/api/v1/matches/${room.roomCode}/host/skip-presentation`,
          headers: { cookie: hostCookie },
          payload: { protocol: 1 },
        })
      ).statusCode,
    ).toBe(200);
  }
  expect(actor.match.lifecycle).toBe("finished");
  expect(actor.publicView()?.outcome?.winnerSeatIds.length).toBeGreaterThan(0);
}

describe("Blackwater server runtime", () => {
  it("serves update-sensitive PWA resources with explicit worker scope", async () => {
    const config = await testConfig();
    const webRoot = join(config.dataDir, "web");
    await mkdir(webRoot, { recursive: true });
    await writeFile(
      join(webRoot, "manifest.webmanifest"),
      JSON.stringify({ name: "Blackwater" }),
    );
    await writeFile(
      join(webRoot, "sw.js"),
      "self.addEventListener('fetch', () => {});",
    );
    const application = await openApplication({ ...config, webRoot });

    const manifest = await application.fastify.inject({
      method: "GET",
      url: "/manifest.webmanifest",
    });
    expect(manifest.statusCode).toBe(200);
    expect(manifest.headers["cache-control"]).toContain("no-cache");

    const worker = await application.fastify.inject({
      method: "GET",
      url: "/sw.js",
    });
    expect(worker.statusCode).toBe(200);
    expect(worker.headers["cache-control"]).toContain("no-cache");
    expect(worker.headers["service-worker-allowed"]).toBe("/");
  });

  it("marks sessions Secure and enables HSTS only for a configured HTTPS origin", async () => {
    const config = await testConfig();
    const application = await openApplication({
      ...config,
      publicUrl: "https://blackwater.example.test",
    });
    const created = await application.fastify.inject({
      method: "POST",
      url: "/api/v1/matches",
      headers: { host: "blackwater.example.test" },
      payload: {
        protocol: 1,
        playerCount: 3,
        planningSeconds: 90,
        factionsEnabled: false,
      },
    });

    expect(String(created.headers["set-cookie"])).toContain("Secure");
    expect(created.headers["strict-transport-security"]).toContain(
      "max-age=15552000",
    );

    const lanJoin = await application.fastify.inject({
      method: "POST",
      url: `/api/v1/matches/${created.json<{ roomCode: string }>().roomCode}/join`,
      headers: { host: "192.168.50.4:8787" },
      payload: {
        protocol: 1,
        roomCode: created.json<{ roomCode: string }>().roomCode,
        displayName: "LAN phone",
        clientInstanceId: "lan-cookie-phone",
      },
    });
    expect(lanJoin.statusCode).toBe(200);
    expect(String(lanJoin.headers["set-cookie"])).not.toContain("Secure");
  });

  it("does not spend the shared mutation budget on page and read traffic", async () => {
    const application = await openApplication(await testConfig());

    const lanPage = await application.fastify.inject({
      method: "GET",
      url: "/health/ready",
    });
    const policy = String(lanPage.headers["content-security-policy"]);
    expect(policy).toContain("default-src 'self'");
    expect(policy).not.toContain("upgrade-insecure-requests");
    expect(lanPage.headers["strict-transport-security"]).toBeUndefined();

    // A cold host/display/player load can request many static resources from a
    // single address. This exceeds the old global limit on purpose.
    for (let request = 0; request < 400; request += 1) {
      const response = await application.fastify.inject({
        method: request % 2 === 0 ? "GET" : "HEAD",
        url: request % 4 < 2 ? "/" : "/health/ready",
      });
      expect(response.statusCode).not.toBe(429);
    }

    const mutation = await application.fastify.inject({
      method: "POST",
      url: "/api/v1/matches",
      payload: { protocol: 1, playerCount: 0 },
    });
    expect(mutation.statusCode).toBe(400);
    expect(mutation.headers["x-ratelimit-limit"]).toBe("360");
  });

  it("synchronizes a persisted host briefing to a lobby TV and late reconnects", async () => {
    const config = await testConfig();
    const application = await openApplication(config);
    await application.start();
    const address = application.fastify.server.address();
    if (!address || typeof address === "string")
      throw new Error("Expected an ephemeral TCP address");
    const origin = `http://127.0.0.1:${address.port}`;

    const created = await application.fastify.inject({
      method: "POST",
      url: "/api/v1/matches",
      payload: {
        protocol: 1,
        playerCount: 3,
        planningSeconds: 90,
        factionsEnabled: false,
      },
    });
    const room = created.json<{ roomCode: string; matchId: string }>();
    const hostCookie = cookieFrom(created.headers["set-cookie"]);
    const display = connectSocket(origin, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    await onceSocket(display, "connect");
    const initialBriefing = onceSocket<BriefingState>(
      display,
      "briefing:state",
    );
    expect(
      await emitAcknowledged<{ ok: boolean; error?: string }>(
        display,
        "viewer:subscribe",
        { role: "public", roomCode: room.roomCode },
      ),
    ).toEqual({ ok: true });
    expect(await initialBriefing).toEqual({
      active: false,
      slideIndex: 0,
      revision: 0,
    });
    expect(application.manager.byRoom(room.roomCode)?.publicView()).toBeNull();

    expect(
      (
        await application.fastify.inject({
          method: "POST",
          url: `/api/v1/matches/${room.roomCode}/host/briefing`,
          payload: { protocol: 1, action: "open", expectedRevision: 0 },
        })
      ).statusCode,
    ).toBe(401);

    const openedBriefing = onceSocket<BriefingState>(display, "briefing:state");
    expect(
      (
        await application.fastify.inject({
          method: "POST",
          url: `/api/v1/matches/${room.roomCode}/host/briefing`,
          headers: { cookie: hostCookie },
          payload: { protocol: 1, action: "open", expectedRevision: 0 },
        })
      ).statusCode,
    ).toBe(200);
    expect(await openedBriefing).toMatchObject({
      active: true,
      slideIndex: 0,
      revision: 1,
    });
    expect(
      (
        await application.fastify.inject({
          method: "POST",
          url: `/api/v1/matches/${room.roomCode}/host/briefing`,
          headers: { cookie: hostCookie },
          payload: { protocol: 1, action: "next", expectedRevision: 0 },
        })
      ).statusCode,
    ).toBe(409);
    expect(application.manager.byRoom(room.roomCode)?.briefingView()).toEqual({
      active: true,
      slideIndex: 0,
      revision: 1,
    });
    expect(
      (
        await application.fastify.inject({
          method: "POST",
          url: `/api/v1/matches/${room.roomCode}/start`,
          headers: { cookie: hostCookie },
          payload: { protocol: 1 },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await application.fastify.inject({
          method: "POST",
          url: `/api/v1/matches/${room.roomCode}/host/briefing`,
          headers: { cookie: hostCookie },
          payload: {
            protocol: 1,
            action: "go-to",
            expectedRevision: 1,
            slideIndex: 4,
          },
        })
      ).statusCode,
    ).toBe(200);

    display.disconnect();
    await application.close();
    applications.splice(applications.indexOf(application), 1);
    const recovered = await openApplication(config);
    expect(recovered.manager.byRoom(room.roomCode)?.briefingView()).toEqual({
      active: true,
      slideIndex: 4,
      revision: 2,
    });
  });

  it("pauses active play for a briefing and never resumes behind the slides", async () => {
    const application = await openApplication(await testConfig());
    const match = await startThreePlayerMatch(application);
    const actor = application.manager.byRoom(match.roomCode)!;
    const beforeDeadline = actor.match.workflow.phase.endsAtServerMs;
    expect(beforeDeadline).not.toBeNull();

    const opened = await application.fastify.inject({
      method: "POST",
      url: `/api/v1/matches/${match.roomCode}/host/briefing`,
      headers: { cookie: match.hostCookie },
      payload: { protocol: 1, action: "open", expectedRevision: 0 },
    });
    expect(opened.statusCode).toBe(200);
    expect(actor.match.workflow).toMatchObject({
      phase: { paused: true, pauseReason: "host-choice", endsAtServerMs: null },
      briefing: { active: true, slideIndex: 0 },
    });
    expect(actor.match.workflow.phase.remainingMs).toBeGreaterThan(0);
    expect(actor.hostView().controls.canResume).toBe(false);

    const hiddenResume = await application.fastify.inject({
      method: "POST",
      url: `/api/v1/matches/${match.roomCode}/host/resume`,
      headers: { cookie: match.hostCookie },
      payload: { protocol: 1 },
    });
    expect(hiddenResume.statusCode).toBe(409);
    expect(actor.match.workflow.phase.paused).toBe(true);

    expect(
      (
        await application.fastify.inject({
          method: "POST",
          url: `/api/v1/matches/${match.roomCode}/host/briefing`,
          headers: { cookie: match.hostCookie },
          payload: { protocol: 1, action: "close", expectedRevision: 1 },
        })
      ).statusCode,
    ).toBe(200);
    expect(actor.match.workflow.briefing.active).toBe(false);
    expect(actor.match.workflow.phase.paused).toBe(true);
    expect(actor.hostView().controls.canResume).toBe(true);

    expect(
      (
        await application.fastify.inject({
          method: "POST",
          url: `/api/v1/matches/${match.roomCode}/host/resume`,
          headers: { cookie: match.hostCookie },
          payload: { protocol: 1 },
        })
      ).statusCode,
    ).toBe(200);
    expect(actor.match.workflow.phase.paused).toBe(false);
    expect(actor.match.workflow.phase.endsAtServerMs).not.toBeNull();
  });

  it("runs a complete one-human expedition with persisted server bots", async () => {
    const config = await testConfig();
    let application = await openApplication(config);
    const created = await application.fastify.inject({
      method: "POST",
      url: "/api/v1/matches",
      payload: {
        protocol: 1,
        playerCount: 3,
        botCount: 2,
        planningSeconds: 60,
        factionsEnabled: true,
      },
    });
    expect(created.statusCode).toBe(201);
    const room = created.json<{ roomCode: string; matchId: string }>();
    const hostCookie = cookieFrom(created.headers["set-cookie"]);
    let actor = application.manager.byRoom(room.roomCode)!;

    expect(actor.lobby().seats).toMatchObject([
      { controller: null, claimed: false, ready: false },
      {
        displayName: "Manta",
        controller: "bot",
        botStrategy: "network",
        claimed: true,
        ready: true,
      },
      {
        displayName: "Lantern",
        controller: "bot",
        botStrategy: "discovery",
        claimed: true,
        ready: true,
      },
    ]);
    expect(
      (
        await application.fastify.inject({
          method: "PUT",
          url: `/api/v1/matches/${room.roomCode}/bots`,
          payload: { protocol: 1, targetBotCount: 1 },
        })
      ).statusCode,
    ).toBe(401);
    const reducedBots = await application.fastify.inject({
      method: "PUT",
      url: `/api/v1/matches/${room.roomCode}/bots`,
      headers: { cookie: hostCookie },
      payload: { protocol: 1, targetBotCount: 1 },
    });
    expect(reducedBots.statusCode).toBe(200);
    expect(
      reducedBots
        .json<{ seats: Array<{ controller: string | null }> }>()
        .seats.filter((seat) => seat.controller === "bot"),
    ).toHaveLength(1);
    expect(
      (
        await application.fastify.inject({
          method: "PUT",
          url: `/api/v1/matches/${room.roomCode}/bots`,
          headers: { cookie: hostCookie },
          payload: { protocol: 1, targetBotCount: 2 },
        })
      ).statusCode,
    ).toBe(200);

    const joined = await application.fastify.inject({
      method: "POST",
      url: `/api/v1/matches/${room.roomCode}/join`,
      payload: {
        protocol: 1,
        roomCode: room.roomCode,
        displayName: "Solo",
        clientInstanceId: "solo-phone",
      },
    });
    expect(joined.statusCode).toBe(200);
    const human = PlayerSessionBootstrapSchema.parse(joined.json());
    const playerCookie = cookieFrom(joined.headers["set-cookie"]);
    expect(application.store.listSeats(room.matchId)).toHaveLength(1);
    expect(
      application.store
        .listSessions(room.matchId)
        .filter((session) => session.role === "player"),
    ).toHaveLength(1);

    expect(
      (
        await application.fastify.inject({
          method: "POST",
          url: `/api/v1/matches/${room.roomCode}/ready`,
          headers: { cookie: playerCookie },
          payload: {
            protocol: 1,
            ready: true,
            clientInstanceId: "solo-phone",
          },
        })
      ).statusCode,
    ).toBe(200);
    await actor.connect({
      connectionId: "solo-display",
      role: "display",
      sessionId: "solo-display",
      seatId: null,
      transport: "websocket",
    });
    expect(actor.lobby().canStart).toBe(true);
    expect(
      (
        await application.fastify.inject({
          method: "POST",
          url: `/api/v1/matches/${room.roomCode}/start`,
          headers: { cookie: hostCookie },
          payload: { protocol: 1 },
        })
      ).statusCode,
    ).toBe(200);

    const botSeatIds = Object.keys(actor.match.workflow.bots).sort();
    expect(botSeatIds).toHaveLength(2);
    expect(
      botSeatIds.map((seatId) => actor.match.workflow.drafts[seatId]?.locked),
    ).toEqual([true, true]);
    expect(
      botSeatIds.flatMap((seatId) =>
        actor.match.workflow.drafts[seatId]!.plan.operations.map(
          (operation) => operation.kind,
        ),
      ),
    ).toContain("develop");
    expect(
      actor
        .publicView()
        ?.expeditions.filter((expedition) => expedition.controller === "bot"),
    ).toHaveLength(2);

    const canonical = actor.match.rulesState;
    if (canonical.kind !== "active") throw new Error("Match did not start");
    for (const seatId of botSeatIds) {
      const projection = actor.playerView(seatId)!;
      const strategy = actor.match.workflow.bots[seatId]!.strategy;
      const generated = DraftPlanSchema.parse(
        planBotTurn(projection, strategy),
      );
      expect(planBotTurn(projection, strategy)).toEqual(generated);
      const reordered = structuredClone(projection);
      reordered.public.topology.edges.reverse();
      reordered.public.topology.sectors.reverse();
      reordered.public.expeditions.reverse();
      reordered.public.arks.reverse();
      reordered.public.platforms.reverse();
      reordered.public.deepSites.reverse();
      reordered.public.salvage.reverse();
      reordered.submarines.reverse();
      expect(planBotTurn(reordered, strategy)).toEqual(generated);
      expect(
        validateProgram(canonical.state, seatId, {
          seatId,
          // Protocol Zod output permits explicit undefined on optional wire
          // fields; the parsed operations are structurally the same core plan.
          operations:
            generated.operations as unknown as ThreePulseProgram["operations"],
          ...(generated.secondDawnSalvagePriority
            ? {
                secondDawnSalvagePriority: generated.secondDawnSalvagePriority,
              }
            : {}),
        }).valid,
      ).toBe(true);
    }

    const botsBeforeRestart = structuredClone(actor.match.workflow.bots);
    const draftsBeforeRestart = Object.fromEntries(
      botSeatIds.map((seatId) => [
        seatId,
        structuredClone(actor.match.workflow.drafts[seatId]),
      ]),
    );
    await application.close();
    applications.splice(applications.indexOf(application), 1);
    application = await openApplication(config);
    actor = application.manager.byRoom(room.roomCode)!;
    expect(actor.match.workflow.bots).toEqual(botsBeforeRestart);
    expect(
      Object.fromEntries(
        botSeatIds.map((seatId) => [
          seatId,
          actor.match.workflow.drafts[seatId],
        ]),
      ),
    ).toEqual(draftsBeforeRestart);
    expect(actor.match.workflow.phase).toMatchObject({
      kind: "open-water",
      paused: true,
      pauseReason: "restart",
    });
    await actor.connect({
      connectionId: "solo-display-recovered",
      role: "display",
      sessionId: "solo-display-recovered",
      seatId: null,
      transport: "websocket",
    });
    expect(
      (
        await application.fastify.inject({
          method: "POST",
          url: `/api/v1/matches/${room.roomCode}/host/resume`,
          headers: { cookie: hostCookie },
          payload: { protocol: 1 },
        })
      ).statusCode,
    ).toBe(200);

    const session = application.store.getSession(human.sessionId)!;
    for (let expectedRound = 1; expectedRound <= 7; expectedRound += 1) {
      if (actor.match.lifecycle === "finished") break;
      const view = actor.playerView(human.seatId)!;
      expect(view.public.phase).toMatchObject({
        kind: "open-water",
        round: expectedRound,
      });
      expect(view.draft.locked).toBe(false);
      expect(
        botSeatIds.every(
          (seatId) => actor.match.workflow.drafts[seatId]?.locked,
        ),
      ).toBe(true);
      const roundRules = actor.match.rulesState;
      if (roundRules.kind !== "active")
        throw new Error("Round rules are missing");
      for (const seatId of botSeatIds) {
        const botView = actor.playerView(seatId)!;
        const generated = planBotTurn(
          botView,
          actor.match.workflow.bots[seatId]!.strategy,
        );
        expect(actor.match.workflow.drafts[seatId]!.plan).toEqual(generated);
        expect(
          validateProgram(roundRules.state, seatId, {
            seatId,
            operations:
              generated.operations as unknown as ThreePulseProgram["operations"],
            ...(generated.secondDawnSalvagePriority
              ? {
                  secondDawnSalvagePriority:
                    generated.secondDawnSalvagePriority,
                }
              : {}),
          }).valid,
        ).toBe(true);
      }
      expect(
        await actor.handleCommand(
          session,
          CommandEnvelopeSchema.parse({
            protocol: 1,
            commandId: `solo-lock-${expectedRound}`,
            matchId: room.matchId,
            phaseId: view.public.phase.phaseId,
            sessionEpoch: human.sessionEpoch,
            clientInstanceId: human.clientInstanceId,
            writerLeaseId: human.writerLeaseId,
            type: "draft.lock",
            expected: { kind: "draft", revision: view.draft.revision },
            payload: { plan: view.draft.plan },
          }),
        ),
      ).toMatchObject({ status: "accepted" });
      expect(actor.publicView()?.phase.kind).toBe("resolution");
      const skipped = await application.fastify.inject({
        method: "POST",
        url: `/api/v1/matches/${room.roomCode}/host/skip-presentation`,
        headers: { cookie: hostCookie },
        payload: { protocol: 1 },
      });
      expect(skipped.statusCode).toBe(200);
    }
    expect(actor.match.lifecycle).toBe("finished");
    expect(actor.publicView()?.outcome?.winnerSeatIds.length).toBeGreaterThan(
      0,
    );
  });

  it("keeps 1–6 player lineups legal with factions on and off", async () => {
    const application = await openApplication(await testConfig());
    for (const factionsEnabled of [false, true]) {
      for (const playerCount of [1, 2, 3, 4, 5, 6]) {
        await runBotPolicyMatch(application, playerCount, factionsEnabled);
      }
    }
  }, 45_000);

  it("supports the full LAN lobby, writer-lease, command, phase, and recovery flow", async () => {
    const config = await testConfig();
    const application = await openApplication(config);

    expect(
      (
        await application.fastify.inject({
          method: "GET",
          url: "/health/ready",
        })
      ).json(),
    ).toMatchObject({ status: "ready" });
    expect(
      (
        await application.fastify.inject({
          method: "GET",
          url: "/api/v1/meta",
          remoteAddress: "8.8.8.8",
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await application.fastify.inject({
          method: "POST",
          url: "/api/v1/matches",
          payload: { protocol: 1, playerCount: 0 },
        })
      ).statusCode,
    ).toBe(400);

    const match = await startThreePlayerMatch(application);
    const actor = application.manager.byRoom(match.roomCode)!;
    expect(actor.publicView()).toMatchObject({
      matchId: match.matchId,
      lifecycle: "active",
      outcome: null,
    });
    expect(
      actor
        .publicView()!
        .deepSites.filter((site) => site.dominionObjective)
        .map((site) => site.sectorId)
        .sort((a, b) => a - b),
    ).toEqual([12, 18]);

    const first = match.players[0]!;
    const resumed = await application.fastify.inject({
      method: "POST",
      url: "/api/v1/sessions/resume",
      headers: { cookie: first.cookie },
      payload: { protocol: 1, clientInstanceId: "phone-one-reloaded" },
    });
    expect(resumed.statusCode).toBe(200);
    const renewed = PlayerSessionBootstrapSchema.parse(resumed.json());
    expect(renewed.writerLeaseId).not.toBe(first.bootstrap.writerLeaseId);
    const session = application.store.getSession(first.bootstrap.sessionId)!;
    const view = actor.playerView(first.bootstrap.seatId)!;
    const ark = view.public.arks.find(
      (asset) => asset.ownerSeatId === first.bootstrap.seatId,
    )!;
    const reservedPlan = {
      operations: [
        {
          kind: "develop" as const,
          pulse: 1 as const,
          assetId: ark.assetId,
          requiredSectorId: ark.sectorId,
          project: { kind: "platform" as const, module: "extractor" as const },
        },
        { kind: "hold" as const, pulse: 2 as const },
        { kind: "hold" as const, pulse: 3 as const },
      ],
    };
    const commandBase = {
      protocol: 1 as const,
      matchId: match.matchId,
      phaseId: view.public.phase.phaseId,
      sessionEpoch: renewed.sessionEpoch,
      clientInstanceId: renewed.clientInstanceId,
    };

    const revokedResult = await actor.handleCommand(
      session,
      CommandEnvelopeSchema.parse({
        ...commandBase,
        commandId: "lock-old-writer",
        writerLeaseId: first.bootstrap.writerLeaseId,
        type: "draft.lock",
        expected: { kind: "draft", revision: view.draft.revision },
        payload: { plan: reservedPlan },
      }),
    );
    expect(revokedResult).toMatchObject({
      status: "rejected",
      code: "WRITER_LEASE_REVOKED",
    });

    const lockCommand = CommandEnvelopeSchema.parse({
      ...commandBase,
      commandId: "lock-new-writer",
      writerLeaseId: renewed.writerLeaseId,
      type: "draft.lock",
      expected: { kind: "draft", revision: view.draft.revision },
      payload: { plan: reservedPlan },
    });
    expect(await actor.handleCommand(session, lockCommand)).toMatchObject({
      status: "accepted",
      applied: { kind: "draft" },
    });
    expect(await actor.handleCommand(session, lockCommand)).toMatchObject({
      status: "duplicate",
    });
    expect(actor.playerView(renewed.seatId)?.draft.reservedSupply).toBe(3);

    const current = actor.playerView(renewed.seatId)!;
    const emptyBundle = {
      supply: 0,
      signal: 0,
      reportIds: [],
      specimenIds: [],
    };
    expect(
      await actor.handleCommand(
        session,
        CommandEnvelopeSchema.parse({
          ...commandBase,
          phaseId: current.public.phase.phaseId,
          commandId: "reserved-trade-offer",
          writerLeaseId: renewed.writerLeaseId,
          type: "deal.create",
          expected: { kind: "none" },
          payload: {
            recipientSeatId: match.players[1]!.bootstrap.seatId,
            mode: "trade",
            give: { ...emptyBundle, supply: 2 },
            receive: emptyBundle,
            proposerSpecimenDestinations: [],
            term: { kind: "immediate", sectorIds: [], note: null },
            expiresAtPhaseId: current.public.phase.phaseId,
          },
        }),
      ),
    ).toMatchObject({ status: "accepted" });
    const pendingOffer = actor
      .playerView(renewed.seatId)!
      .deals.find((deal) => deal.status === "pending")!;
    const second = match.players[1]!;
    const secondSession = application.store.getSession(
      second.bootstrap.sessionId,
    )!;
    expect(
      await actor.handleCommand(
        secondSession,
        CommandEnvelopeSchema.parse({
          protocol: 1,
          matchId: match.matchId,
          phaseId: current.public.phase.phaseId,
          commandId: "accept-reserved-trade",
          sessionEpoch: second.bootstrap.sessionEpoch,
          clientInstanceId: second.bootstrap.clientInstanceId,
          writerLeaseId: second.bootstrap.writerLeaseId,
          type: "deal.accept",
          expected: {
            kind: "offer",
            offerId: pendingOffer.offerId,
            revision: pendingOffer.revision,
          },
          payload: { specimenDestinations: [] },
        }),
      ),
    ).toMatchObject({
      status: "rejected",
      code: "INSUFFICIENT_AVAILABLE_RESOURCE",
    });
    const contractResult = await actor.handleCommand(
      session,
      CommandEnvelopeSchema.parse({
        ...commandBase,
        phaseId: current.public.phase.phaseId,
        commandId: "unsupported-contract",
        writerLeaseId: renewed.writerLeaseId,
        type: "deal.create",
        expected: { kind: "none" },
        payload: {
          recipientSeatId: match.players[1]!.bootstrap.seatId,
          mode: "contract",
          give: emptyBundle,
          receive: { ...emptyBundle, supply: 1 },
          proposerSpecimenDestinations: [],
          term: {
            kind: "conditional-payment",
            sectorIds: [],
            note: "Pay after the next survey",
          },
          expiresAtPhaseId: current.public.phase.phaseId,
        },
      }),
    );
    expect(contractResult).toMatchObject({
      status: "rejected",
      code: "INVALID_INTENT",
    });

    const closed = await application.fastify.inject({
      method: "POST",
      url: `/api/v1/matches/${match.roomCode}/host/close-planning`,
      headers: { cookie: match.hostCookie },
      payload: { protocol: 1 },
    });
    expect(closed.statusCode).toBe(200);
    const resolving = actor.playerView(renewed.seatId)!;
    expect(resolving.public.phase.kind).toBe("resolution");
    expect(actor.match.workflow.presentation).toMatchObject({
      cursor: 0,
      beatCount: 4,
    });
    expect(actor.match.workflow.presentation.pulseStates).not.toBeNull();
    expect(actor.match.workflow.presentation.claimState).not.toBeNull();
    expect(actor.presentationBeat()).toMatchObject({
      stream: "public",
      pulse: 1,
      durationMs: 3_500,
    });
    const socialDuringResolution = await actor.handleCommand(
      session,
      CommandEnvelopeSchema.parse({
        ...commandBase,
        phaseId: resolving.public.phase.phaseId,
        commandId: "late-handshake",
        writerLeaseId: renewed.writerLeaseId,
        type: "deal.create",
        expected: { kind: "none" },
        payload: {
          recipientSeatId: match.players[1]!.bootstrap.seatId,
          mode: "handshake",
          give: emptyBundle,
          receive: emptyBundle,
          proposerSpecimenDestinations: [],
          term: { kind: "ceasefire", sectorIds: [], note: null },
          expiresAtPhaseId: resolving.public.phase.phaseId,
        },
      }),
    );
    expect(socialDuringResolution).toMatchObject({
      status: "rejected",
      code: "PHASE_CLOSED",
    });

    for (const expected of [
      { cursor: 1, pulse: 2 },
      { cursor: 2, pulse: 3 },
      { cursor: 3, pulse: null },
    ] as const) {
      const endsAt =
        actor.match.workflow.presentation.currentBeatEndsAtServerMs;
      if (endsAt === null) throw new Error("Presentation clock is missing");
      await actor.tick(endsAt + 1);
      expect(actor.match.workflow.presentation.cursor).toBe(expected.cursor);
      expect(actor.publicView()?.phase.pulse).toBe(expected.pulse);
    }

    const matchId = match.matchId;
    await application.close();
    applications.splice(applications.indexOf(application), 1);
    const recovered = await openApplication(config);
    const recoveredActor = recovered.manager.byId(matchId)!;
    expect(recoveredActor.hostView().phase).toMatchObject({
      kind: "resolution",
      paused: true,
    });
    expect(recoveredActor.match.workflow.phase.remainingMs).toBeGreaterThan(0);
    expect(recoveredActor.match.workflow.phase.pauseReason).toBe("restart");
  });

  it("persists occupied-anchor resolution events without wedging the match", async () => {
    const application = await openApplication(await testConfig());
    const match = await startThreePlayerMatch(application);
    const actor = application.manager.byRoom(match.roomCode)!;
    const first = match.players[0]!;
    const session = application.store.getSession(first.bootstrap.sessionId)!;

    const lockPlatformAtArk = async (commandId: string) => {
      const view = actor.playerView(first.bootstrap.seatId)!;
      const ark = view.public.arks.find(
        (candidate) => candidate.ownerSeatId === first.bootstrap.seatId,
      )!;
      const plan = {
        operations: [
          {
            kind: "develop" as const,
            pulse: 1 as const,
            assetId: ark.assetId,
            requiredSectorId: ark.sectorId,
            project: {
              kind: "platform" as const,
              module: "extractor" as const,
            },
          },
          { kind: "hold" as const, pulse: 2 as const },
          { kind: "hold" as const, pulse: 3 as const },
        ],
      };
      const result = await actor.handleCommand(
        session,
        CommandEnvelopeSchema.parse({
          protocol: 1,
          matchId: match.matchId,
          phaseId: view.public.phase.phaseId,
          commandId,
          sessionEpoch: first.bootstrap.sessionEpoch,
          clientInstanceId: first.bootstrap.clientInstanceId,
          writerLeaseId: first.bootstrap.writerLeaseId,
          type: "draft.lock",
          expected: { kind: "draft", revision: view.draft.revision },
          payload: { plan },
        }),
      );
      expect(result).toMatchObject({ status: "accepted" });
    };

    const hostAction = (action: "close-planning" | "skip-presentation") =>
      application.fastify.inject({
        method: "POST",
        url: `/api/v1/matches/${match.roomCode}/host/${action}`,
        headers: { cookie: match.hostCookie },
        payload: { protocol: 1 },
      });

    await lockPlatformAtArk("build-first-anchor");
    expect((await hostAction("close-planning")).statusCode).toBe(200);
    expect((await hostAction("skip-presentation")).statusCode).toBe(200);
    expect(actor.publicView()?.phase).toMatchObject({
      kind: "open-water",
      round: 2,
    });

    // The second build knowingly targets the now-occupied public anchor. The
    // resolver safely fizzles it and emits the underscore-bearing event that
    // previously crashed persistence and left the actor in a retry loop.
    await lockPlatformAtArk("retry-occupied-anchor");
    expect((await hostAction("close-planning")).statusCode).toBe(200);
    expect(actor.publicView()?.phase.kind).toBe("resolution");
    expect(
      application.store
        .listEvents(match.matchId)
        .map((event) => event.eventType),
    ).toContain("develop.anchor_interference");
    expect(application.store.listPendingRoundInputs(match.matchId)).toEqual([]);
  });

  it("streams scoped projections and command acknowledgements over WebSocket", async () => {
    const config = await testConfig();
    const application = await openApplication(config);
    await application.start();
    const address = application.fastify.server.address();
    if (!address || typeof address === "string")
      throw new Error("Expected an ephemeral TCP address");
    const origin = `http://127.0.0.1:${address.port}`;
    const match = await startThreePlayerMatch(application);
    const actor = application.manager.byRoom(match.roomCode)!;

    const display = connectSocket(origin, {
      path: "/socket.io",
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    await onceSocket(display, "connect");
    const publicProjection = onceSocket<ProjectionEnvelope>(
      display,
      "projection",
    );
    expect(
      await emitAcknowledged<{ ok: boolean; error?: string }>(
        display,
        "viewer:subscribe",
        { role: "public", roomCode: match.roomCode },
      ),
    ).toEqual({ ok: true });
    const publicEnvelope = PublicProjectionEnvelopeSchema.parse(
      await publicProjection,
    );
    await actor.disconnect(match.displayConnectionId);
    const canonical = actor.match.rulesState;
    if (canonical.kind !== "active") throw new Error("Match did not start");
    const privateSubmarineId = Object.values(canonical.state.assets).find(
      (asset) => asset.kind === "submarine",
    )?.id;
    expect(privateSubmarineId).toBeTruthy();
    expect(JSON.stringify(publicEnvelope)).not.toContain(privateSubmarineId);

    const first = match.players[0]!;
    const player = connectSocket(origin, {
      path: "/socket.io",
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      extraHeaders: { cookie: first.cookie },
    });
    await onceSocket(player, "connect");
    const initialPrivate = onceSocket<ProjectionEnvelope>(player, "projection");
    expect(
      await emitAcknowledged<{ ok: boolean; error?: string }>(
        player,
        "viewer:subscribe",
        { role: "player", roomCode: match.roomCode },
      ),
    ).toEqual({ ok: true });
    const privateEnvelope = PlayerProjectionEnvelopeSchema.parse(
      await initialPrivate,
    );
    expect(privateEnvelope.payload.seatId).toBe(first.bootstrap.seatId);

    const nextProjection = onceSocket<ProjectionEnvelope>(player, "projection");
    const result = await emitAcknowledged<CommandResult>(player, "command", {
      protocol: 1,
      commandId: "socket-lock-one",
      matchId: match.matchId,
      phaseId: privateEnvelope.phaseId,
      sessionEpoch: first.bootstrap.sessionEpoch,
      clientInstanceId: first.bootstrap.clientInstanceId,
      writerLeaseId: first.bootstrap.writerLeaseId,
      type: "draft.lock",
      expected: {
        kind: "draft",
        revision: privateEnvelope.payload.draft.revision,
      },
      payload: { plan: privateEnvelope.payload.draft.plan },
    });
    expect(result).toMatchObject({ status: "accepted" });
    expect(
      PlayerProjectionEnvelopeSchema.parse(await nextProjection).payload.draft
        .locked,
    ).toBe(true);

    display.disconnect();
    await vi.waitFor(() => {
      expect(actor.hostView().phase.paused).toBe(true);
    });
    player.disconnect();
  });
});

function onceSocket<T = unknown>(
  socket: Socket,
  event: string,
  timeoutMs = 3_000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for Socket.IO event ${event}`));
    }, timeoutMs);
    const onEvent = (value: T) => {
      clearTimeout(timer);
      resolve(value);
    };
    socket.once(event, onEvent);
  });
}

function emitAcknowledged<T>(
  socket: Socket,
  event: string,
  payload: unknown,
  timeoutMs = 3_000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event} acknowledgement`)),
      timeoutMs,
    );
    socket.emit(event, payload, (value: T) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}
