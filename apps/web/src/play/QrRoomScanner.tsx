import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { playFeedback } from "../shared/feedback";

export function roomCodeFromQr(value: string): string | null {
  const raw = value.trim();
  const direct = raw.toUpperCase();
  if (/^[A-Z0-9]{6}$/.test(direct)) return direct;
  try {
    const url = new URL(raw);
    const pathCode = url.pathname.match(
      /\/(?:j|play|display)\/([a-z0-9]{6})(?:\/|$)/i,
    )?.[1];
    const queryCode = url.searchParams.get("room");
    const candidate = (pathCode ?? queryCode ?? "").toUpperCase();
    return /^[A-Z0-9]{6}$/.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function QrRoomScanner({ onScan }: { onScan: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("Starting camera…");
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const start = async () => {
      if (!window.isSecureContext) {
        setStatus("Camera scanning requires the secure HTTPS app.");
        return;
      }
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        if (cancelled || !videoRef.current) return;
        const reader = new BrowserQRCodeReader(undefined, {
          delayBetweenScanAttempts: 140,
          delayBetweenScanSuccess: 500,
        });
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          videoRef.current,
          (result) => {
            if (!result) return;
            const code = roomCodeFromQr(result.getText());
            if (!code) {
              setStatus("That QR code is not a Blackwater invitation.");
              return;
            }
            controlsRef.current?.stop();
            playFeedback("commit");
            onScan(code);
            setOpen(false);
          },
        );
        if (cancelled) controls.stop();
        else {
          controlsRef.current = controls;
          setStatus("Point the camera at the QR code on the host screen.");
        }
      } catch (reason) {
        if (cancelled) return;
        const denied =
          reason instanceof DOMException && reason.name === "NotAllowedError";
        setStatus(
          denied
            ? "Camera permission was denied. Allow it in browser settings or enter the code manually."
            : "The camera could not start. Enter the room code manually.",
        );
      }
    };
    void start();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      const stream = videoRef.current?.srcObject;
      if (stream instanceof MediaStream)
        stream.getTracks().forEach((track) => track.stop());
    };
  }, [open, onScan]);

  const close = () => {
    controlsRef.current?.stop();
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="join-card__scan"
        onClick={() => {
          setStatus("Starting camera…");
          setOpen(true);
        }}
        aria-label="Scan room QR code"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" />
          <path d="M8 8h3v3H8zM14 8h2v2h-2zM8 14h2v2H8zM13 13h3v3h-3z" />
        </svg>
        Scan
      </button>
      {open && (
        <div
          className="qr-scanner"
          role="dialog"
          aria-modal="true"
          aria-label="Scan Blackwater room code"
        >
          <section className="qr-scanner__sheet panel">
            <header>
              <div>
                <p className="eyebrow">Join expedition</p>
                <h2>Scan room QR</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={close}
                aria-label="Close QR scanner"
              >
                ×
              </button>
            </header>
            <div className="qr-scanner__camera">
              <video ref={videoRef} muted playsInline />
              <div className="qr-scanner__frame" aria-hidden="true">
                <i />
              </div>
            </div>
            <p role="status">{status}</p>
            <button type="button" className="button-ghost" onClick={close}>
              Enter code manually
            </button>
          </section>
        </div>
      )}
    </>
  );
}
