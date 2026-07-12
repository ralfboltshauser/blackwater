import { createHash } from "node:crypto";

export type PrngState = [number, number, number, number];

export function seedPrng(seed: string): PrngState {
  const digest = createHash("sha256").update(seed, "utf8").digest();
  const result: PrngState = [
    digest.readUInt32LE(0),
    digest.readUInt32LE(4),
    digest.readUInt32LE(8),
    digest.readUInt32LE(12),
  ];
  if (result.every((word) => word === 0)) result[0] = 0x9e3779b9;
  return result;
}

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

/** xoshiro128**. Mutates and returns the explicit canonical PRNG state. */
export function nextUint32(state: PrngState): number {
  const result =
    Math.imul(rotateLeft(Math.imul(state[1], 5) >>> 0, 7), 9) >>> 0;
  const t = (state[1] << 9) >>> 0;
  state[2] = (state[2] ^ state[0]) >>> 0;
  state[3] = (state[3] ^ state[1]) >>> 0;
  state[1] = (state[1] ^ state[2]) >>> 0;
  state[0] = (state[0] ^ state[3]) >>> 0;
  state[2] = (state[2] ^ t) >>> 0;
  state[3] = rotateLeft(state[3], 11);
  return result;
}

export function nextInt(state: PrngState, exclusiveMax: number): number {
  if (!Number.isSafeInteger(exclusiveMax) || exclusiveMax <= 0) {
    throw new Error("exclusiveMax must be a positive safe integer");
  }
  const limit = Math.floor(0x1_0000_0000 / exclusiveMax) * exclusiveMax;
  let value = nextUint32(state);
  while (value >= limit) value = nextUint32(state);
  return value % exclusiveMax;
}

export function shuffled<T>(items: readonly T[], state: PrngState): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = nextInt(state, index + 1);
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}
