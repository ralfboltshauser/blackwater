const INSTANCE_KEY = "blackwater.client-instance";

function randomToken(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export function getClientInstanceId(): string {
  const existing = sessionStorage.getItem(INSTANCE_KEY);
  if (existing) return existing;
  const created = `client_${randomToken(12)}`;
  sessionStorage.setItem(INSTANCE_KEY, created);
  return created;
}

export function nextCommandId(prefix: string): string {
  const key = `blackwater.command-counter.${prefix}`;
  const current = Number(sessionStorage.getItem(key) ?? 0) + 1;
  sessionStorage.setItem(key, String(current));
  return `${prefix}_${current}`;
}
