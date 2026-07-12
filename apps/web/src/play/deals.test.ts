import { describe, expect, it } from "vitest";
import type { PlayerProjection } from "@blackwater/protocol";
import { parseDealIds, specimenDestinationIssue, toggleLimited } from "./deals";

const submarine = (
  assetId: string,
  cargoCount: number,
): PlayerProjection["submarines"][number] => ({
  assetId,
  sectorId: 1,
  integrity: 2,
  state: "active",
  silence: 2,
  maxSilence: 2,
  usableFromRound: 1,
  returnAtRound: null,
  incomingSectorId: null,
  cargo: Array.from({ length: cargoCount }, (_, index) => ({
    specimenId: `${assetId}_cargo_${index}`,
    type: "ribbon_filter",
  })),
});

describe("phone deal composer helpers", () => {
  it("parses spoken private IDs without duplicates", () => {
    expect(parseDealIds("report-7, report-12 report-7;specimen_4")).toEqual([
      "report-7",
      "report-12",
      "specimen_4",
    ]);
  });

  it("never selects more assets than the protocol cap", () => {
    expect(toggleLimited(["a", "b"], "c", 2)).toEqual(["a", "b"]);
    expect(toggleLimited(["a", "b"], "a", 2)).toEqual(["b"]);
  });

  it("requires a destination for every requested specimen", () => {
    expect(
      specimenDestinationIssue(["specimen-1"], [], [submarine("sub-a", 0)]),
    ).toMatch(/choose an active submarine/i);
  });

  it("rejects two incoming specimens assigned beyond cargo capacity", () => {
    expect(
      specimenDestinationIssue(
        ["specimen-1", "specimen-2"],
        [
          { specimenId: "specimen-1", toSubmarineId: "sub-a" },
          { specimenId: "specimen-2", toSubmarineId: "sub-a" },
        ],
        [submarine("sub-a", 1)],
      ),
    ).toMatch(/does not have room/i);
  });
});
