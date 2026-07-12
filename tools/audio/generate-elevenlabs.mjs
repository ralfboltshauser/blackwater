import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) throw new Error("ELEVENLABS_API_KEY is required");

const output = resolve("assets/generated/audio");
const run = promisify(execFile);
await mkdir(output, { recursive: true });

async function saveNormalized(name, audio, loudness) {
  const destination = resolve(output, `${name}.mp3`);
  const raw = resolve(output, `${name}.raw.mp3`);
  await writeFile(raw, audio);
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    raw,
    "-af",
    `loudnorm=I=${loudness}:TP=-2:LRA=8`,
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "128k",
    destination,
  ]);
  await rm(raw);
}

const effects = {
  tap: [
    0.5,
    "Minimal futuristic tactile UI tap, tiny damped glass-and-water droplet click, clean and satisfying, no reverb tail, no voice, one-shot",
  ],
  select: [
    0.7,
    "Elegant alien ocean research console selection sound, soft sonar droplet with a precise crystalline tick, subtle, premium sci-fi UI, no voice, one-shot",
  ],
  commit: [
    1.25,
    "Satisfying futuristic command confirmation, two-stage mechanical seal followed by a warm low sonar bloom, confident not aggressive, alien ocean expedition, no voice",
  ],
  unlock: [
    0.9,
    "Futuristic magnetic lock releasing underwater, short descending crystalline chirp and soft mechanical release, clean premium game UI, no voice",
  ],
  warning: [
    1.2,
    "Restrained alien research vessel warning, two low sonar knocks with a muted electronic edge, urgent but not alarming or harsh, no voice",
  ],
  scan: [
    1.8,
    "Deep ocean active sonar scan, focused pulse expanding through vast alien water, delicate rising data shimmer returns, cinematic but concise, no voice",
  ],
  pulse: [
    1.5,
    "Round phase transition on an alien ocean command ship, deep hydrophone thump, smooth pressure whoosh, crisp sonar resolve, cinematic game UI, no voice",
  ],
  victory: [
    3.8,
    "Scientific breakthrough victory sting on an alien ocean planet, luminous synth chord rising from deep sonar harmonics, hopeful awe, elegant and restrained, no drums, no voice",
  ],
};

async function request(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`${response.status} ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer());
}

for (const [name, [duration_seconds, text]] of Object.entries(effects)) {
  const audio = await request(
    "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",
    {
      text,
      duration_seconds,
      prompt_influence: 0.55,
      model_id: "eleven_text_to_sound_v2",
    },
  );
  await saveNormalized(name, audio, -18);
  process.stdout.write(`generated ${name}.mp3 (${audio.length} bytes)\n`);
}

const music = {
  briefing: {
    music_length_ms: 60000,
    prompt:
      "Instrumental cinematic ambient score for discovering Neris, an alien ocean planet beneath permanent storm clouds. Awe, mystery, scientific optimism, deep hydrophone textures, distant glass harmonics, slow warm analog synth chords, subtle sonar motifs. Spacious and elegant, no vocals, no horror, no trailer braams, no loud percussion, no abrupt ending. Background music for a spoken board-game briefing, restrained dynamics and a calm seamless-feeling ending.",
  },
  open_water: {
    music_length_ms: 90000,
    prompt:
      "Instrumental strategic sci-fi ambient music for rival research expeditions exploring an alien ocean. Quiet tension, patient forward motion, deep ocean drones, soft modular synth pulses, hydrophone clicks, restrained low percussion, occasional luminous discovery motif. Sophisticated and immersive, no vocals, no horror, no bombast, no dominant melody, no abrupt transitions. Background game music that supports conversation and loops naturally.",
  },
};

for (const [name, spec] of Object.entries(music)) {
  const audio = await request(
    "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128",
    {
      ...spec,
      model_id: "music_v1",
      force_instrumental: true,
      sign_with_c2pa: false,
    },
  );
  await saveNormalized(name, audio, -21);
  process.stdout.write(`generated ${name}.mp3 (${audio.length} bytes)\n`);
}
