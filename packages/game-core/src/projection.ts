import { charterStatus, isThreat } from "./victory.js";
import type {
  Asset,
  CanonicalValue,
  Device,
  Observation,
  ReportArtifact,
  RulesState,
  SeatId,
  SpecimenType,
} from "./types.js";

export interface ProjectedReport {
  reportId: string;
  kind: "sealed" | "statement";
  verified: boolean;
  authorSeatId: SeatId;
  custody: SeatId[];
  fields: Record<string, CanonicalValue>;
}

export type ProjectedObservation = Omit<Observation, "subjectId"> & {
  contactId: string;
};

export interface PublicProjection {
  matchId: string;
  round: number;
  roundCap: number;
  phase: RulesState["phase"];
  map: RulesState["map"];
  seats: Array<{
    id: SeatId;
    name: string;
    color: string;
    emblem: string;
    faction: string;
    supply: number;
    analyzedCount: number;
    threat: boolean;
    charterWatch: {
      network: number;
      discovery: number;
      activeLab: boolean;
      dominion: "sealed";
    };
  }>;
  arks: Asset[];
  platforms: Asset[];
  evidence: Array<
    Omit<RulesState["evidence"][string], "subjectId" | "toSectorId">
  >;
  sites: Array<{ sectorId: number; stocked: boolean }>;
  salvage: Array<{ id: string; sectorId: number }>;
  agreements: Array<{
    id: string;
    partyIds: string[];
    sectorIds: number[];
    status: string;
  }>;
  commissionTargets: SeatId[];
  broadcastReports: ProjectedReport[];
  winners: SeatId[];
  winningCharters: RulesState["winningCharters"];
  fallbackScores: RulesState["fallbackScores"];
}

export interface SeatProjection {
  public: PublicProjection;
  seat: {
    id: SeatId;
    signal: number;
    analyzedTypes: string[];
    deviceInventory: { snare: number; decoy: number };
  };
  assets: Asset[];
  specimens: Array<{ specimenId: string; type: string }>;
  devices: Device[];
  observations: ProjectedObservation[];
  reports: ProjectedReport[];
  program: RulesState["programs"][string] | null;
  privateDeals: RulesState["deals"][string][];
}

export function projectPublic(state: RulesState): PublicProjection {
  return {
    matchId: state.matchId,
    round: state.round,
    roundCap: state.roundCap,
    phase: state.phase,
    map: structuredClone(state.map),
    seats: Object.values(state.seats)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((seat) => {
        const watch = charterStatus(state, seat.id);
        return {
          id: seat.id,
          name: seat.name,
          color: seat.color,
          emblem: seat.emblem,
          faction: seat.faction,
          supply: seat.supply,
          analyzedCount: seat.analyzedSpecimenIds.length,
          threat: isThreat(state, seat.id),
          charterWatch: {
            network: watch.network.connectedActive,
            discovery: watch.discovery.analyzedTotal,
            activeLab: watch.discovery.activeLab,
            dominion: "sealed" as const,
          },
        };
      }),
    arks: Object.values(state.assets)
      .filter((asset) => asset.kind === "ark")
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((asset) => structuredClone(asset)),
    platforms: Object.values(state.assets)
      .filter((asset) => asset.kind === "platform")
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((asset) => structuredClone(asset)),
    evidence: Object.values(state.evidence)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(({ subjectId: _subjectId, toSectorId: _arrival, ...evidence }) =>
        structuredClone(evidence),
      ),
    sites: Object.values(state.sites)
      .sort((a, b) => a.sectorId - b.sectorId)
      .map((site) => ({
        sectorId: site.sectorId,
        stocked: site.stockSpecimenId !== null,
      })),
    salvage: Object.values(state.salvage)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((item) => ({ id: item.id, sectorId: item.sectorId })),
    agreements: Object.values(state.deals)
      .filter((deal) => deal.kind === "handshake")
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((deal) => ({
        id: deal.id,
        partyIds: [...deal.partyIds],
        sectorIds: [...deal.sectorIds],
        status: deal.status,
      })),
    commissionTargets: Object.values(state.commission)
      .filter((commission) => !commission.claimed)
      .map((commission) => commission.targetSeatId)
      .sort(),
    broadcastReports: Object.values(state.reports)
      .filter((report) => report.public)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((report) => projectReport(state, report)),
    winners: [...state.winners],
    winningCharters: structuredClone(state.winningCharters),
    fallbackScores: structuredClone(state.fallbackScores),
  };
}

export function projectForSeat(
  state: RulesState,
  seatId: SeatId,
): SeatProjection {
  const seat = state.seats[seatId];
  if (!seat) throw new Error("Seat does not exist");
  const grantedIds = new Set(
    state.reportGrants
      .filter((grant) => grant.seatId === seatId)
      .map((grant) => grant.reportId),
  );
  return {
    public: projectPublic(state),
    seat: {
      id: seatId,
      signal: seat.signal,
      analyzedTypes: [
        ...new Set(
          seat.analyzedSpecimenIds
            .map((specimenId) => state.specimens[specimenId]?.type)
            .filter((type): type is SpecimenType => type !== undefined),
        ),
      ].sort(),
      deviceInventory: structuredClone(seat.deviceInventory),
    },
    assets: Object.values(state.assets)
      .filter((asset) => asset.ownerId === seatId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((asset) => structuredClone(asset)),
    specimens: [
      ...new Set(
        Object.values(state.assets)
          .filter(
            (asset) => asset.kind === "submarine" && asset.ownerId === seatId,
          )
          .flatMap((asset) => (asset.kind === "submarine" ? asset.cargo : [])),
      ),
    ]
      .sort()
      .flatMap((specimenId) => {
        const specimen = state.specimens[specimenId];
        return specimen ? [{ specimenId, type: specimen.type }] : [];
      }),
    devices: Object.values(state.devices)
      .filter((device) => device.ownerId === seatId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((device) => structuredClone(device)),
    observations: Object.values(state.observations)
      .filter((observation) => observation.ownerId === seatId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(({ subjectId: _subjectId, ...observation }) => ({
        ...structuredClone(observation),
        contactId: observation.id,
      })),
    reports: Object.values(state.reports)
      .filter((report) => report.public || grantedIds.has(report.id))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((report) => projectReport(state, report)),
    program: state.programs[seatId]
      ? structuredClone(state.programs[seatId])
      : null,
    privateDeals: Object.values(state.deals)
      .filter(
        (deal) =>
          deal.kind === "atomic_trade" && deal.partyIds.includes(seatId),
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((deal) => structuredClone(deal)),
  };
}

function projectReport(
  state: RulesState,
  report: ReportArtifact,
): ProjectedReport {
  if (report.kind === "statement") {
    return {
      reportId: report.id,
      kind: "statement",
      verified: false,
      authorSeatId: report.createdBySeatId,
      custody: [...report.custody],
      fields: { claim: report.claim, sectorId: report.sectorId },
    };
  }
  const observation = state.observations[report.observationId];
  const available: Record<string, CanonicalValue> = observation
    ? {
        sectorId: observation.sectorId,
        observedAtRound: observation.observedRound,
        observedAtPulse: observation.observedPulse,
        contactCount: observation.contactCount,
        contactClass:
          observation.contactClass === "site"
            ? "unknown"
            : observation.contactClass,
        direction: observation.direction,
        identitySeatId: observation.identitySeatId,
        specimenType: observation.specimenType,
        confidence:
          observation.confidence === 100
            ? "exact"
            : observation.confidence === 70
              ? "medium"
              : "low",
        sensor:
          observation.source === "passive_sonar"
            ? "passive-sonar"
            : observation.source === "active_survey"
              ? "active-survey"
              : observation.source === "snare"
                ? "trap"
                : "visual",
      }
    : {};
  return {
    reportId: report.id,
    kind: "sealed",
    verified: true,
    authorSeatId: report.createdBySeatId,
    custody: [...report.custody],
    fields: Object.fromEntries(
      report.fields
        .filter((field) => field in available)
        .map((field) => [field, available[field]!]),
    ),
  };
}

export function projectHost(state: RulesState): {
  matchId: string;
  round: number;
  phase: RulesState["phase"];
  seatCount: number;
  programCount: number;
  ended: boolean;
} {
  return {
    matchId: state.matchId,
    round: state.round,
    phase: state.phase,
    seatCount: Object.keys(state.seats).length,
    programCount: Object.keys(state.programs).length,
    ended: state.phase === "ended",
  };
}
