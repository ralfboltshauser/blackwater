export type FeedbackCue =
  | "tap"
  | "select"
  | "commit"
  | "unlock"
  | "warning"
  | "scan"
  | "pulse"
  | "victory";

const SOUND_KEY = "blackwater.sound-enabled";
let audioContext: AudioContext | null = null;

const cueNotes: Record<FeedbackCue, Array<[number, number, number]>> = {
  tap: [[270, 0, 0.035]],
  select: [[390, 0, 0.055]],
  commit: [
    [340, 0, 0.07],
    [510, 0.075, 0.11],
  ],
  unlock: [
    [470, 0, 0.07],
    [310, 0.07, 0.09],
  ],
  warning: [
    [180, 0, 0.12],
    [180, 0.17, 0.12],
  ],
  scan: [
    [250, 0, 0.08],
    [420, 0.08, 0.1],
    [680, 0.18, 0.13],
  ],
  pulse: [
    [160, 0, 0.18],
    [320, 0.03, 0.11],
  ],
  victory: [
    [260, 0, 0.14],
    [390, 0.14, 0.16],
    [520, 0.3, 0.2],
    [780, 0.5, 0.32],
  ],
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

export function isSoundEnabled(): boolean {
  return localStorage.getItem(SOUND_KEY) !== "false";
}

export function setSoundEnabled(enabled: boolean): void {
  localStorage.setItem(SOUND_KEY, String(enabled));
  if (!enabled && audioContext?.state === "running")
    void audioContext.suspend();
}

export async function primeAudio(): Promise<void> {
  if (!isSoundEnabled()) return;
  audioContext ??= new AudioContext({ latencyHint: "interactive" });
  if (audioContext.state === "suspended") await audioContext.resume();
}

export function playFeedback(cue: FeedbackCue): void {
  const vibration = vibrations[cue];
  if (vibration && "vibrate" in navigator) navigator.vibrate(vibration);
  if (!isSoundEnabled()) return;

  void primeAudio()
    .then(() => {
      const context = audioContext;
      if (!context || context.state !== "running") return;
      const base = context.currentTime + 0.006;
      for (const [frequency, delay, duration] of cueNotes[cue]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type =
          cue === "warning"
            ? "square"
            : cue === "victory"
              ? "triangle"
              : "sine";
        oscillator.frequency.setValueAtTime(frequency, base + delay);
        oscillator.frequency.exponentialRampToValueAtTime(
          frequency * (cue === "scan" ? 1.16 : 0.96),
          base + delay + duration,
        );
        gain.gain.setValueAtTime(0.0001, base + delay);
        gain.gain.exponentialRampToValueAtTime(
          cue === "tap" ? 0.026 : 0.055,
          base + delay + 0.012,
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, base + delay + duration);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(base + delay);
        oscillator.stop(base + delay + duration + 0.02);
      }
    })
    .catch(() => undefined);
}
