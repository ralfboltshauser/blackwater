import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans-condensed/latin-500.css";
import "@fontsource/ibm-plex-sans-condensed/latin-600.css";
import "../styles/global.css";
import { initializePwa } from "../pwa/runtime";

initializePwa();

export function roomFromLocation(): string | null {
  const params = new URLSearchParams(window.location.search);
  const queryRoom = params.get("room")?.trim().toUpperCase();
  if (queryRoom) return queryRoom;
  const match = window.location.pathname.match(
    /\/(?:j|play|display)\/([A-Z0-9]{4,8})/i,
  );
  return match?.[1]?.toUpperCase() ?? null;
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}
