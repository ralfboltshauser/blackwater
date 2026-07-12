import { connectedSectors } from "./maps.js";
import { externalId } from "./ids.js";
import type {
  CharterKind,
  Platform,
  RulesState,
  SeatId,
  SectorId,
  SpecimenType,
} from "./types.js";

export interface CharterStatus {
  network: {
    satisfied: boolean;
    connectedActive: number;
    eligibleModules: boolean;
    regions: number;
  };
  discovery: {
    satisfied: boolean;
    analyzedTotal: number;
    distinctTypes: number;
    activeLab: boolean;
  };
  dominion: {
    satisfied: boolean;
    controlledRequired: number;
    required: number;
  };
}

export function activePlatforms(
  state: RulesState,
  seatId?: SeatId,
): Platform[] {
  return Object.values(state.assets)
    .filter(
      (asset): asset is Platform =>
        asset.kind === "platform" &&
        asset.state === "active" &&
        (seatId === undefined || asset.ownerId === seatId),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

function connectedComponents(
  state: RulesState,
  platforms: Platform[],
): Platform[][] {
  const bySector = new Map(
    platforms.map((platform) => [platform.sectorId, platform]),
  );
  const unseen = new Set(platforms.map((platform) => platform.id));
  const components: Platform[][] = [];
  while (unseen.size > 0) {
    const firstId = [...unseen].sort()[0]!;
    const first = platforms.find((platform) => platform.id === firstId)!;
    const component: Platform[] = [];
    const queue = [first];
    unseen.delete(first.id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const adjacentSector of connectedSectors(
        state.map,
        current.sectorId,
      )) {
        const adjacent = bySector.get(adjacentSector);
        if (adjacent && unseen.delete(adjacent.id)) queue.push(adjacent);
      }
    }
    components.push(component.sort((a, b) => a.id.localeCompare(b.id)));
  }
  return components;
}

export function sectorControllers(
  state: RulesState,
  sectorId: SectorId,
  includeArk: boolean,
): SeatId[] {
  const controllers = new Set<SeatId>();
  for (const asset of Object.values(state.assets)) {
    if (asset.sectorId !== sectorId) continue;
    if (
      asset.kind === "submarine" &&
      asset.status === "active" &&
      asset.usableFromRound <= state.round
    ) {
      controllers.add(asset.ownerId);
    } else if (asset.kind === "platform" && asset.state === "active") {
      controllers.add(asset.ownerId);
    } else if (includeArk && asset.kind === "ark") {
      controllers.add(asset.ownerId);
    }
  }
  return [...controllers].sort();
}

export function controlledDeepSites(
  state: RulesState,
  seatId: SeatId,
): SectorId[] {
  return state.map.deepSiteIds.filter((sectorId) => {
    const controllers = sectorControllers(state, sectorId, false);
    return controllers.length === 1 && controllers[0] === seatId;
  });
}

export function distinctAnalyzedTypes(
  state: RulesState,
  seatId: SeatId,
): SpecimenType[] {
  const seat = state.seats[seatId];
  if (!seat) return [];
  return [
    ...new Set(
      seat.analyzedSpecimenIds
        .map((specimenId) => state.specimens[specimenId]?.type)
        .filter((type): type is SpecimenType => type !== undefined),
    ),
  ].sort();
}

export function charterStatus(
  state: RulesState,
  seatId: SeatId,
): CharterStatus {
  const platforms = activePlatforms(state, seatId);
  const components = connectedComponents(state, platforms);
  const largest = components.sort((a, b) => b.length - a.length)[0] ?? [];
  const modules = new Set(platforms.map((platform) => platform.module));
  const regions = new Set(
    platforms.map((platform) => state.map.sectors[platform.sectorId]!.region),
  );
  const networkSatisfied =
    platforms.length === 4 &&
    largest.length === 4 &&
    regions.size === 3 &&
    modules.has("extractor") &&
    modules.has("sonar");

  const seat = state.seats[seatId]!;
  const distinctTypes = distinctAnalyzedTypes(state, seatId);
  const activeLab = platforms.some(
    (platform) => platform.module === "laboratory",
  );
  const controlled = controlledDeepSites(state, seatId);
  const required = state.map.dominionRequiredSiteIds;
  return {
    network: {
      satisfied: networkSatisfied,
      connectedActive: Math.min(4, largest.length),
      eligibleModules: modules.has("extractor") && modules.has("sonar"),
      regions: regions.size,
    },
    discovery: {
      satisfied: distinctTypes.length >= 3 && activeLab,
      analyzedTotal: seat.analyzedSpecimenIds.length,
      distinctTypes: distinctTypes.length,
      activeLab,
    },
    dominion: {
      satisfied: required.every((sectorId) => controlled.includes(sectorId)),
      controlledRequired: required.filter((sectorId) =>
        controlled.includes(sectorId),
      ).length,
      required: required.length,
    },
  };
}

export function satisfiedCharters(
  state: RulesState,
  seatId: SeatId,
): CharterKind[] {
  const status = charterStatus(state, seatId);
  const result: CharterKind[] = [];
  if (status.network.satisfied) result.push("network");
  if (status.discovery.satisfied) result.push("discovery");
  if (status.dominion.satisfied) result.push("dominion");
  return result;
}

export function isThreat(state: RulesState, seatId: SeatId): boolean {
  const status = charterStatus(state, seatId);
  const seat = state.seats[seatId]!;
  const ark = Object.values(state.assets).find(
    (asset) => asset.kind === "ark" && asset.ownerId === seatId,
  );
  const legalEmptyAnchor = ark
    ? !Object.values(state.assets).some(
        (asset) => asset.kind === "platform" && asset.sectorId === ark.sectorId,
      )
    : false;
  let networkThreat = false;
  if (
    status.network.connectedActive === 3 &&
    legalEmptyAnchor &&
    ark &&
    seat.supply >=
      (seat.faction === "hadal_engineers" && !seat.factionUses.hadalDiscountUsed
        ? 2
        : 3)
  ) {
    networkThreat = (["extractor", "sonar", "laboratory"] as const).some(
      (module) => {
        const hypothetical = structuredClone(state);
        const hypotheticalId = externalId("threat", seatId);
        hypothetical.assets[hypotheticalId] = {
          kind: "platform",
          id: hypotheticalId,
          ownerId: seatId,
          sectorId: ark.sectorId,
          module,
          state: "active",
          jammedThroughForecastRound: null,
          reactivatesAtForecastRound: null,
        };
        return charterStatus(hypothetical, seatId).network.satisfied;
      },
    );
  }
  const discoveryThreat =
    status.discovery.analyzedTotal >= 2 && status.discovery.activeLab;
  return networkThreat || discoveryThreat;
}

export function fallbackScore(state: RulesState, seatId: SeatId): number {
  return (
    controlledDeepSites(state, seatId).length * 2 +
    activePlatforms(state, seatId).length +
    distinctAnalyzedTypes(state, seatId).length
  );
}
