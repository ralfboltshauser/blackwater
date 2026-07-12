import {
  DraftPlanSchema,
  type BotStrategy,
  type DraftPlan,
  type Operation,
  type PlayerProjection,
} from "@blackwater/protocol";

type Pulse = 1 | 2 | 3;
type PublicPlatform = PlayerProjection["public"]["platforms"][number];
type PrivateSubmarine = PlayerProjection["submarines"][number];

/**
 * Blackwater's live bot policy has a deliberately narrow input. It cannot read
 * RulesState, another seat's private projection, or the canonical PRNG.
 */
export function planBotTurn(
  projection: PlayerProjection,
  strategy: BotStrategy,
): DraftPlan {
  const selected =
    strategy === "network"
      ? planNetwork(projection)
      : strategy === "discovery"
        ? planDiscovery(projection)
        : strategy === "dominion"
          ? planDominion(projection)
          : strategy === "interdictor"
            ? planInterdictor(projection)
            : planAdaptive(projection);
  return DraftPlanSchema.parse({
    ...selected,
    secondDawnSalvagePriority: salvagePriority(projection),
  });
}

function planNetwork(projection: PlayerProjection): DraftPlan {
  const ark = ownArk(projection);
  if (!ark) return holdPlan();
  let arkSector = ark.sectorId;
  let supply = projection.resources.supply;
  const ownPlatforms = sortedPlatforms(projection).filter(
    (platform) => platform.ownerSeatId === projection.seatId,
  );
  const shadowPlatforms = sortedPlatforms(projection).map((platform) => ({
    ...platform,
  }));
  const operations: Operation[] = [];

  for (const pulse of pulses()) {
    const occupied = shadowPlatforms.some(
      (platform) => platform.sectorId === arkSector,
    );
    if (!occupied && ownPlatforms.length < 4 && supply >= 3) {
      const module = nextNetworkModule(ownPlatforms);
      operations.push({
        kind: "develop",
        pulse,
        assetId: ark.assetId,
        requiredSectorId: arkSector,
        project: { kind: "platform", module },
      });
      const shadow: PublicPlatform = {
        platformId: `shadow-${projection.seatId}-${pulse}`,
        ownerSeatId: projection.seatId,
        sectorId: arkSector,
        module,
        state: "active",
        contenderSeatId: null,
        contestEligibleRound: null,
      };
      shadowPlatforms.push(shadow);
      ownPlatforms.push(shadow);
      supply -= 3;
      continue;
    }

    // Once an empty anchor has been reached, wait for enough production to
    // build there. Moving again would break the intended connected chain.
    if (!occupied) {
      operations.push(hold(pulse, ark.assetId, arkSector));
      continue;
    }
    const destination = bestNetworkNeighbor(
      projection,
      arkSector,
      ownPlatforms,
      shadowPlatforms,
    );
    if (destination === null) {
      operations.push(hold(pulse, ark.assetId, arkSector));
      continue;
    }
    operations.push({
      kind: "navigate",
      pulse,
      assetId: ark.assetId,
      requiredSectorId: arkSector,
      toSectorId: destination,
    });
    arkSector = destination;
  }
  return plan(operations);
}

function planDiscovery(projection: PlayerProjection): DraftPlan {
  const ark = ownArk(projection);
  const submarine = firstActiveSubmarine(projection);
  if (!ark && !submarine) return holdPlan();
  let arkSector = ark?.sectorId ?? null;
  let supply = projection.resources.supply;
  let signal = projection.resources.signal;
  let submarineSector = submarine?.sectorId ?? null;
  let silence = submarine?.silence ?? 0;
  const cargo = [...(submarine?.cargo ?? [])].sort((a, b) =>
    a.specimenId.localeCompare(b.specimenId),
  );
  let predictedCargo = cargo.length;
  const allPlatforms = sortedPlatforms(projection).map((platform) => ({
    ...platform,
  }));
  let laboratory = allPlatforms.find(
    (platform) =>
      platform.ownerSeatId === projection.seatId &&
      platform.module === "laboratory" &&
      platform.state === "active",
  );
  const availableSites = new Set(
    projection.public.deepSites
      .filter((site) => site.specimenAvailable)
      .map((site) => site.sectorId),
  );
  const operations: Operation[] = [];

  for (const pulse of pulses()) {
    if (!laboratory && ark && arkSector !== null) {
      const occupied = allPlatforms.some(
        (platform) => platform.sectorId === arkSector,
      );
      const ownPlatformCount = allPlatforms.filter(
        (platform) => platform.ownerSeatId === projection.seatId,
      ).length;
      if (!occupied && ownPlatformCount < 4 && supply >= 3) {
        operations.push({
          kind: "develop",
          pulse,
          assetId: ark.assetId,
          requiredSectorId: arkSector,
          project: { kind: "platform", module: "laboratory" },
        });
        laboratory = {
          platformId: `shadow-lab-${projection.seatId}`,
          ownerSeatId: projection.seatId,
          sectorId: arkSector,
          module: "laboratory",
          state: "active",
          contenderSeatId: null,
          contestEligibleRound: null,
        };
        allPlatforms.push(laboratory);
        supply -= 3;
        continue;
      }
      if (occupied) {
        const destination = adjacentSectorIds(projection, arkSector).find(
          (sectorId) =>
            !allPlatforms.some((platform) => platform.sectorId === sectorId),
        );
        if (destination !== undefined) {
          operations.push({
            kind: "navigate",
            pulse,
            assetId: ark.assetId,
            requiredSectorId: arkSector,
            toSectorId: destination,
          });
          arkSector = destination;
          continue;
        }
      }
    }

    if (!submarine || submarineSector === null) {
      operations.push(hold(pulse));
      continue;
    }
    if (
      laboratory &&
      cargo.length > 0 &&
      submarineSector === laboratory.sectorId
    ) {
      const specimen = cargo.shift();
      if (specimen) {
        operations.push({
          kind: "analyze",
          pulse,
          assetId: submarine.assetId,
          requiredSectorId: submarineSector,
          specimenId: specimen.specimenId,
        });
        predictedCargo -= 1;
        continue;
      }
    }
    if (
      laboratory &&
      predictedCargo > 0 &&
      (predictedCargo >= 2 || availableSites.size === 0)
    ) {
      const step = nextPathStep(
        projection,
        submarineSector,
        laboratory.sectorId,
      );
      if (step !== null) {
        const silent = silence > 0;
        operations.push({
          kind: "glide",
          pulse,
          assetId: submarine.assetId,
          requiredSectorId: submarineSector,
          toSectorId: step,
          silent,
        });
        submarineSector = step;
        if (silent) silence -= 1;
        continue;
      }
    }
    if (availableSites.has(submarineSector) && predictedCargo < 2) {
      operations.push({
        kind: "harvest",
        pulse,
        assetId: submarine.assetId,
        requiredSectorId: submarineSector,
        targetId: `site:${submarineSector}`,
        signalCommitment: 0,
      });
      availableSites.delete(submarineSector);
      predictedCargo += 1;
      continue;
    }
    const target = nearestTarget(projection, submarineSector, [
      ...availableSites,
    ]);
    if (target !== null) {
      const step = nextPathStep(projection, submarineSector, target);
      if (step !== null) {
        const silent = silence > 0;
        operations.push({
          kind: "glide",
          pulse,
          assetId: submarine.assetId,
          requiredSectorId: submarineSector,
          toSectorId: step,
          silent,
        });
        submarineSector = step;
        if (silent) silence -= 1;
        continue;
      }
    }
    if (
      signal > 0 &&
      projection.public.topology.sectors.some(
        (sector) => sector.sectorId === submarineSector && sector.deepSite,
      )
    ) {
      operations.push({
        kind: "survey",
        pulse,
        assetId: submarine.assetId,
        requiredSectorId: submarineSector,
      });
      signal -= 1;
      continue;
    }
    operations.push(hold(pulse, submarine.assetId, submarineSector));
  }
  return plan(operations);
}

function planDominion(projection: PlayerProjection): DraftPlan {
  const ark = ownArk(projection);
  const submarines = activeSubmarines(projection);
  const allOwnedSubmarines = [...projection.submarines].sort((a, b) =>
    a.assetId.localeCompare(b.assetId),
  );
  const objectives = projection.public.deepSites
    .filter((site) => site.dominionObjective)
    .map((site) => site.sectorId)
    .sort((a, b) => a - b);
  if (!ark || submarines.length === 0 || objectives.length === 0)
    return planDiscovery(projection);

  const sectors = new Map(
    submarines.map((submarine) => [submarine.assetId, submarine.sectorId]),
  );
  const silence = new Map(
    submarines.map((submarine) => [submarine.assetId, submarine.silence]),
  );
  const assigned = new Map<string, number>();
  const operations: Operation[] = [];
  let supply = projection.resources.supply;
  let builtSubmarine = false;

  for (const pulse of pulses()) {
    const controlledObjectives = new Set(
      objectives.filter(
        (objective) =>
          [...sectors.values()].includes(objective) ||
          projection.public.platforms.some(
            (platform) =>
              platform.ownerSeatId === projection.seatId &&
              platform.state === "active" &&
              platform.sectorId === objective,
          ),
      ),
    );
    if (
      !builtSubmarine &&
      allOwnedSubmarines.length < 2 &&
      controlledObjectives.size > 0 &&
      supply >= 4
    ) {
      operations.push({
        kind: "develop",
        pulse,
        assetId: ark.assetId,
        requiredSectorId: ark.sectorId,
        project: { kind: "submarine" },
      });
      supply -= 4;
      builtSubmarine = true;
      continue;
    }

    const mover = submarines
      .map((submarine) => {
        const from = sectors.get(submarine.assetId) ?? submarine.sectorId;
        const preferred = objectives.filter(
          (objective) =>
            ![...assigned.entries()].some(
              ([assetId, assignedObjective]) =>
                assetId !== submarine.assetId &&
                assignedObjective === objective,
            ),
        );
        const target = nearestTarget(
          projection,
          from,
          preferred.length > 0 ? preferred : objectives,
        );
        return {
          submarine,
          from,
          target,
          distance:
            target === null
              ? Number.POSITIVE_INFINITY
              : shortestPath(projection, from, target).length,
        };
      })
      .sort(
        (a, b) =>
          Number(a.from === a.target) - Number(b.from === b.target) ||
          a.distance - b.distance ||
          a.submarine.assetId.localeCompare(b.submarine.assetId),
      )[0];
    if (!mover || mover.target === null || mover.from === mover.target) {
      const resting = mover?.submarine ?? submarines[0]!;
      const sector = sectors.get(resting.assetId) ?? resting.sectorId;
      operations.push(hold(pulse, resting.assetId, sector));
      continue;
    }
    assigned.set(mover.submarine.assetId, mover.target);
    const step = nextPathStep(projection, mover.from, mover.target);
    if (step === null) {
      operations.push(hold(pulse, mover.submarine.assetId, mover.from));
      continue;
    }
    const remainingSilence = silence.get(mover.submarine.assetId) ?? 0;
    operations.push({
      kind: "glide",
      pulse,
      assetId: mover.submarine.assetId,
      requiredSectorId: mover.from,
      toSectorId: step,
      silent: remainingSilence > 0,
    });
    sectors.set(mover.submarine.assetId, step);
    if (remainingSilence > 0)
      silence.set(mover.submarine.assetId, remainingSilence - 1);
  }
  return plan(operations);
}

function planInterdictor(projection: PlayerProjection): DraftPlan {
  const submarine = firstActiveSubmarine(projection);
  if (!submarine) return planNetwork(projection);
  const targetSeatIds = new Set([
    ...projection.public.commissions.map(
      (commission) => commission.targetSeatId,
    ),
    ...projection.public.expeditions
      .filter((expedition) =>
        expedition.charters.some(
          (charter) => charter.charter !== "dominion" && charter.threatened,
        ),
      )
      .map((expedition) => expedition.seatId),
  ]);
  const rivals = sortedPlatforms(projection)
    .filter((platform) => platform.ownerSeatId !== projection.seatId)
    .sort(
      (a, b) =>
        Number(targetSeatIds.has(b.ownerSeatId)) -
          Number(targetSeatIds.has(a.ownerSeatId)) ||
        a.platformId.localeCompare(b.platformId),
    );
  if (rivals.length === 0) return planDiscovery(projection);

  let sector = submarine.sectorId;
  let silence = submarine.silence;
  let signal = projection.resources.signal;
  const operations: Operation[] = [];
  const jammed = new Set<string>();
  for (const pulse of pulses()) {
    const local = rivals.find((platform) => platform.sectorId === sector);
    if (local && signal > 0 && !jammed.has(local.platformId)) {
      operations.push({
        kind: "jam",
        pulse,
        assetId: submarine.assetId,
        requiredSectorId: sector,
        targetPlatformId: local.platformId,
      });
      signal -= 1;
      jammed.add(local.platformId);
      continue;
    }
    if (local) {
      operations.push({
        kind: "raid",
        pulse,
        assetId: submarine.assetId,
        requiredSectorId: sector,
        targetPlatformId: local.platformId,
        signalCommitment: signal > 0 ? 1 : 0,
      });
      if (signal > 0) signal -= 1;
      continue;
    }
    const target = nearestTarget(
      projection,
      sector,
      rivals.map((platform) => platform.sectorId),
    );
    const step =
      target === null ? null : nextPathStep(projection, sector, target);
    if (step === null) {
      operations.push(hold(pulse, submarine.assetId, sector));
      continue;
    }
    operations.push({
      kind: "glide",
      pulse,
      assetId: submarine.assetId,
      requiredSectorId: sector,
      toSectorId: step,
      silent: silence > 0,
    });
    sector = step;
    if (silence > 0) silence -= 1;
  }
  return plan(operations);
}

function planAdaptive(projection: PlayerProjection): DraftPlan {
  const own = projection.public.expeditions.find(
    (expedition) => expedition.seatId === projection.seatId,
  );
  const network = own?.charters.find(
    (charter) => charter.charter === "network",
  );
  const discovery = own?.charters.find(
    (charter) => charter.charter === "discovery",
  );
  const networkValue = network?.charter === "network" ? network.value : 0;
  const discoveryValue =
    discovery?.charter === "discovery" ? discovery.value : 0;
  if (
    projection.public.commissions.length > 0 &&
    projection.public.phase.round > 2
  )
    return planInterdictor(projection);
  return networkValue <= discoveryValue
    ? planNetwork(projection)
    : planDiscovery(projection);
}

function plan(operations: Operation[]): DraftPlan {
  if (operations.length !== 3) return holdPlan();
  return {
    operations: operations as [Operation, Operation, Operation],
  };
}

function holdPlan(): DraftPlan {
  return {
    operations: [hold(1), hold(2), hold(3)],
  };
}

function hold(
  pulse: Pulse,
  assetId?: string,
  requiredSectorId?: number,
): Operation {
  return assetId !== undefined && requiredSectorId !== undefined
    ? { kind: "hold", pulse, assetId, requiredSectorId }
    : { kind: "hold", pulse };
}

function pulses(): Pulse[] {
  return [1, 2, 3];
}

function ownArk(projection: PlayerProjection) {
  return [...projection.public.arks]
    .filter((ark) => ark.ownerSeatId === projection.seatId)
    .sort((a, b) => a.assetId.localeCompare(b.assetId))[0];
}

function activeSubmarines(projection: PlayerProjection): PrivateSubmarine[] {
  return [...projection.submarines]
    .filter(
      (submarine) =>
        submarine.state === "active" &&
        submarine.usableFromRound <= projection.public.phase.round,
    )
    .sort((a, b) => a.assetId.localeCompare(b.assetId));
}

function firstActiveSubmarine(
  projection: PlayerProjection,
): PrivateSubmarine | undefined {
  return activeSubmarines(projection)[0];
}

function sortedPlatforms(projection: PlayerProjection): PublicPlatform[] {
  return [...projection.public.platforms].sort((a, b) =>
    a.platformId.localeCompare(b.platformId),
  );
}

function nextNetworkModule(
  platforms: PublicPlatform[],
): "extractor" | "sonar" | "laboratory" {
  if (!platforms.some((platform) => platform.module === "extractor"))
    return "extractor";
  if (!platforms.some((platform) => platform.module === "sonar"))
    return "sonar";
  if (!platforms.some((platform) => platform.module === "laboratory"))
    return "laboratory";
  return "extractor";
}

function bestNetworkNeighbor(
  projection: PlayerProjection,
  from: number,
  ownPlatforms: PublicPlatform[],
  allPlatforms: PublicPlatform[],
): number | null {
  const regions = new Set(
    ownPlatforms.flatMap((platform) => {
      const sector = projection.public.topology.sectors.find(
        (candidate) => candidate.sectorId === platform.sectorId,
      );
      return sector ? [sector.region] : [];
    }),
  );
  return (
    adjacentSectorIds(projection, from)
      .filter(
        (sectorId) =>
          !allPlatforms.some((platform) => platform.sectorId === sectorId),
      )
      .sort((a, b) => {
        const sectorA = projection.public.topology.sectors.find(
          (sector) => sector.sectorId === a,
        );
        const sectorB = projection.public.topology.sectors.find(
          (sector) => sector.sectorId === b,
        );
        const score = (sector: typeof sectorA, id: number) =>
          (sector && !regions.has(sector.region) ? 20 : 0) +
          (sector?.region === "blackwater" ? 4 : 0) +
          (sector?.deepSite ? 2 : 0) +
          stableTieBreak(projection, id);
        return score(sectorB, b) - score(sectorA, a) || a - b;
      })[0] ?? null
  );
}

function adjacentSectorIds(
  projection: PlayerProjection,
  sectorId: number,
): number[] {
  return [
    ...new Set(
      projection.public.topology.edges.flatMap((edge) =>
        edge.a === sectorId ? [edge.b] : edge.b === sectorId ? [edge.a] : [],
      ),
    ),
  ].sort((a, b) => a - b);
}

function shortestPath(
  projection: PlayerProjection,
  from: number,
  to: number,
): number[] {
  if (from === to) return [from];
  const queue: number[][] = [[from]];
  const seen = new Set([from]);
  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1]!;
    for (const next of adjacentSectorIds(projection, current)) {
      if (seen.has(next)) continue;
      const candidate = [...path, next];
      if (next === to) return candidate;
      seen.add(next);
      queue.push(candidate);
    }
  }
  return [];
}

function nextPathStep(
  projection: PlayerProjection,
  from: number,
  to: number,
): number | null {
  return shortestPath(projection, from, to)[1] ?? null;
}

function nearestTarget(
  projection: PlayerProjection,
  from: number,
  targets: number[],
): number | null {
  return (
    [...new Set(targets)]
      .map((target) => ({
        target,
        path: shortestPath(projection, from, target),
      }))
      .filter((candidate) => candidate.path.length > 0)
      .sort(
        (a, b) =>
          a.path.length - b.path.length ||
          stableTieBreak(projection, b.target) -
            stableTieBreak(projection, a.target) ||
          a.target - b.target,
      )[0]?.target ?? null
  );
}

function salvagePriority(projection: PlayerProjection): string[] {
  const origins = activeSubmarines(projection).map(
    (submarine) => submarine.sectorId,
  );
  return [...projection.public.salvage]
    .map((salvage) => ({
      id: salvage.salvageId,
      distance: Math.min(
        ...origins.map(
          (origin) => shortestPath(projection, origin, salvage.sectorId).length,
        ),
      ),
    }))
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))
    .slice(0, 12)
    .map((salvage) => salvage.id);
}

function stableTieBreak(
  projection: PlayerProjection,
  value: string | number,
): number {
  const input = `${projection.public.matchId}|${projection.seatId}|${projection.public.phase.round}|${value}`;
  let hash = 2_166_136_261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % 7;
}
