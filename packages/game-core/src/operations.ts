import { areConnected, connectedSectors } from "./maps.js";
import type {
  Asset,
  AssetId,
  DeployOperation,
  DevelopOperation,
  Operation,
  OperationChoice,
  Pulse,
  RulesState,
  SeatId,
  Submarine,
  ThreePulseProgram,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

export function ownedAssets(state: RulesState, seatId: SeatId): Asset[] {
  return Object.values(state.assets)
    .filter((asset) => asset.ownerId === seatId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function activeSubmarines(
  state: RulesState,
  seatId?: SeatId,
): Submarine[] {
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

export function operationSignalCost(operation: Operation): number {
  switch (operation.kind) {
    case "survey":
    case "jam":
      return 1;
    case "harvest":
    case "hunt":
    case "raid":
    case "screen":
      return operation.signalCommitment;
    case "deploy":
      return 0;
    default:
      return 0;
  }
}

export function operationSupplyCost(
  state: RulesState,
  seatId: SeatId,
  operation: Operation,
  hadalDiscountAvailable = true,
): number {
  if (operation.kind !== "develop") return 0;
  if (operation.project.kind === "platform") {
    return state.seats[seatId]?.faction === "hadal_engineers" &&
      hadalDiscountAvailable
      ? 2
      : 3;
  }
  if (operation.project.kind === "submarine") return 4;
  return 1;
}

function validateAssetOwnership(
  state: RulesState,
  seatId: SeatId,
  assetId: AssetId | undefined,
  pulse: Pulse,
  issues: ValidationIssue[],
): Asset | undefined {
  if (!assetId) return undefined;
  const asset = state.assets[assetId];
  if (!asset || asset.ownerId !== seatId) {
    issues.push({
      code: "ASSET_NOT_OWNED",
      message: "The operation must use one of your assets.",
      pulse,
    });
    return undefined;
  }
  return asset;
}

function validateOperationShape(
  state: RulesState,
  seatId: SeatId,
  operation: Operation,
  issues: ValidationIssue[],
): void {
  const pulse = operation.pulse;
  const asset = validateAssetOwnership(
    state,
    seatId,
    operation.assetId,
    pulse,
    issues,
  );
  if (operation.kind === "hold" && !operation.assetId) return;
  if (!asset) return;
  if (
    "requiredSectorId" in operation &&
    operation.requiredSectorId !== undefined
  ) {
    if (!state.map.sectors[operation.requiredSectorId]) {
      issues.push({
        code: "UNKNOWN_SECTOR",
        message: "Required sector is not on this basin.",
        pulse,
      });
    }
  }
  switch (operation.kind) {
    case "glide":
      if (asset.kind !== "submarine") {
        issues.push({
          code: "WRONG_ASSET",
          message: "Only a submarine can Glide.",
          pulse,
        });
      } else {
        if (
          !areConnected(
            state.map,
            operation.requiredSectorId,
            operation.toSectorId,
          )
        ) {
          issues.push({
            code: "BAD_ROUTE",
            message: "Glide must follow one connection.",
            pulse,
          });
        }
        if (operation.silent && asset.silence < 1) {
          issues.push({
            code: "NO_SILENCE",
            message: "Silent Glide requires one Silence.",
            pulse,
          });
        }
      }
      break;
    case "sprint":
      if (
        asset.kind !== "submarine" ||
        !areConnected(
          state.map,
          operation.requiredSectorId,
          operation.path[0],
        ) ||
        !areConnected(state.map, operation.path[0], operation.path[1])
      ) {
        issues.push({
          code: "BAD_ROUTE",
          message: "Sprint requires a legal two-edge route.",
          pulse,
        });
      }
      break;
    case "navigate":
      if (
        asset.kind !== "ark" ||
        !areConnected(
          state.map,
          operation.requiredSectorId,
          operation.toSectorId,
        )
      ) {
        issues.push({
          code: "BAD_NAVIGATE",
          message: "Navigate requires an Ark and one legal edge.",
          pulse,
        });
      }
      if (
        operation.towPlatformId &&
        state.seats[seatId]?.faction !== "roaming_atoll"
      ) {
        issues.push({
          code: "NO_TOW_POWER",
          message: "Only Roaming Atoll can tow a platform.",
          pulse,
        });
      }
      break;
    case "survey":
      if (
        asset.kind !== "submarine" &&
        !(
          asset.kind === "platform" &&
          asset.module === "sonar" &&
          asset.state === "active"
        )
      ) {
        issues.push({
          code: "WRONG_ASSET",
          message: "Survey requires a submarine or active Sonar.",
          pulse,
        });
      }
      if (
        operation.suppressPublicContact &&
        state.seats[seatId]?.faction !== "quiet_current"
      ) {
        issues.push({
          code: "NO_SUPPRESS_POWER",
          message: "Only Quiet Current can suppress this contact.",
          pulse,
        });
      }
      break;
    case "harvest":
    case "analyze":
    case "deploy":
    case "raid":
    case "jam":
    case "go_dark":
      if (asset.kind !== "submarine") {
        issues.push({
          code: "WRONG_ASSET",
          message: `${operation.kind} requires a submarine.`,
          pulse,
        });
      }
      break;
    case "hunt":
      if (asset.kind !== "submarine") {
        issues.push({
          code: "WRONG_ASSET",
          message: "hunt requires a submarine.",
          pulse,
        });
      }
      if (
        Boolean(operation.targetSeatId) === Boolean(operation.targetEvidenceId)
      ) {
        issues.push({
          code: "HUNT_TARGET",
          message: "Hunt requires exactly one suspected seat or known contact.",
          pulse,
        });
      }
      if (operation.targetEvidenceId) {
        const publicEvidence = state.evidence[operation.targetEvidenceId];
        const privateObservation =
          state.observations[operation.targetEvidenceId];
        const grantedReport = state.reports[operation.targetEvidenceId];
        const knowsContact =
          publicEvidence !== undefined ||
          privateObservation?.ownerId === seatId ||
          (grantedReport?.kind === "sealed" &&
            state.reportGrants.some(
              (grant) =>
                grant.reportId === grantedReport.id && grant.seatId === seatId,
            ));
        if (!knowsContact)
          issues.push({
            code: "UNKNOWN_CONTACT",
            message: "That contact is not in your Intel.",
            pulse,
          });
      }
      break;
    case "develop":
      if (asset.kind !== "ark") {
        issues.push({
          code: "WRONG_ASSET",
          message: "Develop requires the Ark.",
          pulse,
        });
      }
      break;
    case "screen":
      if (asset.kind !== "submarine" && asset.kind !== "ark") {
        issues.push({
          code: "WRONG_ASSET",
          message: "Screen requires a submarine or Ark.",
          pulse,
        });
      }
      break;
    case "hold":
      break;
  }
}

/**
 * Validates only facts the acting seat is allowed to know. Hidden opponents are
 * deliberately never used to reject a draft.
 */
export function validateProgram(
  state: RulesState,
  seatId: SeatId,
  program: ThreePulseProgram,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!state.seats[seatId]) {
    return {
      valid: false,
      issues: [{ code: "UNKNOWN_SEAT", message: "Seat does not exist." }],
      reservedSupply: 0,
      reservedSignal: 0,
    };
  }
  if (program.seatId !== seatId || program.operations.length !== 3) {
    issues.push({
      code: "BAD_PROGRAM",
      message: "A program must contain exactly three Operations for its seat.",
    });
  }
  let reservedSupply = 0;
  let reservedSignal = 0;
  let hadalDiscountAvailable =
    !state.seats[seatId]!.factionUses.hadalDiscountUsed;
  let towAvailable = !state.seats[seatId]!.factionUses.towUsed;
  let quietSuppressionAvailable =
    !state.seats[seatId]!.factionUses.quietContactSuppressed;
  let predictedPlatformCount = ownedAssets(state, seatId).filter(
    (asset) => asset.kind === "platform",
  ).length;
  let predictedSubmarineCount = ownedAssets(state, seatId).filter(
    (asset) => asset.kind === "submarine",
  ).length;
  let predictedLiveDevices = Object.values(state.devices).filter(
    (device) => device.ownerId === seatId && device.state === "armed",
  ).length;
  const predictedInventory = { ...state.seats[seatId]!.deviceInventory };
  const predictedSector = new Map<AssetId, number>();
  const predictedSilence = new Map<AssetId, number>();
  for (const asset of ownedAssets(state, seatId)) {
    predictedSector.set(asset.id, asset.sectorId);
    if (asset.kind === "submarine")
      predictedSilence.set(asset.id, asset.silence);
  }

  for (const [index, operation] of program.operations.entries()) {
    const pulse = (index + 1) as Pulse;
    if (operation.pulse !== pulse) {
      issues.push({
        code: "BAD_PULSE",
        message: `Operation ${index + 1} must be assigned to Pulse ${pulse}.`,
        pulse,
      });
    }
    validateOperationShape(state, seatId, operation, issues);
    const assetId = operation.assetId;
    if (
      assetId &&
      "requiredSectorId" in operation &&
      operation.requiredSectorId !== undefined
    ) {
      const expected = predictedSector.get(assetId);
      if (expected !== undefined && expected !== operation.requiredSectorId) {
        issues.push({
          code: "OWN_ROUTE_MISMATCH",
          message:
            "This Operation does not begin where your preceding planned route ends.",
          pulse,
        });
      }
    }
    if (
      operation.kind === "develop" &&
      operation.project.kind === "repair_submarine"
    ) {
      const target = state.assets[operation.project.submarineId];
      if (target?.kind !== "submarine" || target.ownerId !== seatId) {
        issues.push({
          code: "REPAIR_TARGET_NOT_OWNED",
          message: "Repair requires one of your submarines.",
          pulse,
        });
      } else {
        const targetSector = predictedSector.get(target.id) ?? target.sectorId;
        if (targetSector !== operation.requiredSectorId) {
          issues.push({
            code: "REPAIR_NOT_COLOCATED",
            message: "The Ark and repair target must be co-located this Pulse.",
            pulse,
          });
        }
        if (
          target.status !== "disabled" &&
          target.integrity >= target.maxIntegrity
        ) {
          issues.push({
            code: "REPAIR_NOT_NEEDED",
            message: "The selected submarine does not need repair.",
            pulse,
          });
        }
        if (target.status === "constructing") {
          issues.push({
            code: "REPAIR_TARGET_CONSTRUCTING",
            message: "A constructing submarine cannot be repaired.",
            pulse,
          });
        }
      }
    }
    if (operation.kind === "glide") {
      predictedSector.set(operation.assetId, operation.toSectorId);
      if (operation.silent) {
        const remaining = (predictedSilence.get(operation.assetId) ?? 0) - 1;
        predictedSilence.set(operation.assetId, remaining);
        if (remaining < 0)
          issues.push({
            code: "NO_SILENCE",
            message: "The full plan overspends Silence.",
            pulse,
          });
      }
    } else if (operation.kind === "sprint") {
      predictedSector.set(operation.assetId, operation.path[1]);
    } else if (operation.kind === "navigate") {
      predictedSector.set(operation.assetId, operation.toSectorId);
      if (operation.towPlatformId) {
        if (!towAvailable)
          issues.push({
            code: "TOW_USED",
            message: "Tow is available once per round.",
            pulse,
          });
        towAvailable = false;
      }
    } else if (operation.kind === "hold" && operation.assetId) {
      const asset = state.assets[operation.assetId];
      if (asset?.kind === "submarine") {
        predictedSilence.set(
          operation.assetId,
          Math.min(
            asset.maxSilence,
            (predictedSilence.get(operation.assetId) ?? 0) + 1,
          ),
        );
      }
    } else if (operation.kind === "go_dark") {
      const asset = state.assets[operation.assetId];
      if (asset?.kind === "submarine")
        predictedSilence.set(asset.id, asset.maxSilence);
    }

    let supplyCost = operationSupplyCost(
      state,
      seatId,
      operation,
      hadalDiscountAvailable,
    );
    let signalCost = operationSignalCost(operation);
    if (operation.kind === "develop" && operation.project.kind === "platform") {
      predictedPlatformCount += 1;
      if (predictedPlatformCount > 4)
        issues.push({
          code: "PLATFORM_CAP",
          message: "You may own at most four platforms.",
          pulse,
        });
    }
    if (
      operation.kind === "develop" &&
      operation.project.kind === "submarine"
    ) {
      predictedSubmarineCount += 1;
      if (predictedSubmarineCount > 2)
        issues.push({
          code: "SUBMARINE_CAP",
          message: "You may own at most two submarines.",
          pulse,
        });
    }
    if (
      (operation.kind === "survey" || operation.kind === "harvest") &&
      operation.suppressPublicContact
    ) {
      if (!quietSuppressionAvailable)
        issues.push({
          code: "SUPPRESS_USED",
          message: "Contact suppression is available once per round.",
          pulse,
        });
      quietSuppressionAvailable = false;
      const suppressingAsset = state.assets[operation.assetId];
      if (suppressingAsset?.kind !== "submarine") {
        issues.push({
          code: "SUPPRESS_SOURCE",
          message: "Only a submarine can suppress its contact.",
          pulse,
        });
      } else {
        const remaining = (predictedSilence.get(operation.assetId) ?? 0) - 1;
        predictedSilence.set(operation.assetId, remaining);
        if (remaining < 0)
          issues.push({
            code: "NO_SILENCE",
            message: "Contact suppression requires one Silence.",
            pulse,
          });
      }
    }
    if (
      operation.kind === "develop" &&
      operation.project.kind === "platform" &&
      hadalDiscountAvailable &&
      state.seats[seatId]!.faction === "hadal_engineers"
    ) {
      hadalDiscountAvailable = false;
    }
    if (operation.kind === "deploy") {
      const inventory = predictedInventory[operation.device];
      if (inventory <= 0) {
        const totalCharges =
          predictedLiveDevices +
          predictedInventory.snare +
          predictedInventory.decoy;
        if (totalCharges >= 2)
          issues.push({
            code: "DEVICE_CAP",
            message: "You may own at most two device charges.",
            pulse,
          });
        supplyCost += 1;
        signalCost += 1;
      } else predictedInventory[operation.device] -= 1;
      predictedLiveDevices += 1;
      validateDeployRoute(state, operation, issues);
    }
    reservedSupply += supplyCost;
    reservedSignal += signalCost;
  }
  if (reservedSupply > state.seats[seatId]!.supply) {
    issues.push({
      code: "INSUFFICIENT_SUPPLY",
      message: "The full plan overspends Supply.",
    });
  }
  if (reservedSignal > state.seats[seatId]!.signal) {
    issues.push({
      code: "INSUFFICIENT_SIGNAL",
      message: "The full plan overspends Signal.",
    });
  }
  return { valid: issues.length === 0, issues, reservedSupply, reservedSignal };
}

function validateDeployRoute(
  state: RulesState,
  operation: DeployOperation,
  issues: ValidationIssue[],
): void {
  if (operation.device !== "decoy") return;
  const route = operation.decoyRoute ?? [];
  if (route.length > 3) {
    issues.push({
      code: "DECOY_ROUTE_LONG",
      message: "A Decoy route has at most three edges.",
      pulse: operation.pulse,
    });
  }
  let previous = operation.requiredSectorId;
  for (const sector of route) {
    if (!areConnected(state.map, previous, sector)) {
      issues.push({
        code: "BAD_DECOY_ROUTE",
        message: "Every Decoy route step must follow an edge.",
        pulse: operation.pulse,
      });
      return;
    }
    previous = sector;
  }
}

export function reserveProgram(
  state: RulesState,
  program: ThreePulseProgram,
): ValidationResult {
  const result = validateProgram(state, program.seatId, program);
  if (!result.valid) return result;
  state.programs[program.seatId] = structuredClone(program);
  state.programEscrows[program.seatId] = {
    supply: result.reservedSupply,
    signal: result.reservedSignal,
  };
  return result;
}

export function defaultProgram(seatId: SeatId): ThreePulseProgram {
  return {
    seatId,
    operations: [1, 2, 3].map((pulse) => ({
      kind: "hold",
      pulse: pulse as Pulse,
    })) as [Operation, Operation, Operation],
  };
}

export function listLegalOperations(
  state: RulesState,
  seatId: SeatId,
  assetId: AssetId,
): OperationChoice[] {
  const asset = state.assets[assetId];
  if (!asset || asset.ownerId !== seatId) return [];
  const choices: OperationChoice[] = [{ kind: "hold", assetId, label: "Hold" }];
  if (
    asset.kind === "submarine" &&
    asset.status === "active" &&
    asset.usableFromRound <= state.round
  ) {
    const adjacent = connectedSectors(state.map, asset.sectorId);
    choices.push({
      kind: "glide",
      assetId,
      sectorIds: adjacent,
      label: "Glide",
    });
    choices.push({
      kind: "sprint",
      assetId,
      sectorIds: [
        ...new Set(
          adjacent.flatMap((middle) => connectedSectors(state.map, middle)),
        ),
      ].sort((a, b) => a - b),
      label: "Sprint",
    });
    choices.push({
      kind: "survey",
      assetId,
      sectorIds: [asset.sectorId],
      label: "Survey",
    });
    choices.push({
      kind: "harvest",
      assetId,
      sectorIds: [asset.sectorId],
      targetIds: [
        ...(state.sites[asset.sectorId]?.stockSpecimenId
          ? [`site:${asset.sectorId}`]
          : []),
        ...Object.values(state.salvage)
          .filter((item) => item.sectorId === asset.sectorId)
          .map((item) => item.id),
      ],
      label: "Harvest",
    });
    choices.push({
      kind: "analyze",
      assetId,
      sectorIds: [asset.sectorId],
      targetIds: [...asset.cargo],
      label: "Analyze",
    });
    choices.push({
      kind: "deploy",
      assetId,
      sectorIds: [asset.sectorId],
      label: "Deploy device",
    });
    choices.push({
      kind: "hunt",
      assetId,
      sectorIds: [asset.sectorId],
      label: "Hunt",
    });
    choices.push({
      kind: "raid",
      assetId,
      sectorIds: [asset.sectorId],
      targetIds: Object.values(state.assets)
        .filter(
          (candidate) =>
            candidate.kind === "platform" &&
            candidate.sectorId === asset.sectorId &&
            candidate.ownerId !== seatId,
        )
        .map((candidate) => candidate.id),
      label: "Raid",
    });
    choices.push({
      kind: "jam",
      assetId,
      sectorIds: [asset.sectorId],
      label: "Jam",
    });
    choices.push({
      kind: "go_dark",
      assetId,
      sectorIds: [asset.sectorId],
      label: "Go Dark",
    });
    choices.push({
      kind: "screen",
      assetId,
      sectorIds: [asset.sectorId],
      label: "Screen",
    });
  } else if (asset.kind === "ark") {
    choices.push({
      kind: "navigate",
      assetId,
      sectorIds: connectedSectors(state.map, asset.sectorId),
      label: "Navigate",
    });
    choices.push({
      kind: "develop",
      assetId,
      sectorIds: [asset.sectorId],
      label: "Develop",
    });
    choices.push({
      kind: "screen",
      assetId,
      sectorIds: [asset.sectorId],
      label: "Screen",
    });
  } else if (
    asset.kind === "platform" &&
    asset.module === "sonar" &&
    asset.state === "active"
  ) {
    choices.push({
      kind: "survey",
      assetId,
      sectorIds: [asset.sectorId],
      label: "Active Survey",
    });
  }
  return choices;
}

export function developProjectCost(
  state: RulesState,
  seatId: SeatId,
  project: DevelopOperation["project"],
): number {
  if (project.kind === "platform") {
    return state.seats[seatId]?.faction === "hadal_engineers" &&
      !state.seats[seatId]!.factionUses.hadalDiscountUsed
      ? 2
      : 3;
  }
  return project.kind === "submarine" ? 4 : 1;
}
