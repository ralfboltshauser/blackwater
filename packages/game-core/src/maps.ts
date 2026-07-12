import type { BasinState, Sector, SectorId } from "./types.js";

const SECTORS_19: Sector[] = [
  {
    id: 1,
    name: "Shallow Shelf",
    region: "shelf",
    x: 80,
    y: 80,
    deepSite: false,
  },
  {
    id: 2,
    name: "Shelf Break",
    region: "shelf",
    x: 280,
    y: 60,
    deepSite: false,
  },
  {
    id: 3,
    name: "North Shelf",
    region: "shelf",
    x: 500,
    y: 80,
    deepSite: false,
  },
  {
    id: 4,
    name: "Aeolian Pass",
    region: "shelf",
    x: 710,
    y: 70,
    deepSite: false,
  },
  {
    id: 5,
    name: "Glass Shoal",
    region: "shelf",
    x: 910,
    y: 100,
    deepSite: false,
  },
  {
    id: 6,
    name: "Western Rift",
    region: "rift",
    x: 100,
    y: 310,
    deepSite: false,
  },
  {
    id: 7,
    name: "Rift Junction",
    region: "rift",
    x: 300,
    y: 280,
    deepSite: false,
  },
  {
    id: 8,
    name: "Helix Rift",
    region: "rift",
    x: 500,
    y: 300,
    deepSite: false,
  },
  {
    id: 9,
    name: "Eastern Rift",
    region: "rift",
    x: 700,
    y: 280,
    deepSite: false,
  },
  {
    id: 10,
    name: "Thermal Vents",
    region: "rift",
    x: 900,
    y: 320,
    deepSite: false,
  },
  {
    id: 11,
    name: "Southwest Basin",
    region: "blackwater",
    x: 70,
    y: 560,
    deepSite: false,
  },
  {
    id: 12,
    name: "Abyssal Plain",
    region: "blackwater",
    x: 270,
    y: 530,
    deepSite: true,
  },
  {
    id: 13,
    name: "Blackwater Site 2",
    region: "blackwater",
    x: 500,
    y: 530,
    deepSite: true,
  },
  {
    id: 14,
    name: "Brine Gallery",
    region: "blackwater",
    x: 720,
    y: 530,
    deepSite: false,
  },
  {
    id: 15,
    name: "Southeast Basin",
    region: "blackwater",
    x: 920,
    y: 570,
    deepSite: false,
  },
  {
    id: 16,
    name: "Lantern Trench",
    region: "blackwater",
    x: 170,
    y: 800,
    deepSite: false,
  },
  {
    id: 17,
    name: "Cobalt Drop",
    region: "blackwater",
    x: 390,
    y: 770,
    deepSite: false,
  },
  {
    id: 18,
    name: "Choir Basin",
    region: "blackwater",
    x: 650,
    y: 790,
    deepSite: true,
  },
  {
    id: 19,
    name: "Far Reach",
    region: "blackwater",
    x: 870,
    y: 810,
    deepSite: false,
  },
];

const CONNECTIONS_19: Array<[SectorId, SectorId]> = [
  [1, 2],
  [1, 6],
  [2, 3],
  [2, 7],
  [3, 4],
  [3, 8],
  [4, 5],
  [4, 9],
  [5, 10],
  [6, 7],
  [6, 11],
  [7, 8],
  [7, 12],
  [8, 9],
  [8, 13],
  [9, 10],
  [9, 13],
  [9, 14],
  [10, 15],
  [11, 12],
  [11, 16],
  [12, 13],
  [12, 16],
  [12, 17],
  [13, 14],
  [13, 17],
  [13, 18],
  [14, 15],
  [14, 18],
  [15, 19],
  [16, 17],
  [17, 18],
  [18, 19],
];

const SMALL_IDS = new Set([2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 17, 18]);

function asRecord(sectors: Sector[]): Record<SectorId, Sector> {
  return Object.fromEntries(
    sectors.map((sector) => [sector.id, { ...sector }]),
  ) as Record<SectorId, Sector>;
}

export function createBasinForPlayers(
  playerCount: number,
  seatIds: string[],
): BasinState {
  if (playerCount < 1 || playerCount > 6 || seatIds.length !== playerCount) {
    throw new Error("Blackwater requires exactly 1–6 seat IDs");
  }
  const small = playerCount <= 4;
  const sectors = small
    ? SECTORS_19.filter((sector) => SMALL_IDS.has(sector.id))
    : SECTORS_19;
  const connections = small
    ? CONNECTIONS_19.filter(([a, b]) => SMALL_IDS.has(a) && SMALL_IDS.has(b))
    : CONNECTIONS_19;
  const anchorsByCount: Record<number, SectorId[]> = {
    1: [3],
    2: [6, 10],
    3: [2, 6, 10],
    4: [2, 4, 6, 10],
    5: [1, 3, 5, 11, 15],
    6: [1, 3, 5, 11, 15, 19],
  };
  const anchors = anchorsByCount[playerCount]!;
  return {
    templateId: small ? "basin-13" : "basin-19",
    coordinateScale: 1000,
    sectors: asRecord(sectors),
    connections: connections.map(([a, b]) => [a, b]),
    homeSectors: Object.fromEntries(
      seatIds.map((seatId, index) => [seatId, anchors[index]!]),
    ),
    deepSiteIds: [12, 13, 18],
    dominionRequiredSiteIds: playerCount <= 3 ? [12, 18] : [12, 13, 18],
  };
}

export function areConnected(
  map: BasinState,
  first: SectorId,
  second: SectorId,
): boolean {
  return map.connections.some(
    ([a, b]) => (a === first && b === second) || (a === second && b === first),
  );
}

export function connectedSectors(
  map: BasinState,
  sectorId: SectorId,
): SectorId[] {
  const result: SectorId[] = [];
  for (const [a, b] of map.connections) {
    if (a === sectorId) result.push(b);
    if (b === sectorId) result.push(a);
  }
  return result.sort((a, b) => a - b);
}

export function shortestPath(
  map: BasinState,
  from: SectorId,
  to: SectorId,
): SectorId[] {
  if (from === to) return [from];
  const queue: SectorId[][] = [[from]];
  const visited = new Set<SectorId>([from]);
  while (queue.length > 0) {
    const path = queue.shift()!;
    for (const next of connectedSectors(map, path[path.length - 1]!)) {
      if (visited.has(next)) continue;
      const candidate = [...path, next];
      if (next === to) return candidate;
      visited.add(next);
      queue.push(candidate);
    }
  }
  return [];
}
