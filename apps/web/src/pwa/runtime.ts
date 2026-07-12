export type InstallPlatform = "ios" | "android" | "desktop";

export type PwaSnapshot = {
  installed: boolean;
  platform: InstallPlatform;
  promptAvailable: boolean;
  secureContext: boolean;
  serviceWorkerAvailable: boolean;
  updateReady: boolean;
};

type InstallOutcome = "accepted" | "dismissed" | "unavailable";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STATE_EVENT = "blackwater:pwa-state";
let initialized = false;
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let updateRegistration: ServiceWorkerRegistration | null = null;
let reloadForUpdate = false;
let serviceWorkerRegistered = false;

function installedMode(): boolean {
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };
  return (
    navigatorWithStandalone.standalone === true ||
    matchMedia("(display-mode: standalone)").matches ||
    matchMedia("(display-mode: fullscreen)").matches
  );
}

function platform(): InstallPlatform {
  const ios =
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return "ios";
  if (/Android/i.test(navigator.userAgent)) return "android";
  return "desktop";
}

function emitState(): void {
  window.dispatchEvent(new Event(STATE_EVENT));
}

function observeRegistration(registration: ServiceWorkerRegistration): void {
  if (registration.waiting && navigator.serviceWorker.controller) {
    updateRegistration = registration;
    emitState();
  }
  registration.addEventListener("updatefound", () => {
    const candidate = registration.installing;
    if (!candidate) return;
    candidate.addEventListener("statechange", () => {
      if (
        candidate.state === "installed" &&
        navigator.serviceWorker.controller
      ) {
        updateRegistration = registration;
        emitState();
      }
    });
  });
}

async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    serviceWorkerRegistered = true;
    observeRegistration(registration);
    await registration.update();
  } catch {
    serviceWorkerRegistered = false;
    // Live play remains online-only. A registration failure must not strand a
    // controller, but it does make the install diagnostics visibly incomplete.
  } finally {
    emitState();
  }
}

export function initializePwa(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emitState();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emitState();
  });
  for (const query of [
    matchMedia("(display-mode: standalone)"),
    matchMedia("(display-mode: fullscreen)"),
  ]) {
    query.addEventListener("change", emitState);
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!reloadForUpdate) return;
      reloadForUpdate = false;
      window.location.reload();
    });
  }

  if (document.readyState === "complete") {
    void registerServiceWorker();
  } else {
    window.addEventListener("load", () => void registerServiceWorker(), {
      once: true,
    });
  }
}

export function pwaSnapshot(): PwaSnapshot {
  return {
    installed: installedMode(),
    platform: platform(),
    promptAvailable: deferredPrompt !== null,
    secureContext: window.isSecureContext,
    serviceWorkerAvailable: serviceWorkerRegistered,
    updateReady: Boolean(updateRegistration?.waiting),
  };
}

export function subscribePwa(listener: () => void): () => void {
  window.addEventListener(STATE_EVENT, listener);
  return () => window.removeEventListener(STATE_EVENT, listener);
}

export async function promptPwaInstall(): Promise<InstallOutcome> {
  const prompt = deferredPrompt;
  if (!prompt) return "unavailable";
  await prompt.prompt();
  const choice = await prompt.userChoice;
  deferredPrompt = null;
  emitState();
  return choice.outcome;
}

export function applyPwaUpdate(): boolean {
  const waiting = updateRegistration?.waiting;
  if (!waiting) return false;
  reloadForUpdate = true;
  waiting.postMessage({ type: "SKIP_WAITING" });
  return true;
}

export async function preferLandscape(): Promise<void> {
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (orientation: "landscape") => Promise<void>;
  };
  if (!installedMode() || !orientation.lock) return;
  try {
    await orientation.lock("landscape");
  } catch {
    // iOS and some Android launchers keep orientation under user control. The
    // controller remains usable in portrait and shows its own rotate hint.
  }
}
