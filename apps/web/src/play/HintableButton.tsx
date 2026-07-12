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
  title: string;
  summary: string;
  trace: string;
  anchor: DOMRect;
};

type HintableButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "onClick"
> & {
  children: ReactNode;
  hintId: string;
  hintTitle: string;
  hintSummary: string;
  hintTrace: string;
  onActivate: () => void;
  onHint: (hint: ContextHint) => void;
  onHintDismiss: (hintId: string) => void;
};

export function HintableButton({
  children,
  hintId,
  hintTitle,
  hintSummary,
  hintTrace,
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
  const show = (button: HTMLButtonElement) => {
    clearDismiss();
    onHint({
      id: hintId,
      title: hintTitle,
      summary: hintSummary,
      trace: hintTrace,
      anchor: button.getBoundingClientRect(),
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
    const button = event.currentTarget;
    holdTimer.current = window.setTimeout(() => {
      if (pointer.current?.id !== event.pointerId) return;
      pointer.current.activated = true;
      suppressClick.current = true;
      show(button);
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
      dismissTimer.current = window.setTimeout(
        () => onHintDismiss(hintId),
        2_600,
      );
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
        if (event.pointerType !== "mouse") return;
        clearHold();
        const button = event.currentTarget;
        holdTimer.current = window.setTimeout(() => show(button), 420);
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        if (event.pointerType !== "mouse") return;
        clearHold();
        if (!focused.current) onHintDismiss(hintId);
      }}
      onFocus={(event) => {
        focused.current = true;
        onFocus?.(event);
        if (event.currentTarget.matches(":focus-visible"))
          show(event.currentTarget);
      }}
      onBlur={(event) => {
        focused.current = false;
        onBlur?.(event);
        onHintDismiss(hintId);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu?.(event);
      }}
    >
      {children}
      <span id={`${hintId}-description`} className="sr-only">
        {hintSummary}. {hintTrace}. Hold for a quick explanation.
      </span>
    </button>
  );
}

export function ContextHintTooltip({ hint }: { hint: ContextHint | null }) {
  if (!hint || typeof document === "undefined") return null;
  const viewportWidth = window.innerWidth;
  const width = Math.min(320, viewportWidth - 16);
  const left = Math.min(
    viewportWidth - width - 8,
    Math.max(8, hint.anchor.left + hint.anchor.width / 2 - width / 2),
  );
  const placeAbove = hint.anchor.top > Math.min(210, window.innerHeight * 0.52);
  return createPortal(
    <div
      className="context-hint-tooltip"
      data-placement={placeAbove ? "above" : "below"}
      role="tooltip"
      style={
        placeAbove
          ? { left, width, bottom: window.innerHeight - hint.anchor.top + 8 }
          : { left, width, top: hint.anchor.bottom + 8 }
      }
    >
      <span>HOLD GUIDE</span>
      <b>{hint.title}</b>
      <p>{hint.summary}</p>
      <small>Public: {hint.trace}</small>
    </div>,
    document.body,
  );
}
