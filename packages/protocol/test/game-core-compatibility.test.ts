import { describe, expect, it } from "vitest";

import type { Operation as CoreOperation } from "../../game-core/src/types";
import { OperationSchema } from "../src";

describe("game-core protocol compatibility", () => {
  it("accepts every canonical Operation shape without translation", () => {
    const operations: CoreOperation[] = [
      { kind: "hold", pulse: 1 },
      {
        kind: "glide",
        pulse: 1,
        assetId: "sub_1",
        requiredSectorId: 1,
        toSectorId: 2,
        silent: true,
      },
      {
        kind: "sprint",
        pulse: 1,
        assetId: "sub_1",
        requiredSectorId: 1,
        path: [2, 3],
      },
      {
        kind: "navigate",
        pulse: 1,
        assetId: "ark_1",
        requiredSectorId: 1,
        toSectorId: 2,
        towPlatformId: "platform_1",
      },
      {
        kind: "survey",
        pulse: 1,
        assetId: "sub_1",
        requiredSectorId: 2,
        suppressPublicContact: true,
      },
      {
        kind: "harvest",
        pulse: 1,
        assetId: "sub_1",
        requiredSectorId: 2,
        targetId: "site_2",
        signalCommitment: 2,
      },
      {
        kind: "analyze",
        pulse: 1,
        assetId: "sub_1",
        requiredSectorId: 2,
        specimenId: "specimen_1",
      },
      {
        kind: "develop",
        pulse: 1,
        assetId: "ark_1",
        requiredSectorId: 2,
        project: { kind: "platform", module: "sonar" },
      },
      {
        kind: "deploy",
        pulse: 1,
        assetId: "sub_1",
        requiredSectorId: 2,
        device: "decoy",
        decoyRoute: [3, 4],
      },
      {
        kind: "hunt",
        pulse: 1,
        assetId: "sub_1",
        requiredSectorId: 2,
        targetEvidenceId: "evidence_1",
        signalCommitment: 1,
      },
      {
        kind: "raid",
        pulse: 1,
        assetId: "sub_1",
        requiredSectorId: 2,
        targetPlatformId: "platform_1",
        signalCommitment: 2,
      },
      {
        kind: "jam",
        pulse: 1,
        assetId: "sub_1",
        requiredSectorId: 2,
        targetPlatformId: "platform_1",
      },
      {
        kind: "go_dark",
        pulse: 1,
        assetId: "sub_1",
        requiredSectorId: 2,
      },
      {
        kind: "screen",
        pulse: 1,
        assetId: "ark_1",
        requiredSectorId: 2,
        protectedAssetId: "platform_1",
        counterTargetSeatId: "amber",
        signalCommitment: 2,
      },
    ];

    expect(
      operations.map((operation) => OperationSchema.parse(operation)),
    ).toEqual(operations);
  });
});
