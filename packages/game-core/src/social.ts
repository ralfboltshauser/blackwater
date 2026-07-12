import { nextEntityId } from "./setup.js";
import type {
  AtomicTrade,
  CanonicalEvent,
  Handshake,
  ReportId,
  RulesState,
  SeatId,
  SectorId,
  SealedReport,
  TradeTransfer,
} from "./types.js";
import { RESOURCE_CAP } from "./types.js";

export interface SocialTransition {
  stateAfter: RulesState;
  events: CanonicalEvent[];
}

function socialEvent(
  state: RulesState,
  kind: string,
  visibility: "public" | "private",
  audienceSeatIds: SeatId[],
  data: CanonicalEvent["data"],
): CanonicalEvent {
  const sequence = state.nextEntitySequence;
  return {
    id: nextEntityId(state, "event"),
    kind,
    round: state.round,
    pulse: null,
    stage: 0,
    ordinal: sequence,
    visibility,
    audienceSeatIds: [...audienceSeatIds].sort(),
    data,
  };
}

export function sealObservation(
  state: RulesState,
  ownerId: SeatId,
  observationId: string,
): SocialTransition {
  const next = structuredClone(state);
  const observation = next.observations[observationId];
  if (!observation || observation.ownerId !== ownerId)
    throw new Error("Observation is not owned by sender");
  if (
    Object.values(next.reports).some(
      (report) =>
        report.kind === "sealed" && report.observationId === observationId,
    )
  ) {
    throw new Error("Observation is already sealed");
  }
  const reportId = nextEntityId(next, "report");
  const report: SealedReport = {
    kind: "sealed",
    id: reportId,
    observationId,
    parentReportId: null,
    fields: [
      "sectorId",
      "observedAtRound",
      "observedAtPulse",
      "contactCount",
      "contactClass",
      "direction",
      "identitySeatId",
      "specimenType",
      "confidence",
      "sensor",
    ],
    createdBySeatId: ownerId,
    createdRound: next.round,
    custody: [ownerId],
    public: false,
  };
  next.reports[reportId] = report;
  next.reportGrants.push({
    reportId,
    seatId: ownerId,
    grantedRound: next.round,
  });
  return {
    stateAfter: next,
    events: [
      socialEvent(next, "intel.sealed", "private", [ownerId], { reportId }),
    ],
  };
}

export function forwardReport(
  state: RulesState,
  senderId: SeatId,
  recipientId: SeatId,
  sourceReportId: ReportId,
  fields?: string[],
): SocialTransition {
  const next = structuredClone(state);
  const source = next.reports[sourceReportId];
  if (
    !source ||
    !next.reportGrants.some(
      (grant) => grant.reportId === sourceReportId && grant.seatId === senderId,
    )
  ) {
    throw new Error("Sender does not possess this report");
  }
  if (!next.seats[recipientId]) throw new Error("Recipient does not exist");
  let reportId = sourceReportId;
  if (source.kind === "sealed" && fields) {
    const permitted = [...new Set(fields)]
      .filter((field) => source.fields.includes(field))
      .sort();
    reportId = nextEntityId(next, "report");
    next.reports[reportId] = {
      ...source,
      id: reportId,
      parentReportId: source.id,
      fields: permitted,
      createdBySeatId: senderId,
      createdRound: next.round,
      custody: [...new Set([...source.custody, recipientId])].sort(),
      public: false,
    };
  } else {
    source.custody = [...new Set([...source.custody, recipientId])].sort();
  }
  if (
    !next.reportGrants.some(
      (grant) => grant.reportId === reportId && grant.seatId === recipientId,
    )
  ) {
    next.reportGrants.push({
      reportId,
      seatId: recipientId,
      grantedRound: next.round,
    });
  }
  return {
    stateAfter: next,
    events: [
      socialEvent(next, "intel.forwarded", "private", [senderId, recipientId], {
        reportId,
        senderId,
        recipientId,
      }),
    ],
  };
}

export function createStatement(
  state: RulesState,
  authorId: SeatId,
  recipients: SeatId[],
  claim: string,
  sectorId: SectorId | null = null,
): SocialTransition {
  const next = structuredClone(state);
  if (!next.seats[authorId]) throw new Error("Author does not exist");
  const normalized = claim.normalize("NFC").trim().slice(0, 240);
  if (normalized.length === 0) throw new Error("Statement cannot be empty");
  const reportId = nextEntityId(next, "statement");
  const custody = [...new Set([authorId, ...recipients])].sort();
  next.reports[reportId] = {
    kind: "statement",
    id: reportId,
    parentReportId: null,
    createdBySeatId: authorId,
    createdRound: next.round,
    custody,
    public: false,
    claim: normalized,
    sectorId,
  };
  for (const seatId of custody)
    next.reportGrants.push({ reportId, seatId, grantedRound: next.round });
  return {
    stateAfter: next,
    events: [
      socialEvent(next, "intel.statement", "private", custody, {
        reportId,
        authorId,
        sectorId,
      }),
    ],
  };
}

export function broadcastReport(
  state: RulesState,
  seatId: SeatId,
  reportId: ReportId,
): SocialTransition {
  const next = structuredClone(state);
  const report = next.reports[reportId];
  if (
    !report ||
    !next.reportGrants.some(
      (grant) => grant.reportId === reportId && grant.seatId === seatId,
    )
  ) {
    throw new Error("Seat does not possess this report");
  }
  report.public = true;
  return {
    stateAfter: next,
    events: [
      socialEvent(next, "intel.broadcast", "public", [], {
        reportId,
        broadcasterId: seatId,
      }),
    ],
  };
}

function ensureResourceTransfer(
  state: RulesState,
  transfer: Extract<TradeTransfer, { kind: "supply" | "signal" }>,
): void {
  if (!Number.isSafeInteger(transfer.amount) || transfer.amount <= 0)
    throw new Error("Trade amount must be a positive integer");
  const source = state.seats[transfer.fromSeatId];
  const destination = state.seats[transfer.toSeatId];
  if (!source || !destination || source.id === destination.id)
    throw new Error("Invalid resource transfer parties");
  const reserved = state.programEscrows[source.id]?.[transfer.kind] ?? 0;
  if (source[transfer.kind] - reserved < transfer.amount)
    throw new Error(`Insufficient available ${transfer.kind}`);
}

export function settleAtomicTrade(
  state: RulesState,
  tradeId: string,
  transfers: TradeTransfer[],
  publicReceipt = false,
): SocialTransition {
  const next = structuredClone(state);
  const specimenTransferIds = transfers.flatMap((transfer) =>
    transfer.kind === "specimen" ? [transfer.specimenId] : [],
  );
  if (new Set(specimenTransferIds).size !== specimenTransferIds.length)
    throw new Error(
      "A physical specimen can be transferred only once per Trade",
    );
  const reportTransferTuples = transfers.flatMap((transfer) =>
    transfer.kind === "report"
      ? [
          `${transfer.fromSeatId}\u0000${transfer.toSeatId}\u0000${transfer.reportId}`,
        ]
      : [],
  );
  if (new Set(reportTransferTuples).size !== reportTransferTuples.length)
    throw new Error("A report transfer can appear only once per Trade");
  const partyIds = [
    ...new Set(
      transfers.flatMap((transfer) => [transfer.fromSeatId, transfer.toSeatId]),
    ),
  ].sort();
  if (partyIds.length < 2 || partyIds.length > 3)
    throw new Error("A Trade needs two or three parties");
  if (
    partyIds.length === 3 &&
    !partyIds.some((id) => next.seats[id]?.faction === "concord_relay")
  ) {
    throw new Error("A three-party Trade requires Concord Relay");
  }

  const outgoing = new Map<string, number>();
  const resourceDeltas = new Map<string, number>();
  for (const transfer of transfers) {
    if (
      !partyIds.includes(transfer.fromSeatId) ||
      !partyIds.includes(transfer.toSeatId)
    )
      throw new Error("Invalid Trade party");
    if (transfer.kind === "supply" || transfer.kind === "signal") {
      ensureResourceTransfer(next, transfer);
      const key = `${transfer.kind}:${transfer.fromSeatId}`;
      outgoing.set(key, (outgoing.get(key) ?? 0) + transfer.amount);
      const destinationKey = `${transfer.kind}:${transfer.toSeatId}`;
      resourceDeltas.set(key, (resourceDeltas.get(key) ?? 0) - transfer.amount);
      resourceDeltas.set(
        destinationKey,
        (resourceDeltas.get(destinationKey) ?? 0) + transfer.amount,
      );
    } else if (transfer.kind === "report") {
      if (
        !next.reportGrants.some(
          (grant) =>
            grant.reportId === transfer.reportId &&
            grant.seatId === transfer.fromSeatId,
        )
      ) {
        throw new Error("Report sender lacks custody");
      }
    } else if ("fromSubmarineId" in transfer) {
      const from = next.assets[transfer.fromSubmarineId];
      const to = next.assets[transfer.toSubmarineId];
      if (
        from?.kind !== "submarine" ||
        to?.kind !== "submarine" ||
        from.ownerId !== transfer.fromSeatId ||
        to.ownerId !== transfer.toSeatId ||
        from.sectorId !== to.sectorId ||
        !from.cargo.includes(transfer.specimenId) ||
        to.cargo.length >= 2
      ) {
        throw new Error("Physical specimen exchange is not currently legal");
      }
    }
  }
  for (const [key, amount] of outgoing) {
    const [kind, seatId] = key.split(":") as ["supply" | "signal", SeatId];
    const seat = next.seats[seatId]!;
    const reserved = next.programEscrows[seatId]?.[kind] ?? 0;
    if (seat[kind] - reserved < amount)
      throw new Error(`Combined transfers overspend ${kind}`);
  }
  for (const [key, delta] of resourceDeltas) {
    const [kind, seatId] = key.split(":") as ["supply" | "signal", SeatId];
    const finalBalance = next.seats[seatId]![kind] + delta;
    if (finalBalance > RESOURCE_CAP)
      throw new Error(`Trade would exceed the ${kind} balance cap`);
  }

  for (const transfer of transfers) {
    if (transfer.kind === "supply" || transfer.kind === "signal") {
      next.seats[transfer.fromSeatId]![transfer.kind] -= transfer.amount;
      next.seats[transfer.toSeatId]![transfer.kind] += transfer.amount;
    } else if (transfer.kind === "report") {
      if (
        !next.reportGrants.some(
          (grant) =>
            grant.reportId === transfer.reportId &&
            grant.seatId === transfer.toSeatId,
        )
      ) {
        next.reportGrants.push({
          reportId: transfer.reportId,
          seatId: transfer.toSeatId,
          grantedRound: next.round,
        });
      }
      const report = next.reports[transfer.reportId]!;
      report.custody = [
        ...new Set([...report.custody, transfer.toSeatId]),
      ].sort();
    } else if ("fromSubmarineId" in transfer) {
      const from = next.assets[transfer.fromSubmarineId]!;
      const to = next.assets[transfer.toSubmarineId]!;
      if (from.kind !== "submarine" || to.kind !== "submarine")
        throw new Error("Invalid submarine");
      from.cargo = from.cargo.filter((id) => id !== transfer.specimenId);
      to.cargo.push(transfer.specimenId);
      next.specimens[transfer.specimenId]!.knownTo = [
        ...new Set([
          ...next.specimens[transfer.specimenId]!.knownTo,
          transfer.toSeatId,
        ]),
      ].sort();
    }
  }

  const trade: AtomicTrade = {
    kind: "atomic_trade",
    id: tradeId,
    partyIds,
    transfers: structuredClone(transfers),
    status: "accepted",
    createdRound: next.round,
    publicReceipt,
  };
  next.deals[tradeId] = trade;
  for (const partyId of partyIds) {
    const seat = next.seats[partyId]!;
    if (
      seat.faction === "concord_relay" &&
      !seat.factionUses.concordTradeUsed
    ) {
      seat.signal = Math.min(RESOURCE_CAP, seat.signal + 1);
      seat.factionUses.concordTradeUsed = true;
    }
  }
  return {
    stateAfter: next,
    events: [
      socialEvent(
        next,
        "trade.accepted",
        publicReceipt ? "public" : "private",
        publicReceipt ? [] : partyIds,
        {
          tradeId,
          partyIds,
        },
      ),
    ],
  };
}

export function recordHandshake(
  state: RulesState,
  id: string,
  partyIds: SeatId[],
  sectorIds: SectorId[],
  terms: Pick<
    Handshake,
    "prohibitHunt" | "prohibitRaid" | "safePassageDevices"
  >,
): SocialTransition {
  const next = structuredClone(state);
  const parties = [...new Set(partyIds)].sort();
  if (parties.length < 2 || parties.some((seatId) => !next.seats[seatId]))
    throw new Error("Invalid Handshake parties");
  const handshake: Handshake = {
    kind: "handshake",
    id,
    partyIds: parties,
    sectorIds: [...new Set(sectorIds)].sort((a, b) => a - b),
    ...terms,
    status: "active",
    createdRound: next.round,
    expiresAfterRound: next.round,
    breachedBySeatId: null,
  };
  next.deals[id] = handshake;
  return {
    stateAfter: next,
    events: [
      socialEvent(next, "handshake.recorded", "public", [], {
        id,
        partyIds: parties,
        sectorIds: handshake.sectorIds,
      }),
    ],
  };
}
