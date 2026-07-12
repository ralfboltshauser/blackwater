import type { PlayerProjection } from "@blackwater/protocol";

export type SpecimenDestination = {
  specimenId: string;
  toSubmarineId: string;
};

export function parseDealIds(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
}

export function toggleLimited(
  items: string[],
  item: string,
  max: number,
): string[] {
  if (items.includes(item))
    return items.filter((candidate) => candidate !== item);
  return items.length < max ? [...items, item] : items;
}

export function specimenDestinationIssue(
  specimenIds: string[],
  mappings: SpecimenDestination[],
  submarines: PlayerProjection["submarines"],
): string | null {
  if (!specimenIds.length) return null;
  const incomingBySubmarine = new Map<string, number>();
  for (const specimenId of specimenIds) {
    const destinationId = mappings.find(
      (mapping) => mapping.specimenId === specimenId,
    )?.toSubmarineId;
    const submarine = submarines.find(
      (candidate) =>
        candidate.assetId === destinationId && candidate.state === "active",
    );
    if (!destinationId || !submarine) {
      return "Choose an active submarine with free cargo space for every incoming specimen.";
    }
    incomingBySubmarine.set(
      destinationId,
      (incomingBySubmarine.get(destinationId) ?? 0) + 1,
    );
  }
  for (const [submarineId, incoming] of incomingBySubmarine) {
    const submarine = submarines.find(
      (candidate) => candidate.assetId === submarineId,
    );
    if (!submarine || submarine.cargo.length + incoming > 2) {
      return `${submarineId} does not have room for all assigned specimens.`;
    }
  }
  return null;
}
