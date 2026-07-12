import { createHash } from "node:crypto";
import type { CanonicalValue, RulesState } from "./types.js";

function normalize(value: unknown, path: string): CanonicalValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new Error(`Canonical number at ${path} must be a safe integer`);
    return value;
  }
  if (Array.isArray(value))
    return value.map((item, index) => normalize(item, `${path}[${index}]`));
  if (typeof value === "object") {
    const output: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child === undefined)
        throw new Error(`Undefined canonical value at ${path}.${key}`);
      output[key] = normalize(child, `${path}.${key}`);
    }
    return output;
  }
  throw new Error(`Unsupported canonical value at ${path}`);
}

/** Stable JSON for hashes/golden vectors. Rules state deliberately uses safe integers only. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value, "$"));
}

export function canonicalHash(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

export function rulesStateHash(state: RulesState): string {
  return canonicalHash(state);
}
