import { createHash } from "node:crypto";

const EXTERNAL_ID = /^[A-Za-z0-9_-]{3,64}$/;

/**
 * Builds an ID accepted by every protocol ID schema. Readable inputs remain
 * readable; unusually long or non-ASCII inputs receive a stable hash suffix.
 */
export function externalId(...parts: Array<string | number>): string {
  const source = parts.map(String).join("-");
  let readable = source
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  if (readable.length < 3) readable = `id-${readable || "entity"}`;
  if (EXTERNAL_ID.test(readable)) return readable;
  const digest = createHash("sha256")
    .update(source, "utf8")
    .digest("hex")
    .slice(0, 16);
  const prefix =
    readable.slice(0, 64 - digest.length - 1).replace(/[-_]+$/g, "") ||
    "entity";
  return `${prefix}-${digest}`;
}

export function isExternalId(value: string): boolean {
  return EXTERNAL_ID.test(value);
}
