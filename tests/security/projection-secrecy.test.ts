import { describe, expect, it } from "vitest";
import {
  broadcastReport,
  canonicalHash,
  forwardReport,
  projectForSeat,
  projectHost,
  projectPublic,
  resolveRound,
  runForecast,
  sealObservation,
  settleAtomicTrade,
  type Observation,
  type Snare,
} from "../../packages/game-core/src/index.js";
import {
  DeployOperationSchema,
  DevelopOperationSchema,
  PrivateObservationSchema,
  PROTOCOL_VERSION,
  PublicContactSchema,
  SealIntelCommandSchema,
} from "../../packages/protocol/src/index.js";
import {
  allPrograms,
  createTestMatch,
  program,
  submarine,
} from "../gameplay/helpers.js";

function keysIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysIn);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) => [
    key,
    ...keysIn(nested),
  ]);
}

describe("projection secrecy boundaries", () => {
  it("enforces strict public/private contact schemas at the wire boundary", () => {
    const publicContact = {
      contactId: "evidence-public-wire",
      evidenceKind: "wake" as const,
      sectorId: 12,
      class: "unknown" as const,
      confidence: "low" as const,
      identifiedSeatId: null,
      direction: "e" as const,
      observedRound: 1,
      observedPulse: 1 as const,
      age: "fresh" as const,
    };
    expect(PublicContactSchema.safeParse(publicContact).success).toBe(true);
    expect(
      PublicContactSchema.safeParse({
        ...publicContact,
        subjectId: "sub-amber-a",
      }).success,
    ).toBe(false);
    expect(
      PublicContactSchema.safeParse({ ...publicContact, toSectorId: 13 })
        .success,
    ).toBe(false);

    const privateObservation = {
      contactId: "observation-private-wire",
      sealedReportId: null,
      sectorId: 13,
      observedAtRound: 1,
      observedAtPulse: 2 as const,
      contactClass: "submarine" as const,
      direction: "still" as const,
      identitySeatId: "cyan",
      specimenType: null,
      contactCount: 1,
      confidence: 100 as const,
      sensor: "active-survey" as const,
    };
    expect(PrivateObservationSchema.safeParse(privateObservation).success).toBe(
      true,
    );
    expect(
      PrivateObservationSchema.safeParse({
        ...privateObservation,
        subjectId: "sub-cyan-a",
      }).success,
    ).toBe(false);

    expect(
      SealIntelCommandSchema.safeParse({
        protocol: PROTOCOL_VERSION,
        commandId: "command-seal-contact",
        matchId: "match-seal-contact",
        phaseId: "planning-round-one",
        sessionEpoch: 0,
        clientInstanceId: "client-instance-amber",
        writerLeaseId: "writer-lease-amber-000000000000",
        type: "intel.seal",
        expected: { kind: "none" },
        payload: { contactId: privateObservation.contactId },
      }).success,
    ).toBe(true);
  });

  it("does not expose server entity-ID selection in wire Operations", () => {
    expect(
      DeployOperationSchema.safeParse({
        kind: "deploy",
        pulse: 1,
        assetId: "sub-amber-a",
        requiredSectorId: 12,
        device: "snare",
        snareMode: "tag",
        deviceId: "device-forced-by-client",
      }).success,
    ).toBe(false);
    expect(
      DevelopOperationSchema.safeParse({
        kind: "develop",
        pulse: 1,
        assetId: "ark-amber",
        requiredSectorId: 12,
        project: {
          kind: "platform",
          module: "sonar",
          projectId: "ark-cyan",
        },
      }).success,
    ).toBe(false);
  });

  it("is noninterfering when only an opponent's hidden state changes", () => {
    const baseline = createTestMatch(3, "projection-noninterference-deep");
    const changed = structuredClone(baseline);
    const amberSub = submarine(changed, "amber");
    const specimenId = changed.sites[12]!.stockSpecimenId!;

    changed.seats.amber!.signal = 19;
    changed.sites[12]!.stockSpecimenId = null;
    baseline.sites[12]!.stockSpecimenId = null;
    amberSub.cargo = [specimenId];
    changed.specimens[specimenId]!.type = "luminous_pollen";
    changed.specimens[specimenId]!.knownTo = ["amber"];
    const baselineAmber = submarine(baseline, "amber");
    baselineAmber.cargo = [specimenId];
    baseline.specimens[specimenId]!.type = "ribbon_filter";
    baseline.specimens[specimenId]!.knownTo = ["amber"];
    amberSub.sectorId = 13;
    baselineAmber.sectorId = 12;
    baseline.programs.amber = program("amber", {});
    changed.devices["device-amber-secret"] = {
      kind: "snare",
      id: "device-amber-secret",
      ownerId: "amber",
      sectorId: 13,
      mode: "spill",
      state: "armed",
      armedFromPulse: null,
      armedFromRound: 1,
    } satisfies Snare;
    changed.programs.amber = program("amber", {
      1: {
        kind: "hunt",
        pulse: 1,
        assetId: amberSub.id,
        requiredSectorId: 13,
        targetSeatId: "cyan",
        signalCommitment: 2,
      },
    });

    expect(canonicalHash(projectPublic(changed))).toBe(
      canonicalHash(projectPublic(baseline)),
    );
    expect(canonicalHash(projectForSeat(changed, "cyan"))).toBe(
      canonicalHash(projectForSeat(baseline, "cyan")),
    );
    expect(canonicalHash(projectHost(changed))).toBe(
      canonicalHash(projectHost(baseline)),
    );
  });

  it("never exposes evidence subject IDs or opponent plans, cargo, and devices", () => {
    const state = createTestMatch(3, "projection-field-audit");
    const amberSub = submarine(state, "amber");
    const specimenId = state.sites[12]!.stockSpecimenId!;
    state.sites[12]!.stockSpecimenId = null;
    amberSub.cargo.push(specimenId);
    state.specimens[specimenId]!.knownTo.push("amber");
    state.devices["device-amber-hidden"] = {
      kind: "snare",
      id: "device-amber-hidden",
      ownerId: "amber",
      sectorId: amberSub.sectorId,
      mode: "tag",
      state: "armed",
      armedFromPulse: null,
      armedFromRound: 1,
    };
    state.seats.amber!.deviceInventory.snare = 0;
    state.programs.amber = program("amber", {});
    state.evidence["evidence-public-contact"] = {
      id: "evidence-public-contact",
      kind: "wake",
      sectorId: amberSub.sectorId,
      fromSectorId: 12,
      toSectorId: amberSub.sectorId,
      ownerId: null,
      subjectId: amberSub.id,
      observedRound: 1,
      observedPulse: 1,
      expiresAtForecastRound: 3,
      confidence: "strong",
    };

    const publicView = projectPublic(state);
    const cyanView = projectForSeat(state, "cyan");
    const publicText = JSON.stringify(publicView);
    const cyanText = JSON.stringify(cyanView);

    expect(keysIn(publicView)).not.toContain("subjectId");
    expect(keysIn(cyanView)).not.toContain("subjectId");
    expect(publicText).not.toContain(amberSub.id);
    expect(cyanText).not.toContain(amberSub.id);
    expect(cyanText).not.toContain("device-amber-hidden");
    expect(cyanText).not.toContain(specimenId);
    expect(cyanView.program).toBeNull();
    expect(cyanView.public.evidence[0]).not.toHaveProperty("subjectId");
    expect(cyanView.public.evidence[0]).not.toHaveProperty("toSectorId");
  });

  it("places each public wake at the leg origin without projecting its arrival", () => {
    const state = createTestMatch(3, "wake-origin-secrecy");
    const amberSub = submarine(state, "amber");
    amberSub.sectorId = 12;
    const middle = 13;
    const destination = 18;
    const resolved = resolveRound(
      state,
      allPrograms(state, {
        amber: program("amber", {
          1: {
            kind: "sprint",
            pulse: 1,
            assetId: amberSub.id,
            requiredSectorId: 12,
            path: [middle, destination],
          },
        }),
      }),
    );
    const internalWakes = Object.values(resolved.stateAfter.evidence).filter(
      (evidence) =>
        evidence.kind === "wake" && evidence.subjectId === amberSub.id,
    );
    expect(internalWakes.map((evidence) => evidence.sectorId)).toEqual([
      12,
      middle,
    ]);
    expect(internalWakes.map((evidence) => evidence.toSectorId)).toEqual([
      middle,
      destination,
    ]);

    const projectedWakes = projectPublic(resolved.stateAfter).evidence.filter(
      (evidence) => evidence.kind === "wake",
    );
    expect(projectedWakes.map((evidence) => evidence.sectorId)).toEqual([
      12,
      middle,
    ]);
    expect(
      projectedWakes.every((evidence) => !("toSectorId" in evidence)),
    ).toBe(true);
    expect(JSON.stringify(projectedWakes)).not.toContain(amberSub.id);
    const publicWakeEvents = resolved.events.filter(
      (event) => event.kind === "wake.created",
    );
    expect(publicWakeEvents).toHaveLength(2);
    expect(
      publicWakeEvents.every((event) => !("toSectorId" in event.data)),
    ).toBe(true);
    expect(publicWakeEvents.map((event) => event.data.sectorId)).toEqual([
      12,
      middle,
    ]);
  });

  it("preserves field redaction through forwarding and public broadcast", () => {
    let state = createTestMatch(3, "report-redaction-chain");
    const cyanSub = submarine(state, "cyan");
    const observation: Observation = {
      id: "observation-amber-source",
      ownerId: "amber",
      source: "active_survey",
      sectorId: 13,
      observedRound: 1,
      observedPulse: 2,
      contactClass: "submarine",
      subjectId: cyanSub.id,
      identitySeatId: "cyan",
      specimenType: null,
      contactCount: 1,
      direction: "sw",
      confidence: 100,
    };
    state.observations[observation.id] = observation;

    state = sealObservation(state, "amber", observation.id).stateAfter;
    const sourceReportId = Object.keys(state.reports)[0]!;
    const forwarded = forwardReport(state, "amber", "cyan", sourceReportId, [
      "sectorId",
      "confidence",
      "not-a-real-field",
    ]);
    state = forwarded.stateAfter;
    const childReportId = String(forwarded.events[0]!.data.reportId);

    const amberObservation = projectForSeat(state, "amber").observations[0]!;
    expect(amberObservation.contactId).toBe(observation.id);
    expect(amberObservation).not.toHaveProperty("subjectId");
    expect(projectForSeat(state, "violet").reports).toHaveLength(0);
    const cyanReport = projectForSeat(state, "cyan").reports.find(
      (report) => report.reportId === childReportId,
    )!;
    expect(cyanReport.fields).toEqual({ confidence: "exact", sectorId: 13 });
    expect(JSON.stringify(cyanReport)).not.toContain(cyanSub.id);

    state = broadcastReport(state, "cyan", childReportId).stateAfter;
    const broadcast = projectPublic(state).broadcastReports.find(
      (report) => report.reportId === childReportId,
    )!;
    expect(broadcast.fields).toEqual({ confidence: "exact", sectorId: 13 });
    expect(JSON.stringify(broadcast)).not.toContain(cyanSub.id);
    expect(keysIn(broadcast)).not.toContain("subjectId");
  });

  it("seals verified site type exactly once and preserves it through custody", () => {
    let state = createTestMatch(3, "verified-site-intel-custody");
    const observation: Observation = {
      id: "observation-verified-site-type",
      ownerId: "amber",
      source: "active_survey",
      sectorId: 13,
      observedRound: 1,
      observedPulse: 2,
      contactClass: "site",
      subjectId: state.sites[13]!.stockSpecimenId,
      identitySeatId: null,
      specimenType: "luminous_pollen",
      contactCount: 1,
      direction: "still",
      confidence: 100,
    };
    state.observations[observation.id] = observation;
    state = sealObservation(state, "amber", observation.id).stateAfter;
    const sourceReportId = Object.keys(state.reports)[0]!;
    expect(
      projectForSeat(state, "amber").reports.find(
        (report) => report.reportId === sourceReportId,
      )?.fields.specimenType,
    ).toBe("luminous_pollen");
    expect(() => sealObservation(state, "amber", observation.id)).toThrow(
      /already sealed/,
    );

    const redacted = forwardReport(state, "amber", "cyan", sourceReportId, [
      "sectorId",
      "specimenType",
    ]);
    state = redacted.stateAfter;
    const childReportId = String(redacted.events[0]!.data.reportId);
    expect(
      projectForSeat(state, "cyan").reports.find(
        (report) => report.reportId === childReportId,
      )?.fields,
    ).toEqual({ sectorId: 13, specimenType: "luminous_pollen" });

    state = settleAtomicTrade(state, "trade-verified-site-intel", [
      {
        kind: "report",
        fromSeatId: "cyan",
        toSeatId: "violet",
        reportId: childReportId,
      },
    ]).stateAfter;
    expect(
      projectForSeat(state, "violet").reports.find(
        (report) => report.reportId === childReportId,
      )?.fields.specimenType,
    ).toBe("luminous_pollen");
  });

  it("retains sealed observations but prunes stale unsealed raw intel", () => {
    let state = createTestMatch(3, "observation-retention-boundary");
    const sealedObservation: Observation = {
      id: "observation-sealed-retained",
      ownerId: "amber",
      source: "passive_sonar",
      sectorId: 13,
      observedRound: 1,
      observedPulse: 1,
      contactClass: "submarine",
      subjectId: submarine(state, "cyan").id,
      identitySeatId: null,
      specimenType: null,
      contactCount: 1,
      direction: "e",
      confidence: 50,
    };
    const unsealedObservation: Observation = {
      ...sealedObservation,
      id: "observation-unsealed-pruned",
      subjectId: submarine(state, "violet").id,
    };
    state.observations[sealedObservation.id] = sealedObservation;
    state.observations[unsealedObservation.id] = unsealedObservation;
    state = sealObservation(state, "amber", sealedObservation.id).stateAfter;
    state.round = 3;
    state.phase = "forecast";

    state = runForecast(state).stateAfter;
    expect(state.observations[sealedObservation.id]).toBeDefined();
    expect(state.observations[unsealedObservation.id]).toBeUndefined();
    expect(
      Object.values(state.reports).some(
        (report) =>
          report.kind === "sealed" &&
          report.observationId === sealedObservation.id,
      ),
    ).toBe(true);
  });

  it("keeps report custody as unique holders under repeated forwards and trades", () => {
    let state = createTestMatch(3, "report-custody-deduplication");
    const observation: Observation = {
      id: "observation-custody-source",
      ownerId: "amber",
      source: "active_survey",
      sectorId: 13,
      observedRound: 1,
      observedPulse: 1,
      contactClass: "submarine",
      subjectId: submarine(state, "cyan").id,
      identitySeatId: "cyan",
      specimenType: null,
      contactCount: 1,
      direction: "still",
      confidence: 100,
    };
    state.observations[observation.id] = observation;
    state = sealObservation(state, "amber", observation.id).stateAfter;
    const reportId = Object.keys(state.reports)[0]!;

    for (let index = 0; index < 16; index += 1) {
      state = forwardReport(state, "amber", "cyan", reportId).stateAfter;
      state = settleAtomicTrade(state, `trade-report-repeat-${index}`, [
        {
          kind: "report",
          fromSeatId: "amber",
          toSeatId: "cyan",
          reportId,
        },
      ]).stateAfter;
    }

    expect(state.reports[reportId]!.custody).toEqual(["amber", "cyan"]);
    expect(projectForSeat(state, "cyan").reports[0]!.custody).toEqual([
      "amber",
      "cyan",
    ]);
  });

  it("rejects duplicate report tuples but permits explicit distinct recipients", () => {
    let state = createTestMatch(3, "report-transfer-tuple-deduplication");
    state.seats.amber!.faction = "concord_relay";
    const observation: Observation = {
      id: "observation-report-transfer-source",
      ownerId: "amber",
      source: "active_survey",
      sectorId: 13,
      observedRound: 1,
      observedPulse: 1,
      contactClass: "submarine",
      subjectId: submarine(state, "cyan").id,
      identitySeatId: "cyan",
      specimenType: null,
      contactCount: 1,
      direction: "still",
      confidence: 100,
    };
    state.observations[observation.id] = observation;
    state = sealObservation(state, "amber", observation.id).stateAfter;
    const reportId = Object.keys(state.reports)[0]!;
    const duplicate = {
      kind: "report" as const,
      fromSeatId: "amber",
      toSeatId: "cyan",
      reportId,
    };
    expect(() =>
      settleAtomicTrade(state, "trade-duplicate-report", [
        duplicate,
        duplicate,
      ]),
    ).toThrow(/only once/);

    const distinct = settleAtomicTrade(state, "trade-distinct-recipients", [
      duplicate,
      { ...duplicate, toSeatId: "violet" },
    ]).stateAfter;
    expect(distinct.reports[reportId]!.custody).toEqual([
      "amber",
      "cyan",
      "violet",
    ]);
  });
});
