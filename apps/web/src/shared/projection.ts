import type { PlayerProjection, PublicProjection } from "@blackwater/protocol";
import type {
  BasinView,
  EvidenceView,
  MapEntityView,
  SeatColor,
} from "./view-model";

const seatColor = (value: string): SeatColor => value as SeatColor;

export function publicProjectionToBasin(
  projection: PublicProjection,
): BasinView {
  const sectors = projection.topology.sectors.map((sector) => ({
    id: sector.sectorId,
    name: sector.name,
    region: sector.region,
    x: sector.position.x,
    y: sector.position.y,
    deepSite: sector.deepSite,
    dominionObjective:
      projection.deepSites.find((site) => site.sectorId === sector.sectorId)
        ?.dominionObjective ?? false,
    specimenStock:
      projection.deepSites.find((site) => site.sectorId === sector.sectorId)
        ?.specimenAvailable ?? false,
  }));
  const connections: Array<[number, number]> = projection.topology.edges.map(
    (edge) => [edge.a, edge.b],
  );
  const expeditions = new Map(
    projection.expeditions.map((expedition) => [expedition.seatId, expedition]),
  );
  const entities: MapEntityView[] = [
    ...projection.arks.map((ark): MapEntityView => ({
      id: ark.assetId,
      kind: "ark",
      ownerId: ark.ownerSeatId,
      ownerColor: seatColor(expeditions.get(ark.ownerSeatId)?.color ?? "chalk"),
      sectorId: ark.sectorId,
      state: ark.jammed ? "jammed" : "active",
      label: `${expeditions.get(ark.ownerSeatId)?.displayName ?? "Unknown"} Ark`,
    })),
    ...projection.platforms.map((platform): MapEntityView => ({
      id: platform.platformId,
      kind: platform.module,
      ownerId: platform.ownerSeatId,
      ownerColor: seatColor(
        expeditions.get(platform.ownerSeatId)?.color ?? "chalk",
      ),
      sectorId: platform.sectorId,
      state: platform.state === "inactive" ? "disabled" : platform.state,
      label: `${expeditions.get(platform.ownerSeatId)?.displayName ?? "Unknown"} ${platform.module}`,
    })),
    ...projection.deepSites.map((site, index): MapEntityView => ({
      id: `site-${site.sectorId}`,
      kind: "site",
      sectorId: site.sectorId,
      state: "active",
      label: site.specimenAvailable
        ? "Deep Site · specimen available"
        : "Deep Site · quiet",
      sprite: `/sprites/deep-site-${["a", "b", "c"][index % 3]}.webp`,
    })),
    ...projection.salvage.map((salvage): MapEntityView => ({
      id: salvage.salvageId,
      kind: "salvage",
      sectorId: salvage.sectorId,
      state: "active",
      label: "Recoverable specimen salvage",
    })),
  ];
  const evidence: EvidenceView[] = projection.contacts.map((contact) => ({
    id: contact.contactId,
    kind:
      contact.evidenceKind === "wake"
        ? "wake"
        : contact.identifiedSeatId
          ? "identified"
          : contact.evidenceKind === "disturbance"
            ? "jam"
            : "contact",
    sectorId: contact.sectorId,
    direction: contact.direction,
    ...(contact.identifiedSeatId
      ? {
          ownerColor: seatColor(
            expeditions.get(contact.identifiedSeatId)?.color ?? "chalk",
          ),
        }
      : {}),
    label: contact.class,
    age: contact.age === "fading" ? 1 : 0,
  }));
  return { sectors, connections, entities, evidence };
}

export function playerProjectionToBasin(
  projection: PlayerProjection,
): BasinView {
  const publicBasin = publicProjectionToBasin(projection.public);
  const own = projection.public.expeditions.find(
    (expedition) => expedition.seatId === projection.seatId,
  );
  const privateEntities: MapEntityView[] = [
    ...projection.submarines.map((submarine): MapEntityView => ({
      id: submarine.assetId,
      kind: "submarine",
      ownerId: projection.seatId,
      ownerColor: seatColor(own?.color ?? "chalk"),
      sectorId: submarine.sectorId,
      state:
        submarine.state === "active"
          ? submarine.integrity === 2
            ? "active"
            : "damaged"
          : submarine.state === "constructing"
            ? "constructing"
            : "disabled",
      label: submarine.assetId,
      private: true,
    })),
    ...projection.devices
      .filter(
        (device) => device.state === "deployed" && device.sectorId !== null,
      )
      .map((device): MapEntityView => ({
        id: device.deviceId,
        kind: device.kind,
        ownerId: projection.seatId,
        ownerColor: seatColor(own?.color ?? "chalk"),
        sectorId: device.sectorId!,
        state: "active",
        label: `${device.kind} · ${device.trigger ?? "active"}`,
        private: true,
      })),
  ];
  return {
    ...publicBasin,
    entities: [...publicBasin.entities, ...privateEntities],
  };
}
