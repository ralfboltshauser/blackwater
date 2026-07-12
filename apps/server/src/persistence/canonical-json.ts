import { createHash, timingSafeEqual } from "node:crypto";

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

function serialize(value: unknown, ancestors: WeakSet<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Persistent JSON cannot contain non-finite numbers");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new TypeError(`Persistent JSON cannot contain ${typeof value}`);
  }

  if (ancestors.has(value))
    throw new TypeError("Persistent JSON cannot contain cycles");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => serialize(entry, ancestors)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Persistent JSON values must use plain objects");
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => {
        const entry = record[key];
        if (entry === undefined)
          throw new TypeError(`Persistent JSON key ${key} is undefined`);
        return `${JSON.stringify(key)}:${serialize(entry, ancestors)}`;
      })
      .join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalStringify(value: unknown): string {
  return serialize(value, new WeakSet<object>());
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashCredential(credential: string): Buffer {
  if (credential.length < 24 || credential.length > 512)
    throw new TypeError("Credential length is invalid");
  return createHash("sha256").update(credential, "utf8").digest();
}

export function credentialHashMatches(
  credential: string,
  expectedHash: Buffer,
): boolean {
  const actualHash = hashCredential(credential);
  return (
    actualHash.length === expectedHash.length &&
    timingSafeEqual(actualHash, expectedHash)
  );
}

export function parseStoredJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}
