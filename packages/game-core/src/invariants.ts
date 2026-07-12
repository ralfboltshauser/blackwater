import { RESOURCE_CAP, type RulesState } from "./types.js";

export function rulesInvariantViolations(state: RulesState): string[] {
  const problems: string[] = [];
  const seatIds = Object.keys(state.seats);
  if (seatIds.length < 1 || seatIds.length > 6)
    problems.push("seat count must be 1–6");
  const platformSectors = new Map<number, string>();
  for (const seatId of seatIds) {
    const seat = state.seats[seatId]!;
    if (
      !Number.isSafeInteger(seat.supply) ||
      seat.supply < 0 ||
      seat.supply > RESOURCE_CAP
    )
      problems.push(`${seatId} has invalid Supply`);
    if (
      !Number.isSafeInteger(seat.signal) ||
      seat.signal < 0 ||
      seat.signal > RESOURCE_CAP
    )
      problems.push(`${seatId} has invalid Signal`);
    const assets = Object.values(state.assets).filter(
      (asset) => asset.ownerId === seatId,
    );
    if (assets.filter((asset) => asset.kind === "ark").length !== 1)
      problems.push(`${seatId} must have one Ark`);
    if (assets.filter((asset) => asset.kind === "submarine").length > 2)
      problems.push(`${seatId} exceeds submarine cap`);
    if (assets.filter((asset) => asset.kind === "platform").length > 4)
      problems.push(`${seatId} exceeds platform cap`);
    const liveDevices = Object.values(state.devices).filter(
      (device) => device.ownerId === seatId && device.state === "armed",
    ).length;
    const deviceRecords = Object.values(state.devices).filter(
      (device) => device.ownerId === seatId,
    ).length;
    const charges =
      liveDevices + seat.deviceInventory.snare + seat.deviceInventory.decoy;
    if (charges > 2) problems.push(`${seatId} exceeds device charge cap`);
    if (deviceRecords > 2)
      problems.push(`${seatId} has too many retained device records`);
  }
  for (const asset of Object.values(state.assets)) {
    if (!state.seats[asset.ownerId])
      problems.push(`${asset.id} has unknown owner`);
    if (!state.map.sectors[asset.sectorId])
      problems.push(`${asset.id} is outside the basin`);
    if (asset.kind === "platform") {
      const prior = platformSectors.get(asset.sectorId);
      if (prior)
        problems.push(
          `platforms ${prior} and ${asset.id} share anchor ${asset.sectorId}`,
        );
      platformSectors.set(asset.sectorId, asset.id);
    }
    if (asset.kind === "submarine") {
      if (asset.cargo.length > 2)
        problems.push(`${asset.id} exceeds cargo cap`);
      if (asset.integrity < 0 || asset.integrity > 2)
        problems.push(`${asset.id} has invalid Integrity`);
      if (asset.silence < 0 || asset.silence > asset.maxSilence)
        problems.push(`${asset.id} has invalid Silence`);
    }
  }
  for (const specimenId of Object.values(state.sites)
    .map((site) => site.stockSpecimenId)
    .filter(Boolean)) {
    if (!state.specimens[specimenId!])
      problems.push(`site references missing specimen ${specimenId}`);
  }
  const sealedObservationIds = new Set(
    Object.values(state.reports).flatMap((report) =>
      report.kind === "sealed" ? [report.observationId] : [],
    ),
  );
  for (const report of Object.values(state.reports)) {
    if (report.kind === "sealed" && !state.observations[report.observationId]) {
      problems.push(`${report.id} references missing observation`);
    }
    if (new Set(report.custody).size !== report.custody.length)
      problems.push(`${report.id} has duplicate custody holders`);
    if (report.custody.some((seatId) => !state.seats[seatId]))
      problems.push(`${report.id} has unknown custody holder`);
  }
  if (state.phase === "planning") {
    for (const observation of Object.values(state.observations)) {
      if (
        observation.observedRound + 2 <= state.round &&
        !sealedObservationIds.has(observation.id)
      ) {
        problems.push(`${observation.id} is stale and unsealed`);
      }
    }
  }
  return problems.sort();
}

export function assertRulesInvariants(state: RulesState): void {
  const problems = rulesInvariantViolations(state);
  if (problems.length > 0)
    throw new Error(`Rules invariant violation:\n${problems.join("\n")}`);
}
