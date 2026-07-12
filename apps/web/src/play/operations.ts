import type {
  DraftPlan,
  Operation,
  PlayerProjection,
} from "@blackwater/protocol";

export type Pulse = 1 | 2 | 3;
export type OperationKind = Operation["kind"];
export type Commitment = 0 | 1 | 2;
export type ModuleKind = "extractor" | "sonar" | "laboratory";
export type OperationChapter = "core" | "fieldwork" | "tactics";

export type AssetChoice = {
  id: string;
  kind: "ark" | "submarine" | "platform";
  module?: ModuleKind;
  label: string;
  sectorId: number;
  available: boolean;
  detail: string;
};

export type OperationEditor = {
  kind: OperationKind;
  assetId: string;
  targetSectorId: number | null;
  silent: boolean;
  suppressPublicContact: boolean;
  commitment: Commitment;
  module: ModuleKind;
  developKind: "platform" | "submarine" | "repair_submarine";
  device: "snare" | "decoy";
  snareMode: "tag" | "spill";
  targetPlatformId: string;
  targetEvidenceId: string;
  targetSeatId: string;
  harvestTargetId: string;
  specimenId: string;
  repairSubmarineId: string;
  towPlatformId: string;
  decoyRouteSectorId: number | null;
};

export const OPERATION_META: Record<
  OperationKind,
  {
    label: string;
    short: string;
    trace: string;
    when: string;
    how: string;
    chapter: OperationChapter;
    unlockRound: 1 | 2;
  }
> = {
  hold: {
    label: "Hold",
    short: "Wait and recover one Silence",
    trace: "No new public evidence",
    when: "Use it when this unit has nothing urgent to do, or when your submarine needs one Silence back.",
    how: "No target is needed. Save the Pulse and this unit stays in its sector.",
    chapter: "core",
    unlockRound: 1,
  },
  glide: {
    label: "Glide",
    short: "Move a submarine one edge",
    trace: "Origin wake unless Silent Running",
    when: "Use it for precise hidden movement along one connection.",
    how: "Tap one glowing connected sector on the map. Silent Running spends one Silence and hides the ordinary wake.",
    chapter: "core",
    unlockRound: 1,
  },
  sprint: {
    label: "Sprint",
    short: "Move a submarine two edges",
    trace: "Public wakes along the route",
    when: "Use it to cross the basin quickly when secrecy matters less than tempo.",
    how: "Tap a glowing two-edge destination. The route is fixed and leaves public evidence.",
    chapter: "core",
    unlockRound: 1,
  },
  navigate: {
    label: "Navigate",
    short: "Move your public Ark one edge",
    trace: "Full route is public",
    when: "Use it to move your construction base toward a new sector.",
    how: "Tap one glowing connected sector. Your Ark is always public and cannot be destroyed.",
    chapter: "core",
    unlockRound: 1,
  },
  survey: {
    label: "Survey",
    short: "Spend 1 Signal for an active scan",
    trace: "Identified pinger contact",
    when: "Use it at a Deep Site or where hidden submarines and traps may be nearby.",
    how: "The scan happens in this unit's sector. It costs one Signal; no map target is needed.",
    chapter: "core",
    unlockRound: 1,
  },
  harvest: {
    label: "Harvest",
    short: "Contest a specimen or salvage",
    trace: "Public contact at the site",
    when: "This appears when your submarine shares a sector with a stocked site or salvage pod.",
    how: "Choose the available cargo and optionally commit Signal to beat a rival Harvest in the same Pulse.",
    chapter: "fieldwork",
    unlockRound: 1,
  },
  analyze: {
    label: "Analyze",
    short: "Process carried cargo at your Lab",
    trace: "Analyzed count becomes public",
    when: "This appears when a submarine carrying a specimen reaches your active Laboratory.",
    how: "Choose one carried specimen. Its type stays private while your public analyzed count increases.",
    chapter: "fieldwork",
    unlockRound: 1,
  },
  develop: {
    label: "Develop",
    short: "Build or repair durable infrastructure",
    trace: "Project and owner are public",
    when: "Use your Ark to build toward a Charter, add a second submarine, or repair damage.",
    how: "Choose a project in the Ark's current sector. Platforms persist and remain publicly visible.",
    chapter: "core",
    unlockRound: 1,
  },
  deploy: {
    label: "Deploy",
    short: "Place a hidden Snare or Decoy",
    trace: "Hidden until detected or triggered",
    when: "Use it to protect a route, set a trap, or manufacture misleading evidence.",
    how: "Choose a Snare or Decoy. It is placed secretly in this submarine's sector.",
    chapter: "tactics",
    unlockRound: 2,
  },
  hunt: {
    label: "Hunt",
    short: "Challenge a suspected submarine",
    trace: "Public only if a target is present",
    when: "Use it when evidence or conversation gives you a reason to suspect a rival is here.",
    how: "Name one contact or expedition and optionally commit Signal. A wrong guess still spends the commitment.",
    chapter: "tactics",
    unlockRound: 2,
  },
  raid: {
    label: "Raid",
    short: "Disable or contest a platform",
    trace: "Attempt and participants become public",
    when: "This appears when your submarine shares a sector with a rival platform.",
    how: "Choose that platform and optionally commit Signal. Winning begins a public contest rather than deleting it.",
    chapter: "tactics",
    unlockRound: 2,
  },
  jam: {
    label: "Jam",
    short: "Spend 1 Signal to suppress a module",
    trace: "Public disturbance; source stays hidden",
    when: "This appears when your submarine shares a sector with a rival platform you want to silence.",
    how: "Choose the platform. Jam costs one Signal and temporarily stops its module.",
    chapter: "tactics",
    unlockRound: 2,
  },
  go_dark: {
    label: "Go Dark",
    short: "Hold and refill all Silence",
    trace: "No new public evidence",
    when: "Use it after spending Silence or when old evidence is making your route too obvious.",
    how: "Stay in this sector for the Pulse, refill all Silence, and reduce your old evidence.",
    chapter: "tactics",
    unlockRound: 2,
  },
  screen: {
    label: "Screen",
    short: "Protect an asset during this Pulse",
    trace: "Revealed only if it contributes",
    when: "Use it when you expect a Hunt or Raid and want hidden defensive force ready.",
    how: "Stay in this sector and optionally commit Signal. The defense is revealed only if it matters.",
    chapter: "tactics",
    unlockRound: 2,
  },
};

export type OperationOpportunity = {
  kind: OperationKind;
  reason: string;
};

export type OperationMenu = {
  core: OperationKind[];
  opportunities: OperationOpportunity[];
  tactics: OperationKind[];
  current: OperationKind | null;
  tacticsUnlockRound: 2;
};

const coreOrder: OperationKind[] = [
  "glide",
  "sprint",
  "navigate",
  "survey",
  "develop",
  "hold",
];
const tacticOrder: OperationKind[] = [
  "deploy",
  "go_dark",
  "hunt",
  "screen",
  "raid",
  "jam",
];

/**
 * Builds the phone's progressive operation menu from facts this player already
 * knows. It changes presentation, never hidden-information legality.
 */
export function operationMenuForAsset(
  projection: PlayerProjection,
  asset: AssetChoice | undefined,
  plan: DraftPlan,
  pulse: Pulse,
  currentKind?: OperationKind,
): OperationMenu {
  const rawKinds = operationKindsForAsset(asset);
  const raw = new Set(rawKinds);
  const sectorId = asset ? projectedAssetSector(asset, plan, pulse) : null;
  const liveDeviceCount = projection.devices.filter(
    (device) => device.state === "deployed",
  ).length;
  const heldDeviceCount =
    projection.deviceInventory.snare + projection.deviceInventory.decoy;
  const canFabricateDevice =
    liveDeviceCount + heldDeviceCount < 2 &&
    projection.resources.supply >= 1 &&
    projection.resources.signal >= 1;
  if (heldDeviceCount === 0 && !canFabricateDevice) raw.delete("deploy");

  const core = coreOrder.filter((kind) => raw.has(kind));
  const opportunities: OperationOpportunity[] = [];
  if (
    raw.has("harvest") &&
    sectorId !== null &&
    (projection.public.deepSites.some(
      (site) => site.sectorId === sectorId && site.specimenAvailable,
    ) ||
      projection.public.salvage.some((item) => item.sectorId === sectorId))
  ) {
    opportunities.push({ kind: "harvest", reason: "Cargo available here" });
  }
  const submarine = projection.submarines.find(
    (candidate) => candidate.assetId === asset?.id,
  );
  if (
    raw.has("analyze") &&
    sectorId !== null &&
    Boolean(submarine?.cargo.length) &&
    projection.public.platforms.some(
      (platform) =>
        platform.ownerSeatId === projection.seatId &&
        platform.module === "laboratory" &&
        platform.state === "active" &&
        platform.sectorId === sectorId,
    )
  ) {
    opportunities.push({ kind: "analyze", reason: "Lab and cargo ready" });
  }

  const rivalPlatformHere =
    sectorId !== null &&
    projection.public.platforms.some(
      (platform) =>
        platform.ownerSeatId !== projection.seatId &&
        platform.sectorId === sectorId,
    );
  const tactics =
    projection.public.phase.round < 2
      ? []
      : tacticOrder.filter(
          (kind) =>
            raw.has(kind) &&
            ((kind !== "raid" && kind !== "jam") || rivalPlatformHere),
        );

  const visible = new Set<OperationKind>([
    ...core,
    ...opportunities.map((item) => item.kind),
    ...tactics,
  ]);
  const current =
    currentKind && raw.has(currentKind) && !visible.has(currentKind)
      ? currentKind
      : null;
  return {
    core,
    opportunities,
    tactics,
    current,
    tacticsUnlockRound: 2,
  };
}

export function playableAssets(projection: PlayerProjection): AssetChoice[] {
  const own = projection.public.expeditions.find(
    (expedition) => expedition.seatId === projection.seatId,
  );
  const arks = projection.public.arks
    .filter((ark) => ark.ownerSeatId === projection.seatId)
    .map((ark): AssetChoice => ({
      id: ark.assetId,
      kind: "ark",
      label: "ARK",
      sectorId: ark.sectorId,
      available: !ark.jammed,
      detail: ark.jammed ? "Jammed" : `Public · Site ${ark.sectorId}`,
    }));
  const submarines = projection.submarines.map(
    (submarine, index): AssetChoice => ({
      id: submarine.assetId,
      kind: "submarine",
      label: `SUB ${String.fromCharCode(65 + index)}`,
      sectorId: submarine.sectorId,
      available:
        submarine.state === "active" &&
        submarine.usableFromRound <= projection.public.phase.round,
      detail:
        submarine.state === "constructing"
          ? `Calibrating · R${submarine.usableFromRound}`
          : `Integrity ${submarine.integrity}/2 · Silence ${submarine.silence}/${submarine.maxSilence}`,
    }),
  );
  const platforms = projection.public.platforms
    .filter((platform) => platform.ownerSeatId === projection.seatId)
    .map((platform): AssetChoice => ({
      id: platform.platformId,
      kind: "platform",
      module: platform.module,
      label: platform.module.toUpperCase(),
      sectorId: platform.sectorId,
      available: platform.state === "active",
      detail: `${platform.state} · Site ${platform.sectorId}`,
    }));
  return [...arks, ...submarines, ...platforms].map((asset) => ({
    ...asset,
    label:
      asset.kind === "ark" ? `${own?.displayName ?? "Your"} Ark` : asset.label,
  }));
}

export function operationKindsForAsset(
  asset: AssetChoice | undefined,
): OperationKind[] {
  if (!asset) return ["hold"];
  if (!asset.available) return ["hold"];
  if (asset.kind === "ark") return ["navigate", "develop", "screen", "hold"];
  if (asset.kind === "platform")
    return asset.module === "sonar" ? ["survey", "hold"] : ["hold"];
  return [
    "glide",
    "sprint",
    "survey",
    "harvest",
    "analyze",
    "deploy",
    "hunt",
    "raid",
    "jam",
    "go_dark",
    "screen",
    "hold",
  ];
}

export function adjacentSectorIds(
  projection: PlayerProjection,
  sectorId: number,
): number[] {
  return projection.public.topology.edges
    .flatMap((edge) =>
      edge.a === sectorId ? [edge.b] : edge.b === sectorId ? [edge.a] : [],
    )
    .sort((a, b) => a - b);
}

export function twoEdgePath(
  projection: PlayerProjection,
  from: number,
  to: number,
): [number, number] | null {
  for (const middle of adjacentSectorIds(projection, from)) {
    if (adjacentSectorIds(projection, middle).includes(to)) return [middle, to];
  }
  return null;
}

export function projectedAssetSector(
  asset: AssetChoice,
  plan: DraftPlan,
  beforePulse: Pulse,
): number {
  let sectorId = asset.sectorId;
  for (const operation of plan.operations.slice(0, beforePulse - 1)) {
    if (operation.assetId !== asset.id) continue;
    if (operation.kind === "glide" || operation.kind === "navigate")
      sectorId = operation.toSectorId;
    if (operation.kind === "sprint") sectorId = operation.path[1];
  }
  return sectorId;
}

export function reachableForEditor(
  projection: PlayerProjection,
  asset: AssetChoice | undefined,
  plan: DraftPlan,
  pulse: Pulse,
  kind: OperationKind,
): number[] {
  if (!asset) return [];
  const from = projectedAssetSector(asset, plan, pulse);
  if (kind === "glide" || kind === "navigate")
    return adjacentSectorIds(projection, from);
  if (kind === "sprint") {
    const destinations = adjacentSectorIds(projection, from)
      .flatMap((middle) => adjacentSectorIds(projection, middle))
      .filter((sectorId) => sectorId !== from);
    return [...new Set(destinations)].sort((a, b) => a - b);
  }
  return [from];
}

export function editorFromOperation(
  operation: Operation,
  fallbackAssetId: string,
): OperationEditor {
  const targetSectorId =
    operation.kind === "glide" || operation.kind === "navigate"
      ? operation.toSectorId
      : operation.kind === "sprint"
        ? operation.path[1]
        : null;
  return {
    kind: operation.kind,
    assetId: operation.assetId ?? fallbackAssetId,
    targetSectorId,
    silent: operation.kind === "glide" ? operation.silent : false,
    suppressPublicContact:
      (operation.kind === "survey" || operation.kind === "harvest") &&
      Boolean(operation.suppressPublicContact),
    commitment:
      "signalCommitment" in operation
        ? (operation.signalCommitment as Commitment)
        : 0,
    module:
      operation.kind === "develop" && operation.project.kind === "platform"
        ? operation.project.module
        : "extractor",
    developKind:
      operation.kind === "develop" ? operation.project.kind : "platform",
    device: operation.kind === "deploy" ? operation.device : "snare",
    snareMode:
      operation.kind === "deploy" && operation.snareMode
        ? operation.snareMode
        : "tag",
    targetPlatformId:
      operation.kind === "raid" || operation.kind === "jam"
        ? operation.targetPlatformId
        : "",
    targetEvidenceId:
      operation.kind === "hunt" ? (operation.targetEvidenceId ?? "") : "",
    targetSeatId:
      operation.kind === "hunt" ? (operation.targetSeatId ?? "") : "",
    harvestTargetId: operation.kind === "harvest" ? operation.targetId : "",
    specimenId: operation.kind === "analyze" ? operation.specimenId : "",
    repairSubmarineId:
      operation.kind === "develop" &&
      operation.project.kind === "repair_submarine"
        ? operation.project.submarineId
        : "",
    towPlatformId:
      operation.kind === "navigate" ? (operation.towPlatformId ?? "") : "",
    decoyRouteSectorId:
      operation.kind === "deploy" && operation.device === "decoy"
        ? (operation.decoyRoute?.[0] ?? null)
        : null,
  };
}

export function blankEditor(assetId: string): OperationEditor {
  return {
    kind: "hold",
    assetId,
    targetSectorId: null,
    silent: false,
    suppressPublicContact: false,
    commitment: 0,
    module: "extractor",
    developKind: "platform",
    device: "snare",
    snareMode: "tag",
    targetPlatformId: "",
    targetEvidenceId: "",
    targetSeatId: "",
    harvestTargetId: "",
    specimenId: "",
    repairSubmarineId: "",
    towPlatformId: "",
    decoyRouteSectorId: null,
  };
}

export function buildOperation(
  projection: PlayerProjection,
  plan: DraftPlan,
  pulse: Pulse,
  editor: OperationEditor,
): { operation?: Operation; error?: string } {
  const asset = playableAssets(projection).find(
    (candidate) => candidate.id === editor.assetId,
  );
  if (editor.kind === "hold") {
    return asset
      ? {
          operation: {
            kind: "hold",
            pulse,
            assetId: asset.id,
            requiredSectorId: projectedAssetSector(asset, plan, pulse),
          },
        }
      : { operation: { kind: "hold", pulse } };
  }
  if (!asset) return { error: "Choose one of your assets." };
  if (!asset.available)
    return { error: `${asset.label} is not available this round.` };
  const requiredSectorId = projectedAssetSector(asset, plan, pulse);
  const destination = editor.targetSectorId;
  switch (editor.kind) {
    case "glide":
      if (
        destination === null ||
        !adjacentSectorIds(projection, requiredSectorId).includes(destination)
      )
        return { error: "Choose a connected destination on the map." };
      return {
        operation: {
          kind: "glide",
          pulse,
          assetId: asset.id,
          requiredSectorId,
          toSectorId: destination,
          silent: editor.silent,
        },
      };
    case "sprint": {
      if (destination === null)
        return { error: "Choose a two-edge destination." };
      const path = twoEdgePath(projection, requiredSectorId, destination);
      return path
        ? {
            operation: {
              kind: "sprint",
              pulse,
              assetId: asset.id,
              requiredSectorId,
              path,
            },
          }
        : { error: "That destination has no legal two-edge route." };
    }
    case "navigate":
      if (
        destination === null ||
        !adjacentSectorIds(projection, requiredSectorId).includes(destination)
      )
        return { error: "Choose a connected destination for the Ark." };
      if (editor.towPlatformId) {
        const tow = projection.public.platforms.find(
          (platform) =>
            platform.platformId === editor.towPlatformId &&
            platform.ownerSeatId === projection.seatId &&
            platform.sectorId === requiredSectorId &&
            platform.state === "active",
        );
        if (!tow || projection.faction !== "roaming_atoll")
          return {
            error:
              "Tow requires your co-located active platform and Roaming Atoll power.",
          };
        return {
          operation: {
            kind: "navigate",
            pulse,
            assetId: asset.id,
            requiredSectorId,
            toSectorId: destination,
            towPlatformId: tow.platformId,
          },
        };
      }
      return {
        operation: {
          kind: "navigate",
          pulse,
          assetId: asset.id,
          requiredSectorId,
          toSectorId: destination,
        },
      };
    case "survey":
      return editor.suppressPublicContact
        ? {
            operation: {
              kind: "survey",
              pulse,
              assetId: asset.id,
              requiredSectorId,
              suppressPublicContact: true,
            },
          }
        : {
            operation: {
              kind: "survey",
              pulse,
              assetId: asset.id,
              requiredSectorId,
            },
          };
    case "harvest": {
      const targets = [
        ...projection.public.deepSites
          .filter(
            (candidate) =>
              candidate.sectorId === requiredSectorId &&
              candidate.specimenAvailable,
          )
          .map(() => `site:${requiredSectorId}`),
        ...projection.public.salvage
          .filter((salvage) => salvage.sectorId === requiredSectorId)
          .map((salvage) => salvage.salvageId),
      ];
      if (!targets.length)
        return {
          error:
            "No harvestable specimen or salvage is publicly available in this sector.",
        };
      const targetId =
        editor.harvestTargetId ||
        (targets.length === 1 ? targets[0] : undefined);
      if (!targetId || !targets.includes(targetId))
        return {
          error:
            "Choose whether to Harvest the stocked Site or a specific salvage pod.",
        };
      return editor.suppressPublicContact
        ? {
            operation: {
              kind: "harvest",
              pulse,
              assetId: asset.id,
              requiredSectorId,
              targetId,
              signalCommitment: editor.commitment,
              suppressPublicContact: true,
            },
          }
        : {
            operation: {
              kind: "harvest",
              pulse,
              assetId: asset.id,
              requiredSectorId,
              targetId,
              signalCommitment: editor.commitment,
            },
          };
    }
    case "analyze": {
      const submarine = projection.submarines.find(
        (candidate) => candidate.assetId === asset.id,
      );
      const specimenId =
        editor.specimenId ||
        (submarine?.cargo.length === 1
          ? submarine.cargo[0]?.specimenId
          : undefined);
      if (!submarine?.cargo.length)
        return { error: "This submarine carries no specimen to analyze." };
      if (!specimenId)
        return { error: "Choose which carried specimen to analyze." };
      const lab = projection.public.platforms.find(
        (platform) =>
          platform.ownerSeatId === projection.seatId &&
          platform.module === "laboratory" &&
          platform.state === "active" &&
          platform.sectorId === requiredSectorId,
      );
      if (!lab)
        return {
          error: "Analyze requires your active Laboratory in this sector.",
        };
      return {
        operation: {
          kind: "analyze",
          pulse,
          assetId: asset.id,
          requiredSectorId,
          specimenId,
        },
      };
    }
    case "develop": {
      if (asset.kind !== "ark") return { error: "Only your Ark can Develop." };
      if (editor.developKind === "platform")
        return {
          operation: {
            kind: "develop",
            pulse,
            assetId: asset.id,
            requiredSectorId,
            project: { kind: "platform", module: editor.module },
          },
        };
      if (editor.developKind === "submarine")
        return {
          operation: {
            kind: "develop",
            pulse,
            assetId: asset.id,
            requiredSectorId,
            project: { kind: "submarine" },
          },
        };
      const repairTarget = projection.submarines.find(
        (submarine) =>
          submarine.assetId === editor.repairSubmarineId &&
          submarine.sectorId === requiredSectorId &&
          (submarine.integrity < 2 || submarine.state === "disabled"),
      );
      return repairTarget
        ? {
            operation: {
              kind: "develop",
              pulse,
              assetId: asset.id,
              requiredSectorId,
              project: {
                kind: "repair_submarine",
                submarineId: repairTarget.assetId,
              },
            },
          }
        : {
            error:
              "Choose which damaged or disabled submarine is co-located with the Ark.",
          };
    }
    case "deploy": {
      if (projection.deviceInventory[editor.device] <= 0) {
        const liveDevices = projection.devices.filter(
          (device) => device.state === "deployed",
        ).length;
        const heldCharges =
          projection.deviceInventory.snare + projection.deviceInventory.decoy;
        if (liveDevices + heldCharges >= 2)
          return {
            error: `No ${editor.device} charge remains, and the two-device cap prevents fabrication.`,
          };
        if (projection.resources.supply < 1 || projection.resources.signal < 1)
          return {
            error: `Fabricating a replacement ${editor.device} requires 1 Supply and 1 Signal.`,
          };
      }
      if (editor.device === "snare")
        return {
          operation: {
            kind: "deploy",
            pulse,
            assetId: asset.id,
            requiredSectorId,
            device: "snare",
            snareMode: editor.snareMode,
          },
        };
      if (
        editor.decoyRouteSectorId !== null &&
        !adjacentSectorIds(projection, requiredSectorId).includes(
          editor.decoyRouteSectorId,
        )
      )
        return { error: "The Decoy's first route edge must be connected." };
      return editor.decoyRouteSectorId === null
        ? {
            operation: {
              kind: "deploy",
              pulse,
              assetId: asset.id,
              requiredSectorId,
              device: "decoy",
            },
          }
        : {
            operation: {
              kind: "deploy",
              pulse,
              assetId: asset.id,
              requiredSectorId,
              device: "decoy",
              decoyRoute: [editor.decoyRouteSectorId],
            },
          };
    }
    case "hunt": {
      if (editor.targetEvidenceId)
        return {
          operation: {
            kind: "hunt",
            pulse,
            assetId: asset.id,
            requiredSectorId,
            targetEvidenceId: editor.targetEvidenceId,
            signalCommitment: editor.commitment,
          },
        };
      if (editor.targetSeatId)
        return {
          operation: {
            kind: "hunt",
            pulse,
            assetId: asset.id,
            requiredSectorId,
            targetSeatId: editor.targetSeatId,
            signalCommitment: editor.commitment,
          },
        };
      return {
        error:
          "Hunt requires exactly one named contact or suspected expedition.",
      };
    }
    case "raid": {
      const target =
        editor.targetPlatformId ||
        projection.public.platforms.find(
          (platform) =>
            platform.ownerSeatId !== projection.seatId &&
            platform.sectorId === requiredSectorId,
        )?.platformId;
      return target
        ? {
            operation: {
              kind: "raid",
              pulse,
              assetId: asset.id,
              requiredSectorId,
              targetPlatformId: target,
              signalCommitment: editor.commitment,
            },
          }
        : { error: "Raid requires a rival platform in this sector." };
    }
    case "jam": {
      const target =
        editor.targetPlatformId ||
        projection.public.platforms.find(
          (platform) =>
            platform.ownerSeatId !== projection.seatId &&
            platform.sectorId === requiredSectorId,
        )?.platformId;
      return target
        ? {
            operation: {
              kind: "jam",
              pulse,
              assetId: asset.id,
              requiredSectorId,
              targetPlatformId: target,
            },
          }
        : { error: "Jam requires a rival platform in this sector." };
    }
    case "go_dark":
      return {
        operation: {
          kind: "go_dark",
          pulse,
          assetId: asset.id,
          requiredSectorId,
        },
      };
    case "screen":
      return {
        operation: {
          kind: "screen",
          pulse,
          assetId: asset.id,
          requiredSectorId,
          signalCommitment: editor.commitment,
        },
      };
    default:
      return { error: "This operation is not available." };
  }
}

export function replacePulse(
  plan: DraftPlan,
  pulse: Pulse,
  operation: Operation,
): DraftPlan {
  const operations = [...plan.operations] as [Operation, Operation, Operation];
  operations[pulse - 1] = operation;
  return plan.secondDawnSalvagePriority
    ? { operations, secondDawnSalvagePriority: plan.secondDawnSalvagePriority }
    : { operations };
}

export function operationCost(
  operation: Operation,
  hadalPlatformDiscount = false,
  fabricateDevice = false,
): { supply: number; signal: number; silence: number } {
  let supply = 0;
  let signal = 0;
  let silence = 0;
  if (operation.kind === "survey" || operation.kind === "jam") signal = 1;
  if (
    operation.kind === "harvest" ||
    operation.kind === "hunt" ||
    operation.kind === "raid" ||
    operation.kind === "screen"
  )
    signal = operation.signalCommitment;
  if (operation.kind === "glide" && operation.silent) silence = 1;
  if (
    (operation.kind === "survey" || operation.kind === "harvest") &&
    operation.suppressPublicContact
  )
    silence += 1;
  if (operation.kind === "develop")
    supply =
      operation.project.kind === "platform"
        ? hadalPlatformDiscount
          ? 2
          : 3
        : operation.project.kind === "submarine"
          ? 4
          : 1;
  if (operation.kind === "deploy" && fabricateDevice) {
    supply += 1;
    signal += 1;
  }
  return { supply, signal, silence };
}

export function operationSummary(
  operation: Operation,
  projection: PlayerProjection,
): string {
  const sectorName = (id: number) =>
    projection.public.topology.sectors.find((sector) => sector.sectorId === id)
      ?.name ?? `Site ${id}`;
  switch (operation.kind) {
    case "hold":
      return "Hold position";
    case "glide":
      return `Glide → ${sectorName(operation.toSectorId)}${operation.silent ? " · silent" : ""}`;
    case "sprint":
      return `Sprint → ${sectorName(operation.path[1])}`;
    case "navigate":
      return `Navigate → ${sectorName(operation.toSectorId)}`;
    case "survey":
      return `Survey @ ${sectorName(operation.requiredSectorId)}`;
    case "harvest":
      return `Harvest @ ${sectorName(operation.requiredSectorId)} · commit ${operation.signalCommitment}`;
    case "analyze":
      return `Analyze ${operation.specimenId}`;
    case "develop":
      return `Develop ${operation.project.kind === "platform" ? operation.project.module : operation.project.kind.replaceAll("_", " ")}`;
    case "deploy":
      return `Deploy ${operation.device}${operation.device === "snare" ? ` · ${operation.snareMode}` : ""}`;
    case "hunt":
      return `Hunt @ ${sectorName(operation.requiredSectorId)} · commit ${operation.signalCommitment}`;
    case "raid":
      return `Raid ${operation.targetPlatformId} · commit ${operation.signalCommitment}`;
    case "jam":
      return `Jam ${operation.targetPlatformId}`;
    case "go_dark":
      return "Go Dark · refill Silence";
    case "screen":
      return `Screen @ ${sectorName(operation.requiredSectorId)} · commit ${operation.signalCommitment}`;
  }
}

export function planExposure(plan: DraftPlan): string {
  const visible = plan.operations.filter((operation) => {
    if (
      operation.kind === "hold" ||
      operation.kind === "go_dark" ||
      operation.kind === "deploy"
    )
      return false;
    return !(operation.kind === "glide" && operation.silent);
  });
  if (!visible.length) return "No guaranteed public trace";
  return `${visible.length} Pulse${visible.length === 1 ? "" : "s"} may reveal activity`;
}
