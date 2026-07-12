import { useEffect, useRef, useState } from "react";
import {
  applyPwaUpdate,
  promptPwaInstall,
  pwaSnapshot,
  subscribePwa,
  type InstallPlatform,
  type PwaSnapshot,
} from "./runtime";

import "./pwa.css";

function usePwaSnapshot(): PwaSnapshot {
  const [snapshot, setSnapshot] = useState(pwaSnapshot);
  useEffect(() => subscribePwa(() => setSnapshot(pwaSnapshot())), []);
  return snapshot;
}

export function InstallConsole({
  variant,
  roomCode,
}: {
  variant: "join" | "settings";
  roomCode?: string;
}) {
  const snapshot = usePwaSnapshot();
  const [guideOpen, setGuideOpen] = useState(false);
  const secureAppUrl = secureJoinUrl(roomCode);

  const install = async () => {
    if (!snapshot.secureContext) {
      setGuideOpen(true);
      return;
    }
    const outcome = await promptPwaInstall();
    if (outcome !== "accepted") setGuideOpen(true);
  };

  if (variant === "join") {
    return (
      <>
        <section
          className={
            "pwa-install-card " + (snapshot.installed ? "is-installed" : "")
          }
          aria-label="Install the Blackwater field console"
        >
          <img src="/pwa/icon-192.png" alt="" />
          <div>
            <b>
              {snapshot.updateReady
                ? "Console update ready"
                : snapshot.installed
                  ? "Full-screen console active"
                  : !snapshot.secureContext
                    ? "LAN browser ready"
                    : "Lose the browser bars"}
            </b>
            <small>
              {snapshot.updateReady
                ? "Restart here before joining; no private edits are open."
                : snapshot.installed
                  ? "This Home Screen app is ready for private play."
                  : !snapshot.secureContext
                    ? "Play here now. Full-screen install requires working Private DNS."
                    : "Install once, then use this icon every game night."}
            </small>
          </div>
          {snapshot.updateReady ? (
            <button className="button-secondary" onClick={applyPwaUpdate}>
              Restart & update
            </button>
          ) : !snapshot.installed ? (
            <button
              className="button-secondary"
              onClick={() =>
                !snapshot.secureContext || snapshot.promptAvailable
                  ? void install()
                  : setGuideOpen(true)
              }
            >
              {!snapshot.secureContext
                ? "PWA requirements"
                : snapshot.promptAvailable
                  ? "Install now"
                  : "How to install"}
            </button>
          ) : (
            <span aria-hidden="true">✓</span>
          )}
        </section>
        {guideOpen && (
          <InstallGuide
            platform={snapshot.platform}
            roomCode={roomCode}
            secureContext={snapshot.secureContext}
            secureAppUrl={secureAppUrl}
            onClose={() => setGuideOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <section className="pwa-settings-card">
      <img src="/pwa/icon-192.png" alt="" />
      <div>
        <b>
          {snapshot.installed ? "Installed field console" : "Home Screen app"}
        </b>
        <small>
          {snapshot.updateReady
            ? "Finish or save edits, then fully close and reopen after the round."
            : snapshot.installed
              ? snapshot.serviceWorkerAvailable
                ? "No browser chrome · updates checked automatically"
                : "No browser chrome · updates load when the app reopens"
              : "Install for a dedicated landscape controller."}
        </small>
      </div>
      {snapshot.updateReady ? (
        <span className="pwa-settings-card__status">ON REOPEN</span>
      ) : !snapshot.installed ? (
        <button
          className="button-ghost"
          onClick={() => {
            if (!snapshot.secureContext) {
              // This variant is shown after joining. Never abandon an
              // origin-bound legacy seat without first showing the warning.
              setGuideOpen(true);
            } else if (snapshot.promptAvailable) {
              void install();
            } else {
              setGuideOpen(true);
            }
          }}
        >
          {snapshot.secureContext ? "Install" : "HTTPS info"}
        </button>
      ) : (
        <span className="pwa-settings-card__status">READY</span>
      )}
      {guideOpen && (
        <InstallGuide
          platform={snapshot.platform}
          roomCode={roomCode}
          secureContext={snapshot.secureContext}
          secureAppUrl={secureAppUrl}
          onClose={() => setGuideOpen(false)}
        />
      )}
    </section>
  );
}

function InstallGuide({
  platform,
  roomCode,
  secureContext,
  secureAppUrl,
  onClose,
}: {
  platform: InstallPlatform;
  roomCode: string | undefined;
  secureContext: boolean;
  secureAppUrl: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusable = Array.from(
        sheet.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !sheet.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !sheet.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [onClose]);

  const steps = secureContext ? installSteps(platform) : lanDnsSteps(platform);
  return (
    <div
      className="pwa-guide"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-guide-title"
    >
      <button
        className="pwa-guide__scrim"
        tabIndex={-1}
        onClick={onClose}
        aria-label="Close install instructions"
      />
      <section ref={sheetRef} className="pwa-guide__sheet panel">
        <header>
          <div>
            <p className="eyebrow">One-time setup</p>
            <h1 id="pwa-guide-title">Install the field console</h1>
          </div>
          <button
            ref={closeRef}
            className="icon-button"
            onClick={onClose}
            aria-label="Close install instructions"
          >
            ×
          </button>
        </header>
        <div className="pwa-guide__body">
          <figure>
            <img src="/pwa/icon-512.png" alt="Blackwater app icon" />
            <figcaption>No URL bar · private landscape console</figcaption>
          </figure>
          <ol>
            {steps.map((step, index) => (
              <li key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="pwa-guide__handoff">
          <span>After installing</span>
          <p>
            Open the <b>Blackwater</b> icon and enter room{" "}
            {roomCode ? <strong>{roomCode}</strong> : "shown on the TV"}.
          </p>
          <small>{installHandoffNote(platform)}</small>
        </div>
        {!secureContext && (
          <p className="pwa-guide__network">
            Keep playing in this browser unless your host has configured an
            HTTPS address for Blackwater. A Home Screen installation requires a
            trusted certificate; a numeric LAN address can only create a
            shortcut.
            <small>
              The complete game still works over trusted LAN HTTP. Once HTTPS is
              configured, open <code>{secureAppUrl}</code> and install there.
            </small>
          </p>
        )}
        <footer>
          <button className="button-primary" onClick={onClose}>
            I know what to do
          </button>
        </footer>
      </section>
    </div>
  );
}

function secureJoinUrl(roomCode: string | undefined): string {
  const normalized = roomCode?.trim().toUpperCase() ?? "";
  const path = /^[A-Z0-9]{4,8}$/.test(normalized)
    ? `/j/${encodeURIComponent(normalized)}`
    : "/play";
  return new URL(path, window.location.origin).toString();
}

function installSteps(platform: InstallPlatform): string[] {
  if (platform === "ios") {
    return [
      "Tap Safari’s Share button.",
      "Choose Add to Home Screen.",
      "Keep Open as Web App enabled if it is shown, then tap Add.",
      "Rotate the phone after Blackwater opens from the Home Screen.",
    ];
  }
  if (platform === "android") {
    return [
      "Use Chrome at the HTTPS address supplied by the host.",
      "Tap Blackwater’s Install now button, or open Chrome’s ⋮ menu.",
      "Choose Install app and confirm Install—not Create shortcut.",
      "Open Blackwater from the Home Screen and rotate the phone.",
    ];
  }
  return [
    "Open the browser menu or install icon.",
    "Choose Install app or Add to Home Screen.",
    "Confirm the Blackwater Field Console.",
    "Open the new Blackwater icon and enter the TV room code.",
  ];
}

function lanDnsSteps(platform: InstallPlatform): string[] {
  if (platform === "android") {
    return [
      "Ask the host for Blackwater’s HTTPS address.",
      "Open that address in Chrome and confirm it shows a secure connection.",
      "Use Install app from Chrome’s menu; a numeric HTTP address only creates a shortcut.",
    ];
  }
  if (platform === "ios") {
    return [
      "Ask the host for Blackwater’s HTTPS address.",
      "Open that address in Safari and confirm it shows a secure connection.",
      "Use Share → Add to Home Screen; a numeric HTTP address cannot install the PWA.",
    ];
  }
  return [
    "Ask the host for Blackwater’s HTTPS address.",
    "Open it and confirm the certificate is trusted on this device.",
    "Otherwise close this guide and continue in the complete LAN browser mode.",
  ];
}

function installHandoffNote(platform: InstallPlatform): string {
  if (platform === "ios") {
    return "Install before joining: Home Screen apps keep their own private session separate from Safari.";
  }
  if (platform === "android") {
    return "Remove the old HTTP shortcut first. A real install appears in Android Settings → Apps and opens without browser chrome.";
  }
  return "The installed icon always opens a reusable room-code entry screen.";
}
