#!/usr/bin/env node

import { access, copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TOOL_DIR, "../..");
const SOURCE = resolve(ROOT, "assets/source/pwa");
const OUTPUT = resolve(ROOT, "assets/generated");
const ICON_OUTPUT = resolve(OUTPUT, "pwa");
const verifyOnly = process.argv.includes("--verify-only");

const outputs = [
  ["manifest.webmanifest", resolve(OUTPUT, "manifest.webmanifest")],
  ["sw.js", resolve(OUTPUT, "sw.js")],
  ["icon-192.png", resolve(ICON_OUTPUT, "icon-192.png")],
  ["icon-512.png", resolve(ICON_OUTPUT, "icon-512.png")],
  ["icon-maskable-512.png", resolve(ICON_OUTPUT, "icon-maskable-512.png")],
  ["apple-touch-icon.png", resolve(ICON_OUTPUT, "apple-touch-icon.png")],
  ["favicon-32.png", resolve(ICON_OUTPUT, "favicon-32.png")],
];

if (verifyOnly) {
  await Promise.all(outputs.map(([, path]) => access(path)));
  const manifest = JSON.parse(
    await readFile(resolve(OUTPUT, "manifest.webmanifest"), "utf8"),
  );
  if (
    manifest.display !== "standalone" ||
    manifest.orientation !== "landscape" ||
    manifest.start_url !== "/play?source=installed"
  ) {
    throw new Error("Generated PWA manifest is missing controller defaults");
  }
  for (const [, path] of outputs.filter(([name]) => name.endsWith(".png"))) {
    const metadata = await sharp(path).metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height) {
      throw new Error(`${path} is not a valid PNG icon`);
    }
  }
  console.log(`Verified ${outputs.length} PWA outputs.`);
  process.exit(0);
}

await mkdir(ICON_OUTPUT, { recursive: true });
await rm(resolve(OUTPUT, "manifest.webmanifest"), { force: true });
await rm(resolve(OUTPUT, "sw.js"), { force: true });
await copyFile(
  resolve(SOURCE, "manifest.webmanifest"),
  resolve(OUTPUT, "manifest.webmanifest"),
);
await copyFile(resolve(SOURCE, "sw.js"), resolve(OUTPUT, "sw.js"));

const svg = await readFile(resolve(SOURCE, "icon.svg"));
const icon = (size) =>
  sharp(svg, { density: 256 })
    .resize(size, size, { fit: "fill" })
    .flatten({ background: "#03191d" })
    .png({ compressionLevel: 9, adaptiveFiltering: true });

await Promise.all([
  icon(192).toFile(resolve(ICON_OUTPUT, "icon-192.png")),
  icon(512).toFile(resolve(ICON_OUTPUT, "icon-512.png")),
  icon(512).toFile(resolve(ICON_OUTPUT, "icon-maskable-512.png")),
  icon(180).toFile(resolve(ICON_OUTPUT, "apple-touch-icon.png")),
  icon(32).toFile(resolve(ICON_OUTPUT, "favicon-32.png")),
]);

console.log(`Built ${outputs.length} PWA outputs.`);
