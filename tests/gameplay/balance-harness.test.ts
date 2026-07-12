import { describe, expect, it } from "vitest";
import { simulateBatch } from "../../tools/balance/simulate.js";

describe("balance simulation harness", () => {
  it("exercises every strategy profile and the social economy deterministically", () => {
    const first = simulateBatch(6, 6, "balance-harness-regression");
    const second = simulateBatch(6, 6, "balance-harness-regression");

    expect(second).toEqual(first);
    expect(first.invalidBotPrograms).toBe(0);
    expect(first.strategyAssignments).toEqual({
      network: 6,
      discovery: 6,
      dominion: 6,
      interdictor: 6,
      broker: 6,
      adaptive: 6,
    });
    expect(first.social.atomicTrades).toBeGreaterThan(0);
    expect(first.social.specimenTransfers).toBeGreaterThan(0);
    expect(first.social.reportTransfers).toBeGreaterThan(0);
    expect(first.social.reportsSealed).toBeGreaterThan(0);
  });
});
