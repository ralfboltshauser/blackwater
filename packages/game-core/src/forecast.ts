import { emptyFactionUses, nextEntityId } from "./setup.js";
import {
  isThreat,
  sectorControllers,
  satisfiedCharters,
  fallbackScore,
} from "./victory.js";
import {
  RESOURCE_CAP,
  type CanonicalEvent,
  type Platform,
  type RulesState,
  type SeatId,
} from "./types.js";

function phaseEvent(
  state: RulesState,
  kind: string,
  data: CanonicalEvent["data"],
): CanonicalEvent {
  const ordinal = state.nextEntitySequence;
  return {
    id: nextEntityId(state, "event"),
    kind,
    round: state.round,
    pulse: null,
    stage: 0,
    ordinal,
    visibility: "public",
    audienceSeatIds: [],
    data,
  };
}

function arkSector(state: RulesState, seatId: SeatId): number {
  const ark = Object.values(state.assets).find(
    (asset) => asset.kind === "ark" && asset.ownerId === seatId,
  );
  if (!ark) throw new Error(`Seat ${seatId} has no Ark`);
  return ark.sectorId;
}

export function runForecast(state: RulesState): {
  stateAfter: RulesState;
  events: CanonicalEvent[];
} {
  const next = structuredClone(state);
  if (next.phase !== "forecast")
    throw new Error("Forecast can only run from the forecast phase");
  const events: CanonicalEvent[] = [];

  for (const asset of Object.values(next.assets).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (asset.kind !== "submarine") continue;
    if (
      asset.status === "constructing" &&
      asset.usableFromRound <= next.round
    ) {
      asset.status = "active";
      asset.integrity = 2;
      events.push(
        phaseEvent(next, "submarine.launched", {
          assetId: asset.id,
          ownerId: asset.ownerId,
        }),
      );
    } else if (
      asset.status === "disabled" &&
      asset.autoReturnRound !== null &&
      asset.autoReturnRound <= next.round
    ) {
      asset.status = "active";
      asset.integrity = 1;
      asset.sectorId = arkSector(next, asset.ownerId);
      asset.autoReturnRound = null;
      asset.disabledAtRound = null;
      asset.usableFromRound = next.round;
      asset.invalidatedForRound = null;
      events.push(
        phaseEvent(next, "submarine.returned", {
          assetId: asset.id,
          ownerId: asset.ownerId,
        }),
      );
    }
  }

  for (const seat of Object.values(next.seats).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const platforms = Object.values(next.assets).filter(
      (asset): asset is Platform =>
        asset.kind === "platform" && asset.ownerId === seat.id,
    );
    const onlineForProduction = platforms.filter(
      (platform) =>
        platform.state === "active" &&
        (platform.jammedThroughForecastRound === null ||
          platform.jammedThroughForecastRound < next.round),
    );
    const supply =
      2 +
      Math.min(
        2,
        onlineForProduction.filter(
          (platform) => platform.module === "extractor",
        ).length,
      );
    const signal =
      1 +
      Math.min(
        2,
        onlineForProduction.filter((platform) => platform.module === "sonar")
          .length,
      );
    const supplyGained = Math.min(supply, RESOURCE_CAP - seat.supply);
    const signalGained = Math.min(signal, RESOURCE_CAP - seat.signal);
    seat.supply += supplyGained;
    seat.signal += signalGained;
    seat.factionUses = emptyFactionUses();
    events.push(
      phaseEvent(next, "production.received", {
        seatId: seat.id,
        supply: supplyGained,
      }),
    );
    events.push({
      ...phaseEvent(next, "production.signal", {
        seatId: seat.id,
        signal: signalGained,
      }),
      visibility: "private",
      audienceSeatIds: [seat.id],
    });
  }

  for (const asset of Object.values(next.assets).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (asset.kind !== "platform") continue;
    if (
      asset.jammedThroughForecastRound !== null &&
      asset.jammedThroughForecastRound <= next.round
    ) {
      asset.jammedThroughForecastRound = null;
      if (asset.state === "jammed") asset.state = "active";
    }
    if (
      asset.reactivatesAtForecastRound !== null &&
      asset.reactivatesAtForecastRound <= next.round
    ) {
      asset.reactivatesAtForecastRound = null;
      asset.state = "active";
    }
  }

  for (const site of Object.values(next.sites).sort(
    (a, b) => a.sectorId - b.sectorId,
  )) {
    if (site.stockSpecimenId !== null) continue;
    const specimenId = nextEntityId(next, `specimen-site-${site.sectorId}`);
    next.specimens[specimenId] = {
      id: specimenId,
      type: site.specimenType,
      createdRound: next.round,
      knownTo: [],
    };
    site.stockSpecimenId = specimenId;
    events.push(
      phaseEvent(next, "site.replenished", { sectorId: site.sectorId }),
    );
  }

  for (const [evidenceId, evidence] of Object.entries(next.evidence)) {
    if (evidence.expiresAtForecastRound <= next.round)
      delete next.evidence[evidenceId];
  }
  const sealedObservationIds = new Set(
    Object.values(next.reports).flatMap((report) =>
      report.kind === "sealed" ? [report.observationId] : [],
    ),
  );
  for (const [observationId, observation] of Object.entries(
    next.observations,
  )) {
    if (
      observation.observedRound + 2 <= next.round &&
      !sealedObservationIds.has(observationId)
    ) {
      delete next.observations[observationId];
    }
  }
  next.commission = {};
  for (const seatId of Object.keys(next.seats).sort()) {
    if (isThreat(next, seatId)) {
      next.commission[seatId] = {
        targetSeatId: seatId,
        activeRound: next.round,
        claimed: false,
        qualifyingSeatIds: [],
      };
      events.push(
        phaseEvent(next, "commission.opened", {
          targetSeatId: seatId,
          rewardSupply: 1,
        }),
      );
    }
  }
  next.programs = {};
  next.programEscrows = {};
  next.phase = "planning";
  events.push(phaseEvent(next, "phase.planning", { round: next.round }));
  return { stateAfter: next, events };
}

export function runClaimCheck(state: RulesState): {
  stateAfter: RulesState;
  events: CanonicalEvent[];
} {
  const next = structuredClone(state);
  if (next.phase !== "claim" && next.phase !== "resolving")
    throw new Error("Claim Check requires a resolved round");
  const events: CanonicalEvent[] = [];

  for (const contest of Object.values(next.contests).sort((a, b) =>
    a.platformId.localeCompare(b.platformId),
  )) {
    if (contest.transferEligibleRound > next.round) continue;
    const platform = next.assets[contest.platformId];
    if (!platform || platform.kind !== "platform") continue;
    const controllers = sectorControllers(next, platform.sectorId, true);
    const contenderPlatformCount = Object.values(next.assets).filter(
      (asset) =>
        asset.kind === "platform" && asset.ownerId === contest.contenderId,
    ).length;
    if (
      controllers.length === 1 &&
      controllers[0] === contest.contenderId &&
      contenderPlatformCount < 4
    ) {
      const previousOwnerId = platform.ownerId;
      platform.ownerId = contest.contenderId;
      platform.state = "inactive";
      platform.reactivatesAtForecastRound = next.round + 1;
      events.push(
        phaseEvent(next, "platform.transferred", {
          platformId: platform.id,
          previousOwnerId,
          ownerId: platform.ownerId,
        }),
      );
    } else {
      platform.state = "inactive";
      platform.reactivatesAtForecastRound = next.round + 1;
      events.push(
        phaseEvent(next, "platform.retained", {
          platformId: platform.id,
          ownerId: platform.ownerId,
        }),
      );
    }
    delete next.contests[contest.platformId];
  }

  for (const [deviceId, device] of Object.entries(next.devices)) {
    if (
      device.state !== "armed" ||
      (device.kind === "decoy" && device.expiresAfterRound <= next.round)
    )
      delete next.devices[deviceId];
  }
  for (const deal of Object.values(next.deals)) {
    if (
      deal.kind === "handshake" &&
      deal.status === "active" &&
      deal.expiresAfterRound <= next.round
    ) {
      deal.status = "expired";
    }
  }

  const winningCharters: Record<
    SeatId,
    ReturnType<typeof satisfiedCharters>
  > = {};
  for (const seatId of Object.keys(next.seats).sort()) {
    const charters = satisfiedCharters(next, seatId);
    if (charters.length > 0) winningCharters[seatId] = charters;
  }
  const winners = Object.keys(winningCharters).sort();
  if (winners.length > 0) {
    next.winners = winners;
    next.winningCharters = winningCharters;
    next.phase = "ended";
    events.push(
      phaseEvent(next, "match.won", {
        winnerIds: winners,
        charters: winningCharters,
      }),
    );
    return { stateAfter: next, events };
  }

  if (next.round >= next.roundCap) {
    const scores = Object.fromEntries(
      Object.keys(next.seats)
        .sort()
        .map((seatId) => [seatId, fallbackScore(next, seatId)]),
    );
    const high = Math.max(...Object.values(scores));
    next.fallbackScores = scores;
    next.winners = Object.keys(scores)
      .filter((seatId) => scores[seatId] === high)
      .sort();
    next.winningCharters = Object.fromEntries(
      next.winners.map((seatId) => [seatId, ["fallback"]]),
    );
    next.phase = "ended";
    events.push(
      phaseEvent(next, "match.fallback", { scores, winnerIds: next.winners }),
    );
    return { stateAfter: next, events };
  }

  next.round += 1;
  next.phase = "forecast";
  events.push(phaseEvent(next, "phase.forecast", { round: next.round }));
  return { stateAfter: next, events };
}
