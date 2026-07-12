import { createBasinForPlayers } from "./maps.js";
import { externalId, isExternalId } from "./ids.js";
import { seedPrng, shuffled } from "./random.js";
import type {
  Faction,
  FactionUses,
  MatchSetupOptions,
  RulesState,
  SeatState,
  SpecimenType,
} from "./types.js";

export const SEAT_COLORS = [
  "cyan",
  "amber",
  "violet",
  "lime",
  "coral",
  "chalk",
] as const;
export const SEAT_EMBLEMS = [
  "wave",
  "sun",
  "spiral",
  "leaf",
  "fan",
  "star",
] as const;
export const FACTIONS: Faction[] = [
  "echo_cartographers",
  "quiet_current",
  "roaming_atoll",
  "hadal_engineers",
  "concord_relay",
  "second_dawn",
];

export function emptyFactionUses(): FactionUses {
  return {
    echoSurveyUsed: false,
    quietContactSuppressed: false,
    towUsed: false,
    hadalDiscountUsed: false,
    concordTradeUsed: false,
    secondDawnSalvageUsed: false,
  };
}

export function createMatch(options: MatchSetupOptions): RulesState {
  if (!isExternalId(options.matchId)) {
    throw new Error("matchId must satisfy the shared protocol ID contract");
  }
  if (options.seats.length < 1 || options.seats.length > 6) {
    throw new Error("Blackwater requires 1–6 seats");
  }
  const ids = options.seats.map((seat) => seat.id);
  if (ids.some((id) => !isExternalId(id))) {
    throw new Error("Seat IDs must satisfy the shared protocol ID contract");
  }
  if (new Set(ids).size !== ids.length)
    throw new Error("Seat IDs must be unique");

  const prng = seedPrng(options.seed);
  const homes = shuffled(
    Object.values(createBasinForPlayers(ids.length, ids).homeSectors),
    prng,
  );
  const basin = createBasinForPlayers(ids.length, ids);
  basin.homeSectors = Object.fromEntries(
    ids.map((id, index) => [id, homes[index]!]),
  );
  const factionDeck = shuffled(FACTIONS, prng);
  const seats: Record<string, SeatState> = {};
  const assets: RulesState["assets"] = {};

  for (const [index, seatSetup] of options.seats.entries()) {
    const faction =
      seatSetup.faction ??
      (options.factionsEnabled ? factionDeck[index]! : "symmetric");
    seats[seatSetup.id] = {
      id: seatSetup.id,
      name: seatSetup.name,
      color: seatSetup.color ?? SEAT_COLORS[index]!,
      emblem: seatSetup.emblem ?? SEAT_EMBLEMS[index]!,
      faction,
      supply: 4,
      signal: 2,
      analyzedSpecimenIds: [],
      deviceInventory: { snare: 1, decoy: 1 },
      factionUses: emptyFactionUses(),
    };
    const home = basin.homeSectors[seatSetup.id]!;
    const arkId = externalId("ark", seatSetup.id);
    const submarineId = externalId("sub", seatSetup.id, "a");
    assets[arkId] = {
      kind: "ark",
      id: arkId,
      ownerId: seatSetup.id,
      sectorId: home,
    };
    assets[submarineId] = {
      kind: "submarine",
      id: submarineId,
      ownerId: seatSetup.id,
      callSign: "A-1",
      sectorId: home,
      integrity: 2,
      maxIntegrity: 2,
      silence: faction === "quiet_current" ? 3 : 2,
      maxSilence: faction === "quiet_current" ? 3 : 2,
      cargo: [],
      status: "active",
      disabledAtRound: null,
      autoReturnRound: null,
      usableFromRound: 1,
      lastTravelFromSectorId: null,
      invalidatedForRound: null,
    };
  }

  const specimenTypes = shuffled<SpecimenType>(
    ["ribbon_filter", "prism_raft", "luminous_pollen"],
    prng,
  );
  const specimens: RulesState["specimens"] = {};
  const sites: RulesState["sites"] = {};
  basin.deepSiteIds.forEach((sectorId, index) => {
    const specimenId = externalId("specimen", "site", sectorId, "round", 1);
    specimens[specimenId] = {
      id: specimenId,
      type: specimenTypes[index]!,
      createdRound: 1,
      knownTo: [],
    };
    sites[sectorId] = {
      sectorId,
      specimenType: specimenTypes[index]!,
      stockSpecimenId: specimenId,
    };
  });

  return {
    rulesVersion: "1.0.0",
    matchId: options.matchId,
    seed: options.seed,
    prng,
    round: 1,
    roundCap: 7,
    phase: "planning",
    map: basin,
    seats,
    assets,
    devices: {},
    specimens,
    sites,
    salvage: {},
    evidence: {},
    observations: {},
    reports: {},
    reportGrants: [],
    deals: {},
    contests: {},
    commission: {},
    programs: {},
    programEscrows: {},
    winners: [],
    winningCharters: {},
    fallbackScores: {},
    nextEntitySequence: 1,
  };
}

export function nextEntityId(state: RulesState, prefix: string): string {
  const id = externalId(
    prefix,
    `r${state.round}`,
    `n${state.nextEntitySequence}`,
  );
  state.nextEntitySequence += 1;
  return id;
}
