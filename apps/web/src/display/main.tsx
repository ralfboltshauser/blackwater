import { createRoot } from "react-dom/client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PublicProjection } from "@blackwater/protocol";
import { BriefingStage } from "../briefing/BriefingStage";
import { BasinMap } from "../components/BasinMap";
import { AiBadge } from "../shared/AiBadge";
import { Brand } from "../shared/Brand";
import { useRealtimeProjection } from "../shared/api";
import { formatClock, roomFromLocation } from "../shared/bootstrap";
import {
  isAudioReady,
  isSoundEnabled,
  playFeedback,
  primeAudio,
  setMusicScene,
  setSoundEnabled,
  subscribeAudioState,
} from "../shared/feedback";
import { publicProjectionToBasin } from "../shared/projection";
import "../shared/bootstrap";
import "./display.css";

const phaseLabel: Record<string, string> = {
  lobby: "Crew Assembly",
  forecast: "Forecast",
  "open-water": "Open Water",
  resolution: "Resolution",
  "claim-check": "Charter Check",
  "game-over": "Expedition Complete",
};

const PHASE_STEPS = [
  ["forecast", "Forecast", "forecast"],
  ["open-water", "Plan", "plan"],
  ["pulse-1", "Pulse 1", "1"],
  ["pulse-2", "Pulse 2", "2"],
  ["pulse-3", "Pulse 3", "3"],
  ["claim-check", "Charter", "charter"],
] as const;

function DisplayApp() {
  const [roomCode, setRoomCode] = useState(roomFromLocation());
  const [now, setNow] = useState(Date.now());
  const realtime = useRealtimeProjection<PublicProjection>("public", roomCode);
  const briefingActive = realtime.briefing.active;
  const lastBriefingSlide = useRef(realtime.briefing.slideIndex);
  const wasBriefingActive = useRef(briefingActive);
  const [briefingExiting, setBriefingExiting] = useState(false);
  const previousBriefingRevision = useRef(realtime.briefing.revision);
  const previousPhaseSound = useRef("");
  const previousCaptionSequence = useRef(0);
  const victorySoundPlayed = useRef(false);

  if (briefingActive) lastBriefingSlide.current = realtime.briefing.slideIndex;

  useLayoutEffect(() => {
    const justEnded = wasBriefingActive.current && !briefingActive;
    wasBriefingActive.current = briefingActive;
    if (briefingActive) {
      setBriefingExiting(false);
      return;
    }
    if (!justEnded) return;
    setBriefingExiting(true);
    const timer = window.setTimeout(() => setBriefingExiting(false), 900);
    return () => window.clearTimeout(timer);
  }, [briefingActive]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const musicScene = roomCode
    ? briefingActive || !realtime.projection
      ? "briefing"
      : "open-water"
    : "silent";
  useEffect(() => {
    setMusicScene(musicScene);
    return () => setMusicScene("silent");
  }, [musicScene]);

  useEffect(() => {
    if (
      briefingActive &&
      previousBriefingRevision.current !== realtime.briefing.revision
    )
      playFeedback("select");
    previousBriefingRevision.current = realtime.briefing.revision;
  }, [briefingActive, realtime.briefing.revision]);

  useEffect(() => {
    const projection = realtime.projection;
    if (!projection || briefingActive) return;
    const phaseKey = `${projection.phase.phaseId}:${projection.phase.pulse ?? 0}`;
    if (previousPhaseSound.current && previousPhaseSound.current !== phaseKey)
      playFeedback("pulse");
    previousPhaseSound.current = phaseKey;
  }, [briefingActive, realtime.projection?.phase]);

  useEffect(() => {
    const projection = realtime.projection;
    if (
      !projection?.currentCaption ||
      projection.presentation.timelineSeq === previousCaptionSequence.current
    )
      return;
    previousCaptionSequence.current = projection.presentation.timelineSeq;
    const caption = projection.currentCaption.toLowerCase();
    playFeedback(
      /hunt|raid|jam|damage|disabled|contest|snare/.test(caption)
        ? "warning"
        : /survey|sonar|scan|contact/.test(caption)
          ? "scan"
          : /build|develop|analy|harvest|commission/.test(caption)
            ? "commit"
            : "select",
    );
  }, [realtime.projection?.presentation.timelineSeq]);

  useEffect(() => {
    const finished = realtime.projection?.lifecycle === "finished";
    if (finished && !victorySoundPlayed.current) {
      victorySoundPlayed.current = true;
      playFeedback("victory");
    }
  }, [realtime.projection?.lifecycle]);

  if (!roomCode) {
    return <DisplayConnect onConnect={setRoomCode} />;
  }

  if (briefingActive) {
    return (
      <>
        <BriefingStage
          key={realtime.briefing.revision}
          slideIndex={realtime.briefing.slideIndex}
        />
        <DisplayAudioControl />
      </>
    );
  }

  if (!realtime.projection) {
    return (
      <>
        <main className="display-wait">
          <Brand className="display-wait__brand" />
          <div className="sonar-loader" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h1>{realtime.error ? "Signal unavailable" : "Opening the basin"}</h1>
          <p>
            {realtime.error ?? `Room ${roomCode} · waiting for public state`}
          </p>
          {realtime.error && (
            <button
              className="button-secondary"
              onClick={() => setRoomCode(null)}
            >
              Change room
            </button>
          )}
        </main>
        {briefingExiting && (
          <BriefingExit slideIndex={lastBriefingSlide.current} />
        )}
        <DisplayAudioControl />
      </>
    );
  }

  const projection = realtime.projection;
  const basin = publicProjectionToBasin(projection);
  const remaining = projection.phase.endsAtServerMs
    ? Math.max(0, (projection.phase.endsAtServerMs - now) / 1000)
    : 0;
  const readyCount = projection.expeditions.filter(
    (expedition) => expedition.ready,
  ).length;
  const railSplit = Math.ceil(projection.expeditions.length / 2);
  const leftExpeditions = projection.expeditions.slice(0, railSplit);
  const rightExpeditions = projection.expeditions.slice(railSplit);
  const openCommission = projection.commissions[0];
  const activeAgreement = projection.agreements.find(
    (agreement) => agreement.status === "active",
  );
  const publicNotice = openCommission
    ? {
        label: "Leader threat",
        text: `Commission · +${openCommission.rewardSupply} Supply against ${projection.expeditions.find((expedition) => expedition.seatId === openCommission.targetSeatId)?.displayName ?? "the leader"}`,
      }
    : activeAgreement
      ? {
          label: "Recorded agreement",
          text: "Active Handshake terms in force",
        }
      : { label: "Basin status", text: "No leader threat or recorded terms" };
  const phaseStep =
    projection.phase.kind === "forecast"
      ? 0
      : projection.phase.kind === "open-water"
        ? 1
        : projection.phase.kind === "resolution"
          ? projection.phase.pulse === null
            ? 5
            : projection.phase.pulse + 1
          : projection.phase.kind === "claim-check" ||
              projection.phase.kind === "game-over"
            ? 5
            : 0;

  return (
    <>
      <main
        className={`display-app ${briefingExiting ? "is-briefing-reveal" : ""}`}
      >
        <h1 className="sr-only">Blackwater public basin display</h1>
        <header className="display-header">
          <Brand className="display-header__brand" />
          <DisplayMetric
            label="Round"
            value={`${projection.phase.round} / 7`}
          />
          <DisplayMetric
            label="Phase"
            value={
              projection.phase.kind === "resolution" &&
              projection.phase.pulse === null
                ? "Charter Check"
                : (phaseLabel[projection.phase.kind] ?? projection.phase.kind)
            }
            accent
          />
          <DisplayMetric
            label="Time"
            value={
              projection.phase.endsAtServerMs ? formatClock(remaining) : "—"
            }
          />
          <DisplayMetric
            label="Locked"
            value={`${readyCount} / ${projection.expeditions.length}`}
          />
          <div className="display-header__charters">
            {(["network", "discovery", "dominion"] as const).map((charter) => {
              if (charter === "dominion") {
                return (
                  <div key={charter} className="charter-chip is-sealed">
                    <span
                      className="charter-icon charter-icon--dominion"
                      aria-hidden="true"
                    />
                    <div>
                      <b>dominion</b>
                      <small>SEALED</small>
                    </div>
                  </div>
                );
              }
              const leaders = projection.expeditions
                .map((expedition) => {
                  const progress = expedition.charters.find(
                    (item) => item.charter === charter,
                  );
                  if (!progress || progress.charter === "dominion") return null;
                  return { expedition, progress };
                })
                .filter(
                  (entry): entry is NonNullable<typeof entry> => entry !== null,
                )
                .sort((a, b) => b.progress.value - a.progress.value);
              const lead = leaders[0];
              return (
                <div
                  key={charter}
                  className={`charter-chip ${lead?.progress.threatened ? "is-threat" : ""}`}
                >
                  <span
                    className={`charter-icon charter-icon--${charter}`}
                    aria-hidden="true"
                  />
                  <div>
                    <b>{charter}</b>
                    <small>
                      {lead
                        ? `${lead.expedition.displayName} ${lead.progress.value}/${lead.progress.target}`
                        : "No progress"}
                    </small>
                  </div>
                </div>
              );
            })}
          </div>
          <div
            className={`display-header__signal ${realtime.connected ? "is-live" : ""}`}
          >
            <span />
            {realtime.connected ? "Live" : "Reconnecting"}
          </div>
        </header>

        <section className="display-body">
          <aside className="display-rail display-rail--left">
            {leftExpeditions.map((expedition, index) => (
              <ExpeditionCard
                key={expedition.seatId}
                expedition={expedition}
                platforms={projection.platforms.filter(
                  (platform) => platform.ownerSeatId === expedition.seatId,
                )}
                seat={index + 1}
              />
            ))}
          </aside>
          <section className="display-basin panel">
            <BasinMap basin={basin} focusSectorId={null} />
            {projection.currentCaption && (
              <div
                key={`${projection.presentation.timelineSeq}-${projection.currentCaption}`}
                className="display-caption"
                role="status"
              >
                {projection.currentCaption}
              </div>
            )}
            {projection.phase.paused && (
              <div className="display-pause">
                <span>Expedition paused</span>
                <small>{projection.phase.pauseReason ?? "Host control"}</small>
              </div>
            )}
          </section>
          <aside className="display-rail display-rail--right">
            {rightExpeditions.map((expedition, index) => (
              <ExpeditionCard
                key={expedition.seatId}
                expedition={expedition}
                platforms={projection.platforms.filter(
                  (platform) => platform.ownerSeatId === expedition.seatId,
                )}
                seat={railSplit + index + 1}
              />
            ))}
          </aside>
        </section>

        <footer className="display-footer">
          <div className="pulse-track">
            {PHASE_STEPS.map(([key, label, icon], index) => {
              const active = index === phaseStep;
              const complete = index < phaseStep;
              return (
                <div
                  key={key}
                  className={`${active ? "is-active" : ""} ${complete ? "is-complete" : ""}`}
                  aria-current={active ? "step" : undefined}
                >
                  <PhaseStepIcon kind={icon} complete={complete} />
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
          <div className="display-footer__event">
            <span className="eyebrow">{publicNotice.label}</span>
            <strong>{publicNotice.text}</strong>
          </div>
          <div className="display-footer__forecast">
            <span className="eyebrow">Room</span>
            <strong>{projection.roomCode}</strong>
          </div>
        </footer>

        {projection.lifecycle === "finished" && (
          <VictoryOverlay projection={projection} />
        )}
      </main>
      {briefingExiting && (
        <BriefingExit slideIndex={lastBriefingSlide.current} />
      )}
      <DisplayAudioControl />
    </>
  );
}

function DisplayAudioControl() {
  const [, render] = useState(0);
  useEffect(() => subscribeAudioState(() => render((value) => value + 1)), []);
  const enabled = isSoundEnabled();
  const ready = enabled && isAudioReady();
  const toggle = async () => {
    if (ready) {
      setSoundEnabled(false);
      return;
    }
    setSoundEnabled(true);
    await primeAudio().catch(() => undefined);
    render((value) => value + 1);
  };
  return (
    <button
      className={`display-audio ${ready ? "is-on" : ""}`}
      aria-pressed={ready}
      aria-label={ready ? "Audio on" : "Enable audio"}
      onClick={() => void toggle()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 10v4h3l4 3V7L8 10H5Z" />
        {ready ? (
          <path d="M15 9.2c1.4 1.6 1.4 4 0 5.6M18 7c2.8 2.8 2.8 7.2 0 10" />
        ) : (
          <path d="m16 10 4 4m0-4-4 4" />
        )}
      </svg>
      <span>{ready ? "Audio on" : "Enable audio"}</span>
    </button>
  );
}

function PhaseStepIcon({
  kind,
  complete,
}: {
  kind: string;
  complete: boolean;
}) {
  if (complete)
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6.5 12.5 3.4 3.4 7.7-8" />
      </svg>
    );
  if (/^[123]$/.test(kind)) return <b aria-hidden="true">{kind}</b>;
  if (kind === "forecast")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
      </svg>
    );
  if (kind === "plan")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 7h10M7 12h10M7 17h7" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 20V4m0 1h10l-2.5 3L17 11H7" />
    </svg>
  );
}

function BriefingExit({ slideIndex }: { slideIndex: number }) {
  return (
    <div className="display-briefing-exit" aria-hidden="true">
      <BriefingStage slideIndex={slideIndex} />
      <div className="display-briefing-exit__dive">Entering Neris</div>
    </div>
  );
}

function DisplayConnect({ onConnect }: { onConnect: (room: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <main className="display-connect">
      <Brand className="display-connect__brand" />
      <p className="eyebrow">Public basin display</p>
      <h1>Connect this screen</h1>
      <p>Enter the room code shown in Host Controls.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (value.length === 6) onConnect(value);
        }}
      >
        <input
          className="field mono"
          aria-label="Room code"
          value={value}
          onChange={(event) =>
            setValue(
              event.target.value
                .replace(/[^a-z0-9]/gi, "")
                .toUpperCase()
                .slice(0, 6),
            )
          }
          placeholder="ROOM CODE"
          autoFocus
        />
        <button
          className="button-primary"
          type="submit"
          disabled={value.length !== 6}
        >
          Open basin
        </button>
      </form>
    </main>
  );
}

function DisplayMetric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`display-metric ${accent ? "is-accent" : ""}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

type Expedition = PublicProjection["expeditions"][number];
type Platform = PublicProjection["platforms"][number];
function ExpeditionCard({
  expedition,
  platforms,
  seat,
}: {
  expedition: Expedition;
  platforms: Platform[];
  seat: number;
}) {
  const threat = expedition.charters.some(
    (charter) => charter.charter !== "dominion" && charter.threatened,
  );
  return (
    <article
      className={`expedition-card panel ${expedition.ready ? "is-ready" : ""}`}
      data-seat={expedition.color}
    >
      <header>
        <b>{seat}</b>
        <div>
          <div className="expedition-card__name">
            <h2>{expedition.displayName}</h2>
            {expedition.controller === "bot" && (
              <AiBadge strategy={expedition.botStrategy} />
            )}
          </div>
          <p>{expedition.factionName}</p>
        </div>
      </header>
      <div className="expedition-card__resources">
        <span>
          Supply <b>{expedition.supply}</b>
        </span>
        <span>
          Analyzed <b>{expedition.analyzedSpecimenCount}</b>
        </span>
      </div>
      <div
        className="expedition-card__modules"
        aria-label={`${platforms.length} research platforms`}
      >
        {platforms.length === 0 && <span>No platforms deployed</span>}
        {platforms.map((platform) => (
          <img
            key={platform.platformId}
            className={platform.state !== "active" ? "is-offline" : ""}
            src={`/sprites/${platform.module}.webp`}
            alt={platform.module}
            title={`${platform.module} · ${platform.state}`}
          />
        ))}
        <small>
          {expedition.submarineCount} sub
          {expedition.submarineCount === 1 ? "" : "s"}
        </small>
      </div>
      <div className="expedition-card__progress">
        {expedition.charters.map((charter) =>
          charter.charter === "dominion" ? (
            <span key={charter.charter} className="is-sealed">
              <i />
              <small>dominion · SEALED</small>
            </span>
          ) : (
            <span
              key={charter.charter}
              style={
                {
                  "--value": `${Math.min(1, charter.value / charter.target) * 100}%`,
                } as React.CSSProperties
              }
            >
              <i />
              <small>{charter.charter}</small>
            </span>
          ),
        )}
      </div>
      <footer>
        {expedition.controller === "bot" ? (
          <>{expedition.ready ? "Locked" : "Calculating"}</>
        ) : (
          <>
            <span
              className={`presence-dot presence-dot--${expedition.presence}`}
            />
            {expedition.ready ? "Locked" : "Planning"}
          </>
        )}
        {threat && <b className="threat-tag">Threat</b>}
      </footer>
    </article>
  );
}

function VictoryOverlay({ projection }: { projection: PublicProjection }) {
  const winners = projection.expeditions.filter(
    (expedition) => expedition.winner,
  );
  const fallback =
    projection.outcome?.winningCharters.some((row) =>
      row.charters.includes("fallback"),
    ) ?? false;
  return (
    <div
      className="victory-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Expedition complete"
    >
      <div className="victory-overlay__bloom" />
      <p className="eyebrow">
        {fallback
          ? "Round cap · field record scored"
          : "Charter claim confirmed"}
      </p>
      <h1>
        {winners.length > 1 ? "The basin has co-winners" : "The deep answers"}
      </h1>
      <div className="victory-overlay__winners">
        {winners.map((winner) => {
          const outcome = projection.outcome?.winningCharters.find(
            (row) => row.seatId === winner.seatId,
          );
          const score = projection.outcome?.fallbackScores.find(
            (row) => row.seatId === winner.seatId,
          )?.score;
          return (
            <div key={winner.seatId} data-seat={winner.color}>
              <span /> <b>{winner.displayName}</b>
              <small>
                {outcome?.charters
                  .map((charter) => charter.toUpperCase())
                  .join(" · ") ?? "CHARTER"}
                {score === undefined ? "" : ` · ${score} PTS`}
              </small>
            </div>
          );
        })}
      </div>
      {fallback && projection.outcome && (
        <div className="victory-overlay__scores">
          {projection.outcome.fallbackScores
            .slice()
            .sort((a, b) => b.score - a.score)
            .map((row) => (
              <span key={row.seatId}>
                {projection.expeditions.find(
                  (expedition) => expedition.seatId === row.seatId,
                )?.displayName ?? row.seatId}
                <b>{row.score}</b>
              </span>
            ))}
        </div>
      )}
      <p>Field record sealed · return to Host Controls for a rematch.</p>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<DisplayApp />);
