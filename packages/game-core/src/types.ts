export type SeatId = string;
export type SectorId = number;
export type AssetId = string;
export type DeviceId = string;
export type SpecimenId = string;
export type EvidenceId = string;
export type ObservationId = string;
export type ReportId = string;

/** Shared wire/UI ceiling for every spendable resource balance. */
export const RESOURCE_CAP = 99 as const;

export type Region = "shelf" | "rift" | "blackwater";
export type ModuleKind = "extractor" | "sonar" | "laboratory";
export type SpecimenType = "ribbon_filter" | "prism_raft" | "luminous_pollen";
export type Direction =
  "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw" | "still" | "unknown";
export type Faction =
  | "symmetric"
  | "echo_cartographers"
  | "quiet_current"
  | "roaming_atoll"
  | "hadal_engineers"
  | "concord_relay"
  | "second_dawn";

export type RulesPhase =
  "forecast" | "planning" | "resolving" | "claim" | "ended";
export type Pulse = 1 | 2 | 3;

export interface Sector {
  id: SectorId;
  name: string;
  region: Region;
  x: number;
  y: number;
  deepSite: boolean;
}

export interface BasinState {
  templateId: "basin-13" | "basin-19";
  /** Divide sector x/y by this value for normalized display coordinates. */
  coordinateScale: 1000;
  sectors: Record<SectorId, Sector>;
  connections: Array<[SectorId, SectorId]>;
  homeSectors: Record<SeatId, SectorId>;
  deepSiteIds: SectorId[];
  dominionRequiredSiteIds: SectorId[];
}

export interface FactionUses {
  echoSurveyUsed: boolean;
  quietContactSuppressed: boolean;
  towUsed: boolean;
  hadalDiscountUsed: boolean;
  concordTradeUsed: boolean;
  secondDawnSalvageUsed: boolean;
}

export interface SeatState {
  id: SeatId;
  name: string;
  color: string;
  emblem: string;
  faction: Faction;
  supply: number;
  signal: number;
  analyzedSpecimenIds: SpecimenId[];
  deviceInventory: { snare: number; decoy: number };
  factionUses: FactionUses;
}

export interface Ark {
  kind: "ark";
  id: AssetId;
  ownerId: SeatId;
  sectorId: SectorId;
}

export interface Submarine {
  kind: "submarine";
  id: AssetId;
  ownerId: SeatId;
  callSign: string;
  sectorId: SectorId;
  integrity: number;
  maxIntegrity: 2;
  silence: number;
  maxSilence: 2 | 3;
  cargo: SpecimenId[];
  status: "active" | "disabled" | "constructing";
  disabledAtRound: number | null;
  autoReturnRound: number | null;
  usableFromRound: number;
  lastTravelFromSectorId: SectorId | null;
  invalidatedForRound: number | null;
}

export interface Platform {
  kind: "platform";
  id: AssetId;
  ownerId: SeatId;
  sectorId: SectorId;
  module: ModuleKind;
  state: "active" | "jammed" | "contested" | "inactive";
  jammedThroughForecastRound: number | null;
  reactivatesAtForecastRound: number | null;
}

export type Asset = Ark | Submarine | Platform;

export interface Snare {
  kind: "snare";
  id: DeviceId;
  ownerId: SeatId;
  sectorId: SectorId;
  mode: "tag" | "spill";
  state: "armed" | "consumed" | "disarmed";
  armedFromPulse: Pulse | null;
  armedFromRound: number;
}

export interface Decoy {
  kind: "decoy";
  id: DeviceId;
  ownerId: SeatId;
  sectorId: SectorId;
  route: SectorId[];
  routeIndex: number;
  state: "armed" | "consumed" | "disarmed";
  armedFromPulse: Pulse | null;
  armedFromRound: number;
  expiresAfterRound: number;
}

export type Device = Snare | Decoy;

export interface Specimen {
  id: SpecimenId;
  type: SpecimenType;
  createdRound: number;
  knownTo: SeatId[];
}

export interface SiteState {
  sectorId: SectorId;
  specimenType: SpecimenType;
  stockSpecimenId: SpecimenId | null;
}

export interface Salvage {
  id: string;
  specimenId: SpecimenId;
  sectorId: SectorId;
  droppedBySeatId: SeatId;
  droppedRound: number;
  droppedPulse: Pulse;
}

export interface Evidence {
  id: EvidenceId;
  kind: "wake" | "contact" | "identified_contact" | "disturbance";
  sectorId: SectorId;
  fromSectorId: SectorId | null;
  toSectorId: SectorId | null;
  ownerId: SeatId | null;
  subjectId: string | null;
  observedRound: number;
  observedPulse: Pulse;
  expiresAtForecastRound: number;
  confidence: "partial" | "strong" | "confirmed";
}

export interface Observation {
  id: ObservationId;
  ownerId: SeatId;
  source: "passive_sonar" | "active_survey" | "snare" | "harvest";
  sectorId: SectorId;
  observedRound: number;
  observedPulse: Pulse;
  contactClass: "submarine" | "decoy" | "snare" | "site";
  subjectId: string | null;
  identitySeatId: SeatId | null;
  specimenType: SpecimenType | null;
  contactCount: number;
  direction: Direction;
  /** Integer percent, kept out of canonical floating-point state. */
  confidence: 50 | 70 | 100;
}

export interface SealedReport {
  kind: "sealed";
  id: ReportId;
  observationId: ObservationId;
  parentReportId: ReportId | null;
  fields: string[];
  createdBySeatId: SeatId;
  createdRound: number;
  custody: SeatId[];
  public: boolean;
}

export interface StatementReport {
  kind: "statement";
  id: ReportId;
  parentReportId: null;
  createdBySeatId: SeatId;
  createdRound: number;
  custody: SeatId[];
  public: boolean;
  claim: string;
  sectorId: SectorId | null;
}

export type ReportArtifact = SealedReport | StatementReport;

export interface ReportGrant {
  reportId: ReportId;
  seatId: SeatId;
  grantedRound: number;
}

export interface TradeResourceTransfer {
  kind: "supply" | "signal";
  fromSeatId: SeatId;
  toSeatId: SeatId;
  amount: number;
}

export interface TradeReportTransfer {
  kind: "report";
  fromSeatId: SeatId;
  toSeatId: SeatId;
  reportId: ReportId;
}

export interface TradeSpecimenTransfer {
  kind: "specimen";
  fromSeatId: SeatId;
  toSeatId: SeatId;
  fromSubmarineId: AssetId;
  toSubmarineId: AssetId;
  specimenId: SpecimenId;
}

export type TradeTransfer =
  TradeResourceTransfer | TradeReportTransfer | TradeSpecimenTransfer;

export interface AtomicTrade {
  kind: "atomic_trade";
  id: string;
  partyIds: SeatId[];
  transfers: TradeTransfer[];
  status: "pending" | "accepted" | "withdrawn" | "failed";
  createdRound: number;
  publicReceipt: boolean;
}

export interface Handshake {
  kind: "handshake";
  id: string;
  partyIds: SeatId[];
  sectorIds: SectorId[];
  prohibitHunt: boolean;
  prohibitRaid: boolean;
  safePassageDevices: boolean;
  status: "active" | "breached" | "expired";
  createdRound: number;
  expiresAfterRound: number;
  breachedBySeatId: SeatId | null;
}

export type Deal = AtomicTrade | Handshake;

export interface PlatformContest {
  platformId: AssetId;
  contenderId: SeatId;
  contestedSinceRound: number;
  transferEligibleRound: number;
}

export interface CommissionState {
  targetSeatId: SeatId;
  activeRound: number;
  claimed: boolean;
  qualifyingSeatIds: SeatId[];
}

export interface HoldOperation {
  kind: "hold";
  pulse: Pulse;
  assetId?: AssetId;
  requiredSectorId?: SectorId;
}

export interface GlideOperation {
  kind: "glide";
  pulse: Pulse;
  assetId: AssetId;
  requiredSectorId: SectorId;
  toSectorId: SectorId;
  silent: boolean;
}

export interface SprintOperation {
  kind: "sprint";
  pulse: Pulse;
  assetId: AssetId;
  requiredSectorId: SectorId;
  path: [SectorId, SectorId];
}

export interface NavigateOperation {
  kind: "navigate";
  pulse: Pulse;
  assetId: AssetId;
  requiredSectorId: SectorId;
  toSectorId: SectorId;
  towPlatformId?: AssetId;
}

export interface SurveyOperation {
  kind: "survey";
  pulse: Pulse;
  assetId: AssetId;
  requiredSectorId: SectorId;
  suppressPublicContact?: boolean;
}

export interface HarvestOperation {
  kind: "harvest";
  pulse: Pulse;
  assetId: AssetId;
  requiredSectorId: SectorId;
  targetId: string;
  signalCommitment: 0 | 1 | 2;
  suppressPublicContact?: boolean;
}

export interface AnalyzeOperation {
  kind: "analyze";
  pulse: Pulse;
  assetId: AssetId;
  requiredSectorId: SectorId;
  specimenId: SpecimenId;
}

export type DevelopProject =
  | { kind: "platform"; module: ModuleKind; projectId?: AssetId }
  | { kind: "submarine"; projectId?: AssetId }
  | { kind: "repair_submarine"; submarineId: AssetId };

export interface DevelopOperation {
  kind: "develop";
  pulse: Pulse;
  assetId: AssetId;
  requiredSectorId: SectorId;
  project: DevelopProject;
}

export interface DeployOperation {
  kind: "deploy";
  pulse: Pulse;
  assetId: AssetId;
  requiredSectorId: SectorId;
  device: "snare" | "decoy";
  snareMode?: "tag" | "spill";
  decoyRoute?: SectorId[];
  deviceId?: DeviceId;
}

export interface HuntOperation {
  kind: "hunt";
  pulse: Pulse;
  assetId: AssetId;
  requiredSectorId: SectorId;
  targetSeatId?: SeatId;
  targetEvidenceId?: EvidenceId;
  signalCommitment: 0 | 1 | 2;
}

export interface RaidOperation {
  kind: "raid";
  pulse: Pulse;
  assetId: AssetId;
  requiredSectorId: SectorId;
  targetPlatformId: AssetId;
  signalCommitment: 0 | 1 | 2;
}

export interface JamOperation {
  kind: "jam";
  pulse: Pulse;
  assetId: AssetId;
  requiredSectorId: SectorId;
  targetPlatformId: AssetId;
}

export interface GoDarkOperation {
  kind: "go_dark";
  pulse: Pulse;
  assetId: AssetId;
  requiredSectorId: SectorId;
}

export interface ScreenOperation {
  kind: "screen";
  pulse: Pulse;
  assetId: AssetId;
  requiredSectorId: SectorId;
  protectedAssetId?: AssetId;
  counterTargetSeatId?: SeatId;
  signalCommitment: 0 | 1 | 2;
}

export type Operation =
  | HoldOperation
  | GlideOperation
  | SprintOperation
  | NavigateOperation
  | SurveyOperation
  | HarvestOperation
  | AnalyzeOperation
  | DevelopOperation
  | DeployOperation
  | HuntOperation
  | RaidOperation
  | JamOperation
  | GoDarkOperation
  | ScreenOperation;

export interface ThreePulseProgram {
  seatId: SeatId;
  operations: [Operation, Operation, Operation];
  secondDawnSalvagePriority?: string[];
}

export type CanonicalScalar = string | number | boolean | null;
export type CanonicalValue =
  CanonicalScalar | CanonicalValue[] | { [key: string]: CanonicalValue };

export interface CanonicalEvent {
  id: string;
  kind: string;
  round: number;
  pulse: Pulse | null;
  stage: number;
  ordinal: number;
  visibility: "public" | "private";
  audienceSeatIds: SeatId[];
  data: Record<string, CanonicalValue>;
}

export interface RulesState {
  rulesVersion: "1.0.0";
  matchId: string;
  seed: string;
  prng: [number, number, number, number];
  round: number;
  roundCap: 7;
  phase: RulesPhase;
  map: BasinState;
  seats: Record<SeatId, SeatState>;
  assets: Record<AssetId, Asset>;
  devices: Record<DeviceId, Device>;
  specimens: Record<SpecimenId, Specimen>;
  sites: Record<SectorId, SiteState>;
  salvage: Record<string, Salvage>;
  evidence: Record<EvidenceId, Evidence>;
  observations: Record<ObservationId, Observation>;
  reports: Record<ReportId, ReportArtifact>;
  reportGrants: ReportGrant[];
  deals: Record<string, Deal>;
  contests: Record<AssetId, PlatformContest>;
  commission: Record<SeatId, CommissionState>;
  programs: Record<SeatId, ThreePulseProgram>;
  programEscrows: Record<SeatId, { supply: number; signal: number }>;
  winners: SeatId[];
  winningCharters: Record<SeatId, CharterKind[]>;
  fallbackScores: Record<SeatId, number>;
  nextEntitySequence: number;
}

export type CharterKind = "network" | "discovery" | "dominion" | "fallback";

export interface RoundResolution {
  stateAfter: RulesState;
  events: CanonicalEvent[];
  /** Server-only canonical frames captured after each resolved Pulse. */
  pulseStates: Record<Pulse, RulesState>;
}

export interface RoundInput {
  rulesVersion: RulesState["rulesVersion"];
  matchSeed: string;
  round: number;
  stateBefore: RulesState;
  programsBySeat: Record<SeatId, ThreePulseProgram>;
}

export interface ValidationIssue {
  code: string;
  message: string;
  pulse?: Pulse;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  reservedSupply: number;
  reservedSignal: number;
}

export interface SeatSetup {
  id: SeatId;
  name: string;
  faction?: Faction;
  color?: string;
  emblem?: string;
}

export interface MatchSetupOptions {
  matchId: string;
  seed: string;
  seats: SeatSetup[];
  factionsEnabled?: boolean;
}

export interface OperationChoice {
  kind: Operation["kind"];
  assetId?: AssetId;
  sectorIds?: SectorId[];
  targetIds?: string[];
  label: string;
}
