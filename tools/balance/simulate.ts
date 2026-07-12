import {
  assertRulesInvariants,
  connectedSectors,
  createMatch,
  defaultProgram,
  externalId,
  forwardReport,
  isThreat,
  resolveRound,
  runClaimCheck,
  runForecast,
  sealObservation,
  seedPrng,
  settleAtomicTrade,
  shortestPath,
  shuffled,
  validateProgram,
  type Ark,
  type ModuleKind,
  type Operation,
  type Platform,
  type Pulse,
  type RulesState,
  type SealedReport,
  type SeatId,
  type SpecimenType,
  type Submarine,
  type ThreePulseProgram,
} from "../../packages/game-core/src/index.js";

type Strategy =
  "network" | "discovery" | "dominion" | "interdictor" | "broker" | "adaptive";

interface SocialStats {
  atomicTrades: number;
  specimenTransfers: number;
  reportTransfers: number;
  reportsSealed: number;
}

interface SimulationSummary {
  matches: number;
  playerCount: number;
  factionsEnabled: boolean;
  endedByCharter: number;
  endedByFallback: number;
  averageFinishRound: number;
  winnerSeats: Record<string, number>;
  charterWins: Record<string, number>;
  strategyWins: Record<Strategy, number>;
  strategyAssignments: Record<Strategy, number>;
  factionWins: Record<string, number>;
  factionAssignments: Record<string, number>;
  social: SocialStats;
  invalidBotPrograms: number;
  invalidBotProgramReasons: Record<string, number>;
  diagnostics: string[];
}

function ownedArk(state: RulesState, seatId: SeatId): Ark {
  return Object.values(state.assets).find(
    (asset): asset is Ark => asset.kind === "ark" && asset.ownerId === seatId,
  )!;
}

function ownedSub(state: RulesState, seatId: SeatId): Submarine | null {
  return (
    Object.values(state.assets)
      .filter(
        (asset): asset is Submarine =>
          asset.kind === "submarine" &&
          asset.ownerId === seatId &&
          asset.status === "active" &&
          asset.usableFromRound <= state.round,
      )
      .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null
  );
}

function platforms(state: RulesState, seatId?: SeatId): Platform[] {
  return Object.values(state.assets)
    .filter(
      (asset): asset is Platform =>
        asset.kind === "platform" &&
        (seatId === undefined || asset.ownerId === seatId),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

function navigate(ark: Ark, pulse: Pulse, destination: number): Operation {
  return {
    kind: "navigate",
    pulse,
    assetId: ark.id,
    requiredSectorId: ark.sectorId,
    toSectorId: destination,
  };
}

function hold(pulse: Pulse, assetId?: string, sectorId?: number): Operation {
  return assetId && sectorId !== undefined
    ? { kind: "hold", pulse, assetId, requiredSectorId: sectorId }
    : { kind: "hold", pulse };
}

function nearestPath(
  state: RulesState,
  from: number,
  targets: number[],
): number[] {
  return (
    targets
      .map((target) => shortestPath(state.map, from, target))
      .filter((path) => path.length > 0)
      .sort(
        (a, b) => a.length - b.length || a.join(",").localeCompare(b.join(",")),
      )[0] ?? []
  );
}

function activeSubs(state: RulesState, seatId?: SeatId): Submarine[] {
  return Object.values(state.assets)
    .filter(
      (asset): asset is Submarine =>
        asset.kind === "submarine" &&
        asset.status === "active" &&
        asset.usableFromRound <= state.round &&
        (seatId === undefined || asset.ownerId === seatId),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

function heldSpecimenTypes(
  state: RulesState,
  seatId: SeatId,
): Set<SpecimenType> {
  const specimenIds = [
    ...state.seats[seatId]!.analyzedSpecimenIds,
    ...activeSubs(state, seatId).flatMap((submarine) => submarine.cargo),
  ];
  return new Set(
    specimenIds.flatMap((specimenId) => {
      const specimen = state.specimens[specimenId];
      return specimen ? [specimen.type] : [];
    }),
  );
}

function knownSiteTypes(
  state: RulesState,
  seatId: SeatId,
): Map<number, SpecimenType> {
  const result = new Map<number, SpecimenType>();
  for (const observation of Object.values(state.observations)) {
    if (
      observation.ownerId === seatId &&
      observation.contactClass === "site" &&
      observation.specimenType !== null
    ) {
      result.set(observation.sectorId, observation.specimenType);
    }
  }
  const granted = new Set(
    state.reportGrants
      .filter((grant) => grant.seatId === seatId)
      .map((grant) => grant.reportId),
  );
  for (const report of Object.values(state.reports)) {
    if (
      report.kind !== "sealed" ||
      !granted.has(report.id) ||
      !report.fields.includes("sectorId") ||
      !report.fields.includes("specimenType")
    )
      continue;
    const observation = state.observations[report.observationId];
    if (observation?.specimenType)
      result.set(observation.sectorId, observation.specimenType);
  }
  return result;
}

function emptySocialStats(): SocialStats {
  return {
    atomicTrades: 0,
    specimenTransfers: 0,
    reportTransfers: 0,
    reportsSealed: 0,
  };
}

function addSocialStats(target: SocialStats, source: SocialStats): void {
  target.atomicTrades += source.atomicTrades;
  target.specimenTransfers += source.specimenTransfers;
  target.reportTransfers += source.reportTransfers;
  target.reportsSealed += source.reportsSealed;
}

function runBotSocialPhase(
  initial: RulesState,
  strategies: Record<SeatId, Strategy>,
): { state: RulesState; stats: SocialStats } {
  let state = initial;
  const stats = emptySocialStats();
  const tradedSeats = new Set<SeatId>();
  const seatIds = Object.keys(state.seats).sort();
  const brokers = seatIds.filter(
    (seatId) =>
      strategies[seatId] === "broker" ||
      state.seats[seatId]!.faction === "concord_relay",
  );

  // Brokers turn recent observations into durable, tradeable packets.
  for (const brokerId of brokers) {
    const alreadySealed = new Set(
      Object.values(state.reports).flatMap((report) =>
        report.kind === "sealed" ? [report.observationId] : [],
      ),
    );
    const candidates = Object.values(state.observations)
      .filter(
        (observation) =>
          observation.ownerId === brokerId &&
          !alreadySealed.has(observation.id),
      )
      .sort(
        (a, b) =>
          Number(b.specimenType !== null) - Number(a.specimenType !== null) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 2);
    for (const observation of candidates) {
      state = sealObservation(state, brokerId, observation.id).stateAfter;
      stats.reportsSealed += 1;
    }
  }

  // Sell useful verified site intel to Discovery seats. If the buyer is short
  // on Supply, forwarding it free still exercises the information economy.
  for (const brokerId of brokers) {
    let movedReport = false;
    const possessed = new Set(
      state.reportGrants
        .filter((grant) => grant.seatId === brokerId)
        .map((grant) => grant.reportId),
    );
    const reports = Object.values(state.reports)
      .filter(
        (report): report is SealedReport =>
          report.kind === "sealed" &&
          possessed.has(report.id) &&
          report.fields.includes("specimenType"),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const recipientId of seatIds.filter(
      (seatId) =>
        seatId !== brokerId &&
        (strategies[seatId] === "discovery" || strategies[seatId] === "broker"),
    )) {
      const known = knownSiteTypes(state, recipientId);
      const report = reports.find((candidate) => {
        if (
          state.reportGrants.some(
            (grant) =>
              grant.reportId === candidate.id && grant.seatId === recipientId,
          )
        )
          return false;
        const observation = state.observations[candidate.observationId];
        return (
          observation?.specimenType !== null &&
          observation?.specimenType !== undefined &&
          known.get(observation.sectorId) !== observation.specimenType
        );
      });
      if (!report) continue;
      if (
        state.seats[recipientId]!.supply >= 5 &&
        state.seats[brokerId]!.supply < 99
      ) {
        state = settleAtomicTrade(
          state,
          externalId("sim-intel-trade", state.round, brokerId, recipientId),
          [
            {
              kind: "report",
              fromSeatId: brokerId,
              toSeatId: recipientId,
              reportId: report.id,
            },
            {
              kind: "supply",
              fromSeatId: recipientId,
              toSeatId: brokerId,
              amount: 1,
            },
          ],
        ).stateAfter;
        stats.atomicTrades += 1;
        tradedSeats.add(brokerId);
        tradedSeats.add(recipientId);
      } else {
        state = forwardReport(
          state,
          brokerId,
          recipientId,
          report.id,
        ).stateAfter;
      }
      stats.reportTransfers += 1;
      movedReport = true;
      break;
    }
    if (movedReport) continue;
  }

  // Discovery seats buy missing physical types when a carrier is actually
  // co-located. Gifts remain legal when the buyer cannot afford the 1 Supply.
  for (const recipientId of seatIds.filter(
    (seatId) =>
      strategies[seatId] === "discovery" || strategies[seatId] === "broker",
  )) {
    const missing = new Set<SpecimenType>([
      "ribbon_filter",
      "prism_raft",
      "luminous_pollen",
    ]);
    for (const type of heldSpecimenTypes(state, recipientId))
      missing.delete(type);
    if (missing.size === 0) continue;
    const receivers = activeSubs(state, recipientId).filter(
      (submarine) => submarine.cargo.length < 2,
    );
    const choice = receivers
      .flatMap((receiver) =>
        activeSubs(state)
          .filter(
            (donor) =>
              donor.ownerId !== recipientId &&
              donor.sectorId === receiver.sectorId,
          )
          .flatMap((donor) =>
            donor.cargo.flatMap((specimenId) => {
              const specimen = state.specimens[specimenId];
              if (!specimen || !missing.has(specimen.type)) return [];
              const donorNeedsType =
                strategies[donor.ownerId] === "discovery" &&
                !state.seats[donor.ownerId]!.analyzedSpecimenIds.some(
                  (analyzedId) =>
                    state.specimens[analyzedId]?.type === specimen.type,
                ) &&
                donor.cargo.filter(
                  (cargoId) => state.specimens[cargoId]?.type === specimen.type,
                ).length < 2;
              return donorNeedsType
                ? []
                : [{ receiver, donor, specimenId, type: specimen.type }];
            }),
          ),
      )
      .sort(
        (a, b) =>
          a.type.localeCompare(b.type) ||
          a.donor.id.localeCompare(b.donor.id) ||
          a.receiver.id.localeCompare(b.receiver.id),
      )[0];
    if (!choice) continue;
    const transfers = [
      {
        kind: "specimen" as const,
        fromSeatId: choice.donor.ownerId,
        toSeatId: recipientId,
        fromSubmarineId: choice.donor.id,
        toSubmarineId: choice.receiver.id,
        specimenId: choice.specimenId,
      },
    ];
    const paid =
      state.seats[recipientId]!.supply > 0 &&
      state.seats[choice.donor.ownerId]!.supply < 99;
    state = settleAtomicTrade(
      state,
      externalId(
        "sim-specimen-trade",
        state.round,
        choice.donor.ownerId,
        recipientId,
      ),
      paid
        ? [
            ...transfers,
            {
              kind: "supply" as const,
              fromSeatId: recipientId,
              toSeatId: choice.donor.ownerId,
              amount: 1,
            },
          ]
        : transfers,
    ).stateAfter;
    stats.atomicTrades += 1;
    stats.specimenTransfers += 1;
    tradedSeats.add(recipientId);
    tradedSeats.add(choice.donor.ownerId);
  }

  // A Concord/broker with no other deal makes a mutually useful 1-for-1
  // exchange: it pays Supply for Signal and receives its faction rebate.
  for (const brokerId of brokers) {
    if (tradedSeats.has(brokerId)) continue;
    const peerId = seatIds.find(
      (seatId) =>
        seatId !== brokerId &&
        state.seats[seatId]!.signal > 0 &&
        state.seats[seatId]!.supply < 99,
    );
    if (
      !peerId ||
      state.seats[brokerId]!.supply < 2 ||
      state.seats[brokerId]!.signal >= 99
    )
      continue;
    state = settleAtomicTrade(
      state,
      externalId("sim-broker-swap", state.round, brokerId, peerId),
      [
        {
          kind: "supply",
          fromSeatId: brokerId,
          toSeatId: peerId,
          amount: 1,
        },
        {
          kind: "signal",
          fromSeatId: peerId,
          toSeatId: brokerId,
          amount: 1,
        },
      ],
    ).stateAfter;
    stats.atomicTrades += 1;
    tradedSeats.add(brokerId);
    tradedSeats.add(peerId);
  }

  return { state, stats };
}

function planNetwork(state: RulesState, seatId: SeatId): ThreePulseProgram {
  const shadow = structuredClone(state);
  const seat = shadow.seats[seatId]!;
  const ark = ownedArk(shadow, seatId);
  const operations: Operation[] = [];
  let hypotheticalPlatforms = platforms(shadow, seatId).length;
  let discount =
    seat.faction === "hadal_engineers" && !seat.factionUses.hadalDiscountUsed;
  const modules: ModuleKind[] = [
    "extractor",
    "sonar",
    "laboratory",
    "extractor",
  ];

  for (let value = 1; value <= 3; value += 1) {
    const pulse = value as Pulse;
    const occupied = platforms(shadow).some(
      (platform) => platform.sectorId === ark.sectorId,
    );
    const cost = discount ? 2 : 3;
    if (!occupied && hypotheticalPlatforms < 4 && seat.supply >= cost) {
      const module = modules[hypotheticalPlatforms] ?? "extractor";
      operations.push({
        kind: "develop",
        pulse,
        assetId: ark.id,
        requiredSectorId: ark.sectorId,
        project: {
          kind: "platform",
          module,
          projectId: externalId("bot-platform", seatId, state.round, pulse),
        },
      });
      const shadowPlatformId = externalId("shadow-platform", pulse);
      shadow.assets[shadowPlatformId] = {
        kind: "platform",
        id: shadowPlatformId,
        ownerId: seatId,
        sectorId: ark.sectorId,
        module,
        state: "active",
        jammedThroughForecastRound: null,
        reactivatesAtForecastRound: null,
      };
      hypotheticalPlatforms += 1;
      seat.supply -= cost;
      discount = false;
      continue;
    }
    if (!occupied) {
      operations.push(hold(pulse, ark.id, ark.sectorId));
      continue;
    }
    const ownedRegions = new Set(
      platforms(shadow, seatId).map(
        (platform) => shadow.map.sectors[platform.sectorId]!.region,
      ),
    );
    const candidates = connectedSectors(shadow.map, ark.sectorId)
      .filter(
        (sectorId) =>
          !platforms(shadow).some((platform) => platform.sectorId === sectorId),
      )
      .sort((a, b) => {
        const regionA = shadow.map.sectors[a]!.region;
        const regionB = shadow.map.sectors[b]!.region;
        const scoreA =
          (ownedRegions.has(regionA) ? 0 : 10) +
          (regionA === "blackwater" ? 2 : 0);
        const scoreB =
          (ownedRegions.has(regionB) ? 0 : 10) +
          (regionB === "blackwater" ? 2 : 0);
        return scoreB - scoreA || a - b;
      });
    const destination = candidates[0];
    if (destination === undefined)
      operations.push(hold(pulse, ark.id, ark.sectorId));
    else {
      operations.push(navigate(ark, pulse, destination));
      ark.sectorId = destination;
    }
  }
  return {
    seatId,
    operations: operations as [Operation, Operation, Operation],
  };
}

function planDiscovery(
  state: RulesState,
  seatId: SeatId,
  surveyUnknownSites = false,
): ThreePulseProgram {
  const shadow = structuredClone(state);
  const seat = shadow.seats[seatId]!;
  const ark = ownedArk(shadow, seatId);
  const submarine = ownedSub(shadow, seatId);
  const operations: Operation[] = [];
  let lab = platforms(shadow, seatId).find(
    (platform) =>
      platform.module === "laboratory" && platform.state === "active",
  );
  let predictedCargo = submarine ? [...submarine.cargo] : [];
  const plannedSurveySectors = new Set<number>();

  for (let value = 1; value <= 3; value += 1) {
    const pulse = value as Pulse;
    if (!lab) {
      const occupied = platforms(shadow).some(
        (platform) => platform.sectorId === ark.sectorId,
      );
      const cost =
        seat.faction === "hadal_engineers" &&
        !seat.factionUses.hadalDiscountUsed
          ? 2
          : 3;
      if (!occupied && seat.supply >= cost) {
        const projectId = externalId("bot-lab", seatId, state.round, pulse);
        operations.push({
          kind: "develop",
          pulse,
          assetId: ark.id,
          requiredSectorId: ark.sectorId,
          project: {
            kind: "platform",
            module: "laboratory",
            projectId,
          },
        });
        seat.supply -= cost;
        if (seat.faction === "hadal_engineers")
          seat.factionUses.hadalDiscountUsed = true;
        lab = {
          kind: "platform",
          id: projectId,
          ownerId: seatId,
          sectorId: ark.sectorId,
          module: "laboratory",
          state: "active",
          jammedThroughForecastRound: null,
          reactivatesAtForecastRound: null,
        };
        shadow.assets[projectId] = lab;
        continue;
      }
      const destination = connectedSectors(shadow.map, ark.sectorId).find(
        (sectorId) =>
          !platforms(shadow).some((platform) => platform.sectorId === sectorId),
      );
      if (destination === undefined)
        operations.push(hold(pulse, ark.id, ark.sectorId));
      else {
        operations.push(navigate(ark, pulse, destination));
        ark.sectorId = destination;
      }
      continue;
    }
    if (!submarine) {
      operations.push(hold(pulse));
      continue;
    }
    if (predictedCargo.length > 0 && submarine.sectorId === lab.sectorId) {
      const specimenId = predictedCargo[0]!;
      if (specimenId.startsWith("predicted:"))
        operations.push(hold(pulse, submarine.id, submarine.sectorId));
      else {
        operations.push({
          kind: "analyze",
          pulse,
          assetId: submarine.id,
          requiredSectorId: submarine.sectorId,
          specimenId,
        });
        predictedCargo = predictedCargo.slice(1);
      }
      continue;
    }
    const ownedTypes = new Set(
      [...seat.analyzedSpecimenIds, ...predictedCargo]
        .map((specimenId) => shadow.specimens[specimenId]?.type)
        .filter((type) => type !== undefined),
    );
    const knownSites = knownSiteTypes(shadow, seatId);
    const allStockedSites = shadow.map.deepSiteIds.filter(
      (sectorId) => shadow.sites[sectorId]?.stockSpecimenId !== null,
    );
    const usefulStockedSites = allStockedSites.filter((sectorId) => {
      const type = knownSites.get(sectorId);
      return type === undefined || !ownedTypes.has(type);
    });
    const stockedSites = (
      usefulStockedSites.length > 0 ? usefulStockedSites : allStockedSites
    ).sort((a, b) => {
      const typeA = knownSites.get(a);
      const typeB = knownSites.get(b);
      const scoreA = typeA === undefined ? 1 : ownedTypes.has(typeA) ? 0 : 2;
      const scoreB = typeB === undefined ? 1 : ownedTypes.has(typeB) ? 0 : 2;
      return scoreB - scoreA || a - b;
    });
    if (
      predictedCargo.length >= 2 ||
      (predictedCargo.length > 0 && stockedSites.length === 0)
    ) {
      if (submarine.sectorId !== lab.sectorId) {
        const path = shortestPath(shadow.map, submarine.sectorId, lab.sectorId);
        const destination = path[1];
        if (destination === undefined)
          operations.push(hold(pulse, submarine.id, submarine.sectorId));
        else {
          operations.push({
            kind: "glide",
            pulse,
            assetId: submarine.id,
            requiredSectorId: submarine.sectorId,
            toSectorId: destination,
            silent: submarine.silence > 0,
          });
          if (submarine.silence > 0) submarine.silence -= 1;
          submarine.sectorId = destination;
        }
      }
      continue;
    }
    if (stockedSites.includes(submarine.sectorId)) {
      if (
        surveyUnknownSites &&
        !knownSites.has(submarine.sectorId) &&
        !plannedSurveySectors.has(submarine.sectorId) &&
        seat.signal > 0
      ) {
        operations.push({
          kind: "survey",
          pulse,
          assetId: submarine.id,
          requiredSectorId: submarine.sectorId,
        });
        seat.signal -= 1;
        plannedSurveySectors.add(submarine.sectorId);
        knownSites.set(
          submarine.sectorId,
          shadow.sites[submarine.sectorId]!.specimenType,
        );
        continue;
      }
      operations.push({
        kind: "harvest",
        pulse,
        assetId: submarine.id,
        requiredSectorId: submarine.sectorId,
        targetId: `site:${submarine.sectorId}`,
        signalCommitment: 0,
      });
      predictedCargo.push(`predicted:${pulse}`);
      shadow.sites[submarine.sectorId]!.stockSpecimenId = null;
    } else {
      const path = nearestPath(shadow, submarine.sectorId, stockedSites);
      const destination = path[1];
      if (destination === undefined)
        operations.push(hold(pulse, submarine.id, submarine.sectorId));
      else {
        operations.push({
          kind: "glide",
          pulse,
          assetId: submarine.id,
          requiredSectorId: submarine.sectorId,
          toSectorId: destination,
          silent: submarine.silence > 0,
        });
        if (submarine.silence > 0) submarine.silence -= 1;
        submarine.sectorId = destination;
      }
    }
  }
  return {
    seatId,
    operations: operations as [Operation, Operation, Operation],
  };
}

function planDominion(state: RulesState, seatId: SeatId): ThreePulseProgram {
  const shadow = structuredClone(state);
  const seat = shadow.seats[seatId]!;
  const ark = ownedArk(shadow, seatId);
  const operations: Operation[] = [];
  for (let value = 1; value <= 3; value += 1) {
    const pulse = value as Pulse;
    const required = shadow.map.dominionRequiredSiteIds;
    const allOwnedSubs = Object.values(shadow.assets).filter(
      (asset): asset is Submarine =>
        asset.kind === "submarine" && asset.ownerId === seatId,
    );
    const activeOwnedSubs = allOwnedSubs.filter(
      (candidate) =>
        candidate.status === "active" &&
        candidate.usableFromRound <= shadow.round,
    );
    const alreadyHeldDeepSite = shadow.map.dominionRequiredSiteIds.some(
      (sectorId) =>
        activeOwnedSubs.some((candidate) => candidate.sectorId === sectorId) ||
        platforms(shadow, seatId).some(
          (candidate) =>
            candidate.state === "active" && candidate.sectorId === sectorId,
        ),
    );
    if (
      Object.keys(shadow.seats).length === 3 &&
      allOwnedSubs.length < 2 &&
      alreadyHeldDeepSite &&
      seat.supply >= 4
    ) {
      operations.push({
        kind: "develop",
        pulse,
        assetId: ark.id,
        requiredSectorId: ark.sectorId,
        project: {
          kind: "submarine",
          projectId: externalId("sub", seatId, "b"),
        },
      });
      seat.supply -= 4;
      const secondSubmarineId = externalId("sub", seatId, "b");
      shadow.assets[secondSubmarineId] = {
        kind: "submarine",
        id: secondSubmarineId,
        ownerId: seatId,
        callSign: "B-2",
        sectorId: ark.sectorId,
        integrity: 2,
        maxIntegrity: 2,
        silence: seat.faction === "quiet_current" ? 3 : 2,
        maxSilence: seat.faction === "quiet_current" ? 3 : 2,
        cargo: [],
        status: "constructing",
        disabledAtRound: null,
        autoReturnRound: null,
        usableFromRound: shadow.round + 1,
        lastTravelFromSectorId: null,
        invalidatedForRound: null,
      };
      continue;
    }

    const hostileWithRaider = required
      .map((sectorId) => ({
        sectorId,
        hostile: platforms(shadow).find(
          (candidate) =>
            candidate.sectorId === sectorId && candidate.ownerId !== seatId,
        ),
        submarine: activeOwnedSubs.find(
          (candidate) => candidate.sectorId === sectorId,
        ),
      }))
      .find((candidate) => candidate.hostile && candidate.submarine);
    if (
      hostileWithRaider?.hostile &&
      hostileWithRaider.submarine &&
      seat.signal > 0
    ) {
      const commitment = Math.min(2, seat.signal) as 1 | 2;
      operations.push({
        kind: "raid",
        pulse,
        assetId: hostileWithRaider.submarine.id,
        requiredSectorId: hostileWithRaider.sectorId,
        targetPlatformId: hostileWithRaider.hostile.id,
        signalCommitment: commitment,
      });
      seat.signal -= commitment;
      continue;
    }

    if (Object.keys(shadow.seats).length > 3) {
      const platformTarget = required.find(
        (sectorId) =>
          !platforms(shadow, seatId).some(
            (candidate) =>
              candidate.state === "active" && candidate.sectorId === sectorId,
          ) &&
          !platforms(shadow).some(
            (candidate) => candidate.sectorId === sectorId,
          ),
      );
      if (
        platformTarget !== undefined &&
        platforms(shadow, seatId).length < 4
      ) {
        const buildCost =
          seat.faction === "hadal_engineers" &&
          !seat.factionUses.hadalDiscountUsed
            ? 2
            : 3;
        if (ark.sectorId === platformTarget && seat.supply >= buildCost) {
          const module: ModuleKind = platforms(shadow, seatId).some(
            (candidate) => candidate.module === "sonar",
          )
            ? "extractor"
            : "sonar";
          operations.push({
            kind: "develop",
            pulse,
            assetId: ark.id,
            requiredSectorId: platformTarget,
            project: {
              kind: "platform",
              module,
              projectId: externalId("bot-dominion", seatId, state.round, pulse),
            },
          });
          seat.supply -= buildCost;
          if (seat.faction === "hadal_engineers")
            seat.factionUses.hadalDiscountUsed = true;
          const shadowDominionId = externalId("shadow-dominion", pulse);
          shadow.assets[shadowDominionId] = {
            kind: "platform",
            id: shadowDominionId,
            ownerId: seatId,
            sectorId: platformTarget,
            module,
            state: "active",
            jammedThroughForecastRound: null,
            reactivatesAtForecastRound: null,
          };
        } else {
          const destination = shortestPath(
            shadow.map,
            ark.sectorId,
            platformTarget,
          )[1];
          if (destination === undefined)
            operations.push(hold(pulse, ark.id, ark.sectorId));
          else {
            operations.push(navigate(ark, pulse, destination));
            ark.sectorId = destination;
          }
        }
        continue;
      }
    }

    const ownPlatformSites = new Set(
      platforms(shadow, seatId)
        .filter((candidate) => candidate.state === "active")
        .map((candidate) => candidate.sectorId),
    );
    const occupiedByOwnSub = new Set(
      activeOwnedSubs.map((candidate) => candidate.sectorId),
    );
    const unresolvedSites = required.filter((sectorId) => {
      const hostile = platforms(shadow).some(
        (candidate) =>
          candidate.sectorId === sectorId && candidate.ownerId !== seatId,
      );
      return (
        hostile ||
        (!ownPlatformSites.has(sectorId) && !occupiedByOwnSub.has(sectorId))
      );
    });
    if (unresolvedSites.length === 0) {
      operations.push(hold(pulse));
      continue;
    }

    const mobileSubs = activeOwnedSubs.filter(
      (candidate) => !required.includes(candidate.sectorId),
    );
    const moveChoice = mobileSubs
      .flatMap((candidate) =>
        unresolvedSites.map((sectorId) => ({
          candidate,
          sectorId,
          path: shortestPath(shadow.map, candidate.sectorId, sectorId),
        })),
      )
      .filter((choice) => choice.path.length > 1)
      .sort(
        (a, b) =>
          a.path.length - b.path.length ||
          a.candidate.id.localeCompare(b.candidate.id) ||
          a.sectorId - b.sectorId,
      )[0];
    if (moveChoice) {
      const destination = moveChoice.path[1]!;
      operations.push({
        kind: "glide",
        pulse,
        assetId: moveChoice.candidate.id,
        requiredSectorId: moveChoice.candidate.sectorId,
        toSectorId: destination,
        silent: moveChoice.candidate.silence > 0,
      });
      if (moveChoice.candidate.silence > 0) moveChoice.candidate.silence -= 1;
      moveChoice.candidate.sectorId = destination;
      continue;
    }

    const targetSector = unresolvedSites[0]!;
    const hostile = platforms(shadow).find(
      (candidate) =>
        candidate.sectorId === targetSector && candidate.ownerId !== seatId,
    );
    if (hostile) {
      const nearest = activeOwnedSubs
        .map((candidate) => ({
          candidate,
          path: shortestPath(shadow.map, candidate.sectorId, targetSector),
        }))
        .filter((choice) => choice.path.length > 1)
        .sort(
          (a, b) =>
            a.path.length - b.path.length ||
            a.candidate.id.localeCompare(b.candidate.id),
        )[0];
      if (nearest) {
        const destination = nearest.path[1]!;
        operations.push({
          kind: "glide",
          pulse,
          assetId: nearest.candidate.id,
          requiredSectorId: nearest.candidate.sectorId,
          toSectorId: destination,
          silent: false,
        });
        nearest.candidate.sectorId = destination;
      } else operations.push(hold(pulse));
      continue;
    }
    if (platforms(shadow, seatId).length >= 4) {
      operations.push(hold(pulse));
      continue;
    }
    if (
      ark.sectorId === targetSector &&
      !platforms(shadow).some(
        (candidate) => candidate.sectorId === targetSector,
      ) &&
      seat.supply >= 3
    ) {
      const module: ModuleKind = platforms(shadow, seatId).some(
        (candidate) => candidate.module === "sonar",
      )
        ? "extractor"
        : "sonar";
      operations.push({
        kind: "develop",
        pulse,
        assetId: ark.id,
        requiredSectorId: targetSector,
        project: {
          kind: "platform",
          module,
          projectId: externalId("bot-dominion", seatId, state.round, pulse),
        },
      });
      seat.supply -=
        seat.faction === "hadal_engineers" &&
        !seat.factionUses.hadalDiscountUsed
          ? 2
          : 3;
      const shadowDominionId = externalId("shadow-dominion", pulse);
      shadow.assets[shadowDominionId] = {
        kind: "platform",
        id: shadowDominionId,
        ownerId: seatId,
        sectorId: targetSector,
        module,
        state: "active",
        jammedThroughForecastRound: null,
        reactivatesAtForecastRound: null,
      };
    } else {
      const destination = shortestPath(
        shadow.map,
        ark.sectorId,
        targetSector,
      )[1];
      if (destination === undefined)
        operations.push(hold(pulse, ark.id, ark.sectorId));
      else {
        operations.push(navigate(ark, pulse, destination));
        ark.sectorId = destination;
      }
    }
  }
  return {
    seatId,
    operations: operations as [Operation, Operation, Operation],
  };
}

function planInterdictor(state: RulesState, seatId: SeatId): ThreePulseProgram {
  const targetSeat = Object.keys(state.seats)
    .sort()
    .find((candidate) => candidate !== seatId && isThreat(state, candidate));
  const submarine = ownedSub(state, seatId);
  const targetPlatform = targetSeat
    ? platforms(state, targetSeat)
        .filter((platform) => platform.state === "active")
        .sort((a, b) => a.id.localeCompare(b.id))[0]
    : undefined;
  if (!targetPlatform || !submarine) return planNetwork(state, seatId);
  const shadowSub = structuredClone(submarine);
  const seat = structuredClone(state.seats[seatId]!);
  const operations: Operation[] = [];
  for (let value = 1; value <= 3; value += 1) {
    const pulse = value as Pulse;
    if (shadowSub.sectorId === targetPlatform.sectorId) {
      const commitment = Math.min(2, seat.signal) as 0 | 1 | 2;
      operations.push({
        kind: "raid",
        pulse,
        assetId: shadowSub.id,
        requiredSectorId: shadowSub.sectorId,
        targetPlatformId: targetPlatform.id,
        signalCommitment: commitment,
      });
      seat.signal -= commitment;
    } else {
      const destination = shortestPath(
        state.map,
        shadowSub.sectorId,
        targetPlatform.sectorId,
      )[1];
      if (destination === undefined) operations.push(hold(pulse));
      else {
        operations.push({
          kind: "glide",
          pulse,
          assetId: shadowSub.id,
          requiredSectorId: shadowSub.sectorId,
          toSectorId: destination,
          silent: false,
        });
        shadowSub.sectorId = destination;
      }
    }
  }
  return {
    seatId,
    operations: operations as [Operation, Operation, Operation],
  };
}

/**
 * Brokers use the Discovery route to create valuable site observations and
 * cargo; runBotSocialPhase turns those assets into verified intel and trades.
 */
function planBroker(state: RulesState, seatId: SeatId): ThreePulseProgram {
  return planDiscovery(state, seatId, true);
}

function chooseProgram(
  state: RulesState,
  seatId: SeatId,
  strategy: Strategy,
): ThreePulseProgram {
  const faction = state.seats[seatId]!.faction;
  const adaptiveProgram =
    faction === "hadal_engineers" || faction === "roaming_atoll"
      ? planNetwork(state, seatId)
      : faction === "echo_cartographers" || faction === "concord_relay"
        ? planBroker(state, seatId)
        : planDominion(state, seatId);
  const preferred =
    strategy === "network"
      ? planNetwork(state, seatId)
      : strategy === "discovery"
        ? planDiscovery(state, seatId)
        : strategy === "dominion"
          ? planDominion(state, seatId)
          : strategy === "interdictor"
            ? planInterdictor(state, seatId)
            : strategy === "broker"
              ? planBroker(state, seatId)
              : adaptiveProgram;
  return preferred;
}

export function simulateOne(
  seed: string,
  playerCount: number,
  factionsEnabled = true,
): {
  state: RulesState;
  strategies: Record<SeatId, Strategy>;
  invalidPrograms: number;
  invalidReasons: Record<string, number>;
  social: SocialStats;
} {
  const seatSetups = Array.from({ length: playerCount }, (_, index) => ({
    id: `seat-${index + 1}`,
    name: `Bot ${index + 1}`,
  }));
  let state = createMatch({
    matchId: externalId("simulation", seed),
    seed,
    seats: seatSetups,
    factionsEnabled,
  });
  const random = seedPrng(`strategies:${seed}`);
  const strategyDeck = shuffled<Strategy>(
    ["network", "discovery", "dominion", "interdictor", "broker", "adaptive"],
    random,
  );
  const strategies = Object.fromEntries(
    seatSetups.map((seat, index) => [seat.id, strategyDeck[index]!]),
  ) as Record<SeatId, Strategy>;
  let invalidPrograms = 0;
  const invalidReasons: Record<string, number> = {};
  const social = emptySocialStats();

  while (state.phase !== "ended") {
    if (state.phase === "forecast") {
      state = runForecast(state).stateAfter;
      assertRulesInvariants(state);
      continue;
    }
    if (state.phase === "planning") {
      const socialPhase = runBotSocialPhase(state, strategies);
      state = socialPhase.state;
      addSocialStats(social, socialPhase.stats);
      assertRulesInvariants(state);
      const programs: Record<SeatId, ThreePulseProgram> = {};
      for (const seatId of Object.keys(state.seats).sort()) {
        const candidate = chooseProgram(state, seatId, strategies[seatId]!);
        const validation = validateProgram(state, seatId, candidate);
        if (!validation.valid) {
          invalidPrograms += 1;
          for (const issue of validation.issues)
            increment(invalidReasons, issue.code);
          programs[seatId] = defaultProgram(seatId);
        } else programs[seatId] = candidate;
      }
      state = resolveRound(state, programs).stateAfter;
      assertRulesInvariants(state);
      continue;
    }
    if (state.phase === "claim" || state.phase === "resolving") {
      state = runClaimCheck(state).stateAfter;
      assertRulesInvariants(state);
      continue;
    }
    throw new Error(`Unexpected simulation phase ${state.phase}`);
  }
  return { state, strategies, invalidPrograms, invalidReasons, social };
}

function increment(
  record: Record<string, number>,
  key: string,
  amount = 1,
): void {
  record[key] = (record[key] ?? 0) + amount;
}

export function simulateBatch(
  matches: number,
  playerCount: number,
  seed = "blackwater-balance-v1",
  factionsEnabled = true,
): SimulationSummary {
  const summary: SimulationSummary = {
    matches,
    playerCount,
    factionsEnabled,
    endedByCharter: 0,
    endedByFallback: 0,
    averageFinishRound: 0,
    winnerSeats: {},
    charterWins: {},
    strategyWins: {
      network: 0,
      discovery: 0,
      dominion: 0,
      interdictor: 0,
      broker: 0,
      adaptive: 0,
    },
    strategyAssignments: {
      network: 0,
      discovery: 0,
      dominion: 0,
      interdictor: 0,
      broker: 0,
      adaptive: 0,
    },
    factionWins: {},
    factionAssignments: {},
    social: emptySocialStats(),
    invalidBotPrograms: 0,
    invalidBotProgramReasons: {},
    diagnostics: [],
  };
  let roundTotal = 0;
  for (let index = 0; index < matches; index += 1) {
    const result = simulateOne(
      `${seed}:${playerCount}:${index}`,
      playerCount,
      factionsEnabled,
    );
    const fallback = result.state.winners.some((seatId) =>
      result.state.winningCharters[seatId]?.includes("fallback"),
    );
    if (fallback) summary.endedByFallback += 1;
    else summary.endedByCharter += 1;
    roundTotal += result.state.round;
    summary.invalidBotPrograms += result.invalidPrograms;
    addSocialStats(summary.social, result.social);
    for (const [reason, count] of Object.entries(result.invalidReasons))
      increment(summary.invalidBotProgramReasons, reason, count);
    for (const [seatId, strategy] of Object.entries(result.strategies)) {
      increment(summary.strategyAssignments, strategy);
      increment(
        summary.factionAssignments,
        result.state.seats[seatId]!.faction,
      );
    }
    for (const winnerId of result.state.winners) {
      increment(summary.winnerSeats, winnerId);
      increment(summary.strategyWins, result.strategies[winnerId]!);
      increment(summary.factionWins, result.state.seats[winnerId]!.faction);
      for (const charter of result.state.winningCharters[winnerId] ?? [])
        increment(summary.charterWins, charter);
    }
  }
  summary.averageFinishRound = Math.round((roundTotal / matches) * 100) / 100;
  const fallbackRate = summary.endedByFallback / matches;
  if (fallbackRate > 0.25) {
    summary.diagnostics.push(
      `Fallback rate ${(fallbackRate * 100).toFixed(1)}% exceeds the 25% heuristic warning threshold; improve agents or playtest Charter tempo.`,
    );
  }
  if (summary.invalidBotPrograms > 0) {
    summary.diagnostics.push(
      `${summary.invalidBotPrograms} bot programs were rejected; inspect invalidBotProgramReasons.`,
    );
  }
  const seatWins = Object.values(summary.winnerSeats);
  if (
    seatWins.length > 1 &&
    (Math.max(...seatWins) - Math.min(...seatWins)) / matches > 0.08
  ) {
    summary.diagnostics.push(
      "Winner-seat spread exceeds eight percentage points; audit home assignment with a larger sample.",
    );
  }
  if (summary.averageFinishRound < 4 || summary.averageFinishRound > 6.5) {
    summary.diagnostics.push(
      `Average finish round ${summary.averageFinishRound} is outside the desired 4–6.5 simulation band.`,
    );
  }
  return summary;
}

function argument(name: string, fallback: number): number {
  const marker = `--${name}=`;
  const raw = process.argv
    .find((value) => value.startsWith(marker))
    ?.slice(marker.length);
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`--${name} must be a positive integer`);
  return parsed;
}

function booleanArgument(name: string, fallback: boolean): boolean {
  const marker = `--${name}=`;
  const raw = process.argv
    .find((value) => value.startsWith(marker))
    ?.slice(marker.length);
  if (raw === undefined) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`--${name} must be true or false`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const matches = argument("matches", 100);
  const requestedPlayerCount = process.argv.find((value) =>
    value.startsWith("--players="),
  );
  const playerCounts = requestedPlayerCount
    ? [argument("players", 4)]
    : [1, 2, 3, 4, 5, 6];
  const factionsEnabled = booleanArgument("factions", true);
  const results = playerCounts.map((playerCount) =>
    simulateBatch(
      matches,
      playerCount,
      "blackwater-balance-v1",
      factionsEnabled,
    ),
  );
  process.stdout.write(
    `${JSON.stringify({ rulesVersion: "1.0.0", heuristicOnly: true, results }, null, 2)}\n`,
  );
}
