import { areConnected, connectedSectors, shortestPath } from "./maps.js";
import { externalId } from "./ids.js";
import {
  activeSubmarines,
  defaultProgram,
  developProjectCost,
  operationSignalCost,
  operationSupplyCost,
  validateProgram,
} from "./operations.js";
import { nextEntityId } from "./setup.js";
import type {
  Ark,
  Asset,
  CanonicalEvent,
  Decoy,
  DeployOperation,
  Device,
  Direction,
  Evidence,
  HarvestOperation,
  HuntOperation,
  JamOperation,
  NavigateOperation,
  Observation,
  Operation,
  Platform,
  Pulse,
  RaidOperation,
  RoundInput,
  RoundResolution,
  RulesState,
  ScreenOperation,
  SeatId,
  Snare,
  Submarine,
  SurveyOperation,
  ThreePulseProgram,
} from "./types.js";
import { RESOURCE_CAP } from "./types.js";

interface ResolveContext {
  state: RulesState;
  events: CanonicalEvent[];
  ordinal: number;
}

interface MovementRecord {
  assetId: string;
  ownerId: SeatId;
  fromSectorId: number;
  toSectorId: number;
  silent: boolean;
  decoy: boolean;
}

function externallyAddressableIdInUse(state: RulesState, id: string): boolean {
  return (
    id in state.seats ||
    id in state.assets ||
    id in state.devices ||
    id in state.specimens ||
    id in state.salvage ||
    id in state.evidence ||
    id in state.observations ||
    id in state.reports ||
    id in state.deals
  );
}

/**
 * Optional IDs exist for trusted deterministic fixtures. They are never an
 * overwrite capability: a collision falls back to a fresh canonical ID.
 */
function unusedEntityId(
  state: RulesState,
  requestedId: string | undefined,
  prefix: string,
): string {
  if (requestedId && !externallyAddressableIdInUse(state, requestedId))
    return requestedId;
  let generated: string;
  do generated = nextEntityId(state, prefix);
  while (externallyAddressableIdInUse(state, generated));
  return generated;
}

function movementDirection(
  state: RulesState,
  fromSectorId: number,
  toSectorId: number,
): Direction {
  const from = state.map.sectors[fromSectorId];
  const to = state.map.sectors[toSectorId];
  if (!from || !to) return "unknown";
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return "still";
  if (Math.abs(dx) > Math.abs(dy) * 2) return dx > 0 ? "e" : "w";
  if (Math.abs(dy) > Math.abs(dx) * 2) return dy > 0 ? "s" : "n";
  if (dx > 0) return dy > 0 ? "se" : "ne";
  return dy > 0 ? "sw" : "nw";
}

function sortedSeatIds(state: RulesState): SeatId[] {
  return Object.keys(state.seats).sort();
}

function emit(
  context: ResolveContext,
  kind: string,
  pulse: Pulse,
  stage: number,
  visibility: "public" | "private",
  audienceSeatIds: SeatId[],
  data: CanonicalEvent["data"],
): CanonicalEvent {
  const event: CanonicalEvent = {
    id: externalId(
      "event",
      `r${context.state.round}`,
      `p${pulse}`,
      `s${stage}`,
      `n${context.ordinal}`,
    ),
    kind,
    round: context.state.round,
    pulse,
    stage,
    ordinal: context.ordinal,
    visibility,
    audienceSeatIds: [...audienceSeatIds].sort(),
    data,
  };
  context.ordinal += 1;
  context.events.push(event);
  return event;
}

function assetReady(
  state: RulesState,
  seatId: SeatId,
  operation: Operation,
): Asset | null {
  if (operation.kind === "hold" && !operation.assetId) return null;
  const asset = operation.assetId ? state.assets[operation.assetId] : undefined;
  if (!asset || asset.ownerId !== seatId) return null;
  if (
    "requiredSectorId" in operation &&
    operation.requiredSectorId !== undefined &&
    asset.sectorId !== operation.requiredSectorId
  )
    return null;
  if (asset.kind === "submarine") {
    if (
      asset.status !== "active" ||
      asset.usableFromRound > state.round ||
      asset.invalidatedForRound === state.round
    )
      return null;
  }
  return asset;
}

function operationBySeat(
  state: RulesState,
  pulse: Pulse,
): Array<[SeatId, Operation]> {
  return sortedSeatIds(state).map((seatId) => {
    const program = state.programs[seatId] ?? defaultProgram(seatId);
    return [seatId, program.operations[pulse - 1]!];
  });
}

function spendSignal(
  state: RulesState,
  seatId: SeatId,
  amount: number,
): boolean {
  const seat = state.seats[seatId]!;
  if (seat.signal < amount) return false;
  seat.signal -= amount;
  return true;
}

function spendSupply(
  state: RulesState,
  seatId: SeatId,
  amount: number,
): boolean {
  const seat = state.seats[seatId]!;
  if (seat.supply < amount) return false;
  seat.supply -= amount;
  return true;
}

function addEvidence(
  context: ResolveContext,
  pulse: Pulse,
  evidence: Omit<
    Evidence,
    "id" | "observedRound" | "observedPulse" | "expiresAtForecastRound"
  >,
): Evidence {
  const id = nextEntityId(context.state, "evidence");
  const created: Evidence = {
    ...evidence,
    id,
    observedRound: context.state.round,
    observedPulse: pulse,
    expiresAtForecastRound: context.state.round + 2,
  };
  context.state.evidence[id] = created;
  return created;
}

function addObservation(
  context: ResolveContext,
  pulse: Pulse,
  observation: Omit<Observation, "id" | "observedRound" | "observedPulse">,
): Observation {
  const id = nextEntityId(context.state, "observation");
  const created: Observation = {
    ...observation,
    id,
    observedRound: context.state.round,
    observedPulse: pulse,
  };
  context.state.observations[id] = created;
  return created;
}

function deviceIsArmed(device: Device, round: number, pulse: Pulse): boolean {
  if (device.state !== "armed") return false;
  if (round > device.armedFromRound) return true;
  if (round < device.armedFromRound) return false;
  return device.armedFromPulse === null || pulse >= device.armedFromPulse;
}

function recordHandshakeBreach(
  context: ResolveContext,
  actorId: SeatId,
  targetId: SeatId,
  sectorId: number,
  pulse: Pulse,
  cause: "hunt" | "raid" | "snare",
): void {
  for (const deal of Object.values(context.state.deals).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (
      deal.kind !== "handshake" ||
      deal.status !== "active" ||
      !deal.partyIds.includes(actorId) ||
      !deal.partyIds.includes(targetId) ||
      !deal.sectorIds.includes(sectorId)
    )
      continue;
    const prohibited =
      cause === "hunt"
        ? deal.prohibitHunt
        : cause === "raid"
          ? deal.prohibitRaid
          : deal.safePassageDevices;
    if (!prohibited) continue;
    deal.status = "breached";
    deal.breachedBySeatId = actorId;
    emit(
      context,
      "handshake.breached",
      pulse,
      cause === "snare" ? 4 : 8,
      "public",
      [],
      { handshakeId: deal.id, actorId, targetId, sectorId, cause },
    );
  }
}

function dropSpecimen(
  context: ResolveContext,
  sub: Submarine,
  specimenId: string,
  pulse: Pulse,
  stage = 4,
): void {
  sub.cargo = sub.cargo.filter((id) => id !== specimenId);
  const salvageId = nextEntityId(context.state, "salvage");
  context.state.salvage[salvageId] = {
    id: salvageId,
    specimenId,
    sectorId: sub.sectorId,
    droppedBySeatId: sub.ownerId,
    droppedRound: context.state.round,
    droppedPulse: pulse,
  };
  emit(context, "specimen.dropped", pulse, stage, "public", [], {
    salvageId,
    sectorId: sub.sectorId,
  });
}

function triggerSnares(
  context: ResolveContext,
  pulse: Pulse,
  arrivals: MovementRecord[],
  stopped: Set<string>,
): void {
  const state = context.state;
  const snares = Object.values(state.devices)
    .filter(
      (device): device is Snare =>
        device.kind === "snare" && deviceIsArmed(device, state.round, pulse),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const snare of snares) {
    const targets = arrivals
      .filter(
        (arrival) =>
          !arrival.decoy &&
          arrival.toSectorId === snare.sectorId &&
          arrival.ownerId !== snare.ownerId,
      )
      .map((arrival) => state.assets[arrival.assetId])
      .filter(
        (asset): asset is Submarine =>
          asset?.kind === "submarine" && asset.status === "active",
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    if (targets.length === 0) continue;
    snare.state = "consumed";
    emit(context, "snare.triggered", pulse, 4, "public", [], {
      deviceId: snare.id,
      ownerId: snare.ownerId,
      sectorId: snare.sectorId,
      mode: snare.mode,
      contactCount: targets.length,
    });
    for (const target of targets) {
      addObservation(context, pulse, {
        ownerId: snare.ownerId,
        source: "snare",
        sectorId: snare.sectorId,
        contactClass: "submarine",
        subjectId: target.id,
        identitySeatId: target.ownerId,
        specimenType: null,
        contactCount: 1,
        direction: "still",
        confidence: 100,
      });
      emit(
        context,
        "snare.private_result",
        pulse,
        4,
        "private",
        [snare.ownerId, target.ownerId],
        {
          deviceId: snare.id,
          targetId: target.id,
          targetOwnerId: target.ownerId,
          mode: snare.mode,
        },
      );
      if (snare.mode === "spill") {
        stopped.add(target.id);
        const newest = target.cargo.at(-1);
        if (newest) dropSpecimen(context, target, newest, pulse);
      }
      recordHandshakeBreach(
        context,
        snare.ownerId,
        target.ownerId,
        snare.sectorId,
        pulse,
        "snare",
      );
    }
  }
}

function createWake(
  context: ResolveContext,
  pulse: Pulse,
  movement: MovementRecord,
): void {
  const evidence = addEvidence(context, pulse, {
    kind: "wake",
    // A wake marks where the vessel departed, not where it arrived. Revealing
    // the arrival would turn hidden movement into public movement.
    sectorId: movement.fromSectorId,
    fromSectorId: movement.fromSectorId,
    toSectorId: movement.toSectorId,
    ownerId: null,
    subjectId: movement.assetId,
    confidence: "partial",
  });
  emit(context, "wake.created", pulse, 3, "public", [], {
    evidenceId: evidence.id,
    sectorId: movement.fromSectorId,
    direction: movementDirection(
      context.state,
      movement.fromSectorId,
      movement.toSectorId,
    ),
  });
}

function passiveSonar(
  context: ResolveContext,
  pulse: Pulse,
  movements: MovementRecord[],
): void {
  const state = context.state;
  const sonars = Object.values(state.assets).filter(
    (asset): asset is Platform =>
      asset.kind === "platform" &&
      asset.module === "sonar" &&
      asset.state === "active",
  );
  for (const movement of movements.filter((record) => !record.silent)) {
    for (const seatId of sortedSeatIds(state)) {
      if (seatId === movement.ownerId) continue;
      const coverage = sonars.filter(
        (sonar) =>
          sonar.ownerId === seatId &&
          (sonar.sectorId === movement.toSectorId ||
            areConnected(state.map, sonar.sectorId, movement.toSectorId)),
      ).length;
      if (coverage === 0) continue;
      const subject = movement.decoy
        ? state.devices[movement.assetId]
        : state.assets[movement.assetId];
      addObservation(context, pulse, {
        ownerId: seatId,
        source: "passive_sonar",
        sectorId: movement.toSectorId,
        contactClass: movement.decoy && coverage >= 2 ? "decoy" : "submarine",
        subjectId: movement.assetId,
        identitySeatId:
          !movement.decoy && coverage >= 2 ? movement.ownerId : null,
        specimenType: null,
        contactCount: 1,
        direction: movementDirection(
          state,
          movement.fromSectorId,
          movement.toSectorId,
        ),
        confidence: coverage >= 2 ? 70 : 50,
      });
      emit(context, "sonar.passive", pulse, 5, "private", [seatId], {
        sectorId: movement.toSectorId,
        contactClass: movement.decoy && coverage >= 2 ? "decoy" : "submarine",
        identitySeatId:
          !movement.decoy && coverage >= 2 ? movement.ownerId : null,
        subjectKnown: Boolean(subject),
      });
    }
  }
}

function moveDecoys(context: ResolveContext, pulse: Pulse): MovementRecord[] {
  const movements: MovementRecord[] = [];
  for (const decoy of Object.values(context.state.devices)
    .filter(
      (device): device is Decoy =>
        device.kind === "decoy" &&
        deviceIsArmed(device, context.state.round, pulse),
    )
    .sort((a, b) => a.id.localeCompare(b.id))) {
    const nextSector = decoy.route[decoy.routeIndex];
    if (
      nextSector === undefined ||
      !areConnected(context.state.map, decoy.sectorId, nextSector)
    )
      continue;
    const record: MovementRecord = {
      assetId: decoy.id,
      ownerId: decoy.ownerId,
      fromSectorId: decoy.sectorId,
      toSectorId: nextSector,
      silent: false,
      decoy: true,
    };
    decoy.sectorId = nextSector;
    decoy.routeIndex += 1;
    movements.push(record);
    createWake(context, pulse, record);
  }
  return movements;
}

function resolveMovement(
  context: ResolveContext,
  pulse: Pulse,
  operations: Array<[SeatId, Operation]>,
): void {
  const state = context.state;
  const stopped = new Set<string>();
  const allMovements: MovementRecord[] = [];
  const firstLeg: Array<{
    seatId: SeatId;
    operation: Operation;
    asset: Ark | Submarine;
    to: number;
    silent: boolean;
  }> = [];
  const sprintSecond = new Map<string, number>();
  const towCandidates: Array<{
    seatId: SeatId;
    operation: NavigateOperation;
    ark: Ark;
    platform: Platform;
  }> = [];

  for (const [seatId, operation] of operations) {
    if (!["glide", "sprint", "navigate"].includes(operation.kind)) continue;
    const asset = assetReady(state, seatId, operation);
    if (!asset) continue;
    if (operation.kind === "glide" && asset.kind === "submarine") {
      if (!areConnected(state.map, asset.sectorId, operation.toSectorId))
        continue;
      if (operation.silent) {
        if (asset.silence < 1) continue;
        asset.silence -= 1;
      }
      firstLeg.push({
        seatId,
        operation,
        asset,
        to: operation.toSectorId,
        silent: operation.silent,
      });
    } else if (operation.kind === "sprint" && asset.kind === "submarine") {
      if (
        !areConnected(state.map, asset.sectorId, operation.path[0]) ||
        !areConnected(state.map, operation.path[0], operation.path[1])
      )
        continue;
      firstLeg.push({
        seatId,
        operation,
        asset,
        to: operation.path[0],
        silent: false,
      });
      sprintSecond.set(asset.id, operation.path[1]);
    } else if (operation.kind === "navigate" && asset.kind === "ark") {
      if (!areConnected(state.map, asset.sectorId, operation.toSectorId))
        continue;
      firstLeg.push({
        seatId,
        operation,
        asset,
        to: operation.toSectorId,
        silent: false,
      });
      if (
        operation.towPlatformId &&
        state.seats[seatId]!.faction === "roaming_atoll" &&
        !state.seats[seatId]!.factionUses.towUsed
      ) {
        const platform = state.assets[operation.towPlatformId];
        if (
          platform?.kind === "platform" &&
          platform.ownerId === seatId &&
          platform.sectorId === asset.sectorId &&
          platform.state === "active"
        ) {
          towCandidates.push({ seatId, operation, ark: asset, platform });
        }
      }
    }
  }

  const occupiedAtStart = new Set(
    Object.values(state.assets)
      .filter((asset) => asset.kind === "platform")
      .map((asset) => asset.sectorId),
  );
  const towCounts = new Map<number, number>();
  for (const candidate of towCandidates)
    towCounts.set(
      candidate.operation.toSectorId,
      (towCounts.get(candidate.operation.toSectorId) ?? 0) + 1,
    );

  const firstRecords: MovementRecord[] = [];
  for (const item of firstLeg.sort((a, b) =>
    a.asset.id.localeCompare(b.asset.id),
  )) {
    const from = item.asset.sectorId;
    item.asset.sectorId = item.to;
    if (item.asset.kind === "submarine")
      item.asset.lastTravelFromSectorId = from;
    const record: MovementRecord = {
      assetId: item.asset.id,
      ownerId: item.seatId,
      fromSectorId: from,
      toSectorId: item.to,
      silent: item.silent,
      decoy: false,
    };
    firstRecords.push(record);
    allMovements.push(record);
    if (item.asset.kind === "ark") {
      emit(context, "ark.navigated", pulse, 3, "public", [], {
        assetId: item.asset.id,
        ownerId: item.seatId,
        fromSectorId: from,
        toSectorId: item.to,
      });
    } else if (!item.silent) {
      createWake(context, pulse, record);
    }
  }
  for (const candidate of towCandidates.sort((a, b) =>
    a.platform.id.localeCompare(b.platform.id),
  )) {
    if (
      occupiedAtStart.has(candidate.operation.toSectorId) ||
      towCounts.get(candidate.operation.toSectorId)! > 1
    ) {
      emit(context, "tow.failed", pulse, 3, "public", [], {
        platformId: candidate.platform.id,
        destinationSectorId: candidate.operation.toSectorId,
      });
      continue;
    }
    candidate.platform.sectorId = candidate.operation.toSectorId;
    state.seats[candidate.seatId]!.factionUses.towUsed = true;
    emit(context, "platform.towed", pulse, 3, "public", [], {
      platformId: candidate.platform.id,
      ownerId: candidate.seatId,
      toSectorId: candidate.platform.sectorId,
    });
  }
  triggerSnares(context, pulse, firstRecords, stopped);

  const secondRecords: MovementRecord[] = [];
  for (const [assetId, destination] of [...sprintSecond].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const asset = state.assets[assetId];
    if (
      asset?.kind !== "submarine" ||
      asset.status !== "active" ||
      stopped.has(assetId)
    )
      continue;
    const from = asset.sectorId;
    asset.sectorId = destination;
    asset.lastTravelFromSectorId = from;
    const record: MovementRecord = {
      assetId,
      ownerId: asset.ownerId,
      fromSectorId: from,
      toSectorId: destination,
      silent: false,
      decoy: false,
    };
    secondRecords.push(record);
    allMovements.push(record);
    createWake(context, pulse, record);
  }
  triggerSnares(context, pulse, secondRecords, stopped);
  const decoyMovements = moveDecoys(context, pulse);
  passiveSonar(context, pulse, [...allMovements, ...decoyMovements]);
}

function resolveJams(
  context: ResolveContext,
  pulse: Pulse,
  operations: Array<[SeatId, Operation]>,
): void {
  const targets: Array<{
    seatId: SeatId;
    operation: JamOperation;
    target: Platform;
  }> = [];
  for (const [seatId, operation] of operations) {
    if (operation.kind !== "jam") continue;
    const asset = assetReady(context.state, seatId, operation);
    const target = context.state.assets[operation.targetPlatformId];
    if (
      asset?.kind !== "submarine" ||
      target?.kind !== "platform" ||
      target.sectorId !== asset.sectorId
    )
      continue;
    if (!spendSignal(context.state, seatId, 1)) continue;
    targets.push({ seatId, operation, target });
  }
  for (const { target } of targets.sort((a, b) =>
    a.target.id.localeCompare(b.target.id),
  )) {
    target.state = target.state === "contested" ? "contested" : "jammed";
    target.jammedThroughForecastRound = context.state.round + 1;
    addEvidence(context, pulse, {
      kind: "disturbance",
      sectorId: target.sectorId,
      fromSectorId: null,
      toSectorId: null,
      ownerId: null,
      subjectId: target.id,
      confidence: "confirmed",
    });
    emit(context, "platform.jammed", pulse, 6, "public", [], {
      platformId: target.id,
      sectorId: target.sectorId,
    });
  }
}

function surveySector(
  context: ResolveContext,
  pulse: Pulse,
  seatId: SeatId,
  sectorId: number,
  disarm: boolean,
): void {
  const state = context.state;
  const site = state.sites[sectorId];
  if (site) {
    addObservation(context, pulse, {
      ownerId: seatId,
      source: "active_survey",
      sectorId,
      contactClass: "site",
      subjectId: site.stockSpecimenId,
      identitySeatId: null,
      specimenType: site.specimenType,
      contactCount: 1,
      direction: "still",
      confidence: 100,
    });
  }
  for (const sub of activeSubmarines(state).filter(
    (candidate) =>
      candidate.sectorId === sectorId && candidate.ownerId !== seatId,
  )) {
    addObservation(context, pulse, {
      ownerId: seatId,
      source: "active_survey",
      sectorId,
      contactClass: "submarine",
      subjectId: sub.id,
      identitySeatId: sub.ownerId,
      specimenType: null,
      contactCount: 1,
      direction: "still",
      confidence: 100,
    });
  }
  for (const device of Object.values(state.devices)
    .filter(
      (candidate) =>
        candidate.sectorId === sectorId &&
        candidate.ownerId !== seatId &&
        candidate.state === "armed",
    )
    .sort((a, b) => a.id.localeCompare(b.id))) {
    addObservation(context, pulse, {
      ownerId: seatId,
      source: "active_survey",
      sectorId,
      contactClass: device.kind,
      subjectId: device.id,
      identitySeatId: device.ownerId,
      specimenType: null,
      contactCount: 1,
      direction: "still",
      confidence: 100,
    });
    if (disarm && device.kind === "snare") {
      device.state = "consumed";
      emit(context, "snare.disarmed", pulse, 7, "public", [], {
        deviceId: device.id,
        ownerId: device.ownerId,
        sectorId,
      });
    }
  }
}

function resolveSurveys(
  context: ResolveContext,
  pulse: Pulse,
  operations: Array<[SeatId, Operation]>,
): void {
  for (const [seatId, operation] of operations) {
    if (operation.kind !== "survey") continue;
    const asset = assetReady(context.state, seatId, operation);
    if (!asset) continue;
    const preJamValid =
      asset.kind === "submarine" ||
      (asset.kind === "platform" && asset.module === "sonar");
    if (!preJamValid || !spendSignal(context.state, seatId, 1)) continue;
    if (asset.kind === "platform" && asset.state !== "active") {
      emit(context, "survey.suppressed", pulse, 7, "private", [seatId], {
        assetId: asset.id,
      });
      continue;
    }
    const seat = context.state.seats[seatId]!;
    let publicContact = true;
    if (
      operation.suppressPublicContact &&
      asset.kind === "submarine" &&
      seat.faction === "quiet_current" &&
      !seat.factionUses.quietContactSuppressed &&
      asset.silence > 0
    ) {
      asset.silence -= 1;
      seat.factionUses.quietContactSuppressed = true;
      publicContact = false;
    }
    if (publicContact) {
      addEvidence(context, pulse, {
        kind: "identified_contact",
        sectorId: asset.sectorId,
        fromSectorId: null,
        toSectorId: null,
        ownerId: seatId,
        subjectId: asset.id,
        confidence: "confirmed",
      });
      emit(context, "survey.ping", pulse, 7, "public", [], {
        ownerId: seatId,
        sectorId: asset.sectorId,
      });
    }
    surveySector(context, pulse, seatId, asset.sectorId, true);
    if (
      seat.faction === "echo_cartographers" &&
      !seat.factionUses.echoSurveyUsed
    ) {
      seat.factionUses.echoSurveyUsed = true;
      for (const adjacent of connectedSectors(
        context.state.map,
        asset.sectorId,
      ))
        surveySector(context, pulse, seatId, adjacent, false);
    }
    emit(context, "survey.result", pulse, 7, "private", [seatId], {
      sectorId: asset.sectorId,
    });
  }
}

type HuntTarget = Submarine | Decoy | null;

function huntTarget(
  state: RulesState,
  actorId: SeatId,
  operation: HuntOperation,
): HuntTarget {
  if (operation.targetEvidenceId) {
    const evidence = state.evidence[operation.targetEvidenceId];
    const observation = state.observations[operation.targetEvidenceId];
    const report = state.reports[operation.targetEvidenceId];
    const reportObservation =
      report?.kind === "sealed" &&
      state.reportGrants.some(
        (grant) => grant.reportId === report.id && grant.seatId === actorId,
      )
        ? state.observations[report.observationId]
        : undefined;
    const subjectId =
      evidence?.subjectId ??
      (observation?.ownerId === actorId ? observation.subjectId : null) ??
      reportObservation?.subjectId;
    if (subjectId) {
      const asset = state.assets[subjectId];
      if (
        asset?.kind === "submarine" &&
        asset.status === "active" &&
        asset.sectorId === operation.requiredSectorId
      )
        return asset;
      const device = state.devices[subjectId];
      if (
        device?.kind === "decoy" &&
        device.state === "armed" &&
        device.sectorId === operation.requiredSectorId
      )
        return device;
    }
  }
  if (operation.targetSeatId) {
    return (
      activeSubmarines(state, operation.targetSeatId)
        .filter((sub) => sub.sectorId === operation.requiredSectorId)
        .sort(
          (a, b) =>
            a.integrity - b.integrity || a.callSign.localeCompare(b.callSign),
        )[0] ?? null
    );
  }
  return null;
}

function arkForSeat(state: RulesState, seatId: SeatId): Ark {
  const ark = Object.values(state.assets).find(
    (asset): asset is Ark => asset.kind === "ark" && asset.ownerId === seatId,
  );
  if (!ark) throw new Error(`Missing Ark for ${seatId}`);
  return ark;
}

function applySubHit(
  context: ResolveContext,
  pulse: Pulse,
  target: Submarine,
  margin: number,
  actorId: SeatId,
): void {
  const origin = target.sectorId;
  if (margin >= 2) target.integrity = 0;
  else target.integrity -= 1;
  if (target.integrity <= 0) {
    for (const specimenId of [...target.cargo])
      dropSpecimen(context, target, specimenId, pulse, 8);
    target.status = "disabled";
    target.disabledAtRound = context.state.round;
    target.autoReturnRound =
      context.state.seats[target.ownerId]!.faction === "second_dawn"
        ? context.state.round + 1
        : context.state.round + 2;
    target.invalidatedForRound = context.state.round;
    target.usableFromRound = context.state.round + 2;
    target.sectorId = arkForSeat(context.state, target.ownerId).sectorId;
    emit(context, "submarine.disabled", pulse, 8, "public", [], {
      actorId,
      targetOwnerId: target.ownerId,
      targetId: target.id,
      sectorId: origin,
    });
  } else {
    const path = shortestPath(
      context.state.map,
      target.sectorId,
      arkForSeat(context.state, target.ownerId).sectorId,
    );
    const retreatSector =
      target.lastTravelFromSectorId &&
      areConnected(
        context.state.map,
        target.sectorId,
        target.lastTravelFromSectorId,
      )
        ? target.lastTravelFromSectorId
        : (path[1] ?? target.sectorId);
    target.sectorId = retreatSector;
    emit(context, "submarine.damaged", pulse, 8, "public", [], {
      actorId,
      targetOwnerId: target.ownerId,
      targetId: target.id,
      sectorId: origin,
      retreatSectorId: retreatSector,
      integrity: target.integrity,
    });
  }
}

interface ConflictIntent {
  seatId: SeatId;
  operation: HuntOperation | RaidOperation | ScreenOperation;
  asset: Submarine | Ark;
  force: number;
  target: HuntTarget | Platform | null;
}

function remainingSupplyReserve(
  state: RulesState,
  seatId: SeatId,
  pulse: Pulse,
): number {
  const program = state.programs[seatId];
  if (!program) return 0;
  let hadal =
    state.seats[seatId]!.faction === "hadal_engineers" &&
    !state.seats[seatId]!.factionUses.hadalDiscountUsed;
  let total = 0;
  for (const operation of program.operations.filter(
    (candidate) => candidate.pulse >= pulse,
  )) {
    total += operationSupplyCost(state, seatId, operation, hadal);
    if (
      operation.kind === "develop" &&
      operation.project.kind === "platform" &&
      hadal
    )
      hadal = false;
  }
  return total;
}

function resolveConflicts(
  context: ResolveContext,
  pulse: Pulse,
  operations: Array<[SeatId, Operation]>,
): void {
  const groups = new Map<number, ConflictIntent[]>();
  for (const [seatId, operation] of operations) {
    if (
      operation.kind !== "hunt" &&
      operation.kind !== "raid" &&
      operation.kind !== "screen"
    )
      continue;
    const asset = assetReady(context.state, seatId, operation);
    if (
      (asset?.kind !== "submarine" && asset?.kind !== "ark") ||
      (operation.kind !== "screen" && asset.kind !== "submarine")
    )
      continue;
    if (!spendSignal(context.state, seatId, operation.signalCommitment))
      continue;
    let target: HuntTarget | Platform | null = null;
    if (operation.kind === "hunt")
      target = huntTarget(context.state, seatId, operation);
    if (operation.kind === "raid") {
      const platform = context.state.assets[operation.targetPlatformId];
      if (
        platform?.kind === "platform" &&
        platform.ownerId !== seatId &&
        platform.sectorId === asset.sectorId
      )
        target = platform;
    }
    const force =
      1 + operation.signalCommitment + (operation.kind === "screen" ? 1 : 0);
    const intent: ConflictIntent = { seatId, operation, asset, force, target };
    const sector = asset.sectorId;
    groups.set(sector, [...(groups.get(sector) ?? []), intent]);
  }

  for (const [sectorId, intents] of [...groups].sort(([a], [b]) => a - b)) {
    const forces = new Map<SeatId, number>();
    for (const intent of intents)
      forces.set(
        intent.seatId,
        Math.max(forces.get(intent.seatId) ?? 0, intent.force),
      );
    const platformDefenseApplied = new Set<SeatId>();
    for (const intent of intents) {
      if (
        intent.operation.kind === "raid" &&
        intent.target?.kind === "platform" &&
        intent.target.state === "active"
      ) {
        forces.set(
          intent.target.ownerId,
          (forces.get(intent.target.ownerId) ?? 0) + 1,
        );
        platformDefenseApplied.add(intent.target.ownerId);
      }
      if (intent.operation.kind === "screen") {
        const ownPlatform = Object.values(context.state.assets).find(
          (asset) =>
            asset.kind === "platform" &&
            asset.ownerId === intent.seatId &&
            asset.sectorId === sectorId &&
            asset.state === "active",
        );
        if (ownPlatform && !platformDefenseApplied.has(intent.seatId)) {
          forces.set(intent.seatId, (forces.get(intent.seatId) ?? 0) + 1);
          platformDefenseApplied.add(intent.seatId);
        }
      }
    }
    const actualOpposition = intents.some(
      (intent) =>
        (intent.operation.kind === "raid" && intent.target !== null) ||
        (intent.operation.kind === "hunt" && intent.target !== null),
    );
    if (!actualOpposition) {
      for (const intent of intents.filter(
        (candidate) => candidate.operation.kind === "hunt",
      )) {
        emit(context, "hunt.missed", pulse, 8, "private", [intent.seatId], {
          sectorId,
        });
      }
      continue;
    }
    const orderedForces = [...forces.entries()].sort(
      ([seatA, forceA], [seatB, forceB]) =>
        forceB - forceA || seatA.localeCompare(seatB),
    );
    const high = orderedForces[0]?.[1] ?? 0;
    const tied = orderedForces
      .filter(([, force]) => force === high)
      .map(([seatId]) => seatId);
    emit(
      context,
      tied.length > 1 ? "conflict.tied" : "conflict.resolved",
      pulse,
      8,
      "public",
      [],
      {
        sectorId,
        forces: Object.fromEntries(
          [...forces].sort(([a], [b]) => a.localeCompare(b)),
        ),
        winnerId: tied.length === 1 ? tied[0]! : null,
      },
    );
    if (tied.length !== 1) continue;
    const winnerId = tied[0]!;
    const winnerIntent = intents.find((intent) => intent.seatId === winnerId);
    if (!winnerIntent) continue;
    const margin =
      high - (orderedForces.find(([seatId]) => seatId !== winnerId)?.[1] ?? 0);
    if (winnerIntent.operation.kind === "hunt") {
      const target = winnerIntent.target;
      if (target?.kind === "submarine") {
        applySubHit(context, pulse, target, margin, winnerId);
        recordHandshakeBreach(
          context,
          winnerId,
          target.ownerId,
          sectorId,
          pulse,
          "hunt",
        );
      } else if (target?.kind === "decoy") {
        target.state = "consumed";
        emit(context, "decoy.destroyed", pulse, 8, "public", [], {
          deviceId: target.id,
          ownerId: target.ownerId,
          actorId: winnerId,
          sectorId,
        });
      }
    } else if (
      winnerIntent.operation.kind === "raid" &&
      winnerIntent.target?.kind === "platform"
    ) {
      const target = winnerIntent.target;
      target.state = "contested";
      target.jammedThroughForecastRound = null;
      context.state.contests[target.id] = {
        platformId: target.id,
        contenderId: winnerId,
        contestedSinceRound: context.state.round,
        transferEligibleRound: context.state.round + 1,
      };
      emit(context, "platform.contested", pulse, 8, "public", [], {
        actorId: winnerId,
        targetOwnerId: target.ownerId,
        platformId: target.id,
        sectorId,
      });
      if (margin >= 2) {
        const victim = context.state.seats[target.ownerId]!;
        const stealable = Math.max(
          0,
          victim.supply -
            remainingSupplyReserve(context.state, target.ownerId, pulse),
        );
        if (
          stealable > 0 &&
          context.state.seats[winnerId]!.supply < RESOURCE_CAP
        ) {
          victim.supply -= 1;
          context.state.seats[winnerId]!.supply += 1;
          emit(context, "supply.stolen", pulse, 8, "public", [], {
            actorId: winnerId,
            targetOwnerId: target.ownerId,
            amount: 1,
          });
        }
      }
      recordHandshakeBreach(
        context,
        winnerId,
        target.ownerId,
        sectorId,
        pulse,
        "raid",
      );
    } else if (
      winnerIntent.operation.kind === "screen" &&
      winnerIntent.operation.counterTargetSeatId
    ) {
      const counterTargetSeatId = winnerIntent.operation.counterTargetSeatId;
      const hostile = intents.find(
        (intent) =>
          intent.seatId === counterTargetSeatId &&
          intent.asset.kind === "submarine",
      );
      if (hostile?.asset.kind === "submarine")
        applySubHit(context, pulse, hostile.asset, margin, winnerId);
    }
  }
}

function resolveDevelop(
  context: ResolveContext,
  pulse: Pulse,
  operations: Array<[SeatId, Operation]>,
): void {
  const platformCandidates = new Map<
    number,
    Array<{
      seatId: SeatId;
      operation: Extract<Operation, { kind: "develop" }>;
      ark: Ark;
    }>
  >();
  const other: Array<{
    seatId: SeatId;
    operation: Extract<Operation, { kind: "develop" }>;
    ark: Ark;
  }> = [];
  for (const [seatId, operation] of operations) {
    if (operation.kind !== "develop") continue;
    const asset = assetReady(context.state, seatId, operation);
    if (asset?.kind !== "ark") continue;
    const candidate = { seatId, operation, ark: asset };
    if (operation.project.kind === "platform") {
      platformCandidates.set(asset.sectorId, [
        ...(platformCandidates.get(asset.sectorId) ?? []),
        candidate,
      ]);
    } else other.push(candidate);
  }
  for (const [sectorId, candidates] of [...platformCandidates].sort(
    ([a], [b]) => a - b,
  )) {
    const occupied = Object.values(context.state.assets).some(
      (asset) => asset.kind === "platform" && asset.sectorId === sectorId,
    );
    if (occupied || candidates.length !== 1) {
      emit(context, "develop.anchor_interference", pulse, 9, "public", [], {
        sectorId,
        builderCount: candidates.length,
      });
      continue;
    }
    const candidate = candidates[0]!;
    const seat = context.state.seats[candidate.seatId]!;
    const ownedPlatformCount = Object.values(context.state.assets).filter(
      (asset) =>
        asset.kind === "platform" && asset.ownerId === candidate.seatId,
    ).length;
    if (ownedPlatformCount >= 4) {
      emit(
        context,
        "develop.platform_cap",
        pulse,
        9,
        "private",
        [candidate.seatId],
        { sectorId },
      );
      continue;
    }
    const cost = developProjectCost(
      context.state,
      candidate.seatId,
      candidate.operation.project,
    );
    if (!spendSupply(context.state, candidate.seatId, cost)) continue;
    const project = candidate.operation.project;
    if (project.kind !== "platform") continue;
    const id = unusedEntityId(
      context.state,
      project.projectId,
      `platform-${candidate.seatId}`,
    );
    context.state.assets[id] = {
      kind: "platform",
      id,
      ownerId: candidate.seatId,
      sectorId,
      module: project.module,
      state: "active",
      jammedThroughForecastRound: null,
      reactivatesAtForecastRound: null,
    };
    if (
      seat.faction === "hadal_engineers" &&
      !seat.factionUses.hadalDiscountUsed
    )
      seat.factionUses.hadalDiscountUsed = true;
    emit(context, "platform.built", pulse, 9, "public", [], {
      platformId: id,
      ownerId: candidate.seatId,
      sectorId,
      module: project.module,
      cost,
    });
  }

  for (const candidate of other.sort((a, b) =>
    a.seatId.localeCompare(b.seatId),
  )) {
    const { seatId, operation, ark } = candidate;
    if (operation.project.kind === "submarine") {
      const subs = Object.values(context.state.assets).filter(
        (asset) => asset.kind === "submarine" && asset.ownerId === seatId,
      );
      if (subs.length >= 2 || !spendSupply(context.state, seatId, 4)) continue;
      const id = unusedEntityId(
        context.state,
        operation.project.projectId ?? externalId("sub", seatId, "b"),
        externalId("sub", seatId, "b"),
      );
      context.state.assets[id] = {
        kind: "submarine",
        id,
        ownerId: seatId,
        callSign: "B-2",
        sectorId: ark.sectorId,
        integrity: 2,
        maxIntegrity: 2,
        silence:
          context.state.seats[seatId]!.faction === "quiet_current" ? 3 : 2,
        maxSilence:
          context.state.seats[seatId]!.faction === "quiet_current" ? 3 : 2,
        cargo: [],
        status: "constructing",
        disabledAtRound: null,
        autoReturnRound: null,
        usableFromRound: context.state.round + 1,
        lastTravelFromSectorId: null,
        invalidatedForRound: null,
      };
      emit(context, "submarine.constructing", pulse, 9, "public", [], {
        assetId: id,
        ownerId: seatId,
        sectorId: ark.sectorId,
      });
    } else if (operation.project.kind === "repair_submarine") {
      const sub = context.state.assets[operation.project.submarineId];
      if (
        sub?.kind !== "submarine" ||
        sub.ownerId !== seatId ||
        sub.sectorId !== ark.sectorId ||
        !spendSupply(context.state, seatId, 1)
      )
        continue;
      if (sub.status === "disabled") {
        sub.status = "active";
        sub.integrity = 1;
        sub.autoReturnRound = null;
        sub.disabledAtRound = null;
        sub.usableFromRound = context.state.round + 1;
        sub.invalidatedForRound = context.state.round;
      } else if (sub.status === "active" && sub.integrity < 2) {
        sub.integrity += 1;
      } else {
        context.state.seats[seatId]!.supply += 1;
        continue;
      }
      emit(context, "submarine.repaired", pulse, 9, "public", [], {
        assetId: sub.id,
        ownerId: seatId,
        integrity: sub.integrity,
      });
    }
  }
}

function resolveDeploy(
  context: ResolveContext,
  pulse: Pulse,
  operations: Array<[SeatId, Operation]>,
): void {
  for (const [seatId, operation] of operations) {
    if (operation.kind !== "deploy") continue;
    const asset = assetReady(context.state, seatId, operation);
    if (asset?.kind !== "submarine") continue;
    const activeCount = Object.values(context.state.devices).filter(
      (device) => device.ownerId === seatId && device.state !== "consumed",
    ).length;
    if (activeCount >= 2) continue;
    const seat = context.state.seats[seatId]!;
    if (seat.deviceInventory[operation.device] > 0)
      seat.deviceInventory[operation.device] -= 1;
    else if (
      !spendSupply(context.state, seatId, 1) ||
      !spendSignal(context.state, seatId, 1)
    )
      continue;
    const id = unusedEntityId(
      context.state,
      operation.deviceId,
      `device-${seatId}`,
    );
    const armsCurrentRound = pulse < 3;
    if (operation.device === "snare") {
      context.state.devices[id] = {
        kind: "snare",
        id,
        ownerId: seatId,
        sectorId: asset.sectorId,
        mode: operation.snareMode ?? "tag",
        state: "armed",
        armedFromPulse: armsCurrentRound ? ((pulse + 1) as Pulse) : null,
        armedFromRound: armsCurrentRound
          ? context.state.round
          : context.state.round + 1,
      };
    } else {
      context.state.devices[id] = {
        kind: "decoy",
        id,
        ownerId: seatId,
        sectorId: asset.sectorId,
        route: [...(operation.decoyRoute ?? [])],
        routeIndex: 0,
        state: "armed",
        armedFromPulse: armsCurrentRound ? ((pulse + 1) as Pulse) : null,
        armedFromRound: armsCurrentRound
          ? context.state.round
          : context.state.round + 1,
        expiresAfterRound: context.state.round + 1,
      };
    }
    emit(context, "device.deployed", pulse, 9, "private", [seatId], {
      deviceId: id,
      device: operation.device,
      sectorId: asset.sectorId,
    });
  }
}

function resolveHarvest(
  context: ResolveContext,
  pulse: Pulse,
  operations: Array<[SeatId, Operation]>,
): void {
  const groups = new Map<
    string,
    Array<{
      seatId: SeatId;
      operation: HarvestOperation;
      sub: Submarine;
      force: number;
      suppressed: boolean;
    }>
  >();
  for (const [seatId, operation] of operations) {
    if (operation.kind !== "harvest") continue;
    const asset = assetReady(context.state, seatId, operation);
    if (asset?.kind !== "submarine" || asset.cargo.length >= 2) continue;
    if (!spendSignal(context.state, seatId, operation.signalCommitment))
      continue;
    let suppressed = false;
    const seat = context.state.seats[seatId]!;
    if (
      operation.suppressPublicContact &&
      seat.faction === "quiet_current" &&
      !seat.factionUses.quietContactSuppressed &&
      asset.silence > 0
    ) {
      asset.silence -= 1;
      seat.factionUses.quietContactSuppressed = true;
      suppressed = true;
    }
    const entry = {
      seatId,
      operation,
      sub: asset,
      force: 1 + operation.signalCommitment,
      suppressed,
    };
    groups.set(operation.targetId, [
      ...(groups.get(operation.targetId) ?? []),
      entry,
    ]);
  }
  for (const [targetId, contenders] of [...groups].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    let specimenId: string | null = null;
    let sectorId = contenders[0]!.sub.sectorId;
    if (targetId.startsWith("site:")) {
      const requestedSector = Number(targetId.slice(5));
      if (requestedSector === sectorId)
        specimenId =
          context.state.sites[requestedSector]?.stockSpecimenId ?? null;
    } else {
      const salvage = context.state.salvage[targetId];
      if (salvage?.sectorId === sectorId) specimenId = salvage.specimenId;
    }
    for (const contender of contenders.filter(
      (candidate) => !candidate.suppressed,
    )) {
      addEvidence(context, pulse, {
        kind: "contact",
        sectorId,
        fromSectorId: null,
        toSectorId: null,
        ownerId: null,
        subjectId: contender.sub.id,
        confidence: "partial",
      });
    }
    const visibleContactCount = contenders.filter(
      (candidate) => !candidate.suppressed,
    ).length;
    if (visibleContactCount > 0)
      emit(context, "harvest.contact", pulse, 10, "public", [], {
        sectorId,
        targetId,
        contactCount: visibleContactCount,
      });
    if (!specimenId) {
      for (const contender of contenders)
        emit(
          context,
          "harvest.empty",
          pulse,
          10,
          "private",
          [contender.seatId],
          { targetId },
        );
      continue;
    }
    const high = Math.max(...contenders.map((contender) => contender.force));
    const leaders = contenders
      .filter((contender) => contender.force === high)
      .sort((a, b) => a.seatId.localeCompare(b.seatId));
    if (leaders.length !== 1) {
      emit(context, "harvest.tied", pulse, 10, "public", [], {
        sectorId,
        participantIds: contenders
          .filter((contender) => !contender.suppressed)
          .map((contender) => contender.seatId)
          .sort(),
      });
      continue;
    }
    const winner = leaders[0]!;
    winner.sub.cargo.push(specimenId);
    context.state.specimens[specimenId]!.knownTo = [
      ...new Set([
        ...context.state.specimens[specimenId]!.knownTo,
        winner.seatId,
      ]),
    ].sort();
    addObservation(context, pulse, {
      ownerId: winner.seatId,
      source: "harvest",
      sectorId,
      contactClass: "site",
      subjectId: specimenId,
      identitySeatId: null,
      specimenType: context.state.specimens[specimenId]!.type,
      contactCount: 1,
      direction: "still",
      confidence: 100,
    });
    if (targetId.startsWith("site:"))
      context.state.sites[sectorId]!.stockSpecimenId = null;
    else delete context.state.salvage[targetId];
    emit(context, "harvest.acquired", pulse, 10, "private", [winner.seatId], {
      specimenId,
      sectorId,
      targetId,
    });
  }
}

function resolveAnalyzeAndRecovery(
  context: ResolveContext,
  pulse: Pulse,
  operations: Array<[SeatId, Operation]>,
): void {
  for (const [seatId, operation] of operations) {
    if (operation.kind === "analyze") {
      const asset = assetReady(context.state, seatId, operation);
      if (
        asset?.kind !== "submarine" ||
        !asset.cargo.includes(operation.specimenId)
      )
        continue;
      const lab = Object.values(context.state.assets).find(
        (candidate) =>
          candidate.kind === "platform" &&
          candidate.ownerId === seatId &&
          candidate.sectorId === asset.sectorId &&
          candidate.module === "laboratory" &&
          candidate.state === "active",
      );
      if (!lab) continue;
      asset.cargo = asset.cargo.filter((id) => id !== operation.specimenId);
      context.state.seats[seatId]!.analyzedSpecimenIds.push(
        operation.specimenId,
      );
      emit(context, "specimen.analyzed", pulse, 11, "public", [], {
        ownerId: seatId,
        analyzedCount: context.state.seats[seatId]!.analyzedSpecimenIds.length,
      });
      emit(
        context,
        "specimen.analyzed_private",
        pulse,
        11,
        "private",
        [seatId],
        {
          specimenId: operation.specimenId,
          specimenType: context.state.specimens[operation.specimenId]!.type,
        },
      );
    } else if (operation.kind === "go_dark") {
      const asset = assetReady(context.state, seatId, operation);
      if (asset?.kind !== "submarine") continue;
      asset.silence = asset.maxSilence;
      for (const evidence of Object.values(context.state.evidence)) {
        if (evidence.subjectId === asset.id)
          evidence.expiresAtForecastRound = Math.min(
            evidence.expiresAtForecastRound,
            context.state.round + 1,
          );
      }
      emit(context, "submarine.dark", pulse, 11, "private", [seatId], {
        assetId: asset.id,
      });
    } else if (operation.kind === "hold" && operation.assetId) {
      const asset = assetReady(context.state, seatId, operation);
      if (asset?.kind === "submarine")
        asset.silence = Math.min(asset.maxSilence, asset.silence + 1);
    }
  }
}

function applySecondDawnSalvage(context: ResolveContext, pulse: Pulse): void {
  for (const seatId of sortedSeatIds(context.state)) {
    const seat = context.state.seats[seatId]!;
    if (
      seat.faction !== "second_dawn" ||
      seat.factionUses.secondDawnSalvageUsed
    )
      continue;
    const priority =
      context.state.programs[seatId]?.secondDawnSalvagePriority ?? [];
    const salvageItems = Object.values(context.state.salvage).sort((a, b) => {
      const aIndex = priority.indexOf(a.id);
      const bIndex = priority.indexOf(b.id);
      return (
        (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) -
          (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex) ||
        a.id.localeCompare(b.id)
      );
    });
    const subs = activeSubmarines(context.state, seatId).filter(
      (sub) => sub.cargo.length < 2,
    );
    let claimed = false;
    for (const salvage of salvageItems) {
      const sub = subs.find(
        (candidate) =>
          candidate.sectorId === salvage.sectorId ||
          areConnected(context.state.map, candidate.sectorId, salvage.sectorId),
      );
      if (!sub) continue;
      sub.cargo.push(salvage.specimenId);
      context.state.specimens[salvage.specimenId]!.knownTo = [
        ...new Set([
          ...context.state.specimens[salvage.specimenId]!.knownTo,
          seatId,
        ]),
      ].sort();
      delete context.state.salvage[salvage.id];
      seat.factionUses.secondDawnSalvageUsed = true;
      emit(context, "salvage.recovered", pulse, 12, "private", [seatId], {
        salvageId: salvage.id,
        specimenId: salvage.specimenId,
        assetId: sub.id,
      });
      claimed = true;
      break;
    }
    if (claimed) continue;
  }
}

function payCommissions(
  context: ResolveContext,
  pulse: Pulse,
  eventStart: number,
): void {
  for (const commission of Object.values(context.state.commission)
    .filter((candidate) => !candidate.claimed)
    .sort((a, b) => a.targetSeatId.localeCompare(b.targetSeatId))) {
    const qualifying = new Set<SeatId>();
    for (const event of context.events.slice(eventStart)) {
      if (
        ![
          "submarine.damaged",
          "submarine.disabled",
          "platform.contested",
        ].includes(event.kind)
      )
        continue;
      if (event.data.targetOwnerId !== commission.targetSeatId) continue;
      const actorId = event.data.actorId;
      if (typeof actorId === "string" && actorId !== commission.targetSeatId)
        qualifying.add(actorId);
    }
    if (qualifying.size === 0) continue;
    commission.claimed = true;
    commission.qualifyingSeatIds = [...qualifying].sort();
    for (const seatId of commission.qualifyingSeatIds)
      context.state.seats[seatId]!.supply = Math.min(
        RESOURCE_CAP,
        context.state.seats[seatId]!.supply + 1,
      );
    emit(context, "commission.claimed", pulse, 13, "public", [], {
      targetSeatId: commission.targetSeatId,
      claimantIds: commission.qualifyingSeatIds,
      rewardEach: 1,
    });
  }
}

function resolvePulse(context: ResolveContext, pulse: Pulse): void {
  const eventStart = context.events.length;
  const operations = operationBySeat(context.state, pulse);
  resolveMovement(context, pulse, operations);
  resolveJams(context, pulse, operations);
  resolveSurveys(context, pulse, operations);
  resolveConflicts(context, pulse, operations);
  resolveDevelop(context, pulse, operations);
  resolveDeploy(context, pulse, operations);
  resolveHarvest(context, pulse, operations);
  resolveAnalyzeAndRecovery(context, pulse, operations);
  applySecondDawnSalvage(context, pulse);
  payCommissions(context, pulse, eventStart);
}

export function resolveRound(
  state: RulesState,
  programs?: Record<SeatId, ThreePulseProgram>,
): RoundResolution {
  const next = structuredClone(state);
  if (next.phase !== "planning")
    throw new Error("Round resolution can only begin during planning");
  const submitted = programs ?? next.programs;
  next.programs = {};
  next.programEscrows = {};
  for (const seatId of sortedSeatIds(next)) {
    const program = submitted[seatId] ?? defaultProgram(seatId);
    const validation = validateProgram(next, seatId, program);
    if (!validation.valid) {
      throw new Error(
        `Invalid program for ${seatId}: ${validation.issues.map((issue) => issue.code).join(", ")}`,
      );
    }
    next.programs[seatId] = structuredClone(program);
    next.programEscrows[seatId] = {
      supply: validation.reservedSupply,
      signal: validation.reservedSignal,
    };
  }
  next.phase = "resolving";
  const context: ResolveContext = { state: next, events: [], ordinal: 1 };
  const pulseStates = {} as Record<Pulse, RulesState>;
  resolvePulse(context, 1);
  pulseStates[1] = structuredClone(next);
  resolvePulse(context, 2);
  pulseStates[2] = structuredClone(next);
  resolvePulse(context, 3);
  pulseStates[3] = structuredClone(next);
  next.programEscrows = {};
  next.phase = "claim";
  context.events.sort(
    (a, b) =>
      (a.pulse ?? 0) - (b.pulse ?? 0) ||
      a.stage - b.stage ||
      a.ordinal - b.ordinal ||
      a.id.localeCompare(b.id),
  );
  context.events.forEach((event, index) => {
    event.ordinal = index + 1;
    event.id = externalId(
      "event",
      `r${next.round}`,
      `p${event.pulse ?? 0}`,
      `s${event.stage}`,
      `n${index + 1}`,
    );
  });
  return { stateAfter: next, events: context.events, pulseStates };
}

export function freezeRoundInput(
  state: RulesState,
  programs: Record<SeatId, ThreePulseProgram> = state.programs,
): RoundInput {
  if (state.phase !== "planning")
    throw new Error("Only Planning state can be frozen for resolution");
  return {
    rulesVersion: state.rulesVersion,
    matchSeed: state.seed,
    round: state.round,
    stateBefore: structuredClone(state),
    programsBySeat: structuredClone(programs),
  };
}

export function resolveRoundInput(input: RoundInput): RoundResolution {
  if (
    input.rulesVersion !== input.stateBefore.rulesVersion ||
    input.matchSeed !== input.stateBefore.seed ||
    input.round !== input.stateBefore.round
  ) {
    throw new Error("RoundInput metadata does not match stateBefore");
  }
  return resolveRound(input.stateBefore, input.programsBySeat);
}
