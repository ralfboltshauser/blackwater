import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { HostProjection, LobbySnapshot } from "@blackwater/protocol";
import { PROTOCOL_VERSION } from "@blackwater/protocol";
import { BriefingController } from "../briefing/BriefingController";
import { AiBadge } from "../shared/AiBadge";
import { Brand } from "../shared/Brand";
import { apiFetch, useRealtimeProjection } from "../shared/api";
import { formatClock } from "../shared/bootstrap";
import "../shared/bootstrap";
import "./host.css";

type CreateMatchResponse = {
  roomCode: string;
  matchId: string;
  joinUrl: string;
  lanJoinUrl?: string;
  displayUrl: string;
};

type ServerMeta = {
  publicUrl: string;
  lanUrl: string;
};

const HOST_ROOM_KEY = "blackwater.host-room";
const HOST_LINKS_KEY = "blackwater.host-links";

function savedHostedRoom(): CreateMatchResponse | null {
  const raw = sessionStorage.getItem(HOST_LINKS_KEY);
  if (raw) {
    try {
      const value = JSON.parse(raw) as CreateMatchResponse;
      if (value.roomCode && value.joinUrl && value.displayUrl) return value;
    } catch {
      /* A stale host tab should fall back to the room code. */
    }
  }
  const roomCode = sessionStorage.getItem(HOST_ROOM_KEY);
  return roomCode
    ? {
        roomCode,
        matchId: "unknown",
        joinUrl: `${window.location.origin}/play.html?room=${roomCode}`,
        displayUrl: `${window.location.origin}/display.html?room=${roomCode}`,
      }
    : null;
}

function HostApp() {
  const [hostedRoom, setHostedRoom] = useState<CreateMatchResponse | null>(
    savedHostedRoom,
  );
  const roomCode = hostedRoom?.roomCode ?? null;
  const [lobby, setLobby] = useState<LobbySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const realtime = useRealtimeProjection<HostProjection>("host", roomCode);

  useEffect(() => {
    if (!roomCode) return;
    let active = true;
    void apiFetch<ServerMeta>("/api/v1/meta")
      .then((meta) => {
        if (!active) return;
        const publicOrigin = meta.publicUrl.replace(/\/$/, "");
        const lanOrigin = meta.lanUrl.replace(/\/$/, "");
        setHostedRoom((current) => {
          if (!current || current.roomCode !== roomCode) return current;
          const repaired = {
            ...current,
            joinUrl: `${publicOrigin}/j/${roomCode}`,
            lanJoinUrl: `${lanOrigin}/j/${roomCode}`,
            displayUrl: `${publicOrigin}/display/${roomCode}`,
          };
          sessionStorage.setItem(HOST_LINKS_KEY, JSON.stringify(repaired));
          return repaired;
        });
      })
      .catch(() => {
        // Lobby polling below still reports a real server outage. A stale link
        // repair failure should not hide an otherwise usable host console.
      });
    return () => {
      active = false;
    };
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode) return;
    let active = true;
    const load = async () => {
      try {
        const snapshot = await apiFetch<LobbySnapshot>(
          `/api/v1/matches/${roomCode}/lobby`,
        );
        if (active) setLobby(snapshot);
      } catch (reason) {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Could not load lobby",
          );
      }
    };
    void load();
    const interval = window.setInterval(load, 1_500);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [roomCode]);

  const openRoom = (created: CreateMatchResponse) => {
    sessionStorage.setItem(HOST_ROOM_KEY, created.roomCode);
    sessionStorage.setItem(HOST_LINKS_KEY, JSON.stringify(created));
    setHostedRoom(created);
  };

  if (!roomCode || !hostedRoom) return <CreateGame onCreated={openRoom} />;

  return (
    <main className="host-app">
      <HostNav
        roomCode={roomCode}
        displayUrl={hostedRoom.displayUrl}
        connected={realtime.connected}
        onLeave={() => {
          sessionStorage.removeItem(HOST_ROOM_KEY);
          sessionStorage.removeItem(HOST_LINKS_KEY);
          setHostedRoom(null);
          setLobby(null);
        }}
      />
      <section className="host-main">
        <LobbyConsole
          roomCode={roomCode}
          joinUrl={hostedRoom.joinUrl}
          lanJoinUrl={
            hostedRoom.lanJoinUrl ??
            `${window.location.origin}/j/${encodeURIComponent(roomCode)}`
          }
          lobby={lobby}
          projection={realtime.projection}
          onError={setError}
          onLobbyChange={setLobby}
        />
        <OperationsPanel
          roomCode={roomCode}
          projection={realtime.projection}
          onError={setError}
        />
      </section>
      {error && (
        <div className="host-toast" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
    </main>
  );
}

function CreateGame({
  onCreated,
}: {
  onCreated: (created: CreateMatchResponse) => void;
}) {
  const [players, setPlayers] = useState(4);
  const [botCount, setBotCount] = useState(0);
  const [planning, setPlanning] = useState(120);
  const [factionsEnabled, setFactionsEnabled] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const created = await apiFetch<CreateMatchResponse>("/api/v1/matches", {
        method: "POST",
        body: JSON.stringify({
          protocol: PROTOCOL_VERSION,
          playerCount: players,
          botCount,
          planningSeconds: planning,
          factionsEnabled,
        }),
      });
      onCreated(created);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create game",
      );
      setCreating(false);
    }
  };

  return (
    <main className="host-create">
      <div className="host-create__glow" aria-hidden="true" />
      <section className="host-create__intro">
        <Brand className="host-create__brand" />
        <p className="eyebrow">Expedition control</p>
        <h1>
          Open a new
          <br />
          <em>basin survey.</em>
        </h1>
        <p>
          Friends join from their phones. Put the public display on the TV,
          choose the crew size, and Blackwater handles the rest.
        </p>
        <div className="host-create__facts">
          <span>One local server</span>
          <span>No accounts</span>
          <span>No elimination</span>
        </div>
      </section>
      <section className="host-create__form panel">
        <header>
          <span className="eyebrow">Game setup</span>
          <b>01</b>
        </header>
        <div className="host-create__setting">
          <div>
            <h2>Expedition seats</h2>
            <p>Play alone, or expand the basin for a crew of up to six.</p>
          </div>
          <div className="segmented" role="group" aria-label="Expedition seats">
            {[1, 2, 3, 4, 5, 6].map((count) => (
              <button
                key={count}
                className={players === count ? "is-selected" : ""}
                aria-pressed={players === count}
                onClick={() => {
                  setPlayers(count);
                  setBotCount((current) => Math.min(current, count - 1));
                }}
              >
                {count}
              </button>
            ))}
          </div>
        </div>
        <div className="host-create__setting host-create__setting--bots">
          <div>
            <h2>Automated rivals</h2>
            <p>
              {botCount === 0
                ? "All seats wait for phones."
                : `${players - botCount} phone${players - botCount === 1 ? "" : "s"} + ${botCount} server AI. Bots use only their own intel.`}
            </p>
          </div>
          <div className="host-create__bot-controls">
            <div className="bot-stepper" role="group" aria-label="AI rivals">
              <button
                aria-label="Remove one AI rival"
                disabled={botCount === 0}
                onClick={() =>
                  setBotCount((current) => Math.max(0, current - 1))
                }
              >
                −
              </button>
              <output aria-live="polite">{botCount} AI</output>
              <button
                aria-label="Add one AI rival"
                disabled={botCount >= players - 1}
                onClick={() =>
                  setBotCount((current) => Math.min(players - 1, current + 1))
                }
              >
                +
              </button>
            </div>
            <button
              className={`host-create__solo ${botCount === players - 1 ? "is-selected" : ""}`}
              aria-pressed={botCount === players - 1}
              onClick={() => setBotCount(players - 1)}
            >
              Solo lineup
            </button>
          </div>
        </div>
        <div className="host-create__setting">
          <div>
            <h2>Open Water timer</h2>
            <p>New crews benefit from an extra half minute.</p>
          </div>
          <div
            className="segmented segmented--wide"
            role="group"
            aria-label="Open Water timer"
          >
            {[90, 120, 150].map((seconds) => (
              <button
                key={seconds}
                className={planning === seconds ? "is-selected" : ""}
                aria-pressed={planning === seconds}
                onClick={() => setPlanning(seconds)}
              >
                {formatClock(seconds)}
              </button>
            ))}
          </div>
        </div>
        <div className="host-create__setting">
          <div>
            <h2>Expedition powers</h2>
            <p>
              {factionsEnabled
                ? "Each seat receives one public, one-sentence specialty."
                : "Recommended first game: learn the shared rules before asymmetry."}
            </p>
          </div>
          <button
            className={`toggle ${factionsEnabled ? "is-on" : ""}`}
            type="button"
            role="switch"
            aria-checked={factionsEnabled}
            aria-label="Enable expedition powers"
            onClick={() => setFactionsEnabled((enabled) => !enabled)}
          >
            <i />
          </button>
        </div>
        <div className="host-create__setting">
          <div>
            <h2>Device walkthrough</h2>
            <p>
              Every new phone gets a short, skippable guided pulse before play.
            </p>
          </div>
          <span className="host-create__badge">Included</span>
        </div>
        {error && <p className="host-create__error">{error}</p>}
        <button
          className="button-primary host-create__submit"
          disabled={creating}
          onClick={create}
        >
          {creating ? "Opening basin…" : "Create expedition"}
        </button>
      </section>
    </main>
  );
}

function HostNav({
  roomCode,
  displayUrl,
  connected,
  onLeave,
}: {
  roomCode: string;
  displayUrl: string;
  connected: boolean;
  onLeave: () => void;
}) {
  return (
    <header className="host-nav">
      <Brand className="host-nav__brand" />
      <div>
        <span className="eyebrow">Room</span>
        <strong>{roomCode}</strong>
      </div>
      <div className={`connection-pill ${connected ? "" : "is-offline"}`}>
        {connected ? "Server live" : "Reconnecting"}
      </div>
      <a
        className="button-ghost"
        href={displayUrl}
        target="_blank"
        rel="noreferrer"
      >
        Open TV display
      </a>
      <button className="button-ghost" onClick={onLeave}>
        Close console
      </button>
    </header>
  );
}

function LobbyConsole({
  roomCode,
  joinUrl,
  lanJoinUrl,
  lobby,
  projection,
  onError,
  onLobbyChange,
}: {
  roomCode: string;
  joinUrl: string;
  lanJoinUrl: string;
  lobby: LobbySnapshot | null;
  projection: HostProjection | null;
  onError: (error: string) => void;
  onLobbyChange: (lobby: LobbySnapshot) => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [joinMode, setJoinMode] = useState<"lan" | "pwa">("lan");
  const [busy, setBusy] = useState(false);
  const [botsBusy, setBotsBusy] = useState(false);
  const [removingSeatId, setRemovingSeatId] = useState<string | null>(null);
  const activeJoinUrl = joinMode === "lan" ? lanJoinUrl : joinUrl;

  useEffect(() => {
    void QRCode.toDataURL(activeJoinUrl, {
      width: 420,
      margin: 1,
      color: { dark: "#031519", light: "#f1ddc4" },
    }).then(setQr);
  }, [activeJoinUrl]);

  const start = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/v1/matches/${roomCode}/start`, {
        method: "POST",
        body: JSON.stringify({ protocol: PROTOCOL_VERSION }),
      });
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Could not start");
    } finally {
      setBusy(false);
    }
  };

  const configureBots = async (targetBotCount: number) => {
    setBotsBusy(true);
    try {
      const snapshot = await apiFetch<LobbySnapshot>(
        `/api/v1/matches/${roomCode}/bots`,
        {
          method: "PUT",
          body: JSON.stringify({
            protocol: PROTOCOL_VERSION,
            targetBotCount,
          }),
        },
      );
      onLobbyChange(snapshot);
    } catch (reason) {
      onError(
        reason instanceof Error ? reason.message : "Could not change AI rivals",
      );
    } finally {
      setBotsBusy(false);
    }
  };

  const removePlayer = async (seatId: string, displayName: string) => {
    if (!window.confirm(`Remove ${displayName} from this expedition?`)) return;
    setRemovingSeatId(seatId);
    try {
      const snapshot = await apiFetch<LobbySnapshot>(
        `/api/v1/matches/${roomCode}/players`,
        {
          method: "DELETE",
          body: JSON.stringify({
            protocol: PROTOCOL_VERSION,
            seatId,
          }),
        },
      );
      onLobbyChange(snapshot);
    } catch (reason) {
      onError(
        reason instanceof Error ? reason.message : "Could not remove player",
      );
    } finally {
      setRemovingSeatId(null);
    }
  };

  const isLobby = !lobby || lobby.lifecycle === "lobby";
  const botCount =
    lobby?.seats.filter((seat) => seat.controller === "bot").length ?? 0;
  const humanCount =
    lobby?.seats.filter((seat) => seat.controller === "human").length ?? 0;
  const openCount = lobby?.seats.filter((seat) => !seat.claimed).length ?? 0;
  const readyCount = lobby?.seats.filter((seat) => seat.ready).length ?? 0;
  const maxBotCount = lobby ? lobby.playerCount - Math.max(1, humanCount) : 0;
  return (
    <section className="host-lobby panel">
      <header className="host-section-head">
        <div>
          <p className="eyebrow">
            {isLobby ? "Crew assembly" : "Live expedition"}
          </p>
          <h1>
            {isLobby
              ? "Invite the crew"
              : `Round ${projection?.phase.kind ?? "active"}`}
          </h1>
        </div>
        <span className="host-section-index">02</span>
      </header>
      <div className="host-lobby__body">
        <div className="host-lobby__invite">
          {qr ? (
            <img src={qr} alt={`QR code for ${activeJoinUrl}`} />
          ) : (
            <div className="qr-placeholder" />
          )}
          <div>
            <span className="eyebrow">
              {joinMode === "lan"
                ? "No setup · LAN browser"
                : "Installable PWA"}
            </span>
            <strong>{roomCode}</strong>
            <small>{activeJoinUrl.replace(/^https?:\/\//, "")}</small>
            <div
              className="host-lobby__join-mode"
              role="group"
              aria-label="Phone connection mode"
            >
              <button
                className={joinMode === "lan" ? "is-selected" : ""}
                aria-pressed={joinMode === "lan"}
                onClick={() => setJoinMode("lan")}
              >
                LAN browser
              </button>
              <button
                className={joinMode === "pwa" ? "is-selected" : ""}
                aria-pressed={joinMode === "pwa"}
                onClick={() => setJoinMode("pwa")}
              >
                HTTPS PWA
              </button>
            </div>
            <small>
              {joinMode === "lan"
                ? "Works on home Wi-Fi without DNS changes. Browser mode only."
                : "Requires Private DNS or local DNS; enables full-screen install."}
            </small>
          </div>
        </div>
        <div className="host-lobby__seats">
          {(lobby?.seats ?? []).map((seat, index) => (
            <article
              key={seat.seatId}
              data-seat={seat.color}
              className={seat.claimed ? "is-claimed" : ""}
            >
              <span>{index + 1}</span>
              <div>
                <span className="host-seat__title">
                  <b>{seat.displayName ?? "Open seat"}</b>
                  {seat.controller === "bot" && (
                    <AiBadge strategy={seat.botStrategy} />
                  )}
                </span>
                <small>
                  {seat.controller === "bot"
                    ? seat.ready
                      ? `AI · ${seat.botStrategy ?? "adaptive"} · ready`
                      : "AI · calculating"
                    : seat.claimed
                      ? seat.ready
                        ? "Ready"
                        : seat.presence
                      : "Waiting for player"}
                </small>
              </div>
              <span className="host-seat__actions">
                {seat.controller !== "bot" && (
                  <i
                    className={`presence-dot presence-dot--${seat.presence}`}
                  />
                )}
                {isLobby && seat.controller === "human" && seat.displayName && (
                  <button
                    className="host-seat__kick"
                    aria-label={`Remove ${seat.displayName}`}
                    title={`Remove ${seat.displayName}`}
                    disabled={removingSeatId !== null}
                    onClick={() =>
                      void removePlayer(seat.seatId, seat.displayName!)
                    }
                  >
                    {removingSeatId === seat.seatId ? "…" : "Remove"}
                  </button>
                )}
              </span>
            </article>
          ))}
          {!lobby && (
            <div className="host-lobby__loading">Reading crew instruments…</div>
          )}
        </div>
      </div>
      <footer className="host-lobby__footer">
        <div className="host-lobby__composition">
          <span>
            {readyCount} / {lobby?.playerCount ?? "—"} ready · {humanCount}{" "}
            human{humanCount === 1 ? "" : "s"} joined · {botCount} AI
            {isLobby && openCount > 0 ? ` · ${openCount} open` : ""}
          </span>
          {isLobby && lobby && (
            <div className="host-lobby__bot-controls">
              <button
                className="button-ghost"
                disabled={botsBusy || botCount === 0}
                onClick={() => void configureBots(botCount - 1)}
              >
                − AI
              </button>
              <button
                className="button-secondary"
                disabled={botsBusy || botCount >= maxBotCount}
                onClick={() => void configureBots(botCount + 1)}
              >
                + AI rival
              </button>
            </div>
          )}
        </div>
        <button
          className="button-primary"
          disabled={
            busy ||
            !lobby?.canStart ||
            !isLobby ||
            Boolean(projection?.briefing.active)
          }
          onClick={start}
        >
          {isLobby
            ? busy
              ? "Starting…"
              : projection?.briefing.active
                ? "Close slides to start"
                : "Begin calibration"
            : "Expedition underway"}
        </button>
      </footer>
    </section>
  );
}

function OperationsPanel({
  roomCode,
  projection,
  onError,
}: {
  roomCode: string;
  projection: HostProjection | null;
  onError: (error: string) => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = projection?.phase.endsAtServerMs
    ? (projection.phase.endsAtServerMs - now) / 1000
    : null;

  const control = async (action: string, body: object = {}) => {
    await apiFetch(`/api/v1/matches/${roomCode}/host/${action}`, {
      method: "POST",
      body: JSON.stringify({ protocol: PROTOCOL_VERSION, ...body }),
    });
  };

  return (
    <aside className="host-ops">
      <BriefingController
        roomCode={roomCode}
        briefing={projection?.briefing ?? null}
        displayReady={Boolean(projection?.displayReady)}
        onError={onError}
      />
      <section className="panel host-ops__phase">
        <p className="eyebrow">Phase control</p>
        <div>
          <h2>{projection?.phase.kind ?? "Lobby"}</h2>
          <strong>{remaining === null ? "—" : formatClock(remaining)}</strong>
        </div>
        <div className="host-ops__buttons">
          <button
            className="button-secondary"
            disabled={!projection?.controls.canPause}
            onClick={() => void control("pause")}
          >
            Pause
          </button>
          <button
            className="button-secondary"
            disabled={!projection?.controls.canResume}
            onClick={() => void control("resume")}
          >
            Resume
          </button>
          <button
            className="button-ghost"
            disabled={!projection?.controls.canExtend}
            onClick={() => void control("extend", { additionalMs: 30_000 })}
          >
            + 0:30
          </button>
          <button
            className="button-ghost"
            disabled={!projection?.controls.canClosePlanning}
            onClick={() => void control("close-planning")}
          >
            Close planning
          </button>
        </div>
      </section>
      <section className="panel host-ops__health">
        <p className="eyebrow">System health</p>
        <HealthRow
          label="Public display"
          value={projection?.displayReady ? "Ready" : "Not ready"}
          ok={Boolean(projection?.displayReady)}
        />
        <HealthRow
          label="Database"
          value={projection?.persistence.quickCheck ?? "Pending"}
          ok={projection?.persistence.quickCheck === "ok"}
        />
        <HealthRow
          label="Connected clients"
          value={String(
            projection?.clients.filter(
              (client) => client.presence === "connected",
            ).length ?? 0,
          )}
          ok
        />
        <HealthRow
          label="Actor queue"
          value={String(projection?.actorQueueDepth ?? 0)}
          ok={(projection?.actorQueueDepth ?? 0) < 3}
        />
      </section>
      <section className="panel host-ops__help">
        <p className="eyebrow">Game-night checklist</p>
        <ol>
          <li>Open the TV display.</li>
          <li>Friends join the same Wi-Fi.</li>
          <li>Phones install Blackwater, then enter the TV room code.</li>
          <li>Keep this console nearby for pauses.</li>
          <li>Talk freely while planning orders.</li>
        </ol>
      </section>
    </aside>
  );
}

function HealthRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="health-row">
      <span>
        <i className={ok ? "is-ok" : ""} />
        {label}
      </span>
      <b>{value}</b>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<HostApp />);
