import type { BotStrategy } from "@blackwater/protocol";

export function AiBadge({ strategy }: { strategy?: BotStrategy | null }) {
  const detail = strategy ? ` · ${strategy} policy` : "";
  return (
    <span
      className="ai-badge"
      aria-label={`AI-controlled expedition${detail}`}
      title={`AI-controlled expedition${detail}`}
    >
      AI
    </span>
  );
}
