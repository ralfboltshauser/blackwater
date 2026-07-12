import { createRoot } from "react-dom/client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ClientCommandSchema,
  DraftPlanSchema,
  PROTOCOL_VERSION,
  SessionBootstrapSchema,
  type CommandResult,
  type DraftPlan,
  type IntelReport,
  type LobbySnapshot,
  type PlayerProjection,
  type SessionBootstrap,
} from "@blackwater/protocol";
import { BasinMap } from "../components/BasinMap";
import { InstallConsole } from "../pwa/InstallConsole";
import { preferLandscape } from "../pwa/runtime";
import { AiBadge } from "../shared/AiBadge";
import { Brand } from "../shared/Brand";
import { apiFetch, useRealtimeProjection } from "../shared/api";
import { formatClock, roomFromLocation } from "../shared/bootstrap";
import {
  playFeedback,
  primeAudio,
  isSoundEnabled,
  setSoundEnabled,
} from "../shared/feedback";
import { getClientInstanceId, nextCommandId } from "../shared/identity";
import { playerProjectionToBasin } from "../shared/projection";
import type { BasinView } from "../shared/view-model";
import { parseDealIds, specimenDestinationIssue, toggleLimited } from "./deals";
import { QrRoomScanner } from "./QrRoomScanner";
import {
  OPERATION_META,
  blankEditor,
  buildOperation,
  editorFromOperation,
  operationCost,
  operationKindsForAsset,
  operationMenuForAsset,
  operationSummary,
  planExposure,
  playableAssets,
  projectedAssetSector,
  reachableForEditor,
  replacePulse,
  type AssetChoice,
  type OperationEditor,
  type OperationKind,
  type Pulse,
} from "./operations";
import {
  ContextHintTooltip,
  HintableButton,
  type ContextHint,
} from "./HintableButton";
import "../shared/bootstrap";
import "./play.css";

type PlayerBootstrap = Extract<SessionBootstrap, { role: "player" }>;
type ConsoleTab = "commands" | "intel" | "deals";
type ReportField = IntelReport["redactedFields"][number];
type Settings = {
  reducedMotion: boolean;
  highContrast: boolean;
  sound: boolean;
};

const SESSION_PREFIX = "blackwater.player-session.";
const ROOM_KEY = "blackwater.player-room";
const NAME_KEY = "blackwater.player-name";
const SETTINGS_KEY = "blackwater.player-settings";
const AUTO_RESUME_KEY = "blackwater.player-auto-resume";
const SUPPRESS_RESUME_KEY = "blackwater.player-suppress-resume";
const LOBBY_COLORS = [
  "cyan",
  "amber",
  "violet",
  "lime",
  "coral",
  "chalk",
] as const;

const phaseNames: Record<string, string> = {
  lobby: "Crew Assembly",
  forecast: "Forecast",
  "open-water": "Open Water",
  resolution: "Resolution",
  "claim-check": "Charter Check",
  "game-over": "Expedition Complete",
};

const dialogFocusable =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function useDialogFocusTrap(onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusable = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(dialogFocusable)).filter(
        (element) =>
          element.tabIndex >= 0 && element.getClientRects().length > 0,
      );
    const initial =
      dialog.querySelector<HTMLElement>("[data-dialog-initial]") ??
      focusable()[0];
    initial?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (controls.length === 0) return;
      const first = controls[0]!;
      const last = controls.at(-1)!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", onKeyDown);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return dialogRef;
}

function normalizeRoom(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-HJ-NP-Z2-9]/g, "")
    .slice(0, 6);
}

function loadBootstrap(roomCode: string | null): PlayerBootstrap | null {
  if (!roomCode) return null;
  try {
    const parsed = SessionBootstrapSchema.safeParse(
      JSON.parse(
        sessionStorage.getItem(`${SESSION_PREFIX}${roomCode}`) ?? "null",
      ),
    );
    return parsed.success && parsed.data.role === "player" ? parsed.data : null;
  } catch {
    return null;
  }
}

function storeBootstrap(bootstrap: PlayerBootstrap): void {
  sessionStorage.setItem(
    `${SESSION_PREFIX}${bootstrap.roomCode}`,
    JSON.stringify(bootstrap),
  );
  localStorage.setItem(ROOM_KEY, bootstrap.roomCode);
  localStorage.setItem(AUTO_RESUME_KEY, "true");
  localStorage.removeItem(SUPPRESS_RESUME_KEY);
}

function loadSettings(): Settings {
  try {
    const saved = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) ?? "{}",
    ) as Partial<Settings>;
    return {
      reducedMotion:
        saved.reducedMotion ??
        matchMedia("(prefers-reduced-motion: reduce)").matches,
      highContrast: saved.highContrast ?? false,
      sound: isSoundEnabled(),
    };
  } catch {
    return {
      reducedMotion: false,
      highContrast: false,
      sound: true,
    };
  }
}

function parsePlayerBootstrap(value: unknown): PlayerBootstrap {
  const candidate =
    value && typeof value === "object" && "session" in value
      ? (value as { session: unknown }).session
      : value;
  const parsed = SessionBootstrapSchema.safeParse(candidate);
  if (!parsed.success || parsed.data.role !== "player")
    throw new Error("The server did not return a player session.");
  return parsed.data;
}

function PlayerApp() {
  const savedRoom = normalizeRoom(localStorage.getItem(ROOM_KEY) ?? "");
  const locationRoom = normalizeRoom(roomFromLocation() ?? "");
  const installedLaunch =
    new URLSearchParams(window.location.search).get("source") === "installed";
  const initialRoom = locationRoom || savedRoom;
  const [roomCode, setRoomCode] = useState(initialRoom);
  const [bootstrap, setBootstrap] = useState<PlayerBootstrap | null>(() =>
    loadBootstrap(initialRoom),
  );
  const [restoring, setRestoring] = useState(
    () =>
      !loadBootstrap(initialRoom) &&
      ((localStorage.getItem(AUTO_RESUME_KEY) === "true" &&
        savedRoom.length === 6 &&
        (!locationRoom || locationRoom === savedRoom)) ||
        (installedLaunch &&
          localStorage.getItem(SUPPRESS_RESUME_KEY) !== "true")),
  );
  const [settings, setSettings] = useState(loadSettings);
  const [joinError, setJoinError] = useState<string | null>(null);
  const realtime = useRealtimeProjection<PlayerProjection>(
    "player",
    bootstrap?.roomCode ?? null,
  );

  useEffect(() => {
    if (locationRoom.length === 6) {
      localStorage.setItem(ROOM_KEY, locationRoom);
    }
  }, [locationRoom]);

  const updateSettings = (next: Settings) => {
    setSettings(next);
    setSoundEnabled(next.sound);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  };

  const acceptBootstrap = (session: PlayerBootstrap) => {
    storeBootstrap(session);
    setRoomCode(session.roomCode);
    setBootstrap(session);
    setJoinError(null);
  };

  const leaveSession = () => {
    if (bootstrap)
      sessionStorage.removeItem(`${SESSION_PREFIX}${bootstrap.roomCode}`);
    setBootstrap(null);
    localStorage.removeItem(AUTO_RESUME_KEY);
    localStorage.setItem(SUPPRESS_RESUME_KEY, "true");
  };

  useEffect(() => {
    if (!restoring || bootstrap) return;
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4_000);
    void apiFetch<unknown>("/api/v1/sessions/resume", {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({
        protocol: PROTOCOL_VERSION,
        clientInstanceId: getClientInstanceId(),
      }),
    })
      .then((response) => {
        if (!active) return;
        acceptBootstrap(parsePlayerBootstrap(response));
        void preferLandscape();
      })
      .catch(() => {
        // An expired cookie is normal between game nights. The saved room and
        // name remain pre-filled so the player can join the current room.
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [bootstrap, restoring]);

  if (restoring) {
    return <ColdStartScreen roomCode={savedRoom} />;
  }

  if (!bootstrap) {
    return (
      <JoinScreen
        initialRoom={roomCode}
        externalError={joinError}
        onJoined={acceptBootstrap}
        onRoomChange={(room) => {
          setRoomCode(room);
          if (room.length === 6) localStorage.setItem(ROOM_KEY, room);
        }}
      />
    );
  }

  return (
    <AuthenticatedPlayer
      bootstrap={bootstrap}
      realtime={realtime}
      settings={settings}
      onSettings={updateSettings}
      onBootstrap={acceptBootstrap}
      onSessionError={setJoinError}
      onLeave={leaveSession}
    />
  );
}

function ColdStartScreen({ roomCode }: { roomCode: string }) {
  return (
    <main className="pwa-cold-start">
      <img src="/pwa/icon-192.png" alt="" />
      <div className="reconnect-sonar" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <p className="eyebrow">
        {roomCode ? "Room " + roomCode : "Installed console"}
      </p>
      <h1>Restoring your field console</h1>
      <p>Checking the private seat saved by this Home Screen app.</p>
    </main>
  );
}

function JoinScreen({
  initialRoom,
  externalError,
  onJoined,
  onRoomChange,
}: {
  initialRoom: string;
  externalError: string | null;
  onJoined: (bootstrap: PlayerBootstrap) => void;
  onRoomChange: (room: string) => void;
}) {
  const [room, setRoom] = useState(initialRoom);
  const [name, setName] = useState(localStorage.getItem(NAME_KEY) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(externalError);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const join = async () => {
    if (room.length !== 6 || !name.trim()) return;
    void preferLandscape();
    setBusy(true);
    setError(null);
    await primeAudio().catch(() => undefined);
    try {
      const response = await apiFetch<unknown>(`/api/v1/matches/${room}/join`, {
        method: "POST",
        body: JSON.stringify({
          protocol: PROTOCOL_VERSION,
          roomCode: room,
          displayName: name.trim(),
          clientInstanceId: getClientInstanceId(),
        }),
      });
      const session = parsePlayerBootstrap(response);
      localStorage.setItem(NAME_KEY, name.trim());
      playFeedback("commit");
      onJoined(session);
    } catch (reason) {
      playFeedback("warning");
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not join this expedition.",
      );
      setBusy(false);
    }
  };

  return (
    <main className="join-screen">
      <div className="join-screen__current" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <section className="join-screen__story">
        <Brand className="join-screen__brand" />
        <p className="eyebrow">Private field instrument</p>
        <h1>
          Your orders stay
          <br />
          <em>below the surface.</em>
        </h1>
        <p>
          The TV is shared truth. This phone holds your submarine, reports,
          deals, traps, and three-Pulse plan.
        </p>
        <div className="join-screen__facts">
          <span>Same Wi-Fi</span>
          <span>No account</span>
          <span>1–6 players</span>
        </div>
      </section>
      <section className="join-card panel">
        <header>
          <div>
            <p className="eyebrow">Join expedition</p>
            <h2>Calibrate your console</h2>
          </div>
          <span>01</span>
        </header>
        <InstallConsole variant="join" roomCode={room} />
        <div className="field-label">
          <label htmlFor="join-room-code">Room code</label>
          <div className="join-card__code-row">
            <input
              id="join-room-code"
              className="field mono join-card__code"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              enterKeyHint="next"
              value={room}
              onChange={(event) => {
                const value = normalizeRoom(event.target.value);
                setRoom(value);
                onRoomChange(value);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                nameInputRef.current?.focus();
              }}
              placeholder="ABC234"
            />
            <QrRoomScanner
              onScan={(code) => {
                setRoom(code);
                onRoomChange(code);
                setError(null);
                window.requestAnimationFrame(() =>
                  nameInputRef.current?.focus(),
                );
              }}
            />
          </div>
        </div>
        <label className="field-label">
          Your name
          <input
            ref={nameInputRef}
            className="field"
            maxLength={24}
            autoComplete="nickname"
            enterKeyHint="done"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              event.currentTarget.blur();
            }}
            placeholder="What should the crew call you?"
          />
        </label>
        <div className="join-card__privacy">
          <span aria-hidden="true">◉</span>
          <div>
            <b>One private seat per phone</b>
            <small>Your session can reconnect after sleep or weak Wi-Fi.</small>
          </div>
        </div>
        {error && (
          <p className="join-card__error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button-primary"
          disabled={busy || room.length !== 6 || !name.trim()}
          onClick={() => void join()}
        >
          {busy ? "Opening channel…" : "Join the survey"}
        </button>
      </section>
    </main>
  );
}

type RealtimePlayer = ReturnType<
  typeof useRealtimeProjection<PlayerProjection>
>;

function AuthenticatedPlayer({
  bootstrap,
  realtime,
  settings,
  onSettings,
  onBootstrap,
  onSessionError,
  onLeave,
}: {
  bootstrap: PlayerBootstrap;
  realtime: RealtimePlayer;
  settings: Settings;
  onSettings: (settings: Settings) => void;
  onBootstrap: (bootstrap: PlayerBootstrap) => void;
  onSessionError: (message: string) => void;
  onLeave: () => void;
}) {
  const [lobby, setLobby] = useState<LobbySnapshot | null>(null);
  const [calibrationOpen, setCalibrationOpen] = useState(
    () =>
      sessionStorage.getItem(`blackwater.calibrated.${bootstrap.matchId}`) !==
      "true",
  );
  const [calibrationStep, setCalibrationStep] = useState(0);
  const [readyBusy, setReadyBusy] = useState(false);
  const [colorBusy, setColorBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (realtime.error) onSessionError(realtime.error);
  }, [onSessionError, realtime.error]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const snapshot = await apiFetch<LobbySnapshot>(
          `/api/v1/matches/${bootstrap.roomCode}/lobby`,
        );
        if (active) setLobby(snapshot);
      } catch {
        // The private projection remains the primary source once the match starts.
      }
    };
    void load();
    const timer = window.setInterval(load, 1_250);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [bootstrap.roomCode]);

  const resume = async () => {
    setError(null);
    try {
      const response = await apiFetch<unknown>("/api/v1/sessions/resume", {
        method: "POST",
        body: JSON.stringify({
          protocol: PROTOCOL_VERSION,
          clientInstanceId: getClientInstanceId(),
        }),
      });
      onBootstrap(parsePlayerBootstrap(response));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "This seat could not be resumed.",
      );
    }
  };

  const setReady = async (ready: boolean) => {
    setReadyBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/matches/${bootstrap.roomCode}/ready`, {
        method: "POST",
        body: JSON.stringify({
          protocol: PROTOCOL_VERSION,
          ready,
          clientInstanceId: bootstrap.clientInstanceId,
        }),
      });
      playFeedback(ready ? "commit" : "unlock");
      const snapshot = await apiFetch<LobbySnapshot>(
        `/api/v1/matches/${bootstrap.roomCode}/lobby`,
      );
      setLobby(snapshot);
    } catch (reason) {
      playFeedback("warning");
      setError(
        reason instanceof Error ? reason.message : "Ready state did not save.",
      );
    } finally {
      setReadyBusy(false);
    }
  };

  const setColor = async (color: (typeof LOBBY_COLORS)[number]) => {
    setColorBusy(true);
    setError(null);
    try {
      const snapshot = await apiFetch<LobbySnapshot>(
        `/api/v1/matches/${bootstrap.roomCode}/color`,
        {
          method: "PATCH",
          body: JSON.stringify({
            protocol: PROTOCOL_VERSION,
            color,
            clientInstanceId: bootstrap.clientInstanceId,
          }),
        },
      );
      setLobby(snapshot);
      playFeedback("select");
    } catch (reason) {
      playFeedback("warning");
      setError(
        reason instanceof Error ? reason.message : "Color did not save.",
      );
    } finally {
      setColorBusy(false);
    }
  };

  const finishCalibration = () => {
    sessionStorage.setItem(
      `blackwater.calibrated.${bootstrap.matchId}`,
      "true",
    );
    setCalibrationOpen(false);
    setCalibrationStep(0);
    playFeedback("scan");
  };

  if (lobby?.lifecycle === "lobby") {
    const ownSeat = lobby.seats.find(
      (seat) => seat.seatId === bootstrap.seatId,
    );
    return (
      <LobbyScreen
        bootstrap={bootstrap}
        lobby={lobby}
        ownReady={Boolean(ownSeat?.ready)}
        busy={readyBusy}
        colorBusy={colorBusy}
        error={error}
        connected={realtime.connected}
        onReady={setReady}
        onColor={setColor}
        onCalibration={() => setCalibrationOpen(true)}
        onLeave={onLeave}
      >
        {calibrationOpen && (
          <CalibrationOverlay
            step={calibrationStep}
            onStep={setCalibrationStep}
            onFinish={finishCalibration}
            onClose={() => setCalibrationOpen(false)}
          />
        )}
      </LobbyScreen>
    );
  }

  if (!realtime.projection) {
    return (
      <main className="reconnect-screen">
        <Brand className="reconnect-screen__brand" />
        <div className="reconnect-sonar">
          <i />
          <i />
          <i />
        </div>
        <p className="eyebrow">Seat {bootstrap.seatId}</p>
        <h1>
          {realtime.error
            ? "Private channel interrupted"
            : "Restoring your field console"}
        </h1>
        <p>
          {error ??
            realtime.error ??
            "Your server-saved draft will appear as soon as the signal returns."}
        </p>
        <div>
          <button className="button-secondary" onClick={() => void resume()}>
            Resume seat
          </button>
          <button className="button-ghost" onClick={onLeave}>
            Join again
          </button>
        </div>
      </main>
    );
  }

  return (
    <FieldConsole
      bootstrap={bootstrap}
      projection={realtime.projection}
      connected={realtime.connected}
      recovered={realtime.recovered}
      sendCommand={realtime.sendCommand}
      settings={settings}
      onSettings={onSettings}
      onLeave={onLeave}
    />
  );
}

function LobbyScreen({
  bootstrap,
  lobby,
  ownReady,
  busy,
  colorBusy,
  error,
  connected,
  onReady,
  onColor,
  onCalibration,
  onLeave,
  children,
}: {
  bootstrap: PlayerBootstrap;
  lobby: LobbySnapshot;
  ownReady: boolean;
  busy: boolean;
  colorBusy: boolean;
  error: string | null;
  connected: boolean;
  onReady: (ready: boolean) => void;
  onColor: (color: (typeof LOBBY_COLORS)[number]) => void;
  onCalibration: () => void;
  onLeave: () => void;
  children?: ReactNode;
}) {
  const own = lobby.seats.find((seat) => seat.seatId === bootstrap.seatId);
  return (
    <main className="lobby-phone" data-seat={own?.color ?? "chalk"}>
      <header className="lobby-phone__head">
        <Brand />
        <span className={`connection-pill ${connected ? "" : "is-offline"}`}>
          {connected ? "Private channel" : "Reconnecting"}
        </span>
        <button
          className="icon-button"
          onClick={onLeave}
          aria-label="Leave seat"
        >
          ×
        </button>
      </header>
      <section className="lobby-phone__identity panel">
        <span className="identity-emblem">
          {lobby.seats.findIndex((seat) => seat.seatId === bootstrap.seatId) +
            1}
        </span>
        <div>
          <p className="eyebrow">Your expedition</p>
          <h1>{own?.displayName ?? "Field team"}</h1>
          <small>
            {own?.color} · {own?.pattern} identity
          </small>
        </div>
        <strong>{lobby.roomCode}</strong>
      </section>
      <section
        className="lobby-phone__colors panel"
        aria-labelledby="expedition-color-title"
      >
        <div>
          <p className="eyebrow">Expedition signal</p>
          <h2 id="expedition-color-title">Choose your color</h2>
        </div>
        <div className="lobby-color-picker">
          {LOBBY_COLORS.map((color) => {
            const claimedBy = lobby.seats.find(
              (seat) => seat.claimed && seat.color === color,
            );
            const selected = own?.color === color;
            const unavailable = Boolean(claimedBy && !selected);
            return (
              <button
                key={color}
                type="button"
                data-seat={color}
                className={selected ? "is-selected" : ""}
                disabled={colorBusy || unavailable}
                aria-label={
                  unavailable
                    ? `${color}, claimed by ${claimedBy?.displayName}`
                    : `${color}${selected ? ", selected" : ""}`
                }
                aria-pressed={selected}
                onClick={() => onColor(color)}
              >
                <span aria-hidden="true" />
                <small>{color}</small>
              </button>
            );
          })}
        </div>
      </section>
      <section className="lobby-phone__seats">
        {lobby.seats.map((seat, index) => (
          <article
            key={seat.seatId}
            data-seat={seat.color}
            className={`${seat.claimed ? "is-claimed" : ""} ${seat.seatId === bootstrap.seatId ? "is-you" : ""}`}
          >
            <b>{index + 1}</b>
            <div>
              <span className="lobby-seat__name">
                <span>{seat.displayName ?? "Open seat"}</span>
                {seat.controller === "bot" && (
                  <AiBadge strategy={seat.botStrategy} />
                )}
              </span>
              <small>
                {seat.seatId === bootstrap.seatId
                  ? "YOU"
                  : seat.controller === "bot"
                    ? "AI · READY"
                    : seat.claimed
                      ? seat.ready
                        ? "READY"
                        : seat.presence
                      : "WAITING"}
              </small>
            </div>
            {seat.controller !== "bot" && (
              <i className={`presence-dot presence-dot--${seat.presence}`} />
            )}
          </article>
        ))}
      </section>
      <footer className="lobby-phone__actions">
        <button className="button-ghost" onClick={onCalibration}>
          Run calibration
        </button>
        <div>
          <span>
            {lobby.seats.filter((seat) => seat.ready).length}/
            {lobby.playerCount} ready
          </span>
          {error && <small role="alert">{error}</small>}
        </div>
        <button
          className={ownReady ? "button-secondary" : "button-primary"}
          disabled={busy}
          onClick={() => void onReady(!ownReady)}
        >
          {busy ? "Saving…" : ownReady ? "Not ready" : "Ready for the deep"}
        </button>
      </footer>
      {children}
    </main>
  );
}

function CalibrationOverlay({
  step,
  onStep,
  onFinish,
  onClose,
}: {
  step: number;
  onStep: (step: number) => void;
  onFinish: () => void;
  onClose: () => void;
}) {
  const lessons = [
    {
      label: "Shared truth",
      title: "The TV is the public basin",
      body: "Arks, platforms, contacts, wakes, Supply, and Charter threats belong to everyone. Point at it. Argue about it.",
    },
    {
      label: "Private depth",
      title: "Your phone knows more",
      body: "Exact submarines, traps, Signal, cargo, sealed reports, and unfinished orders never appear on the shared display.",
    },
    {
      label: "Three Pulses",
      title: "Program a causal sequence",
      body: "Every round you submit exactly three Operations. Glide, Survey, then Harvest is one plan—not three extra turns.",
    },
    {
      label: "Progressive systems",
      title: "Learn the basin by using it",
      body: "Round 1 gives you movement, scanning, and building. Tactical systems come online in Round 2, while Harvest, Analyze, Raid, and Jam appear only when the map makes them useful.",
    },
  ];
  const lesson = lessons[step]!;
  const dialogRef = useDialogFocusTrap(onClose);
  return (
    <div
      ref={dialogRef}
      className="calibration"
      role="dialog"
      aria-modal="true"
      aria-label="Equipment calibration"
    >
      <section className="calibration__card panel">
        <header>
          <div>
            <p className="eyebrow">
              Equipment calibration · {step + 1}/{lessons.length}
            </p>
            <h2>{lesson.label}</h2>
          </div>
          <button
            className="icon-button"
            data-dialog-initial
            onClick={onClose}
            aria-label="Close calibration"
          >
            ×
          </button>
        </header>
        <div
          className={`calibration__instrument calibration__instrument--${step}`}
          aria-hidden="true"
        >
          <span />
          <i />
          <b>
            {step === 0
              ? "PUBLIC"
              : step === 1
                ? "PRIVATE"
                : step === 2
                  ? "P1 · P2 · P3"
                  : "SEALED"}
          </b>
        </div>
        <h1>{lesson.title}</h1>
        <p>{lesson.body}</p>
        <footer>
          <div>
            {lessons.map((_, index) => (
              <i key={index} className={index === step ? "is-active" : ""} />
            ))}
          </div>
          {step > 0 && (
            <button className="button-ghost" onClick={() => onStep(step - 1)}>
              Back
            </button>
          )}
          <button
            className="button-primary"
            onClick={() =>
              step === lessons.length - 1 ? onFinish() : onStep(step + 1)
            }
          >
            {step === lessons.length - 1 ? "Calibration complete" : "Continue"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function FieldConsole({
  bootstrap,
  projection,
  connected,
  recovered,
  sendCommand,
  settings,
  onSettings,
  onLeave,
}: {
  bootstrap: PlayerBootstrap;
  projection: PlayerProjection;
  connected: boolean;
  recovered: boolean;
  sendCommand: RealtimePlayer["sendCommand"];
  settings: Settings;
  onSettings: (settings: Settings) => void;
  onLeave: () => void;
}) {
  const [tab, setTab] = useState<ConsoleTab>("commands");
  const [privacy, setPrivacy] = useState(false);
  const [sheet, setSheet] = useState<"rules" | "settings" | null>(null);
  const [toast, setToast] = useState<{
    kind: "ok" | "error";
    message: string;
  } | null>(null);
  const [now, setNow] = useState(Date.now());
  const phaseKey = `${projection.public.phase.phaseId}:${projection.public.phase.pulse ?? 0}`;
  const previousPhase = useRef(phaseKey);
  const previousRound = useRef(projection.public.phase.round);
  const victoryPlayed = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (phaseKey !== previousPhase.current) {
      previousPhase.current = phaseKey;
      playFeedback(
        projection.public.phase.kind === "resolution" ? "pulse" : "scan",
      );
    }
  }, [phaseKey, projection.public.phase.kind]);

  useEffect(() => {
    if (
      (projection.public.lifecycle === "finished" ||
        projection.public.phase.kind === "game-over") &&
      !victoryPlayed.current
    ) {
      victoryPlayed.current = true;
      playFeedback("victory");
    }
  }, [projection.public.lifecycle, projection.public.phase.kind]);

  const showToast = useCallback((kind: "ok" | "error", message: string) => {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 3_600);
  }, []);

  useEffect(() => {
    const round = projection.public.phase.round;
    if (round > previousRound.current && round >= 2) {
      showToast(
        "ok",
        "Tactical systems online · traps, defense, and conflict are ready",
      );
    }
    previousRound.current = round;
  }, [projection.public.phase.round, showToast]);

  const sendIntent = useCallback(
    async (intent: {
      type: string;
      expected: unknown;
      payload: unknown;
    }): Promise<CommandResult> => {
      const envelope = ClientCommandSchema.parse({
        protocol: PROTOCOL_VERSION,
        commandId: nextCommandId(bootstrap.commandPrefix),
        matchId: projection.public.matchId,
        phaseId: projection.public.phase.phaseId,
        sessionEpoch: bootstrap.sessionEpoch,
        clientInstanceId: bootstrap.clientInstanceId,
        writerLeaseId: bootstrap.writerLeaseId,
        ...intent,
      });
      const result = await sendCommand(envelope);
      if (result.status === "rejected")
        throw new Error(friendlyCommandError(result.code));
      return result;
    },
    [
      bootstrap,
      projection.public.matchId,
      projection.public.phase.phaseId,
      sendCommand,
    ],
  );

  const own = projection.public.expeditions.find(
    (expedition) => expedition.seatId === projection.seatId,
  )!;
  const commission = projection.public.commissions.find(
    (candidate) => candidate.targetSeatId === projection.seatId,
  );
  const remaining = projection.public.phase.endsAtServerMs
    ? Math.max(0, (projection.public.phase.endsAtServerMs - now) / 1000)
    : null;
  const isFinished =
    projection.public.lifecycle === "finished" ||
    projection.public.phase.kind === "game-over";
  const commandBody = isFinished ? (
    <EndgamePanel projection={projection} />
  ) : projection.public.phase.kind === "open-water" ? (
    <PlanningWorkspace
      projection={projection}
      connected={connected}
      sendIntent={sendIntent}
      showToast={showToast}
      onPrivacy={() => setPrivacy(true)}
    />
  ) : (
    <ResolutionWorkspace projection={projection} />
  );

  return (
    <main
      className={`field-console ${settings.reducedMotion ? "is-reduced-motion" : ""} ${settings.highContrast ? "is-high-contrast" : ""}`}
      data-seat={own.color}
    >
      <h1 className="sr-only">
        Blackwater private field console for {own.displayName}
      </h1>
      <header className="field-head">
        <button
          className="field-head__identity"
          onClick={() => setSheet("rules")}
        >
          <span>{own.displayName.slice(0, 1).toUpperCase()}</span>
          <div>
            <b>{own.displayName}</b>
            <small>
              {commission
                ? `OPEN COMMISSION · +${commission.rewardSupply} SUPPLY`
                : own.factionName}
            </small>
          </div>
        </button>
        <div className="field-head__phase">
          <small>Round {projection.public.phase.round} / 7</small>
          <b>
            {phaseNames[projection.public.phase.kind] ??
              projection.public.phase.kind}
          </b>
        </div>
        <div className="field-head__clock">
          <b>{remaining === null ? "—" : formatClock(remaining)}</b>
          <small>
            {projection.public.phase.paused
              ? "PAUSED"
              : projection.draft.locked
                ? "LOCKED"
                : "FIELD TIME"}
          </small>
        </div>
        <div className="field-head__resources">
          <span>
            Supply <b>{projection.resources.supply}</b>
          </span>
          <span>
            Signal <b>{projection.resources.signal}</b>
          </span>
          <span>
            Analyzed <b>{projection.analyzedTypes.length}</b>
          </span>
        </div>
        <span
          className={`field-head__link ${connected ? "is-live" : ""}`}
          title={recovered ? "Connection recovered" : undefined}
        >
          <i />
          {connected ? "Live" : "Reconnecting"}
        </span>
        <button
          className="icon-button"
          onClick={() => setPrivacy(true)}
          aria-label="Lock private console"
          title="Lock private console"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3M6 10h12v10H6z" />
          </svg>
        </button>
        <button
          className="icon-button"
          onClick={() => setSheet("settings")}
          aria-label="Open settings"
        >
          ⚙
        </button>
      </header>

      <nav className="console-tabs" aria-label="Field console sections">
        <button
          className={tab === "commands" ? "is-active" : ""}
          aria-pressed={tab === "commands"}
          onClick={() => {
            setTab("commands");
            playFeedback("select");
          }}
        >
          Commands
        </button>
        <button
          className={tab === "intel" ? "is-active" : ""}
          aria-pressed={tab === "intel"}
          onClick={() => {
            setTab("intel");
            playFeedback("select");
          }}
        >
          Intel <span>{projection.reports.length}</span>
        </button>
        <button
          className={tab === "deals" ? "is-active" : ""}
          aria-pressed={tab === "deals"}
          onClick={() => {
            setTab("deals");
            playFeedback("select");
          }}
        >
          Deals{" "}
          <span>
            {
              projection.deals.filter((deal) => deal.status === "pending")
                .length
            }
          </span>
        </button>
      </nav>

      <section className="console-content">
        {tab === "commands" && commandBody}
        {tab === "intel" && (
          <IntelWorkspace
            projection={projection}
            sendIntent={sendIntent}
            showToast={showToast}
          />
        )}
        {tab === "deals" && (
          <DealsWorkspace
            projection={projection}
            sendIntent={sendIntent}
            showToast={showToast}
          />
        )}
      </section>

      {!connected && (
        <div className="reconnect-banner">
          <i />
          Signal interrupted · your server-saved plan is safe. Editing pauses
          until reconnection.
        </div>
      )}
      {privacy && (
        <PrivacyVeil
          projection={projection}
          onReveal={() => setPrivacy(false)}
        />
      )}
      {sheet && (
        <ReferenceSheet
          mode={sheet}
          roomCode={bootstrap.roomCode}
          settings={settings}
          onSettings={onSettings}
          onMode={setSheet}
          onClose={() => setSheet(null)}
          onLeave={onLeave}
        />
      )}
      {toast && (
        <div className={`phone-toast phone-toast--${toast.kind}`} role="status">
          {toast.message}
        </div>
      )}
      <div className="rotate-hint">
        <span>↻</span>
        <div>
          <b>Rotate for the full field console</b>
          <small>Portrait remains functional below.</small>
        </div>
      </div>
    </main>
  );
}

function InspectableBasinMap({
  basin,
  selectedSectorId = null,
  reachableSectorIds = [],
  focusSectorId = null,
  compact = false,
  privateView = false,
  interactiveCamera = false,
  onSectorSelect,
}: {
  basin: BasinView;
  selectedSectorId?: number | null;
  reachableSectorIds?: number[];
  focusSectorId?: number | null;
  compact?: boolean;
  privateView?: boolean;
  interactiveCamera?: boolean;
  onSectorSelect?: (sectorId: number) => void;
}) {
  const [inspectedSectorId, setInspectedSectorId] = useState<number | null>(
    null,
  );
  const inspectedSector = basin.sectors.find(
    (sector) => sector.id === inspectedSectorId,
  );

  return (
    <>
      <BasinMap
        basin={basin}
        compact={compact}
        privateView={privateView}
        interactiveCamera={interactiveCamera}
        selectedSectorId={inspectedSectorId ?? selectedSectorId}
        reachableSectorIds={reachableSectorIds}
        focusSectorId={focusSectorId}
        inspectAllSectors
        onSectorSelect={(sectorId) => {
          setInspectedSectorId(sectorId);
          onSectorSelect?.(sectorId);
          playFeedback("select");
        }}
      />
      {inspectedSector && (
        <SectorDossier
          basin={basin}
          sectorId={inspectedSector.id}
          onClose={() => setInspectedSectorId(null)}
        />
      )}
    </>
  );
}

function SectorDossier({
  basin,
  sectorId,
  onClose,
}: {
  basin: BasinView;
  sectorId: number;
  onClose: () => void;
}) {
  const sector = basin.sectors.find((candidate) => candidate.id === sectorId)!;
  const neighbours = basin.connections
    .flatMap(([a, b]) => (a === sectorId ? [b] : b === sectorId ? [a] : []))
    .sort((a, b) => a - b);
  const publicEntities = basin.entities.filter(
    (entity) => entity.sectorId === sectorId && !entity.private,
  );
  const evidence = basin.evidence.filter(
    (item) =>
      item.sectorId === sectorId ||
      item.fromSectorId === sectorId ||
      item.toSectorId === sectorId,
  );
  const visibleFacts = [
    ...publicEntities.map((entity) =>
      entity.kind === "site"
        ? (entity.label ?? "Deep Site marker")
        : (entity.label ?? entity.kind),
    ),
    ...evidence.map((item) => {
      if (item.kind === "identified") return "Identified expedition contact";
      if (item.kind === "contact") return "Unidentified sonar contact";
      if (item.kind === "wake") return "Public movement wake";
      return "Signal disturbance or jam evidence";
    }),
  ];
  const regionName =
    sector.region === "blackwater" ? "deep water" : sector.region;

  return (
    <div className="sector-dossier" role="presentation" onClick={onClose}>
      <article
        role="dialog"
        aria-modal="true"
        aria-labelledby="sector-dossier-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div className="sector-dossier__code">
            S{String(sector.id).padStart(2, "0")}
          </div>
          <div>
            <p className="eyebrow">Public sector file · {regionName}</p>
            <h2 id="sector-dossier-title">{sector.name}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close sector details"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="sector-dossier__grid">
          <section>
            <h3>Public right now</h3>
            {visibleFacts.length ? (
              <ul>
                {[...new Set(visibleFacts)].map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            ) : (
              <p>
                No Ark, platform, salvage, or public evidence is recorded here.
              </p>
            )}
            <small>
              Connected to {neighbours.map((id) => `S${id}`).join(", ")}.
            </small>
          </section>

          <section>
            <h3>What this location means</h3>
            <ul>
              <li>
                {sector.region === "shelf"
                  ? "Shelf is one of the three regions used by the Network mission."
                  : sector.region === "rift"
                    ? "Rift is one of the three regions used by the Network mission."
                    : "Deep water is one of the three regions used by the Network mission."}
              </li>
              <li>Region depth does not change the basic movement cost.</li>
              {sector.deepSite && (
                <li>
                  Deep Site: specimens can appear here and a submarine can
                  Harvest one when the public marker says it is available.
                </li>
              )}
              {sector.dominionObjective && (
                <li>
                  Dominion objective: sole active control at the Charter Check
                  counts; a rival presence contests it.
                </li>
              )}
            </ul>
          </section>

          <section className="sector-dossier__unknown">
            <h3>What could be hidden</h3>
            <p>
              A submarine, snare, or decoy may be here without appearing
              publicly. Survey and later public evidence can narrow that
              uncertainty—but an empty public list never proves the sector is
              empty.
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}

function PlanningWorkspace({
  projection,
  connected,
  sendIntent,
  showToast,
  onPrivacy,
}: {
  projection: PlayerProjection;
  connected: boolean;
  sendIntent: (intent: {
    type: string;
    expected: unknown;
    payload: unknown;
  }) => Promise<CommandResult>;
  showToast: (kind: "ok" | "error", message: string) => void;
  onPrivacy: () => void;
}) {
  const discoveryChapter =
    projection.public.phase.round >= 2 ? "tactics" : "core";
  const discoveryKey = `blackwater.discovery.v2.${projection.public.matchId}.${projection.seatId}.${discoveryChapter}`;
  const assets = useMemo(() => playableAssets(projection), [projection]);
  const [plan, setPlan] = useState<DraftPlan>(projection.draft.plan);
  const [draftRevision, setDraftRevision] = useState(projection.draft.revision);
  const [pulse, setPulse] = useState<Pulse>(1);
  const [selectedAssetId, setSelectedAssetId] = useState(
    () => projection.draft.plan.operations[0].assetId ?? assets[0]?.id ?? "",
  );
  const [editor, setEditor] = useState<OperationEditor>(() =>
    editorFromOperation(projection.draft.plan.operations[0], selectedAssetId),
  );
  const [editorDirty, setEditorDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [tacticsOpen, setTacticsOpen] = useState(
    () =>
      OPERATION_META[projection.draft.plan.operations[0].kind].chapter ===
      "tactics",
  );
  const [contextHint, setContextHint] = useState<ContextHint | null>(null);
  const [discoveryDismissed, setDiscoveryDismissed] = useState(() => {
    try {
      return localStorage.getItem(discoveryKey) === "seen";
    } catch {
      return false;
    }
  });
  const revisionRef = useRef(projection.draft.revision);
  const editorDirtyRef = useRef(false);
  const pulseEditorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setDiscoveryDismissed(localStorage.getItem(discoveryKey) === "seen");
    } catch {
      setDiscoveryDismissed(false);
    }
  }, [discoveryKey]);

  useEffect(() => {
    pulseEditorRef.current?.scrollTo({ top: 0 });
  }, [discoveryChapter]);

  const editEditor = (
    update: OperationEditor | ((current: OperationEditor) => OperationEditor),
  ) => {
    editorDirtyRef.current = true;
    setEditorDirty(true);
    setEditor(update);
  };

  const loadPulseEditor = (sourcePlan: DraftPlan, targetPulse: Pulse) => {
    const operation =
      sourcePlan.operations[targetPulse - 1] ?? sourcePlan.operations[0];
    const fallback =
      operation.assetId ?? (selectedAssetId || assets[0]?.id || "");
    setSelectedAssetId(fallback);
    setEditor(editorFromOperation(operation, fallback));
    editorDirtyRef.current = false;
    setEditorDirty(false);
    setEditorError(null);
  };

  useEffect(() => {
    if (projection.draft.revision < revisionRef.current) return;
    revisionRef.current = projection.draft.revision;
    setDraftRevision(projection.draft.revision);
    setPlan(projection.draft.plan);
    if (!editorDirtyRef.current) loadPulseEditor(projection.draft.plan, pulse);
  }, [projection.draft.revision]);

  useEffect(() => {
    loadPulseEditor(plan, pulse);
  }, [pulse]);

  const selectedAsset =
    assets.find((asset) => asset.id === editor.assetId) ?? assets[0];
  const operationMenu = operationMenuForAsset(
    projection,
    selectedAsset,
    plan,
    pulse,
    editor.kind,
  );
  const reachable = reachableForEditor(
    projection,
    selectedAsset,
    plan,
    pulse,
    editor.kind,
  );
  const currentSectorId = selectedAsset
    ? projectedAssetSector(selectedAsset, plan, pulse)
    : null;
  const localCandidate = buildOperation(projection, plan, pulse, editor);
  const priorPlatformBuild = plan.operations
    .slice(0, pulse - 1)
    .some(
      (operation) =>
        operation.kind === "develop" && operation.project.kind === "platform",
    );
  const localCost = localCandidate.operation
    ? operationCost(
        localCandidate.operation,
        projection.faction === "hadal_engineers" && !priorPlatformBuild,
        localCandidate.operation.kind === "deploy" &&
          projection.deviceInventory[localCandidate.operation.device] <= 0,
      )
    : { supply: 0, signal: 0, silence: 0 };
  const basin = basinForPlayer(projection);

  useEffect(() => {
    if (OPERATION_META[editor.kind].chapter === "tactics") setTacticsOpen(true);
  }, [editor.kind]);

  const changeAsset = (assetId: string) => {
    const asset = assets.find((candidate) => candidate.id === assetId);
    const menu = operationMenuForAsset(projection, asset, plan, pulse);
    const kind = menu.core[0] ?? menu.opportunities[0]?.kind ?? "hold";
    setSelectedAssetId(assetId);
    editEditor((current) => ({
      ...current,
      assetId,
      kind,
      targetSectorId: null,
    }));
    setEditorError(null);
    playFeedback("select");
  };

  const chooseKind = (kind: OperationEditor["kind"]) => {
    if (OPERATION_META[kind].chapter === "tactics") setTacticsOpen(true);
    editEditor((current) => ({
      ...current,
      kind,
      targetSectorId: null,
      ...(kind === "deploy"
        ? {
            device:
              projection.deviceInventory.snare > 0
                ? ("snare" as const)
                : projection.deviceInventory.decoy > 0
                  ? ("decoy" as const)
                  : ("snare" as const),
          }
        : {}),
    }));
    setEditorError(null);
    playFeedback(kind === "survey" ? "scan" : "select");
  };

  const dismissDiscovery = () => {
    setDiscoveryDismissed(true);
    try {
      localStorage.setItem(discoveryKey, "seen");
    } catch {
      // Guidance remains dismissible for this session when storage is blocked.
    }
  };

  const dismissContextHint = (hintId: string) => {
    setContextHint((current) => (current?.id === hintId ? null : current));
  };

  const operationButton = (
    kind: OperationKind,
    options: { reason?: string; current?: boolean } = {},
  ) => {
    const meta = OPERATION_META[kind];
    const hintId = `operation-${pulse}-${kind}`;
    return (
      <HintableButton
        key={`${kind}-${options.current ? "current" : "menu"}`}
        hintId={hintId}
        hintTitle={meta.label}
        hintSummary={meta.short}
        hintTrace={meta.trace}
        onHint={setContextHint}
        onHintDismiss={dismissContextHint}
        onActivate={() => chooseKind(kind)}
        className={`${editor.kind === kind ? "is-selected" : ""} ${options.reason ? "is-opportunity" : ""}`}
        aria-pressed={editor.kind === kind}
      >
        <span className="operation-choice__glyph">{operationGlyph(kind)}</span>
        <span className="operation-choice__label">{meta.label}</span>
        {options.reason && (
          <small className="operation-choice__reason">{options.reason}</small>
        )}
      </HintableButton>
    );
  };

  const savePulse = async () => {
    const built = buildOperation(projection, plan, pulse, editor);
    if (!built.operation) {
      playFeedback("warning");
      setEditorError(built.error ?? "This Operation is incomplete.");
      return;
    }
    const next = replacePulse(plan, pulse, built.operation);
    const parsed = DraftPlanSchema.safeParse(next);
    if (!parsed.success) {
      setEditorError(
        parsed.error.issues[0]?.message ?? "This Pulse is incomplete.",
      );
      return;
    }
    setSaving(true);
    setEditorError(null);
    try {
      const result = await sendIntent({
        type: "draft.replace",
        expected: { kind: "draft", revision: draftRevision },
        payload: { plan: parsed.data },
      });
      if (result.status !== "rejected" && result.applied?.kind === "draft") {
        revisionRef.current = result.applied.revision;
        setDraftRevision(result.applied.revision);
      }
      setPlan(parsed.data);
      editorDirtyRef.current = false;
      setEditorDirty(false);
      showToast(
        "ok",
        `Pulse ${pulse} saved · ${OPERATION_META[built.operation.kind].label}`,
      );
      playFeedback(built.operation.kind === "survey" ? "scan" : "select");
      if (pulse < 3) setPulse((pulse + 1) as Pulse);
    } catch (reason) {
      playFeedback("warning");
      showToast(
        "error",
        reason instanceof Error ? reason.message : "Draft did not save.",
      );
    } finally {
      setSaving(false);
    }
  };

  const lock = async () => {
    const built = buildOperation(projection, plan, pulse, editor);
    if (!built.operation) {
      playFeedback("warning");
      setEditorError(built.error ?? "Complete the open Pulse before locking.");
      return;
    }
    const next = replacePulse(plan, pulse, built.operation);
    const parsed = DraftPlanSchema.safeParse(next);
    if (!parsed.success) {
      playFeedback("warning");
      setEditorError(
        parsed.error.issues[0]?.message ?? "The open Pulse is incomplete.",
      );
      return;
    }
    setSaving(true);
    try {
      const result = await sendIntent({
        type: "draft.lock",
        expected: { kind: "draft", revision: draftRevision },
        payload: { plan: parsed.data },
      });
      if (result.status !== "rejected" && result.applied?.kind === "draft") {
        revisionRef.current = result.applied.revision;
        setDraftRevision(result.applied.revision);
      }
      setPlan(parsed.data);
      editorDirtyRef.current = false;
      setEditorDirty(false);
      playFeedback("commit");
      onPrivacy();
      showToast("ok", "Plan locked · watch the basin");
    } catch (reason) {
      playFeedback("warning");
      showToast(
        "error",
        reason instanceof Error ? reason.message : "Plan did not lock.",
      );
    } finally {
      setSaving(false);
    }
  };

  const unlock = async () => {
    setSaving(true);
    try {
      const result = await sendIntent({
        type: "draft.unlock",
        expected: { kind: "draft", revision: draftRevision },
        payload: {},
      });
      if (result.status !== "rejected" && result.applied?.kind === "draft") {
        revisionRef.current = result.applied.revision;
        setDraftRevision(result.applied.revision);
      }
      playFeedback("unlock");
      showToast("ok", "Plan unlocked");
    } catch (reason) {
      playFeedback("warning");
      showToast(
        "error",
        reason instanceof Error ? reason.message : "Plan stayed locked.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (projection.draft.locked) {
    return (
      <section className="locked-plan">
        <div className="locked-plan__map panel">
          <InspectableBasinMap
            basin={basin}
            compact
            privateView
            interactiveCamera
            focusSectorId={currentSectorId}
          />
        </div>
        <div className="locked-plan__summary panel">
          <span className="locked-plan__seal">✓</span>
          <p className="eyebrow">Plan locked</p>
          <h1>Watch the basin.</h1>
          <p>
            Your private details are covered. The server has all three
            Operations and will keep them if this phone sleeps.
          </p>
          <div>
            {plan.operations.map((operation) => (
              <span key={operation.pulse}>
                <b>P{operation.pulse}</b>
                {operationSummary(operation, projection)}
              </span>
            ))}
          </div>
          <button
            className="button-secondary"
            disabled={!connected || saving}
            onClick={() => void unlock()}
          >
            {saving ? "Unlocking…" : "Review & unlock"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="planning-workspace">
      <section className="private-map panel">
        <div className="asset-rail" aria-label="Your assets">
          {assets.map((asset) => (
            <button
              key={asset.id}
              className={editor.assetId === asset.id ? "is-selected" : ""}
              aria-pressed={editor.assetId === asset.id}
              disabled={!asset.available && asset.kind !== "platform"}
              onClick={() => changeAsset(asset.id)}
              title={asset.detail}
            >
              <img src={assetSprite(asset)} alt="" />
              <span>{asset.label}</span>
            </button>
          ))}
        </div>
        <div className="private-map__canvas">
          <InspectableBasinMap
            basin={basin}
            compact
            privateView
            interactiveCamera
            selectedSectorId={editor.targetSectorId}
            reachableSectorIds={reachable}
            focusSectorId={currentSectorId}
            onSectorSelect={(sectorId) => {
              if (reachable.includes(sectorId)) {
                editEditor((current) => ({
                  ...current,
                  targetSectorId: sectorId,
                }));
              }
            }}
          />
          <div className="private-map__legend">
            <span>
              <i /> exact private asset
            </span>
            <span>
              <i /> public evidence
            </span>
          </div>
        </div>
      </section>

      <section className="pulse-work panel">
        <div className="pulse-stepper">
          {plan.operations.map((operation) => (
            <button
              key={operation.pulse}
              disabled={editorDirty && pulse !== operation.pulse}
              className={`${pulse === operation.pulse ? "is-active" : ""} ${operation.kind !== "hold" ? "is-filled" : ""}`}
              aria-pressed={pulse === operation.pulse}
              onClick={() => {
                setPulse(operation.pulse as Pulse);
                playFeedback("select");
              }}
            >
              <b>P{operation.pulse}</b>
              <span>{OPERATION_META[operation.kind].label}</span>
              <small>
                {operation.kind === "hold"
                  ? "Hold position"
                  : operationSummary(operation, projection)}
              </small>
            </button>
          ))}
        </div>
        <div ref={pulseEditorRef} className="pulse-editor">
          {!discoveryDismissed ? (
            <aside
              className={`discovery-card discovery-card--${discoveryChapter}`}
              aria-label={`${discoveryChapter} systems guide`}
            >
              <span className="discovery-card__chapter">
                {discoveryChapter === "core"
                  ? "ROUND 1 · CORE"
                  : "NEW · ROUND 2"}
              </span>
              <div>
                <b>
                  {discoveryChapter === "core"
                    ? "Program one simple step at a time"
                    : "Tactical systems are now online"}
                </b>
                <p>
                  {discoveryChapter === "core"
                    ? "Choose a unit → choose an order → tap a glowing sector if asked → save this Pulse. Repeat three times."
                    : "Open Tactics only when you want traps, stealth recovery, defense, or conflict. Context-only actions still appear exactly where they work."}
                </p>
              </div>
              <button className="button-ghost" onClick={dismissDiscovery}>
                Got it
              </button>
            </aside>
          ) : (
            <div className="discovery-breadcrumb">
              <span>
                {discoveryChapter === "core" ? "CORE ONLINE" : "TACTICS ONLINE"}
              </span>
              Choose unit → order → target → save
            </div>
          )}
          <header>
            <div>
              <p className="eyebrow">
                Pulse {pulse} · {selectedAsset?.label ?? "No asset"}
              </p>
              <h2>{OPERATION_META[editor.kind].label}</h2>
            </div>
            <div className="pulse-editor__tools">
              <button
                className="operation-help-button"
                aria-expanded={guideOpen}
                aria-controls="selected-operation-guide"
                onClick={() => setGuideOpen((open) => !open)}
              >
                <span>?</span> Explain
              </button>
              <span className={`draft-state ${editorDirty ? "is-dirty" : ""}`}>
                {editorDirty ? "UNSAVED" : `Draft r${draftRevision}`}
              </span>
            </div>
          </header>
          <div className="operation-menu">
            <div className="operation-menu__label">
              <span>Core orders</span>
              <small>Hold an order for a quick hint</small>
            </div>
            <div
              className="operation-strip"
              role="group"
              aria-label="Core orders"
            >
              {operationMenu.core.map((kind) => operationButton(kind))}
            </div>
            {operationMenu.opportunities.length > 0 && (
              <div className="operation-opportunities">
                <span>AVAILABLE HERE</span>
                <div
                  className="operation-strip operation-strip--opportunities"
                  role="group"
                  aria-label="Contextual opportunities"
                >
                  {operationMenu.opportunities.map(({ kind, reason }) =>
                    operationButton(kind, { reason }),
                  )}
                </div>
              </div>
            )}
            {projection.public.phase.round <
            operationMenu.tacticsUnlockRound ? (
              <div className="systems-locked">
                <span>R2</span>
                <div>
                  <b>Tactical systems calibrating</b>
                  <small>
                    Traps, defense, and conflict arrive after Round 1.
                  </small>
                </div>
              </div>
            ) : operationMenu.tactics.length > 0 ? (
              <div className="tactics-menu">
                <button
                  className="tactics-menu__toggle"
                  aria-expanded={tacticsOpen}
                  onClick={() => setTacticsOpen((open) => !open)}
                >
                  <span>
                    <b>Tactical systems</b>
                    <small>Traps · stealth · defense · conflict</small>
                  </span>
                  <strong>
                    {tacticsOpen
                      ? "Hide"
                      : `${operationMenu.tactics.length} tools`}{" "}
                    {tacticsOpen ? "↑" : "↓"}
                  </strong>
                </button>
                {tacticsOpen && (
                  <div
                    className="operation-strip operation-strip--tactics"
                    role="group"
                    aria-label="Tactical orders"
                  >
                    {operationMenu.tactics.map((kind) => operationButton(kind))}
                  </div>
                )}
              </div>
            ) : null}
            {operationMenu.current && (
              <div className="current-operation">
                <span>Current saved order</span>
                {operationButton(operationMenu.current, { current: true })}
              </div>
            )}
          </div>
          {guideOpen && (
            <article
              id="selected-operation-guide"
              className="operation-guide"
              aria-live="polite"
            >
              <header>
                <span>{operationGlyph(editor.kind)}</span>
                <div>
                  <small>
                    HOW {OPERATION_META[editor.kind].label.toUpperCase()} WORKS
                  </small>
                  <b>{OPERATION_META[editor.kind].short}</b>
                </div>
                <button
                  className="icon-button"
                  aria-label="Close operation explanation"
                  onClick={() => setGuideOpen(false)}
                >
                  ×
                </button>
              </header>
              <div>
                <p>
                  <span>USE IT WHEN</span>
                  {OPERATION_META[editor.kind].when}
                </p>
                <p>
                  <span>WHAT TO DO</span>
                  {OPERATION_META[editor.kind].how}
                </p>
                <p>
                  <span>RIGHT NOW</span>
                  {localCandidate.error ??
                    "This order is complete and ready to save."}
                </p>
              </div>
            </article>
          )}
          <OperationFields
            projection={projection}
            asset={selectedAsset}
            currentSectorId={currentSectorId}
            editor={editor}
            onEditor={editEditor}
          />
          {projection.faction === "second_dawn" &&
            projection.public.salvage.length > 0 && (
              <label className="compact-field salvage-priority">
                Second Dawn salvage priority
                <select
                  value={
                    plan.secondDawnSalvagePriority?.[0] ??
                    projection.public.salvage[0]?.salvageId ??
                    ""
                  }
                  onChange={(event) => {
                    const first = event.target.value;
                    const rest = projection.public.salvage
                      .map((salvage) => salvage.salvageId)
                      .filter((id) => id !== first);
                    editorDirtyRef.current = true;
                    setEditorDirty(true);
                    setPlan((current) => ({
                      ...current,
                      secondDawnSalvagePriority: [first, ...rest],
                    }));
                  }}
                >
                  <option value="">Default nearest salvage</option>
                  {projection.public.salvage.map((salvage) => (
                    <option key={salvage.salvageId} value={salvage.salvageId}>
                      {sectorName(projection, salvage.sectorId)} ·{" "}
                      {salvage.salvageId}
                    </option>
                  ))}
                </select>
              </label>
            )}
          <div className="operation-preview">
            <div>
              <small>What your unit does</small>
              <b>
                {localCandidate.error ??
                  (localCandidate.operation
                    ? operationSummary(localCandidate.operation, projection)
                    : "Choose an Operation")}
              </b>
            </div>
            <div>
              <small>What everyone sees</small>
              <b>{OPERATION_META[editor.kind].trace}</b>
            </div>
            <div>
              <small>Cost</small>
              <b>{formatCost(localCost)}</b>
            </div>
          </div>
          {editorError && (
            <p className="operation-error" role="alert">
              {editorError}
            </p>
          )}
          <button
            className="button-secondary save-pulse"
            disabled={!connected || saving}
            onClick={() => void savePulse()}
          >
            {saving ? "Saving…" : `Save Pulse ${pulse}`}
          </button>
        </div>
      </section>

      <footer className="plan-footer">
        <div>
          <span className="eyebrow">Resources · current → server reserved</span>
          <p>
            <b>Supply {projection.resources.supply}</b> →{" "}
            {Math.max(
              0,
              projection.resources.supply - projection.draft.reservedSupply,
            )}
            <i />
            <b>Signal {projection.resources.signal}</b> →{" "}
            {Math.max(
              0,
              projection.resources.signal - projection.draft.reservedSignal,
            )}
          </p>
        </div>
        <div className={projection.draft.valid ? "" : "is-warning"}>
          <span className="eyebrow">Exposure & validation</span>
          <p>
            {projection.draft.valid
              ? planExposure(plan)
              : (projection.draft.invalidReasons[0] ??
                "Plan requires attention")}
          </p>
        </div>
        <button
          className="button-primary"
          disabled={!connected || saving}
          onClick={() => void lock()}
        >
          {saving ? "Securing…" : "Lock & ready"}
          <small>
            {editorDirty
              ? "Includes unsaved open editor"
              : "Editable until the deadline"}
          </small>
        </button>
      </footer>
      <ContextHintTooltip hint={contextHint} />
    </section>
  );
}

function OperationFields({
  projection,
  asset,
  currentSectorId,
  editor,
  onEditor,
}: {
  projection: PlayerProjection;
  asset: AssetChoice | undefined;
  currentSectorId: number | null;
  editor: OperationEditor;
  onEditor: (
    editor: OperationEditor | ((current: OperationEditor) => OperationEditor),
  ) => void;
}) {
  const currentName =
    projection.public.topology.sectors.find(
      (sector) => sector.sectorId === currentSectorId,
    )?.name ?? "Unknown sector";
  const targetName = projection.public.topology.sectors.find(
    (sector) => sector.sectorId === editor.targetSectorId,
  )?.name;
  const rivalPlatforms = projection.public.platforms.filter(
    (platform) =>
      platform.ownerSeatId !== projection.seatId &&
      platform.sectorId === currentSectorId,
  );
  const reports = projection.public.contacts.filter(
    (contact) => contact.sectorId === currentSectorId,
  );
  const observations = projection.observations.filter(
    (observation) => observation.sectorId === currentSectorId,
  );
  const submarine = projection.submarines.find(
    (candidate) => candidate.assetId === asset?.id,
  );
  const repairTargets = projection.submarines.filter(
    (candidate) =>
      candidate.sectorId === currentSectorId &&
      (candidate.integrity < 2 || candidate.state === "disabled"),
  );
  const harvestTargets =
    currentSectorId === null
      ? []
      : [
          ...projection.public.deepSites
            .filter(
              (site) =>
                site.sectorId === currentSectorId && site.specimenAvailable,
            )
            .map(() => ({
              id: `site:${currentSectorId}`,
              label: `Stocked Deep Site · ${currentName}`,
            })),
          ...projection.public.salvage
            .filter((salvage) => salvage.sectorId === currentSectorId)
            .map((salvage) => ({
              id: salvage.salvageId,
              label: `Salvage pod · ${salvage.salvageId}`,
            })),
        ];
  const towTargets = projection.public.platforms.filter(
    (platform) =>
      platform.ownerSeatId === projection.seatId &&
      platform.state === "active" &&
      platform.sectorId === currentSectorId,
  );
  const rivalSeats = projection.public.expeditions.filter(
    (expedition) => expedition.seatId !== projection.seatId,
  );
  const decoyRouteOptions =
    currentSectorId === null
      ? []
      : projection.public.topology.edges
          .flatMap((edge) =>
            edge.a === currentSectorId
              ? [edge.b]
              : edge.b === currentSectorId
                ? [edge.a]
                : [],
          )
          .sort((a, b) => a - b);
  const canFabricateDevice =
    projection.devices.filter((device) => device.state === "deployed").length +
      projection.deviceInventory.snare +
      projection.deviceInventory.decoy <
      2 &&
    projection.resources.supply >= 1 &&
    projection.resources.signal >= 1;
  const deployKinds = (["snare", "decoy"] as const).filter(
    (kind) => projection.deviceInventory[kind] > 0 || canFabricateDevice,
  );
  const developKinds = (
    [
      projection.public.platforms.filter(
        (platform) => platform.ownerSeatId === projection.seatId,
      ).length < 4 &&
      !projection.public.platforms.some(
        (platform) => platform.sectorId === currentSectorId,
      )
        ? "platform"
        : null,
      projection.submarines.length < 2 ? "submarine" : null,
      repairTargets.length > 0 ? "repair_submarine" : null,
      editor.kind === "develop" ? editor.developKind : null,
    ] as const
  ).filter(
    (kind, index, values): kind is OperationEditor["developKind"] =>
      kind !== null && values.indexOf(kind) === index,
  );
  const commitmentKinds = ["harvest", "hunt", "raid", "screen"];
  return (
    <div className="operation-fields">
      <div className="operation-fields__route">
        <span>
          FROM <b>{currentName}</b>
        </span>
        <i>→</i>
        <span>
          TO{" "}
          <b>
            {targetName ??
              (["glide", "sprint", "navigate"].includes(editor.kind)
                ? "Choose on map"
                : currentName)}
          </b>
        </span>
      </div>
      {editor.kind === "glide" && (
        <ToggleRow
          label="Silent Running"
          detail={
            submarine
              ? `${submarine.silence}/${submarine.maxSilence} charges`
              : "Requires Silence"
          }
          checked={editor.silent}
          onChange={(silent) => onEditor((current) => ({ ...current, silent }))}
        />
      )}
      {(editor.kind === "survey" || editor.kind === "harvest") &&
        projection.faction === "quiet_current" && (
          <ToggleRow
            label="Suppress public contact"
            detail="Quiet Current power · costs 1 Silence"
            checked={editor.suppressPublicContact}
            onChange={(suppressPublicContact) =>
              onEditor((current) => ({ ...current, suppressPublicContact }))
            }
          />
        )}
      {commitmentKinds.includes(editor.kind) && (
        <FieldButtons
          label="Signal commitment"
          values={[0, 1, 2]}
          value={editor.commitment}
          onChange={(value) =>
            onEditor((current) => ({
              ...current,
              commitment: value as 0 | 1 | 2,
            }))
          }
        />
      )}
      {editor.kind === "harvest" && (
        <label className="compact-field">
          Harvest target
          <select
            value={
              editor.harvestTargetId ||
              (harvestTargets.length === 1 ? harvestTargets[0]?.id : "")
            }
            onChange={(event) =>
              onEditor((current) => ({
                ...current,
                harvestTargetId: event.target.value,
              }))
            }
          >
            <option value="">Choose stocked site or salvage</option>
            {harvestTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {editor.kind === "navigate" &&
        projection.faction === "roaming_atoll" &&
        towTargets.length > 0 && (
          <label className="compact-field">
            Roaming Atoll tow
            <select
              value={editor.towPlatformId}
              onChange={(event) =>
                onEditor((current) => ({
                  ...current,
                  towPlatformId: event.target.value,
                }))
              }
            >
              <option value="">Do not tow</option>
              {towTargets.map((platform) => (
                <option key={platform.platformId} value={platform.platformId}>
                  {platform.module} · {platform.platformId}
                </option>
              ))}
            </select>
          </label>
        )}
      {editor.kind === "develop" && (
        <>
          <FieldButtons
            label="Project"
            values={developKinds}
            value={editor.developKind}
            format={(value) => String(value).replaceAll("_", " ")}
            onChange={(value) =>
              onEditor((current) => ({
                ...current,
                developKind: value as OperationEditor["developKind"],
              }))
            }
          />
          {editor.developKind === "platform" && (
            <FieldButtons
              label="Module"
              values={["extractor", "sonar", "laboratory"]}
              value={editor.module}
              onChange={(value) =>
                onEditor((current) => ({
                  ...current,
                  module: value as OperationEditor["module"],
                }))
              }
            />
          )}
          {editor.developKind === "repair_submarine" && (
            <label className="compact-field">
              Repair target
              <select
                value={editor.repairSubmarineId}
                onChange={(event) =>
                  onEditor((current) => ({
                    ...current,
                    repairSubmarineId: event.target.value,
                  }))
                }
              >
                <option value="">Choose submarine</option>
                {repairTargets.map((candidate) => (
                  <option key={candidate.assetId} value={candidate.assetId}>
                    {candidate.assetId} · integrity {candidate.integrity}/2 ·{" "}
                    {candidate.state}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
      {editor.kind === "deploy" && (
        <>
          <FieldButtons
            label="Device"
            values={deployKinds}
            value={editor.device}
            format={(value) =>
              projection.deviceInventory[value] > 0
                ? `${value} · ${projection.deviceInventory[value]}`
                : `${value} · fabricate 1+1`
            }
            onChange={(value) =>
              onEditor((current) => ({ ...current, device: value }))
            }
          />
          {editor.device === "snare" && (
            <FieldButtons
              label="Trigger"
              values={["tag", "spill"]}
              value={editor.snareMode}
              onChange={(value) =>
                onEditor((current) => ({
                  ...current,
                  snareMode: value as "tag" | "spill",
                }))
              }
            />
          )}
          {editor.device === "decoy" && (
            <label className="compact-field">
              First echo route
              <select
                value={editor.decoyRouteSectorId ?? ""}
                onChange={(event) =>
                  onEditor((current) => ({
                    ...current,
                    decoyRouteSectorId: event.target.value
                      ? Number(event.target.value)
                      : null,
                  }))
                }
              >
                <option value="">Hold in this sector</option>
                {decoyRouteOptions.map((sectorId) => (
                  <option key={sectorId} value={sectorId}>
                    {sectorName(projection, sectorId)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
      {(editor.kind === "raid" || editor.kind === "jam") && (
        <label className="compact-field">
          Target platform
          <select
            value={editor.targetPlatformId}
            onChange={(event) =>
              onEditor((current) => ({
                ...current,
                targetPlatformId: event.target.value,
              }))
            }
          >
            <option value="">Choose rival platform</option>
            {rivalPlatforms.map((platform) => (
              <option key={platform.platformId} value={platform.platformId}>
                {platform.module} · {platform.platformId}
              </option>
            ))}
          </select>
        </label>
      )}
      {editor.kind === "hunt" && (
        <>
          <label className="compact-field">
            Named contact
            <select
              value={editor.targetEvidenceId}
              onChange={(event) =>
                onEditor((current) => ({
                  ...current,
                  targetEvidenceId: event.target.value,
                  targetSeatId: event.target.value ? "" : current.targetSeatId,
                }))
              }
            >
              <option value="">No contact selected</option>
              {observations.map((observation) => (
                <option
                  key={observation.contactId}
                  value={observation.contactId}
                >
                  PRIVATE · {observation.contactClass} ·{" "}
                  {observation.confidence}%
                </option>
              ))}
              {reports.map((contact) => (
                <option key={contact.contactId} value={contact.contactId}>
                  PUBLIC · {contact.class} · {contact.confidence}
                </option>
              ))}
            </select>
          </label>
          <label className="compact-field">
            Or suspected expedition
            <select
              value={editor.targetSeatId}
              onChange={(event) =>
                onEditor((current) => ({
                  ...current,
                  targetSeatId: event.target.value,
                  targetEvidenceId: event.target.value
                    ? ""
                    : current.targetEvidenceId,
                }))
              }
            >
              <option value="">No expedition selected</option>
              {rivalSeats.map((seat) => (
                <option key={seat.seatId} value={seat.seatId}>
                  {seat.displayName}
                  {seat.controller === "bot" ? " · AI" : ""}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {editor.kind === "analyze" && (
        <>
          <label className="compact-field">
            Carried specimen
            <select
              value={editor.specimenId}
              onChange={(event) =>
                onEditor((current) => ({
                  ...current,
                  specimenId: event.target.value,
                }))
              }
            >
              <option value="">Choose cargo</option>
              {submarine?.cargo.map((cargo) => (
                <option key={cargo.specimenId} value={cargo.specimenId}>
                  {cargo.type.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          {submarine && submarine.cargo.length > 0 && (
            <div className="specimen-choices">
              {submarine.cargo.map((cargo) => (
                <button
                  key={cargo.specimenId}
                  className={
                    editor.specimenId === cargo.specimenId ? "is-selected" : ""
                  }
                  onClick={() =>
                    onEditor((current) => ({
                      ...current,
                      specimenId: cargo.specimenId,
                    }))
                  }
                >
                  <img src={specimenSprite(cargo.type)} alt="" />
                  <span>{cargo.type.replaceAll("_", " ")}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <div>
        <b>{label}</b>
        <small>{detail}</small>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <i />
      </span>
    </label>
  );
}

function FieldButtons<T extends string | number>({
  label,
  values,
  value,
  format = String,
  onChange,
}: {
  label: string;
  values: readonly T[];
  value: T;
  format?: (value: T) => string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="field-buttons">
      <span>{label}</span>
      <div>
        {values.map((item) => (
          <button
            key={item}
            className={item === value ? "is-selected" : ""}
            onClick={() => onChange(item)}
          >
            {format(item)}
          </button>
        ))}
      </div>
    </div>
  );
}

function IntelWorkspace({
  projection,
  sendIntent,
  showToast,
}: {
  projection: PlayerProjection;
  sendIntent: (intent: {
    type: string;
    expected: unknown;
    payload: unknown;
  }) => Promise<CommandResult>;
  showToast: (kind: "ok" | "error", message: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(
    projection.reports[0]?.reportId ?? "",
  );
  const [recipients, setRecipients] = useState<string[]>([]);
  const [redacted, setRedacted] = useState<ReportField[]>([]);
  const [statementOpen, setStatementOpen] = useState(false);
  const [statement, setStatement] = useState({
    sectorId: "",
    contactClass: "unknown",
    direction: "unknown",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [sealedObservations, setSealedObservations] = useState<string[]>([]);
  const report =
    projection.reports.find((candidate) => candidate.reportId === selectedId) ??
    projection.reports[0];
  const peers = projection.public.expeditions.filter(
    (expedition) => expedition.seatId !== projection.seatId,
  );
  const fields: ReportField[] = [
    "sectorId",
    "observedAtRound",
    "observedAtPulse",
    "contactCount",
    "contactClass",
    "direction",
    "identitySeatId",
    "specimenType",
    "confidence",
    "sensor",
  ];

  const act = async (
    intent: { type: string; expected: unknown; payload: unknown },
    success: string,
  ) => {
    setBusy(true);
    try {
      await sendIntent(intent);
      playFeedback("commit");
      showToast("ok", success);
    } catch (reason) {
      playFeedback("warning");
      showToast(
        "error",
        reason instanceof Error ? reason.message : "Intel action failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const forward = () => {
    if (!report || recipients.length === 0) return;
    void act(
      {
        type: "intel.forward",
        expected: { kind: "none" },
        payload: {
          reportId: report.reportId,
          recipients,
          redactedFields: redacted,
        },
      },
      "Verified report forwarded",
    );
  };
  const broadcast = () => {
    if (!report) return;
    void act(
      {
        type: "intel.broadcast",
        expected: { kind: "none" },
        payload: { reportId: report.reportId, redactedFields: redacted },
      },
      "Report broadcast to the basin",
    );
  };
  const sendStatement = () => {
    if (!statement.note.trim() || recipients.length === 0) return;
    void act(
      {
        type: "intel.statement",
        expected: { kind: "none" },
        payload: {
          recipients,
          statement: {
            sectorId: statement.sectorId ? Number(statement.sectorId) : null,
            contactCount: null,
            contactClass: statement.contactClass,
            identitySeatId: null,
            direction: statement.direction,
            note: statement.note.trim(),
          },
        },
      },
      "Unverified Statement sent",
    );
  };
  const sealObservation = async (contactId: string) => {
    setBusy(true);
    try {
      await sendIntent({
        type: "intel.seal",
        expected: { kind: "none" },
        payload: { contactId },
      });
      setSealedObservations((current) => [...current, contactId]);
      playFeedback("scan");
      showToast("ok", "Observation sealed as a verified report");
    } catch (reason) {
      playFeedback("warning");
      showToast(
        "error",
        reason instanceof Error
          ? friendlyCommandError(reason.message)
          : "Observation could not be sealed.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="intel-workspace">
      <aside className="intel-list panel">
        <header>
          <div>
            <p className="eyebrow">Private archive</p>
            <h2>Intel packets</h2>
          </div>
          <button
            className="button-secondary"
            onClick={() => setStatementOpen(!statementOpen)}
          >
            + Statement
          </button>
        </header>
        <div>
          {projection.reports.length ? (
            projection.reports
              .slice()
              .reverse()
              .map((item) => (
                <button
                  key={item.reportId}
                  className={
                    item.reportId === report?.reportId ? "is-selected" : ""
                  }
                  onClick={() => {
                    setSelectedId(item.reportId);
                    setStatementOpen(false);
                    playFeedback("select");
                  }}
                >
                  <span className={item.verified ? "is-verified" : ""}>
                    {item.verified ? "SEALED" : "STATEMENT"}
                  </span>
                  <b>
                    {item.sectorId
                      ? sectorName(projection, item.sectorId)
                      : "Redacted sector"}
                  </b>
                  <small>
                    R{item.observedAtRound}/
                    {item.observedAtPulse
                      ? `P${item.observedAtPulse}`
                      : "Forecast"}{" "}
                    · {item.contactClass ?? "redacted"}
                  </small>
                </button>
              ))
          ) : (
            <EmptyState
              title="No packets yet"
              detail="Survey, trade, or receive a report to grow your archive."
            />
          )}
        </div>
      </aside>
      <section className="intel-detail panel">
        {statementOpen ? (
          <StatementComposer
            projection={projection}
            peers={peers}
            recipients={recipients}
            onRecipients={setRecipients}
            value={statement}
            onValue={setStatement}
            busy={busy}
            onSend={sendStatement}
          />
        ) : report ? (
          <>
            <header>
              <div>
                <p className="eyebrow">
                  {report.verified
                    ? "Verified instrument record"
                    : "Unverified Statement"}
                </p>
                <h1>
                  {report.sectorId
                    ? sectorName(projection, report.sectorId)
                    : "Sector redacted"}
                </h1>
              </div>
              <span
                className={`intel-seal ${report.verified ? "is-verified" : ""}`}
              >
                {report.verified ? "✓ SEALED" : "! CLAIM"}
              </span>
            </header>
            {report.specimenType && (
              <div className="intel-specimen">
                <img src={specimenSprite(report.specimenType)} alt="" />
                <div>
                  <small>Authorized specimen signature</small>
                  <b>{report.specimenType.replaceAll("_", " ")}</b>
                </div>
              </div>
            )}
            <div className="intel-grid">
              <DataCell
                label="Observed"
                value={`R${report.observedAtRound}${report.observedAtPulse ? `/P${report.observedAtPulse}` : ""}`}
              />
              <DataCell
                label="Contact"
                value={report.contactClass ?? "Redacted"}
              />
              <DataCell
                label="Heading"
                value={report.direction ?? "Redacted"}
              />
              <DataCell
                label="Confidence"
                value={report.confidence ?? "Redacted"}
              />
              <DataCell label="Sensor" value={report.sensor ?? "Redacted"} />
              <DataCell
                label="Provenance"
                value={`${report.custody.length} custodian${report.custody.length === 1 ? "" : "s"}`}
              />
            </div>
            <div className="intel-actions">
              <div className="recipient-row">
                <span>Recipients</span>
                {peers.map((peer) => (
                  <button
                    key={peer.seatId}
                    data-seat={peer.color}
                    className={
                      recipients.includes(peer.seatId) ? "is-selected" : ""
                    }
                    onClick={() =>
                      setRecipients(toggleItem(recipients, peer.seatId))
                    }
                  >
                    {peer.displayName}
                    {peer.controller === "bot" ? " · AI" : ""}
                  </button>
                ))}
              </div>
              <div className="redaction-row">
                <span>Redact before forwarding</span>
                {fields.map((field) => (
                  <label key={field}>
                    <input
                      type="checkbox"
                      checked={redacted.includes(field)}
                      onChange={() => setRedacted(toggleItem(redacted, field))}
                    />
                    {field.replaceAll("Id", "").replaceAll("At", " ")}
                  </label>
                ))}
              </div>
              <footer>
                <button
                  className="button-ghost"
                  disabled={busy || recipients.length === 0}
                  onClick={forward}
                >
                  Forward sealed copy
                </button>
                <button
                  className="button-primary"
                  disabled={busy}
                  onClick={broadcast}
                >
                  Broadcast publicly
                </button>
              </footer>
            </div>
          </>
        ) : (
          <EmptyState
            title="Select a packet"
            detail="Its provenance and share controls will appear here."
          />
        )}
      </section>
      <aside className="evidence-strip panel">
        <p className="eyebrow">Unsealed observations</p>
        {projection.observations.length ? (
          projection.observations
            .slice()
            .reverse()
            .map((observation) => {
              const sealedReportId =
                observation.sealedReportId ??
                (sealedObservations.includes(observation.contactId)
                  ? "pending-projection"
                  : null);
              return (
                <article
                  key={observation.contactId}
                  className="private-observation"
                >
                  <span>
                    PRIVATE · {observation.sensor.replaceAll("-", " ")}
                  </span>
                  <b>{sectorName(projection, observation.sectorId)}</b>
                  <small>
                    {observation.contactClass} · {observation.confidence}% · R
                    {observation.observedAtRound}/P{observation.observedAtPulse}
                  </small>
                  {observation.specimenType && (
                    <div className="observation-specimen">
                      <img
                        src={specimenSprite(observation.specimenType)}
                        alt=""
                      />
                      {observation.specimenType.replaceAll("_", " ")}
                    </div>
                  )}
                  {sealedReportId ? (
                    <small className="observation-sealed">
                      ✓ Already sealed
                      {observation.sealedReportId
                        ? ` · ${observation.sealedReportId}`
                        : ""}
                    </small>
                  ) : (
                    <button
                      className="button-secondary"
                      disabled={busy}
                      onClick={() =>
                        void sealObservation(observation.contactId)
                      }
                    >
                      Seal report
                    </button>
                  )}
                </article>
              );
            })
        ) : (
          <small>No private sensor history yet.</small>
        )}
        <p className="eyebrow evidence-strip__public">Public evidence</p>
        {projection.public.contacts.length ? (
          projection.public.contacts.slice(-8).map((contact) => (
            <article key={contact.contactId}>
              <span>
                {contact.identifiedSeatId
                  ? "IDENTIFIED"
                  : contact.class.toUpperCase()}
              </span>
              <b>{sectorName(projection, contact.sectorId)}</b>
              <small>
                {contact.confidence} · R{contact.observedRound}
                {contact.observedPulse ? `/P${contact.observedPulse}` : ""}
              </small>
            </article>
          ))
        ) : (
          <small>The basin is quiet.</small>
        )}
        {projection.public.broadcastReports.length > 0 && (
          <>
            <p className="eyebrow evidence-strip__public">Broadcast archive</p>
            {projection.public.broadcastReports
              .slice(-5)
              .reverse()
              .map((broadcast) => (
                <article key={broadcast.reportId}>
                  <span>
                    {broadcast.verified
                      ? "VERIFIED BROADCAST"
                      : "PUBLIC STATEMENT"}
                  </span>
                  <b>
                    {broadcast.sectorId
                      ? sectorName(projection, broadcast.sectorId)
                      : "Redacted sector"}
                  </b>
                  <small>
                    {broadcast.statement ??
                      `${broadcast.contactClass ?? "redacted"} · ${broadcast.direction ?? "heading redacted"}`}
                  </small>
                </article>
              ))}
          </>
        )}
      </aside>
    </section>
  );
}

function StatementComposer({
  projection,
  peers,
  recipients,
  onRecipients,
  value,
  onValue,
  busy,
  onSend,
}: {
  projection: PlayerProjection;
  peers: PlayerProjection["public"]["expeditions"];
  recipients: string[];
  onRecipients: (recipients: string[]) => void;
  value: {
    sectorId: string;
    contactClass: string;
    direction: string;
    note: string;
  };
  onValue: (value: {
    sectorId: string;
    contactClass: string;
    direction: string;
    note: string;
  }) => void;
  busy: boolean;
  onSend: () => void;
}) {
  return (
    <div className="statement-composer">
      <header>
        <div>
          <p className="eyebrow">Authored by you · unverified</p>
          <h1>Compose a Statement</h1>
        </div>
        <span className="intel-seal">! CLAIM</span>
      </header>
      <p>
        Statements may be entirely false. The game preserves your authorship,
        time, and exact words—not their truth.
      </p>
      <div className="statement-fields">
        <label>
          Sector
          <select
            value={value.sectorId}
            onChange={(event) =>
              onValue({ ...value, sectorId: event.target.value })
            }
          >
            <option value="">No sector claimed</option>
            {projection.public.topology.sectors.map((sector) => (
              <option key={sector.sectorId} value={sector.sectorId}>
                {sector.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Contact class
          <select
            value={value.contactClass}
            onChange={(event) =>
              onValue({ ...value, contactClass: event.target.value })
            }
          >
            {["unknown", "vessel", "submarine", "decoy", "disturbance"].map(
              (kind) => (
                <option key={kind}>{kind}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Heading
          <select
            value={value.direction}
            onChange={(event) =>
              onValue({ ...value, direction: event.target.value })
            }
          >
            {[
              "unknown",
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw",
              "still",
            ].map((direction) => (
              <option key={direction}>{direction}</option>
            ))}
          </select>
        </label>
        <label className="statement-note">
          Your claim
          <textarea
            maxLength={280}
            value={value.note}
            onChange={(event) =>
              onValue({ ...value, note: event.target.value })
            }
            placeholder="I saw Chalk leave Blackwater Site 2…"
          />
        </label>
      </div>
      <div className="recipient-row">
        <span>Recipients</span>
        {peers.map((peer) => (
          <button
            key={peer.seatId}
            data-seat={peer.color}
            className={recipients.includes(peer.seatId) ? "is-selected" : ""}
            onClick={() => onRecipients(toggleItem(recipients, peer.seatId))}
          >
            {peer.displayName}
            {peer.controller === "bot" ? " · AI" : ""}
          </button>
        ))}
      </div>
      <button
        className="button-primary"
        disabled={busy || !value.note.trim() || recipients.length === 0}
        onClick={onSend}
      >
        Send unverified Statement
      </button>
    </div>
  );
}

function DealsWorkspace({
  projection,
  sendIntent,
  showToast,
}: {
  projection: PlayerProjection;
  sendIntent: (intent: {
    type: string;
    expected: unknown;
    payload: unknown;
  }) => Promise<CommandResult>;
  showToast: (kind: "ok" | "error", message: string) => void;
}) {
  const peers = projection.public.expeditions.filter(
    (expedition) =>
      expedition.seatId !== projection.seatId &&
      expedition.controller === "human",
  );
  const botPeerCount = projection.public.expeditions.filter(
    (expedition) =>
      expedition.seatId !== projection.seatId &&
      expedition.controller === "bot",
  ).length;
  const [composer, setComposer] = useState(false);
  const [recipient, setRecipient] = useState(peers[0]?.seatId ?? "");
  const [mode, setMode] = useState<"trade" | "handshake">("trade");
  const [giveResources, setGiveResources] = useState({
    supply: Math.min(1, projection.resources.supply),
    signal: 0,
  });
  const [receiveResources, setReceiveResources] = useState({
    supply: 0,
    signal: 1,
  });
  const [giveReportIds, setGiveReportIds] = useState<string[]>([]);
  const [giveSpecimenIds, setGiveSpecimenIds] = useState<string[]>([]);
  const [requestReportInput, setRequestReportInput] = useState("");
  const [requestSpecimenInput, setRequestSpecimenInput] = useState("");
  const [requestedDestinations, setRequestedDestinations] = useState<
    Record<string, string>
  >({});
  const [termKind, setTermKind] = useState<
    "immediate" | "ceasefire" | "safe-passage" | "conditional-payment"
  >("immediate");
  const [sectorId, setSectorId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const ownSubmarines = projection.submarines.filter(
    (submarine) => submarine.state === "active" && submarine.cargo.length < 2,
  );
  const sealedReports = projection.reports.filter((report) => report.verified);
  const ownedCargo = projection.submarines.flatMap((submarine) =>
    submarine.cargo.map((cargo) => ({
      ...cargo,
      submarineId: submarine.assetId,
      sectorId: submarine.sectorId,
    })),
  );
  const requestedReportIds = parseDealIds(requestReportInput);
  const requestedSpecimenIds = parseDealIds(requestSpecimenInput);
  const proposerSpecimenDestinations = requestedSpecimenIds.map(
    (specimenId) => ({
      specimenId,
      toSubmarineId:
        requestedDestinations[specimenId] ?? ownSubmarines[0]?.assetId ?? "",
    }),
  );
  const hasTradeValue =
    giveResources.supply +
      giveResources.signal +
      receiveResources.supply +
      receiveResources.signal +
      giveReportIds.length +
      giveSpecimenIds.length +
      requestedReportIds.length +
      requestedSpecimenIds.length >
    0;
  const requestIdsInvalid = [
    ...requestedReportIds,
    ...requestedSpecimenIds,
  ].some((id) => !/^[A-Za-z0-9_-]{3,64}$/.test(id));
  const destinationIssue = specimenDestinationIssue(
    requestedSpecimenIds,
    proposerSpecimenDestinations,
    ownSubmarines,
  );
  const composerIssue =
    mode === "trade"
      ? requestedReportIds.length > 12
        ? "A trade can request at most 12 reports."
        : requestedSpecimenIds.length > 2
          ? "A trade can request at most two specimens."
          : requestIdsInvalid
            ? "Agreed IDs use only letters, numbers, dashes, and underscores."
            : giveResources.supply > projection.resources.supply ||
                giveResources.signal > projection.resources.signal
              ? "You cannot offer more resources than you hold."
              : (destinationIssue ??
                (!hasTradeValue
                  ? "Add at least one resource, report, or specimen."
                  : null))
      : null;

  const act = async (
    intent: { type: string; expected: unknown; payload: unknown },
    message: string,
    cue: "commit" | "unlock" = "commit",
  ) => {
    setBusy(true);
    try {
      await sendIntent(intent);
      playFeedback(cue);
      showToast("ok", message);
      setComposer(false);
    } catch (reason) {
      playFeedback("warning");
      showToast(
        "error",
        reason instanceof Error ? reason.message : "Deal action failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const create = () => {
    if (!recipient) return;
    if (composerIssue) {
      showToast("error", composerIssue);
      return;
    }
    const emptyBundle = {
      supply: 0,
      signal: 0,
      reportIds: [],
      specimenIds: [],
    };
    const give =
      mode === "handshake"
        ? emptyBundle
        : {
            ...giveResources,
            reportIds: giveReportIds,
            specimenIds: giveSpecimenIds,
          };
    const receive =
      mode === "handshake"
        ? emptyBundle
        : {
            ...receiveResources,
            reportIds: requestedReportIds,
            specimenIds: requestedSpecimenIds,
          };
    const resolvedTerm =
      mode === "trade"
        ? "immediate"
        : termKind === "safe-passage"
          ? "safe-passage"
          : "ceasefire";
    void act(
      {
        type: "deal.create",
        expected: { kind: "none" },
        payload: {
          recipientSeatId: recipient,
          mode,
          give,
          receive,
          term: {
            kind: resolvedTerm,
            sectorIds: sectorId ? [Number(sectorId)] : [],
            note: note.trim() || null,
          },
          expiresAtPhaseId: projection.public.phase.phaseId,
          proposerSpecimenDestinations:
            mode === "trade" ? proposerSpecimenDestinations : [],
        },
      },
      `${mode === "handshake" ? "Breakable Handshake" : "Binding trade"} offered`,
    );
  };

  const accept = (deal: PlayerProjection["deals"][number]) => {
    const receivedSpecimens =
      deal.proposerSeatId === projection.seatId
        ? deal.receive.specimenIds
        : deal.give.specimenIds;
    const specimenDestinations = receivedSpecimens
      .map((specimenId) => ({
        specimenId,
        toSubmarineId:
          destinations[specimenId] ?? ownSubmarines[0]?.assetId ?? "",
      }))
      .filter((mapping) => mapping.toSubmarineId);
    const issue = specimenDestinationIssue(
      receivedSpecimens,
      specimenDestinations,
      ownSubmarines,
    );
    if (issue) {
      showToast("error", issue);
      return;
    }
    void act(
      {
        type: "deal.accept",
        expected: {
          kind: "offer",
          offerId: deal.offerId,
          revision: deal.revision,
        },
        payload: { specimenDestinations },
      },
      "Offer accepted · exchange resolved",
    );
  };
  const withdraw = (deal: PlayerProjection["deals"][number]) =>
    void act(
      {
        type: "deal.withdraw",
        expected: {
          kind: "offer",
          offerId: deal.offerId,
          revision: deal.revision,
        },
        payload: {},
      },
      "Offer withdrawn",
      "unlock",
    );

  return (
    <section className="deals-workspace">
      <aside className="deal-ledger panel">
        <header>
          <div>
            <p className="eyebrow">Negotiation ledger</p>
            <h2>Deals</h2>
          </div>
          <button
            className="button-primary"
            disabled={peers.length === 0}
            title={
              peers.length === 0
                ? "AI rivals do not negotiate in this version"
                : undefined
            }
            onClick={() => setComposer(true)}
          >
            + Offer
          </button>
        </header>
        <div>
          {projection.deals.length ? (
            projection.deals
              .slice()
              .reverse()
              .map((deal) => (
                <DealCard
                  key={deal.offerId}
                  deal={deal}
                  projection={projection}
                  ownSubmarines={ownSubmarines}
                  destinations={destinations}
                  onDestination={(specimenId, submarineId) =>
                    setDestinations((current) => ({
                      ...current,
                      [specimenId]: submarineId,
                    }))
                  }
                  busy={busy}
                  onAccept={() => accept(deal)}
                  onWithdraw={() => withdraw(deal)}
                />
              ))
          ) : (
            <EmptyState
              title="No recorded deals"
              detail={
                peers.length === 0 && botPeerCount > 0
                  ? "AI rivals execute strategy but do not negotiate. Add another human to test binding trades and breakable handshakes."
                  : "Talk first. Record the conclusion only when it matters."
              }
            />
          )}
        </div>
      </aside>
      <section className="deal-guide panel">
        {composer ? (
          <div className="deal-composer">
            <header>
              <div>
                <p className="eyebrow">New structured offer</p>
                <h1>
                  {mode === "handshake" ? "Breakable promise" : "Atomic trade"}
                </h1>
              </div>
              <button
                className="icon-button"
                onClick={() => setComposer(false)}
              >
                ×
              </button>
            </header>
            <div className="mode-picker mode-picker--two">
              {(["trade", "handshake"] as const).map((item) => (
                <button
                  key={item}
                  className={mode === item ? "is-selected" : ""}
                  onClick={() => {
                    setMode(item);
                    playFeedback("select");
                  }}
                >
                  {item}
                  <small>
                    {item === "handshake" ? "Breakable" : "Binding"}
                  </small>
                </button>
              ))}
            </div>
            <p
              className={`deal-mode-note ${mode === "handshake" ? "is-breakable" : ""}`}
            >
              {mode === "handshake"
                ? "No payment is attached. The server records the promise but does not prevent betrayal; a detected breach becomes public."
                : "Both bundles exchange atomically. Nothing moves unless both sides confirm."}
            </p>
            <div className="deal-party">
              <label>
                Offer to
                <select
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                >
                  {peers.map((peer) => (
                    <option key={peer.seatId} value={peer.seatId}>
                      {peer.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {mode === "trade" && (
              <>
                <div className="exchange-builder">
                  <TransferEditor
                    label="You give"
                    value={giveResources}
                    maxSupply={projection.resources.supply}
                    maxSignal={projection.resources.signal}
                    onChange={setGiveResources}
                  />
                  <span>⇄</span>
                  <TransferEditor
                    label="You receive"
                    value={receiveResources}
                    maxSupply={9}
                    maxSignal={9}
                    onChange={setReceiveResources}
                  />
                </div>
                <div className="deal-assets">
                  <section>
                    <header>
                      <div>
                        <b>Your sealed intel</b>
                        <small>
                          Select reports to give. Specimen signatures retain
                          their verified provenance.
                        </small>
                      </div>
                      <span>{giveReportIds.length}/12</span>
                    </header>
                    <div className="deal-asset-list">
                      {sealedReports.length ? (
                        sealedReports.map((report) => (
                          <button
                            key={report.reportId}
                            className={
                              giveReportIds.includes(report.reportId)
                                ? "is-selected"
                                : ""
                            }
                            aria-pressed={giveReportIds.includes(
                              report.reportId,
                            )}
                            onClick={() =>
                              setGiveReportIds((current) =>
                                toggleLimited(current, report.reportId, 12),
                              )
                            }
                          >
                            {report.specimenType ? (
                              <img
                                src={specimenSprite(report.specimenType)}
                                alt=""
                              />
                            ) : (
                              <i>◉</i>
                            )}
                            <span>
                              <b>
                                {report.specimenType?.replaceAll("_", " ") ??
                                  report.contactClass ??
                                  "Sealed contact"}
                              </b>
                              <small>
                                {report.reportId} ·{" "}
                                {report.sectorId
                                  ? sectorName(projection, report.sectorId)
                                  : "redacted sector"}
                              </small>
                            </span>
                          </button>
                        ))
                      ) : (
                        <small>No sealed reports in your custody.</small>
                      )}
                    </div>
                  </section>
                  <section>
                    <header>
                      <div>
                        <b>Your physical cargo</b>
                        <small>
                          Both submarines must be co-located when the recipient
                          accepts.
                        </small>
                      </div>
                      <span>{giveSpecimenIds.length}/2</span>
                    </header>
                    <div className="deal-asset-list">
                      {ownedCargo.length ? (
                        ownedCargo.map((cargo) => (
                          <button
                            key={cargo.specimenId}
                            className={
                              giveSpecimenIds.includes(cargo.specimenId)
                                ? "is-selected"
                                : ""
                            }
                            aria-pressed={giveSpecimenIds.includes(
                              cargo.specimenId,
                            )}
                            onClick={() =>
                              setGiveSpecimenIds((current) =>
                                toggleLimited(current, cargo.specimenId, 2),
                              )
                            }
                          >
                            <img src={specimenSprite(cargo.type)} alt="" />
                            <span>
                              <b>{cargo.type.replaceAll("_", " ")}</b>
                              <small>
                                {cargo.specimenId} · {cargo.submarineId} @{" "}
                                {sectorName(projection, cargo.sectorId)}
                              </small>
                            </span>
                          </button>
                        ))
                      ) : (
                        <small>Your submarines carry no specimens.</small>
                      )}
                    </div>
                  </section>
                </div>
                <div className="deal-requested-assets">
                  <header>
                    <div>
                      <b>Request private assets by agreed ID</b>
                      <small>
                        The other player reads these exact IDs from their Intel
                        or cargo list. IDs do not reveal hidden data publicly.
                      </small>
                    </div>
                  </header>
                  <div>
                    <label>
                      Sealed report IDs
                      <input
                        value={requestReportInput}
                        onChange={(event) =>
                          setRequestReportInput(event.target.value)
                        }
                        placeholder="report-7, report-12"
                      />
                    </label>
                    <label>
                      Specimen IDs
                      <input
                        value={requestSpecimenInput}
                        onChange={(event) =>
                          setRequestSpecimenInput(event.target.value)
                        }
                        placeholder="specimen-4 (max 2)"
                      />
                    </label>
                  </div>
                  {requestedSpecimenIds.map((specimenId) => (
                    <label className="specimen-destination" key={specimenId}>
                      Receive {specimenId}
                      <select
                        value={
                          requestedDestinations[specimenId] ??
                          ownSubmarines[0]?.assetId ??
                          ""
                        }
                        onChange={(event) =>
                          setRequestedDestinations((current) => ({
                            ...current,
                            [specimenId]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Choose submarine</option>
                        {ownSubmarines.map((submarine) => (
                          <option
                            key={submarine.assetId}
                            value={submarine.assetId}
                          >
                            {submarine.assetId} · cargo {submarine.cargo.length}
                            /2 · {sectorName(projection, submarine.sectorId)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <small className="physical-trade-note">
                    Physical cargo still requires co-location at acceptance. The
                    server rejects an impossible exchange without moving
                    anything.
                  </small>
                </div>
              </>
            )}
            {mode === "handshake" && (
              <div className="term-builder">
                <label>
                  Term
                  <select
                    value={
                      termKind === "safe-passage" ? "safe-passage" : "ceasefire"
                    }
                    onChange={(event) =>
                      setTermKind(event.target.value as typeof termKind)
                    }
                  >
                    <option value="ceasefire">Ceasefire</option>
                    <option value="safe-passage">Safe passage</option>
                  </select>
                </label>
                <label>
                  Named sector
                  <select
                    value={sectorId}
                    onChange={(event) => setSectorId(event.target.value)}
                  >
                    <option value="">All / no sector</option>
                    {projection.public.topology.sectors.map((sector) => (
                      <option key={sector.sectorId} value={sector.sectorId}>
                        {sector.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Plain-language note
                  <input
                    maxLength={280}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="No Hunt or Raid at Site 2"
                  />
                </label>
              </div>
            )}
            {composerIssue && (
              <p className="deal-validation" role="alert">
                {composerIssue}
              </p>
            )}
            <button
              className="button-primary"
              disabled={busy || !recipient || Boolean(composerIssue)}
              onClick={create}
            >
              Send{" "}
              {mode === "handshake" ? "breakable Handshake" : "binding trade"}
            </button>
          </div>
        ) : (
          <div className="deal-principles">
            <p className="eyebrow">Conversation first</p>
            <h1>Choose the right degree of trust.</h1>
            <div className="deal-principles__two">
              <article>
                <span>01</span>
                <b>Trade</b>
                <p>
                  Immediate and binding. Resources, reports, and eligible cargo
                  swap atomically.
                </p>
              </article>
              <article>
                <span>02</span>
                <b>Handshake</b>
                <p>
                  Promise-only and breakable. Betrayal is legal; objective
                  breach leaves a public receipt.
                </p>
              </article>
            </div>
            <small>Anything can still remain a purely verbal promise.</small>
          </div>
        )}
      </section>
    </section>
  );
}

function DealCard({
  deal,
  projection,
  ownSubmarines,
  destinations,
  onDestination,
  busy,
  onAccept,
  onWithdraw,
}: {
  deal: PlayerProjection["deals"][number];
  projection: PlayerProjection;
  ownSubmarines: PlayerProjection["submarines"];
  destinations: Record<string, string>;
  onDestination: (specimenId: string, submarineId: string) => void;
  busy: boolean;
  onAccept: () => void;
  onWithdraw: () => void;
}) {
  const outgoing = deal.proposerSeatId === projection.seatId;
  const otherId = outgoing ? deal.recipientSeatId : deal.proposerSeatId;
  const other = projection.public.expeditions.find(
    (expedition) => expedition.seatId === otherId,
  );
  const incomingSpecimens = outgoing
    ? deal.receive.specimenIds
    : deal.give.specimenIds;
  return (
    <article
      className={`deal-card ${deal.mode === "handshake" ? "is-breakable" : "is-binding"}`}
    >
      <header>
        <span>
          {deal.mode === "handshake"
            ? "OPEN HANDSHAKE"
            : deal.mode === "trade"
              ? "SEALED TRADE"
              : "CONDITIONAL PAYMENT"}
        </span>
        <b>{deal.status}</b>
      </header>
      <h3>
        {outgoing ? "To" : "From"} {other?.displayName ?? otherId}
      </h3>
      {deal.mode !== "handshake" && (
        <div className="deal-card__exchange">
          <span>
            {outgoing ? "Give" : "Receive"}
            <b>{bundleLabel(deal.give)}</b>
          </span>
          <i>⇄</i>
          <span>
            {outgoing ? "Receive" : "Give"}
            <b>{bundleLabel(deal.receive)}</b>
          </span>
        </div>
      )}
      {deal.term.kind !== "immediate" && (
        <p>
          {deal.term.kind.replaceAll("-", " ")}
          {deal.term.sectorIds.length
            ? ` · ${deal.term.sectorIds.map((id) => sectorName(projection, id)).join(", ")}`
            : ""}
          {deal.term.note ? ` · ${deal.term.note}` : ""}
        </p>
      )}
      {!outgoing &&
        deal.status === "pending" &&
        incomingSpecimens.map((specimenId) => (
          <label className="specimen-destination" key={specimenId}>
            Incoming specimen
            <select
              value={
                destinations[specimenId] ?? ownSubmarines[0]?.assetId ?? ""
              }
              onChange={(event) =>
                onDestination(specimenId, event.target.value)
              }
            >
              <option value="">Choose submarine</option>
              {ownSubmarines.map((submarine) => (
                <option key={submarine.assetId} value={submarine.assetId}>
                  {submarine.assetId} · cargo {submarine.cargo.length}/2
                </option>
              ))}
            </select>
          </label>
        ))}
      <footer>
        {deal.status === "pending" &&
          (outgoing ? (
            <button
              className="button-ghost"
              disabled={busy}
              onClick={onWithdraw}
            >
              Withdraw
            </button>
          ) : (
            <button
              className="button-primary"
              disabled={busy}
              onClick={onAccept}
            >
              Accept {deal.mode === "handshake" ? "Handshake" : "binding offer"}
            </button>
          ))}
      </footer>
    </article>
  );
}

function TransferEditor({
  label,
  value,
  maxSupply,
  maxSignal,
  onChange,
}: {
  label: string;
  value: { supply: number; signal: number };
  maxSupply: number;
  maxSignal: number;
  onChange: (value: { supply: number; signal: number }) => void;
}) {
  return (
    <div className="transfer-editor">
      <span>{label}</span>
      {(["supply", "signal"] as const).map((resource) => {
        const max = resource === "supply" ? maxSupply : maxSignal;
        return (
          <label key={resource}>
            <small>{resource}</small>
            <button
              onClick={() =>
                onChange({
                  ...value,
                  [resource]: Math.max(0, value[resource] - 1),
                })
              }
            >
              −
            </button>
            <b>{value[resource]}</b>
            <button
              onClick={() =>
                onChange({
                  ...value,
                  [resource]: Math.min(max, value[resource] + 1),
                })
              }
            >
              +
            </button>
          </label>
        );
      })}
    </div>
  );
}

function ResolutionWorkspace({ projection }: { projection: PlayerProjection }) {
  const basin = basinForPlayer(projection);
  const results = projection.resultCards.slice().reverse();
  return (
    <section className="resolution-workspace">
      <div className="resolution-map panel">
        <InspectableBasinMap
          basin={basin}
          privateView
          interactiveCamera
          focusSectorId={
            results[0]?.reportId
              ? null
              : (projection.submarines[0]?.sectorId ?? null)
          }
        />
        <div className="resolution-map__phase">
          <span>P{projection.public.phase.pulse ?? "—"}</span>
          <div>
            <p className="eyebrow">
              {phaseNames[projection.public.phase.kind]}
            </p>
            <b>
              {projection.public.currentCaption ??
                "Watch the shared basin for public causality."}
            </b>
          </div>
        </div>
      </div>
      <aside className="private-results panel">
        <header>
          <div>
            <p className="eyebrow">Private results</p>
            <h2>Your field log</h2>
          </div>
          <span>{results.length}</span>
        </header>
        <div>
          {results.length ? (
            results.map((result) => (
              <article key={result.resultId}>
                <span>
                  R{result.round}/P{result.pulse}
                </span>
                <b>{result.title}</b>
                <p>{result.detail}</p>
                {result.reportId && <small>Sealed report added to Intel</small>}
              </article>
            ))
          ) : (
            <EmptyState
              title="No private result yet"
              detail="The TV presents public events. Private consequences appear here at their causal beat."
            />
          )}
        </div>
        <footer>
          <span>Rules resolve before presentation.</span>
          <small>If animation is skipped, this stable record remains.</small>
        </footer>
      </aside>
    </section>
  );
}

function EndgamePanel({ projection }: { projection: PlayerProjection }) {
  const outcome = projection.public.outcome;
  const winnerIds = new Set(
    outcome?.winnerSeatIds ??
      projection.public.expeditions
        .filter((expedition) => expedition.winner)
        .map((expedition) => expedition.seatId),
  );
  const winners = projection.public.expeditions.filter((expedition) =>
    winnerIds.has(expedition.seatId),
  );
  const ownWin = winners.some((winner) => winner.seatId === projection.seatId);
  const fallback = Boolean(outcome?.fallbackScores.length);
  return (
    <section className="endgame-panel">
      <div className="endgame-panel__bloom" />
      <p className="eyebrow">
        Field record sealed · Round {projection.public.phase.round}
      </p>
      <h1>{ownWin ? "You reached the deep." : "The basin has answered."}</h1>
      <p>
        {fallback
          ? `Round 7 ended without a completed Charter. ${winners.length > 1 ? "The highest fallback score is tied." : "The highest fallback score wins."}`
          : winners.length > 1
            ? "Several expeditions completed known Charters at the same simultaneous Claim Check."
            : "A known Charter was completed at the Claim Check."}
      </p>
      <div className="endgame-winners">
        {winners.map((winner) => {
          const reasons =
            outcome?.winningCharters.find(
              (entry) => entry.seatId === winner.seatId,
            )?.charters ?? [];
          return (
            <article key={winner.seatId} data-seat={winner.color}>
              <span>{winner.displayName.slice(0, 1)}</span>
              <div>
                <b>{winner.displayName}</b>
                <small>
                  {reasons.length
                    ? reasons
                        .map((charter) =>
                          charter === "fallback"
                            ? "Round-cap score"
                            : `${charter} Charter`,
                        )
                        .join(" · ")
                    : winner.factionName}
                </small>
              </div>
            </article>
          );
        })}
      </div>
      {fallback && outcome && (
        <div className="fallback-scoreboard">
          <span>Round-cap score</span>
          {outcome.fallbackScores
            .slice()
            .sort((a, b) => b.score - a.score)
            .map((entry) => {
              const expedition = projection.public.expeditions.find(
                (candidate) => candidate.seatId === entry.seatId,
              );
              return (
                <div
                  key={entry.seatId}
                  data-seat={expedition?.color ?? "chalk"}
                >
                  <b>{expedition?.displayName ?? entry.seatId}</b>
                  <strong>{entry.score}</strong>
                  {winnerIds.has(entry.seatId) && <small>WINNER</small>}
                </div>
              );
            })}
        </div>
      )}
      {projection.analyzedTypes.length > 0 && (
        <div className="endgame-specimens">
          {projection.analyzedTypes.map((type) => (
            <figure key={type}>
              <img src={specimenSprite(type)} alt="" />
              <figcaption>{type.replaceAll("_", " ")}</figcaption>
            </figure>
          ))}
        </div>
      )}
      <section>
        <h2>Your final private record</h2>
        <div>
          <span>
            Analyzed types <b>{projection.analyzedTypes.length}</b>
          </span>
          <span>
            Platforms{" "}
            <b>
              {
                projection.public.platforms.filter(
                  (platform) => platform.ownerSeatId === projection.seatId,
                ).length
              }
            </b>
          </span>
          <span>
            Reports held <b>{projection.reports.length}</b>
          </span>
          <span>
            Deals recorded <b>{projection.deals.length}</b>
          </span>
        </div>
      </section>
      <a className="button-primary" href="/play.html">
        Join a rematch
      </a>
    </section>
  );
}

function PrivacyVeil({
  projection,
  onReveal,
}: {
  projection: PlayerProjection;
  onReveal: () => void;
}) {
  const own = projection.public.expeditions.find(
    (expedition) => expedition.seatId === projection.seatId,
  );
  return (
    <button
      className="privacy-veil"
      onClick={onReveal}
      aria-label="Reveal private console"
    >
      <span className="privacy-veil__pattern" />
      <div>
        <span>◉</span>
        <p className="eyebrow">Private field console covered</p>
        <h1>{own?.displayName}</h1>
        <p>Tap once when the screen is facing you.</p>
        <small>Public geography remains on the TV.</small>
      </div>
    </button>
  );
}

function ReferenceSheet({
  mode,
  roomCode,
  settings,
  onSettings,
  onMode,
  onClose,
  onLeave,
}: {
  mode: "rules" | "settings";
  roomCode: string;
  settings: Settings;
  onSettings: (settings: Settings) => void;
  onMode: (mode: "rules" | "settings") => void;
  onClose: () => void;
  onLeave: () => void;
}) {
  const dialogRef = useDialogFocusTrap(onClose);
  return (
    <div
      ref={dialogRef}
      className="reference-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Blackwater rules and settings"
    >
      <button
        className="reference-sheet__scrim"
        tabIndex={-1}
        onClick={onClose}
        aria-label="Close"
      />
      <section className="reference-sheet__panel panel">
        <header>
          <div>
            <button
              className={mode === "rules" ? "is-active" : ""}
              aria-pressed={mode === "rules"}
              onClick={() => onMode("rules")}
            >
              Rules
            </button>
            <button
              className={mode === "settings" ? "is-active" : ""}
              aria-pressed={mode === "settings"}
              onClick={() => onMode("settings")}
            >
              Settings
            </button>
          </div>
          <button
            className="icon-button"
            data-dialog-initial
            aria-label="Close rules and settings"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {mode === "rules" ? (
          <div className="rules-reference">
            <p className="eyebrow">Known paths · private methods</p>
            <h1>Blackwater field rules</h1>
            <section>
              <h2>Round</h2>
              <ol>
                <li>
                  <b>Forecast</b> · platforms produce and sites replenish.
                </li>
                <li>
                  <b>Open Water</b> · talk and program exactly three Pulses.
                </li>
                <li>
                  <b>Resolution</b> · movement, detection, conflict, then
                  projects.
                </li>
                <li>
                  <b>Charter Check</b> · everyone who qualifies wins
                  simultaneously.
                </li>
              </ol>
            </section>
            <section>
              <h2>Progressive systems</h2>
              <p>
                <b>Round 1 · Explore and build.</b> Glide, Sprint, Survey,
                Navigate, Develop, and Hold are always available. Harvest and
                Analyze appear only when the selected submarine can actually use
                them.
              </p>
              <p>
                <b>Round 2 · Tactics online.</b> Open the Tactics drawer for
                Deploy, Go Dark, Hunt, and Screen. Raid and Jam appear only when
                you share a sector with a rival platform.
              </p>
              <p>
                Hold any order for a quick hint, or use the visible Explain
                button for its complete requirements and public consequences.
              </p>
            </section>
            <section>
              <h2>Victory Charters</h2>
              <p>
                <b>Network</b> · four connected active platforms across all
                depths.
              </p>
              <p>
                <b>Discovery</b> · three distinct analyzed types and an active
                Lab.
              </p>
              <p>
                <b>Dominion</b> · sealed Deep-Site control; qualifying assets
                reveal only on success.
              </p>
            </section>
            <section>
              <h2>Evidence</h2>
              <p>
                Glide wakes show origins. Sprint wakes show routes. Survey and
                Harvest expose activity. Sealed reports are reliable; Statements
                may be entirely false.
              </p>
            </section>
            <section>
              <h2>Stopping a leader</h2>
              <p>
                Every player always has three Operations. Public infrastructure
                makes a near-winner targetable. The TV labels them as a Leader
                Threat, and the Commission rewards the first effective
                intervention.
              </p>
            </section>
          </div>
        ) : (
          <div className="settings-panel">
            <p className="eyebrow">Instrument preferences</p>
            <h1>Field console settings</h1>
            <InstallConsole variant="settings" roomCode={roomCode} />
            <ToggleRow
              label="Sound & haptics"
              detail="Phones remain quiet by default during shared events"
              checked={settings.sound}
              onChange={(sound) => {
                onSettings({ ...settings, sound });
                if (sound) void primeAudio();
              }}
            />
            <ToggleRow
              label="Reduced motion"
              detail="Replace springs and travel with stable crossfades"
              checked={settings.reducedMotion}
              onChange={(reducedMotion) =>
                onSettings({ ...settings, reducedMotion })
              }
            />
            <ToggleRow
              label="High contrast"
              detail="Increase lines, labels, and tactical separation"
              checked={settings.highContrast}
              onChange={(highContrast) =>
                onSettings({ ...settings, highContrast })
              }
            />
            <button className="button-danger" onClick={onLeave}>
              Release this seat
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function DataCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <small>{label}</small>
      <b>{value.replaceAll("_", " ")}</b>
    </div>
  );
}
function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <span>∿</span>
      <b>{title}</b>
      <p>{detail}</p>
    </div>
  );
}
function basinForPlayer(projection: PlayerProjection) {
  const basin = playerProjectionToBasin(projection);
  return {
    ...basin,
    entities: [
      ...basin.entities,
      ...projection.public.salvage.map((salvage) => ({
        id: salvage.salvageId,
        kind: "salvage" as const,
        sectorId: salvage.sectorId,
        state: "active" as const,
        label: "Public salvage",
      })),
    ],
  };
}
function sectorName(projection: PlayerProjection, sectorId: number): string {
  return (
    projection.public.topology.sectors.find(
      (sector) => sector.sectorId === sectorId,
    )?.name ?? `Site ${sectorId}`
  );
}
function toggleItem<T>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}
function operationGlyph(kind: string): string {
  return (
    (
      {
        hold: "Ⅱ",
        glide: "→",
        sprint: "≫",
        navigate: "⌁",
        survey: "◉",
        harvest: "◇",
        analyze: "⌬",
        develop: "+",
        deploy: "⌄",
        hunt: "◎",
        raid: "◫",
        jam: "≋",
        go_dark: "◌",
        screen: "◖",
      } as Record<string, string>
    )[kind] ?? "·"
  );
}
function assetSprite(asset: AssetChoice): string {
  if (asset.kind === "ark") return "/sprites/ark-dir00.webp";
  if (asset.kind === "submarine") return "/sprites/submarine-dir00.webp";
  return `/sprites/${asset.module ?? "platform"}.webp`;
}
function specimenSprite(type: string): string {
  return `/sprites/specimen-${type.replaceAll("_", "-")}.webp`;
}
function formatCost(cost: {
  supply: number;
  signal: number;
  silence: number;
}): string {
  const parts = [
    cost.supply ? `${cost.supply} Supply` : "",
    cost.signal ? `${cost.signal} Signal` : "",
    cost.silence ? `${cost.silence} Silence` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No reserved resource";
}
function bundleLabel(bundle: {
  supply: number;
  signal: number;
  reportIds: string[];
  specimenIds: string[];
}): string {
  const parts = [
    bundle.supply ? `${bundle.supply} Supply` : "",
    bundle.signal ? `${bundle.signal} Signal` : "",
    bundle.reportIds.length ? `${bundle.reportIds.length} report` : "",
    bundle.specimenIds.length ? `${bundle.specimenIds.length} specimen` : "",
  ].filter(Boolean);
  return parts.join(" · ") || "Promise only";
}
function friendlyCommandError(code: string): string {
  const normalized = code.toUpperCase();
  if (normalized.includes("RATE_LIMITED"))
    return "The field channel is busy. Wait a moment before sending another offer or report.";
  if (normalized.includes("STALE_DRAFT"))
    return "Your plan changed on the server. It has been resynchronized; review and try again.";
  if (normalized.includes("STALE_OFFER"))
    return "That offer changed or expired before you confirmed it.";
  if (normalized.includes("INSUFFICIENT"))
    return "A current plan or offer already reserves those resources.";
  if (normalized.includes("PHASE_CLOSED"))
    return "Open Water has closed. Your last valid plan remains in force.";
  if (
    normalized.includes("WRITER_LEASE") ||
    normalized.includes("SESSION_REVOKED")
  )
    return "This phone no longer controls the seat. Resume or reclaim the player session.";
  return code.replaceAll("_", " ").toLowerCase();
}

createRoot(document.getElementById("root")!).render(<PlayerApp />);
