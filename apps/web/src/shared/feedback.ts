export type FeedbackCue =
  | "tap"
  | "select"
  | "commit"
  | "unlock"
  | "warning"
  | "scan"
  | "pulse"
  | "victory";

export type MusicScene = "silent" | "briefing" | "open-water";

const SOUND_KEY = "blackwater.sound-enabled";
const AUDIO_EVENT = "blackwater:audio-state";
const cuePaths: Record<FeedbackCue, string> = {
  tap: "/audio/tap.mp3",
  select: "/audio/select.mp3",
  commit: "/audio/commit.mp3",
  unlock: "/audio/unlock.mp3",
  warning: "/audio/warning.mp3",
  scan: "/audio/scan.mp3",
  pulse: "/audio/pulse.mp3",
  victory: "/audio/victory.mp3",
};
const cueVolumes: Record<FeedbackCue, number> = {
  tap: 0.28,
  select: 0.34,
  commit: 0.44,
  unlock: 0.36,
  warning: 0.38,
  scan: 0.48,
  pulse: 0.46,
  victory: 0.56,
};
const musicPaths: Record<Exclude<MusicScene, "silent">, string> = {
  briefing: "/audio/briefing.mp3",
  "open-water": "/audio/open_water.mp3",
};
const vibrations: Partial<Record<FeedbackCue, number | number[]>> = {
  select: 8,
  commit: [18, 25, 34],
  unlock: 16,
  warning: [35, 45, 35],
  scan: [10, 35, 18],
  pulse: 24,
  victory: [30, 45, 50, 45, 90],
};

let audioContext: AudioContext | null = null;
let desiredMusic: MusicScene = "silent";
let activeMusic: HTMLAudioElement | null = null;
let activeScene: MusicScene = "silent";
let fadeFrame = 0;
const buffers = new Map<FeedbackCue, Promise<AudioBuffer>>();

function emitAudioState(): void {
  window.dispatchEvent(new Event(AUDIO_EVENT));
}

export function subscribeAudioState(listener: () => void): () => void {
  window.addEventListener(AUDIO_EVENT, listener);
  return () => window.removeEventListener(AUDIO_EVENT, listener);
}

export function isSoundEnabled(): boolean {
  return localStorage.getItem(SOUND_KEY) !== "false";
}

export function isAudioReady(): boolean {
  return Boolean(audioContext?.state === "running");
}

export function setSoundEnabled(enabled: boolean): void {
  localStorage.setItem(SOUND_KEY, String(enabled));
  if (!enabled) {
    if (audioContext?.state === "running") void audioContext.suspend();
    void fadeTo(null, 180);
  }
  emitAudioState();
}

async function loadCue(cue: FeedbackCue): Promise<AudioBuffer> {
  let pending = buffers.get(cue);
  if (!pending) {
    pending = fetch(cuePaths[cue])
      .then((response) => {
        if (!response.ok) throw new Error(`Audio ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => audioContext!.decodeAudioData(data));
    buffers.set(cue, pending);
  }
  return pending;
}

function musicFor(scene: Exclude<MusicScene, "silent">): HTMLAudioElement {
  const audio = new Audio(musicPaths[scene]);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0;
  return audio;
}

async function fadeTo(
  next: HTMLAudioElement | null,
  duration = 850,
): Promise<void> {
  const previous = activeMusic;
  if (previous === next) return;
  if (fadeFrame) cancelAnimationFrame(fadeFrame);
  if (next) {
    try {
      await next.play();
    } catch {
      emitAudioState();
      return;
    }
  }
  activeMusic = next;
  const start = performance.now();
  const from = previous?.volume ?? 0;
  const target = next ? 0.24 : 0;
  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - progress) ** 3;
    if (previous) previous.volume = Math.max(0, from * (1 - eased));
    if (next) next.volume = target * eased;
    if (progress < 1) fadeFrame = requestAnimationFrame(tick);
    else {
      fadeFrame = 0;
      if (previous && previous !== next) {
        previous.pause();
        previous.currentTime = 0;
      }
      emitAudioState();
    }
  };
  fadeFrame = requestAnimationFrame(tick);
}

async function syncMusic(): Promise<void> {
  if (!isSoundEnabled() || desiredMusic === "silent") {
    activeScene = "silent";
    await fadeTo(null);
    return;
  }
  if (desiredMusic === activeScene && activeMusic) return;
  const scene = desiredMusic;
  const next = musicFor(scene);
  await fadeTo(next);
  if (activeMusic === next) activeScene = scene;
}

export function setMusicScene(scene: MusicScene): void {
  desiredMusic = scene;
  void syncMusic();
}

export async function primeAudio(): Promise<void> {
  if (!isSoundEnabled()) return;
  audioContext ??= new AudioContext({ latencyHint: "interactive" });
  if (audioContext.state === "suspended") await audioContext.resume();
  await syncMusic();
  emitAudioState();
}

export function playFeedback(cue: FeedbackCue): void {
  const vibration = vibrations[cue];
  if (vibration && "vibrate" in navigator) navigator.vibrate(vibration);
  if (!isSoundEnabled()) return;

  void primeAudio()
    .then(async () => {
      const context = audioContext;
      if (!context || context.state !== "running") return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = await loadCue(cue);
      gain.gain.value = cueVolumes[cue];
      source.connect(gain).connect(context.destination);
      source.start();
    })
    .catch(() => undefined);
}
