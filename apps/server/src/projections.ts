import {
  charterStatus,
  isThreat,
  projectForSeat as projectCoreSeat,
  type Platform,
  type RulesState,
  type SeatId,
  type Submarine,
} from "@blackwater/game-core";
import {
  HostProjectionSchema,
  LobbySnapshotSchema,
  PlayerProjectionSchema,
  PublicProjectionSchema,
  type HostProjection,
  type LobbySnapshot,
  type PlayerProjection,
  type PublicProjection,
} from "@blackwater/protocol";

import type { MatchRecord, SeatRecord, SessionRecord } from "./persistence";
import type { PersistedRules, WorkflowState } from "./state";

export interface PresenceView {
  seatPresence(seatId: string): "connected" | "grace" | "offline";
  displayReady: boolean;
  clients: Array<{
    sessionId: string;
    role: "host" | "display" | "player";
    seatId: string | null;
    presence: "connected" | "grace" | "offline";
    transport: "polling" | "websocket" | "disconnected";
    rttMs: number | null;
    buildId: string;
    protocol: number;
    lastSeenAtMs: number;
  }>;
}

const factionNames: Record<string, string> = {
  symmetric: "Pelagic Survey",
  echo_cartographers: "Echo Cartographers",
  quiet_current: "Quiet Current",
  roaming_atoll: "Roaming Atoll",
  hadal_engineers: "Hadal Engineers",
  concord_relay: "Concord Relay",
  second_dawn: "Second Dawn",
};

const factionPowers: Record<string, string> = {
  symmetric: "Standard expedition kit; no asymmetric exception.",
  echo_cartographers: "Active Survey reaches connected sectors once per round.",
  quiet_current: "Carries a third Silence and may suppress one public contact.",
  roaming_atoll: "The Ark may tow one friendly platform while navigating.",
  hadal_engineers: "The first platform each round costs one less Supply.",
  concord_relay: "Earns 1 Signal after its first accepted trade each round.",
  second_dawn:
    "Recovers from loss faster and may salvage without an Operation.",
};

const patterns = ["solid", "stripe", "dot", "dash", "cross", "wave"] as const;

function directionFor(
  state: RulesState,
  fromId: number | null,
  toId: number | null,
) {
  if (fromId === null || toId === null) return "unknown" as const;
  const from = state.map.sectors[fromId];
  const to = state.map.sectors[toId];
  if (!from || !to) return "unknown" as const;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy) * 2)
    return dx > 0 ? ("e" as const) : ("w" as const);
  if (Math.abs(dy) > Math.abs(dx) * 2)
    return dy > 0 ? ("s" as const) : ("n" as const);
  if (dx > 0) return dy > 0 ? ("se" as const) : ("ne" as const);
  return dy > 0 ? ("sw" as const) : ("nw" as const);
}

export function lobbySnapshot(
  match: MatchRecord<PersistedRules, WorkflowState>,
  presence: PresenceView,
): LobbySnapshot {
  const claimed = match.workflow.seats.filter(
    (seat) => seat.displayName !== null,
  );
  return LobbySnapshotSchema.parse({
    matchId: match.matchId,
    roomCode: match.roomCode,
    lifecycle: match.lifecycle,
    playerCount: match.workflow.playerCount,
    seats: match.workflow.seats.map((seat) => ({
      ...(match.workflow.bots[seat.seatId]
        ? {
            controller: "bot" as const,
            botStrategy: match.workflow.bots[seat.seatId]!.strategy,
          }
        : seat.displayName === null
          ? { controller: null, botStrategy: null }
          : { controller: "human" as const, botStrategy: null }),
      seatId: seat.seatId,
      displayName: seat.displayName,
      color: seat.color,
      pattern: seat.pattern,
      presence:
        seat.displayName === null || match.workflow.bots[seat.seatId]
          ? "offline"
          : presence.seatPresence(seat.seatId),
      claimed: seat.displayName !== null,
      ready: seat.ready,
    })),
    displayConnected: presence.displayReady,
    canStart:
      match.lifecycle === "lobby" &&
      presence.displayReady &&
      claimed.length === match.workflow.playerCount &&
      claimed.every((seat) => seat.ready),
    createdAtMs: match.createdAtMs,
  });
}

export function publicProjection(input: {
  match: MatchRecord<PersistedRules, WorkflowState>;
  state: RulesState;
  presence: PresenceView;
  caption: string | null;
}): PublicProjection {
  const { match, state, presence } = input;
  const seatOrder = match.workflow.seats.map((seat) => seat.seatId);
  const contests = state.contests;
  const platforms = Object.values(state.assets).filter(
    (asset): asset is Platform => asset.kind === "platform",
  );
  const submarines = Object.values(state.assets).filter(
    (asset): asset is Submarine => asset.kind === "submarine",
  );
  const phase = match.workflow.phase;
  return PublicProjectionSchema.parse({
    matchId: match.matchId,
    roomCode: match.roomCode,
    lifecycle: match.lifecycle,
    phase: {
      phaseId: phase.phaseId,
      epoch: phase.epoch,
      kind: phase.kind,
      round: phase.round,
      pulse: phase.pulse,
      paused: phase.paused,
      pauseReason: phase.pauseReason,
      endsAtServerMs: phase.endsAtServerMs,
      finalLockAtServerMs: phase.finalLockAtServerMs,
    },
    topology: {
      basinId: state.map.templateId,
      sectors: Object.values(state.map.sectors).map((sector) => ({
        sectorId: sector.id,
        name: sector.name,
        region: sector.region,
        position: {
          x: sector.x / state.map.coordinateScale,
          y: sector.y / state.map.coordinateScale,
        },
        buildSite: true,
        deepSite: sector.deepSite,
      })),
      edges: state.map.connections.map(([a, b]) => ({
        edgeId: `edge-${a}-${b}`,
        a,
        b,
        current: null,
      })),
    },
    expeditions: seatOrder.flatMap((seatId, index) => {
      const seat = state.seats[seatId];
      const lobbySeat = match.workflow.seats.find(
        (candidate) => candidate.seatId === seatId,
      );
      if (!seat || !lobbySeat) return [];
      const status = charterStatus(state, seatId);
      const threat = isThreat(state, seatId);
      return [
        {
          seatId,
          displayName: seat.name,
          color: lobbySeat.color,
          pattern: patterns[index] ?? "solid",
          factionName: factionNames[seat.faction] ?? seat.faction,
          factionPower:
            factionPowers[seat.faction] ?? "Standard expedition kit.",
          presence: presence.seatPresence(seatId),
          ready: match.workflow.drafts[seatId]?.locked ?? false,
          controller: match.workflow.bots[seatId] ? "bot" : "human",
          botStrategy: match.workflow.bots[seatId]?.strategy ?? null,
          supply: seat.supply,
          platformCount: platforms.filter(
            (platform) => platform.ownerId === seatId,
          ).length,
          submarineCount: submarines.filter(
            (submarine) => submarine.ownerId === seatId,
          ).length,
          analyzedSpecimenCount: seat.analyzedSpecimenIds.length,
          charters: [
            {
              charter: "network" as const,
              value: status.network.connectedActive,
              target: 4,
              threatened: threat && status.network.connectedActive >= 3,
              satisfied: status.network.satisfied,
            },
            {
              charter: "discovery" as const,
              value: status.discovery.analyzedTotal,
              target: 3,
              threatened: threat && status.discovery.distinctTypes >= 2,
              satisfied: status.discovery.satisfied,
            },
            { charter: "dominion" as const, progress: "sealed" as const },
          ],
          winner: state.winners.includes(seatId),
        },
      ];
    }),
    arks: Object.values(state.assets)
      .filter((asset) => asset.kind === "ark")
      .map((ark) => ({
        assetId: ark.id,
        ownerSeatId: ark.ownerId,
        sectorId: ark.sectorId,
        jammed: false,
      })),
    platforms: platforms.map((platform) => ({
      platformId: platform.id,
      ownerSeatId: platform.ownerId,
      sectorId: platform.sectorId,
      module: platform.module,
      state: platform.state,
      contenderSeatId: contests[platform.id]?.contenderId ?? null,
      contestEligibleRound:
        contests[platform.id]?.transferEligibleRound ?? null,
    })),
    contacts: Object.values(state.evidence)
      .sort(
        (a, b) =>
          a.observedRound - b.observedRound ||
          a.observedPulse - b.observedPulse ||
          a.id.localeCompare(b.id),
      )
      .slice(-256)
      .map((evidence) => ({
        contactId: evidence.id,
        evidenceKind:
          evidence.kind === "identified_contact"
            ? "identified-contact"
            : evidence.kind,
        sectorId: evidence.sectorId,
        class:
          evidence.kind === "disturbance"
            ? "disturbance"
            : evidence.kind === "identified_contact"
              ? "submarine"
              : "unknown",
        confidence:
          evidence.confidence === "confirmed"
            ? "exact"
            : evidence.confidence === "strong"
              ? "high"
              : "low",
        identifiedSeatId:
          evidence.kind === "identified_contact" ? evidence.ownerId : null,
        direction: directionFor(
          state,
          evidence.fromSectorId,
          evidence.toSectorId,
        ),
        observedRound: evidence.observedRound,
        observedPulse: evidence.observedPulse,
        age:
          evidence.expiresAtForecastRound <= state.round + 1
            ? "fading"
            : "fresh",
      })),
    deepSites: Object.values(state.sites).map((site) => ({
      sectorId: site.sectorId,
      dominionObjective: state.map.dominionRequiredSiteIds.includes(
        site.sectorId,
      ),
      specimenAvailable: site.stockSpecimenId !== null,
      activity: site.stockSpecimenId !== null ? "quiet" : "harvested",
    })),
    salvage: Object.values(state.salvage).map((salvage) => ({
      salvageId: salvage.id,
      sectorId: salvage.sectorId,
    })),
    commissions: Object.values(state.commission)
      .filter((commission) => !commission.claimed)
      .map((commission) => ({
        targetSeatId: commission.targetSeatId,
        rewardSupply: 1,
      })),
    broadcastReports:
      seatOrder.length === 0
        ? []
        : reportProjection(state, match.workflow, seatOrder[0]!)
            .filter((report) => state.reports[report.reportId]?.public)
            .slice(-64),
    constructionProjects: submarines
      .filter((submarine) => submarine.status === "constructing")
      .map((submarine) => ({
        projectId: submarine.id,
        ownerSeatId: submarine.ownerId,
        sectorId: submarine.sectorId,
        kind: "submarine",
        usableFromRound: submarine.usableFromRound,
      })),
    agreements: Object.values(state.deals)
      .filter((deal) => deal.kind === "handshake")
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(-24)
      .map((deal) => ({
        offerId: deal.id,
        mode: "handshake",
        participants: deal.partyIds,
        termKind: deal.safePassageDevices ? "safe-passage" : "ceasefire",
        sectorIds: deal.sectorIds,
        status: deal.status,
        breachSeatId: deal.breachedBySeatId,
      })),
    presentation: {
      resolutionId: match.workflow.presentation.resolutionId,
      cursor: match.workflow.presentation.cursor,
      beatCount: match.workflow.presentation.beatCount,
      timelineSeq: match.workflow.presentation.timelineSeq,
      paused: match.workflow.presentation.paused,
      currentBeatId: match.workflow.presentation.currentBeatId,
      currentBeatEndsAtServerMs:
        match.workflow.presentation.currentBeatEndsAtServerMs,
    },
    currentCaption: input.caption,
    outcome:
      state.phase === "ended" && state.winners.length > 0
        ? {
            winnerSeatIds: [...state.winners].sort(),
            winningCharters: [...state.winners].sort().map((seatId) => ({
              seatId,
              charters: [...(state.winningCharters[seatId] ?? [])].sort(),
            })),
            fallbackScores: Object.entries(state.fallbackScores)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([seatId, score]) => ({ seatId, score })),
          }
        : null,
  });
}

function reportProjection(
  state: RulesState,
  workflow: WorkflowState,
  seatId: SeatId,
) {
  const projected = projectCoreSeat(state, seatId);
  const allFields = [
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
  ] as const;
  return projected.reports.map((report) => {
    const source = state.reports[report.reportId];
    const fields = report.fields;
    const field = (name: string) => fields[name] ?? null;
    const reportFields = new Set(Object.keys(fields));
    const rawClass = field("contactClass");
    const rawDirection = field("direction");
    const rawConfidence = field("confidence");
    const rawSensor = field("sensor");
    return {
      reportId: report.reportId,
      createdAtMs:
        workflow.createdAtMs + (source?.createdRound ?? state.round) * 1_000,
      observedAtRound: Number(
        field("observedAtRound") ?? source?.createdRound ?? state.round,
      ),
      observedAtPulse: ([1, 2, 3] as const).includes(
        field("observedAtPulse") as 1 | 2 | 3,
      )
        ? (field("observedAtPulse") as 1 | 2 | 3)
        : null,
      sectorId:
        typeof field("sectorId") === "number"
          ? (field("sectorId") as number)
          : null,
      contactCount:
        typeof field("contactCount") === "number"
          ? (field("contactCount") as number)
          : null,
      contactClass:
        typeof rawClass === "string" &&
        ["unknown", "vessel", "submarine", "decoy", "disturbance"].includes(
          rawClass,
        )
          ? rawClass
          : null,
      direction:
        typeof rawDirection === "string" &&
        [
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
        ].includes(rawDirection)
          ? rawDirection
          : null,
      identitySeatId:
        typeof field("identitySeatId") === "string"
          ? (field("identitySeatId") as string)
          : null,
      confidence:
        typeof rawConfidence === "string" &&
        ["low", "medium", "high", "exact"].includes(rawConfidence)
          ? rawConfidence
          : null,
      sensor:
        report.kind === "statement"
          ? "statement"
          : typeof rawSensor === "string" &&
              ["passive-sonar", "active-survey", "trap", "visual"].includes(
                rawSensor,
              )
            ? rawSensor
            : null,
      specimenType:
        typeof field("specimenType") === "string" &&
        ["ribbon_filter", "prism_raft", "luminous_pollen"].includes(
          field("specimenType") as string,
        )
          ? (field("specimenType") as
              "ribbon_filter" | "prism_raft" | "luminous_pollen")
          : null,
      statement:
        typeof field("claim") === "string" ? (field("claim") as string) : null,
      verified: report.verified,
      redactedFields: allFields.filter(
        (name) => name !== "statement" && !reportFields.has(name),
      ),
      authorSeatId: report.authorSeatId,
      custody: report.custody.map((custodySeatId, index) => ({
        seatId: custodySeatId,
        transferredAtMs:
          workflow.createdAtMs +
          (source?.createdRound ?? state.round) * 1_000 +
          index,
      })),
    };
  });
}

export function playerProjection(input: {
  match: MatchRecord<PersistedRules, WorkflowState>;
  state: RulesState;
  seatId: string;
  presence: PresenceView;
  caption: string | null;
}): PlayerProjection {
  const { state, seatId, match } = input;
  const seat = state.seats[seatId];
  if (!seat) throw new Error("Seat not found in rules state");
  const draft = match.workflow.drafts[seatId];
  if (!draft) throw new Error("Seat draft is missing");
  const sealedReportByObservation = new Map<string, string>();
  for (const report of Object.values(state.reports).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (
      report.kind === "sealed" &&
      report.parentReportId === null &&
      !sealedReportByObservation.has(report.observationId)
    ) {
      sealedReportByObservation.set(report.observationId, report.id);
    }
  }
  return PlayerProjectionSchema.parse({
    public: publicProjection(input),
    seatId,
    faction: seat.faction,
    resources: { supply: seat.supply, signal: seat.signal },
    deviceInventory: seat.deviceInventory,
    submarines: Object.values(state.assets)
      .filter(
        (asset): asset is Submarine =>
          asset.kind === "submarine" && asset.ownerId === seatId,
      )
      .map((submarine) => ({
        assetId: submarine.id,
        sectorId: submarine.sectorId,
        integrity: submarine.integrity,
        state: submarine.status,
        silence: submarine.silence,
        maxSilence: submarine.maxSilence,
        usableFromRound: submarine.usableFromRound,
        returnAtRound: submarine.autoReturnRound,
        incomingSectorId: submarine.lastTravelFromSectorId,
        cargo: submarine.cargo.flatMap((specimenId) => {
          const specimen = state.specimens[specimenId];
          return specimen ? [{ specimenId, type: specimen.type }] : [];
        }),
      })),
    devices: Object.values(state.devices)
      .filter((device) => device.ownerId === seatId && device.state === "armed")
      .map((device) => ({
        deviceId: device.id,
        kind: device.kind,
        state:
          device.state === "armed"
            ? "deployed"
            : device.state === "consumed"
              ? "triggered"
              : "expired",
        sectorId: device.sectorId,
        trigger: device.kind === "snare" ? device.mode : null,
        expiresAtRound:
          device.kind === "decoy" ? device.expiresAfterRound : null,
      })),
    analyzedTypes: [
      ...new Set(
        seat.analyzedSpecimenIds.flatMap((specimenId) => {
          const specimen = state.specimens[specimenId];
          return specimen ? [specimen.type] : [];
        }),
      ),
    ],
    observations: Object.values(state.observations)
      .filter((observation) => observation.ownerId === seatId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(-512)
      .map((observation) => ({
        contactId: observation.id,
        sealedReportId: sealedReportByObservation.get(observation.id) ?? null,
        sectorId: observation.sectorId,
        observedAtRound: observation.observedRound,
        observedAtPulse: observation.observedPulse,
        contactClass: observation.contactClass,
        direction: observation.direction,
        identitySeatId: observation.identitySeatId,
        specimenType: observation.specimenType,
        contactCount: observation.contactCount,
        confidence: observation.confidence,
        sensor:
          observation.source === "passive_sonar"
            ? "passive-sonar"
            : observation.source === "active_survey"
              ? "active-survey"
              : observation.source === "snare"
                ? "trap"
                : "harvest",
      })),
    reports: reportProjection(state, match.workflow, seatId).slice(-512),
    draft: {
      revision: draft.revision,
      locked: draft.locked,
      plan: draft.plan,
      reservedSupply: draft.reservedSupply,
      reservedSignal: draft.reservedSignal,
      valid: draft.valid,
      invalidReasons: draft.invalidReasons,
      submittedPulses: draft.submittedPulses,
    },
    deals: Object.values(match.workflow.offers)
      .filter(
        (offer) =>
          offer.proposerSeatId === seatId || offer.recipientSeatId === seatId,
      )
      .sort((a, b) => a.offerId.localeCompare(b.offerId))
      .slice(-32)
      .map((offer) => ({ ...offer })),
    resultCards: match.workflow.resultCards[seatId] ?? [],
  });
}

export function hostProjection(input: {
  match: MatchRecord<PersistedRules, WorkflowState>;
  presence: PresenceView;
  buildId: string;
  databaseBytes: number;
  actorQueueDepth: number;
  schemaVersion: number;
  assetManifestHash: string;
}): HostProjection {
  const { match, presence } = input;
  const phase = match.workflow.phase;
  return HostProjectionSchema.parse({
    matchId: match.matchId,
    roomCode: match.roomCode,
    lifecycle: match.lifecycle,
    phase: {
      phaseId: phase.phaseId,
      epoch: phase.epoch,
      kind: phase.kind,
      paused: phase.paused,
      endsAtServerMs: phase.endsAtServerMs,
    },
    clients: presence.clients,
    displayReady: presence.displayReady,
    briefing: match.workflow.briefing,
    actorQueueDepth: Math.min(1_000, input.actorQueueDepth),
    persistence: {
      ready: true,
      quickCheck: "ok",
      databaseBytes: input.databaseBytes,
      walBytes: 0,
      lastBackupAtMs: null,
    },
    build: {
      buildId: input.buildId,
      protocol: 1,
      rulesVersion: "1.0.0",
      schemaVersion: input.schemaVersion,
      assetManifestHash: input.assetManifestHash,
    },
    controls: {
      canPause: match.lifecycle === "active" && !phase.paused,
      canResume:
        match.lifecycle === "active" &&
        phase.paused &&
        !match.workflow.briefing.active,
      canExtend:
        match.lifecycle === "active" &&
        phase.kind === "open-water" &&
        !match.workflow.briefing.active,
      canClosePlanning:
        match.lifecycle === "active" &&
        phase.kind === "open-water" &&
        !phase.paused &&
        !match.workflow.briefing.active,
      canSkipPresentation:
        match.lifecycle === "active" &&
        phase.kind === "resolution" &&
        !match.workflow.briefing.active,
    },
  });
}
