import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const HOLD_DELAY_MS = 500;
const HOLD_MOVE_TOLERANCE_PX = 10;

export type ContextHint = {
  id: string;
  guideId: string;
  title: string;
  summary: string;
  trace: string;
  when: string;
  how: string;
};

type HintableButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "onClick"
> & {
  children: ReactNode;
  hintId: string;
  hintGuideId: string;
  hintTitle: string;
  hintSummary: string;
  hintTrace: string;
  hintWhen: string;
  hintHow: string;
  onActivate: () => void;
  onHint: (hint: ContextHint) => void;
  onHintDismiss: (hintId: string) => void;
};

export function HintableButton({
  children,
  hintId,
  hintGuideId,
  hintTitle,
  hintSummary,
  hintTrace,
  hintWhen,
  hintHow,
  onActivate,
  onHint,
  onHintDismiss,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  onContextMenu,
  ...buttonProps
}: HintableButtonProps) {
  const holdTimer = useRef<number | null>(null);
  const dismissTimer = useRef<number | null>(null);
  const pointer = useRef<{
    id: number;
    x: number;
    y: number;
    activated: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const focused = useRef(false);

  const clearHold = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  const clearDismiss = () => {
    if (dismissTimer.current !== null)
      window.clearTimeout(dismissTimer.current);
    dismissTimer.current = null;
  };
  const show = () => {
    clearDismiss();
    onHint({
      id: hintId,
      guideId: hintGuideId,
      title: hintTitle,
      summary: hintSummary,
      trace: hintTrace,
      when: hintWhen,
      how: hintHow,
    });
  };
  const dismiss = () => {
    clearHold();
    clearDismiss();
    onHintDismiss(hintId);
  };

  useEffect(
    () => () => {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
      if (dismissTimer.current !== null)
        window.clearTimeout(dismissTimer.current);
    },
    [],
  );

  const startHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    onPointerDown?.(event);
    if (
      event.defaultPrevented ||
      (event.pointerType !== "touch" && event.pointerType !== "pen") ||
      !event.isPrimary
    )
      return;
    clearHold();
    clearDismiss();
    pointer.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      activated: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events may not have an active pointer to capture.
    }
    holdTimer.current = window.setTimeout(() => {
      if (pointer.current?.id !== event.pointerId) return;
      pointer.current.activated = true;
      suppressClick.current = true;
      show();
    }, HOLD_DELAY_MS);
  };

  const moveHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    onPointerMove?.(event);
    const current = pointer.current;
    if (!current || current.id !== event.pointerId) return;
    if (
      Math.hypot(event.clientX - current.x, event.clientY - current.y) >
      HOLD_MOVE_TOLERANCE_PX
    ) {
      clearHold();
      if (current.activated) dismiss();
      pointer.current = null;
    }
  };

  const finishHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    onPointerUp?.(event);
    const current = pointer.current;
    if (!current || current.id !== event.pointerId) return;
    clearHold();
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (current.activated) {
      // The full-screen guide remains open until the player explicitly closes
      // it. Releasing a long press must not make educational content vanish.
      return;
    }
  };

  const cancelHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    onPointerCancel?.(event);
    const current = pointer.current;
    if (!current || current.id !== event.pointerId) return;
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (current.activated) dismiss();
    else clearHold();
  };

  return (
    <button
      {...buttonProps}
      aria-label={buttonProps["aria-label"] ?? hintTitle}
      aria-describedby={`${hintId}-description`}
      onClick={(event) => {
        if (suppressClick.current) {
          event.preventDefault();
          suppressClick.current = false;
          return;
        }
        onActivate();
      }}
      onPointerDown={startHold}
      onPointerMove={moveHold}
      onPointerUp={finishHold}
      onPointerCancel={cancelHold}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        if (event.pointerType === "mouse") clearHold();
      }}
      onFocus={(event) => {
        focused.current = true;
        onFocus?.(event);
        if (event.currentTarget.matches(":focus-visible")) show();
      }}
      onBlur={(event) => {
        focused.current = false;
        onBlur?.(event);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu?.(event);
      }}
    >
      {children}
      <span id={`${hintId}-description`} className="sr-only">
        {hintSummary}. {hintTrace}. Hold for the full-screen guide.
      </span>
    </button>
  );
}

export function ContextHintDialog({
  hint,
  onClose,
  onOpenGuide,
}: {
  hint: ContextHint | null;
  onClose: () => void;
  onOpenGuide: (guideId: string) => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!hint) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;
    const controls = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    controls()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = controls();
      if (!items.length) return;
      const first = items[0]!;
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [hint, onClose]);
  if (!hint || typeof document === "undefined") return null;
  return createPortal(
    <div className="learning-dialog" role="presentation" onClick={onClose}>
      <article
        ref={dialogRef}
        className="learning-dialog__panel learning-dialog__panel--hint"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${hint.id}-guide-title`}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div className="learning-dialog__glyph" aria-hidden="true">
            ?
          </div>
          <div>
            <p className="eyebrow">Full operation guide</p>
            <h1 id={`${hint.id}-guide-title`}>{hint.title}</h1>
            <p>{hint.summary}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close full operation guide"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="learning-dialog__sections">
          <section>
            <span>Use it when</span>
            <p>{hint.when}</p>
          </section>
          <section>
            <span>What to do</span>
            <p>{hint.how}</p>
          </section>
          <section>
            <span>What rivals learn</span>
            <p>{hint.trace}</p>
          </section>
        </div>
        <footer>
          <p>Closing this guide does not select or change the order.</p>
          <button type="button" className="button-ghost" onClick={onClose}>
            Back to planning
          </button>
          <button
            type="button"
            className="button-primary"
            onClick={() => onOpenGuide(hint.guideId)}
          >
            Read full article
          </button>
        </footer>
      </article>
    </div>,
    document.body,
  );
}
