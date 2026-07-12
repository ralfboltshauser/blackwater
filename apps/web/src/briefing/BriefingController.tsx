import { useCallback, useEffect, useState } from "react";
import {
  PROTOCOL_VERSION,
  type BriefingControlRequest,
  type BriefingState,
} from "@blackwater/protocol";
import { apiFetch } from "../shared/api";
import { BRIEFING_SLIDES } from "./content";

export function BriefingController({
  roomCode,
  briefing,
  displayReady,
  onError,
}: {
  roomCode: string;
  briefing: BriefingState | null;
  displayReady: boolean;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const active = Boolean(briefing?.active);
  const slideIndex = briefing?.slideIndex ?? 0;
  const slide = BRIEFING_SLIDES[slideIndex] ?? BRIEFING_SLIDES[0]!;

  const control = useCallback(
    async (action: BriefingControlRequest["action"], targetSlide?: number) => {
      if (busy) return;
      setBusy(true);
      try {
        await apiFetch(`/api/v1/matches/${roomCode}/host/briefing`, {
          method: "POST",
          body: JSON.stringify({
            protocol: PROTOCOL_VERSION,
            action,
            expectedRevision: briefing?.revision ?? 0,
            ...(action === "go-to" ? { slideIndex: targetSlide } : {}),
          }),
        });
      } catch (reason) {
        onError(
          reason instanceof Error
            ? reason.message
            : "Could not control the briefing",
        );
      } finally {
        setBusy(false);
      }
    },
    [briefing?.revision, busy, onError, roomCode],
  );

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.matches(
          "input, textarea, select, button, [contenteditable=true]",
        )
      )
        return;
      if (event.key === "ArrowLeft") void control("previous");
      else if (event.key === "ArrowRight") void control("next");
      else if (event.key === "Home") void control("go-to", 0);
      else if (event.key === "End")
        void control("go-to", BRIEFING_SLIDES.length - 1);
      else if (event.key === "Escape") void control("close");
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, control]);

  return (
    <section
      className={`panel host-briefing ${active ? "is-active" : ""}`}
      aria-label="Crew briefing controls"
    >
      <div className="host-briefing__heading">
        <div>
          <p className="eyebrow">Field briefing</p>
          <h2>{active ? slide.title : "Teach the crew"}</h2>
        </div>
        <span className={displayReady ? "is-live" : ""}>
          {displayReady ? "TV live" : "TV offline"}
        </span>
      </div>

      {!active ? (
        <>
          <p className="host-briefing__intro">
            A host-led, bottom-up explanation of the world, three Charters,
            private information, Pulses, deals, and conflict.
          </p>
          <div className="host-briefing__facts">
            <span>{BRIEFING_SLIDES.length} slides</span>
            <span>Presenter notes</span>
            <span>About 9 minutes</span>
          </div>
          <button
            className="button-primary host-briefing__open"
            disabled={busy || !briefing}
            onClick={() => void control("open")}
          >
            {!briefing
              ? "Connecting…"
              : busy
                ? "Opening…"
                : "Show briefing on TV"}
          </button>
          <small className="host-briefing__safety">
            Opening during play pauses the match clock.
          </small>
        </>
      ) : (
        <>
          <div className="host-briefing__meta">
            <span>
              {String(slideIndex + 1).padStart(2, "0")} /{" "}
              {BRIEFING_SLIDES.length}
            </span>
            <b>{slide.chapter}</b>
            <small>{slide.depth === "core" ? "Core rule" : "Deep dive"}</small>
          </div>
          <div className="host-briefing__notes">
            <span className="eyebrow">Say this</span>
            {slide.speakerNotes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
          <div className="host-briefing__jump" aria-label="Briefing slides">
            {BRIEFING_SLIDES.map((candidate, index) => (
              <button
                key={candidate.id}
                className={index === slideIndex ? "is-current" : ""}
                aria-label={`Go to slide ${index + 1}: ${candidate.title}`}
                aria-current={index === slideIndex ? "step" : undefined}
                disabled={busy}
                onClick={() => void control("go-to", index)}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <div className="host-briefing__buttons">
            <button
              className="button-secondary"
              disabled={busy || slideIndex === 0}
              onClick={() => void control("previous")}
            >
              ← Back
            </button>
            <button
              className="button-primary"
              disabled={busy || slideIndex === BRIEFING_SLIDES.length - 1}
              onClick={() => void control("next")}
            >
              Next →
            </button>
          </div>
          <button
            className="button-ghost host-briefing__close"
            disabled={busy}
            onClick={() => void control("close")}
          >
            End briefing
          </button>
          <small className="host-briefing__keys">
            Keyboard: ← → · Home · End · Esc
          </small>
        </>
      )}
    </section>
  );
}
