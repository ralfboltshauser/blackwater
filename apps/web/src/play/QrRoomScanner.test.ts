import { describe, expect, it } from "vitest";
import { roomCodeFromQr } from "./QrRoomScanner";

describe("roomCodeFromQr", () => {
  it("accepts Blackwater invite URLs and raw room codes", () => {
    expect(roomCodeFromQr("ABC234")).toBe("ABC234");
    expect(roomCodeFromQr("https://blackwater.openexp.dev/j/ab12cd")).toBe(
      "AB12CD",
    );
    expect(
      roomCodeFromQr("https://blackwater.openexp.dev/play?room=9xy7pq"),
    ).toBe("9XY7PQ");
  });

  it("rejects unrelated and malformed QR values", () => {
    expect(roomCodeFromQr("https://example.com/hello")).toBeNull();
    expect(roomCodeFromQr("TOO-LONG")).toBeNull();
    expect(roomCodeFromQr("")).toBeNull();
  });
});
