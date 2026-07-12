export type SeatColor =
  "cyan" | "amber" | "violet" | "lime" | "coral" | "chalk";
export type Region = "shelf" | "rift" | "blackwater";

export type SectorView = {
  id: number;
  name: string;
  region: Region;
  x: number;
  y: number;
  deepSite?: boolean;
  dominionObjective?: boolean;
  specimenStock?: boolean;
};

export type MapEntityView = {
  id: string;
  kind:
    | "ark"
    | "submarine"
    | "platform"
    | "extractor"
    | "sonar"
    | "laboratory"
    | "snare"
    | "decoy"
    | "salvage"
    | "site";
  ownerId?: string;
  ownerColor?: SeatColor;
  sectorId: number;
  state?:
    "active" | "damaged" | "jammed" | "contested" | "disabled" | "constructing";
  label?: string;
  private?: boolean;
  sprite?: string;
};

export type EvidenceView = {
  id: string;
  kind: "wake" | "contact" | "identified" | "jam";
  sectorId?: number;
  fromSectorId?: number;
  toSectorId?: number;
  ownerColor?: SeatColor;
  label?: string;
  age?: number;
  direction?:
    "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw" | "still" | "unknown";
};

export type BasinView = {
  sectors: SectorView[];
  connections: Array<[number, number]>;
  entities: MapEntityView[];
  evidence: EvidenceView[];
};

export const PLAYER_COLORS: Record<SeatColor, string> = {
  cyan: "#4bd8dd",
  amber: "#f5a712",
  violet: "#bd7bc5",
  lime: "#b8c838",
  coral: "#f16e4f",
  chalk: "#e8d6bd",
};

export const DEFAULT_SECTORS: SectorView[] = [
  { id: 1, name: "Shallow Shelf", region: "shelf", x: 0.08, y: 0.09 },
  { id: 2, name: "Shelf Break", region: "shelf", x: 0.28, y: 0.07 },
  { id: 3, name: "North Shelf", region: "shelf", x: 0.5, y: 0.09 },
  { id: 4, name: "Aeolian Pass", region: "shelf", x: 0.71, y: 0.08 },
  { id: 5, name: "Glass Shoal", region: "shelf", x: 0.91, y: 0.11 },
  { id: 6, name: "Western Rift", region: "rift", x: 0.1, y: 0.32 },
  { id: 7, name: "Rift Junction", region: "rift", x: 0.3, y: 0.29 },
  { id: 8, name: "Helix Rift", region: "rift", x: 0.5, y: 0.31 },
  { id: 9, name: "Eastern Rift", region: "rift", x: 0.7, y: 0.29 },
  { id: 10, name: "Thermal Vents", region: "rift", x: 0.9, y: 0.33 },
  { id: 11, name: "Southwest Basin", region: "blackwater", x: 0.07, y: 0.57 },
  {
    id: 12,
    name: "Abyssal Plain",
    region: "blackwater",
    x: 0.27,
    y: 0.54,
    deepSite: true,
    specimenStock: true,
  },
  {
    id: 13,
    name: "Blackwater Site 2",
    region: "blackwater",
    x: 0.5,
    y: 0.54,
    deepSite: true,
    specimenStock: true,
  },
  { id: 14, name: "Brine Gallery", region: "blackwater", x: 0.72, y: 0.54 },
  { id: 15, name: "Southeast Basin", region: "blackwater", x: 0.92, y: 0.58 },
  { id: 16, name: "Lantern Trench", region: "blackwater", x: 0.17, y: 0.81 },
  { id: 17, name: "Cobalt Drop", region: "blackwater", x: 0.39, y: 0.78 },
  {
    id: 18,
    name: "Choir Basin",
    region: "blackwater",
    x: 0.65,
    y: 0.8,
    deepSite: true,
    specimenStock: true,
  },
  { id: 19, name: "Far Reach", region: "blackwater", x: 0.87, y: 0.82 },
];

export const DEFAULT_CONNECTIONS: Array<[number, number]> = [
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
