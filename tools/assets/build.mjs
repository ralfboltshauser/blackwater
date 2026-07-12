#!/usr/bin/env node

/**
 * Blackwater production asset builder.
 *
 * - trims and converts Blender PNG renders to lossless-alpha WebP;
 * - packs deterministic 2048px atlas pages with edge extrusion;
 * - generates an opaque bathymetric water foundation and lightweight flow tile;
 * - emits a manifest with hashes, pivots, trim bounds, and decoded-memory ledger;
 * - verifies alpha, dimensions, bounds, hashes, completeness, and visual budget.
 */

import { createHash } from "node:crypto";
import {
  readFile,
  writeFile,
  mkdir,
  rm,
  readdir,
  stat,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(TOOL_DIR, "../..");
const RAW_DIR = resolve(PROJECT_ROOT, "assets/generated/raw");
const OUTPUT_DIR = resolve(PROJECT_ROOT, "assets/generated");
const ATLAS_SIZE = 2048;
const EXTRUSION = 4;
const SPACING = 8;
const MAX_VISUAL_BYTES = 10 * 1024 * 1024;

const args = new Set(process.argv.slice(2));
const verifyOnly = args.has("--verify-only");

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

async function ensureDirectory(path) {
  await mkdir(path, { recursive: true });
}

async function cleanDerived() {
  for (const relative of ["sprites", "atlas", "water"]) {
    await rm(join(OUTPUT_DIR, relative), { recursive: true, force: true });
    await ensureDirectory(join(OUTPUT_DIR, relative));
  }
  for (const file of ["manifest.json", "contact-sheet.webp"]) {
    await rm(join(OUTPUT_DIR, file), { force: true });
  }
}

async function prepareSprites(renderIndex) {
  const prepared = [];
  for (const source of renderIndex.sprites) {
    const inputPath = join(RAW_DIR, source.file);
    const sourceBuffer = await readFile(inputPath);
    const metadata = await sharp(sourceBuffer).metadata();
    if (metadata.format !== "png" || !metadata.hasAlpha) {
      throw new Error(`${source.file} must be an RGBA PNG`);
    }
    if (
      metadata.width !== renderIndex.resolution[0] ||
      metadata.height !== renderIndex.resolution[1]
    ) {
      throw new Error(
        `${source.file} has unexpected dimensions ${metadata.width}x${metadata.height}`,
      );
    }

    const { data: trimmedPng, info } = await sharp(sourceBuffer)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 2 })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer({ resolveWithObject: true });

    if (info.width < 32 || info.height < 32) {
      throw new Error(`${source.file} trimmed to an implausibly small sprite`);
    }

    const trimLeft = Math.max(0, info.trimOffsetLeft ?? 0);
    const trimTop = Math.max(0, info.trimOffsetTop ?? 0);
    const webp = await sharp(trimmedPng)
      .webp({ lossless: true, effort: 6, smartSubsample: true })
      .toBuffer();
    const spriteFile = `sprites/${source.key}.webp`;
    await writeFile(join(OUTPUT_DIR, spriteFile), webp);

    const extruded = await sharp(trimmedPng)
      .extend({
        top: EXTRUSION,
        bottom: EXTRUSION,
        left: EXTRUSION,
        right: EXTRUSION,
        extendWith: "copy",
      })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();

    prepared.push({
      ...source,
      sourceSize: { width: metadata.width, height: metadata.height },
      trim: { x: trimLeft, y: trimTop, width: info.width, height: info.height },
      pivotPixels: {
        x: Math.round(source.pivot[0] * metadata.width - trimLeft),
        y: Math.round(source.pivot[1] * metadata.height - trimTop),
      },
      individual: {
        file: spriteFile,
        bytes: webp.length,
        sha256: sha256(webp),
      },
      packedWidth: info.width + EXTRUSION * 2,
      packedHeight: info.height + EXTRUSION * 2,
      extruded,
    });
  }
  return prepared;
}

function packSprites(sprites) {
  const ordered = [...sprites].sort(
    (a, b) =>
      b.packedHeight - a.packedHeight ||
      b.packedWidth - a.packedWidth ||
      a.key.localeCompare(b.key),
  );
  const pages = [];

  for (const sprite of ordered) {
    let placement = null;
    let page = null;
    for (const candidate of pages) {
      placement = candidate.place(sprite.packedWidth, sprite.packedHeight);
      if (placement) {
        page = candidate;
        break;
      }
    }
    if (!placement) {
      page = makeShelfPage(pages.length);
      pages.push(page);
      placement = page.place(sprite.packedWidth, sprite.packedHeight);
    }
    if (!placement) {
      throw new Error(`${sprite.key} cannot fit a ${ATLAS_SIZE}px page`);
    }
    sprite.pageIndex = page.index;
    sprite.packedX = placement.x;
    sprite.packedY = placement.y;
    page.sprites.push(sprite);
  }
  return pages;
}

function makeShelfPage(index) {
  const shelves = [];
  return {
    index,
    sprites: [],
    place(width, height) {
      for (const shelf of shelves) {
        if (height <= shelf.height && shelf.x + width <= ATLAS_SIZE) {
          const placement = { x: shelf.x, y: shelf.y };
          shelf.x += width + SPACING;
          return placement;
        }
      }
      const y = shelves.length
        ? shelves.at(-1).y + shelves.at(-1).height + SPACING
        : SPACING;
      if (y + height > ATLAS_SIZE || SPACING + width > ATLAS_SIZE) return null;
      shelves.push({ x: SPACING + width + SPACING, y, height });
      return { x: SPACING, y };
    },
  };
}

async function writeAtlases(pages) {
  const results = [];
  for (const page of pages) {
    const image = sharp({
      create: {
        width: ATLAS_SIZE,
        height: ATLAS_SIZE,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    }).composite(
      page.sprites.map((sprite) => ({
        input: sprite.extruded,
        left: sprite.packedX,
        top: sprite.packedY,
      })),
    );
    const buffer = await image
      .webp({ lossless: true, effort: 6, smartSubsample: true })
      .toBuffer();
    const file = `atlas/equipment-${String(page.index).padStart(2, "0")}.webp`;
    await writeFile(join(OUTPUT_DIR, file), buffer);
    results.push({
      file,
      width: ATLAS_SIZE,
      height: ATLAS_SIZE,
      bytes: buffer.length,
      decodedBytes: ATLAS_SIZE * ATLAS_SIZE * 4,
      sha256: sha256(buffer),
    });
  }
  return results;
}

function depthAt(x, y) {
  const nx = x * 2 - 1;
  const ny = y * 2 - 1;
  const broad = 0.23 * Math.sin(nx * 4.7 + Math.sin(ny * 3.1));
  const cross = 0.13 * Math.sin(ny * 7.3 - nx * 2.2);
  const rift = 0.2 * Math.sin((nx + ny * 0.45) * 10.4 + Math.sin(nx * 3.0));
  const basin = 0.42 * Math.sqrt(nx * nx * 0.42 + ny * ny * 0.7);
  const shelf = -0.22 * y;
  return 0.48 + broad + cross + rift * 0.35 + basin + shelf;
}

function deterministicNoise(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + 4.139) * 43758.5453;
  return n - Math.floor(n);
}

async function buildWater() {
  const width = 2048;
  const height = 1280;
  const pixels = Buffer.allocUnsafe(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const v = y / (height - 1);
      const depth = depthAt(u, v);
      const deep = clamp(depth, 0, 1.25) / 1.25;
      const contourPhase = Math.abs(((depth * 12 + 0.5) % 1) - 0.5) * 2;
      const contour = 1 - smoothstep(0.0, 0.085, contourPhase);
      const fine =
        deterministicNoise(Math.floor(x / 3), Math.floor(y / 3)) - 0.5;
      const caustic = Math.pow(
        Math.max(0, Math.sin(x * 0.037 + Math.sin(y * 0.021) * 2.1)),
        18,
      );
      const vignette = smoothstep(1.25, 0.15, Math.hypot(u - 0.5, v - 0.5));

      let r = 7 + (1 - deep) * 4;
      let g = 28 + (1 - deep) * 28;
      let b = 34 + (1 - deep) * 30;
      r += contour * 8 + caustic * 2 + fine * 2;
      g += contour * 23 + caustic * 8 + fine * 4;
      b += contour * 25 + caustic * 10 + fine * 5;
      const edge = 0.84 + vignette * 0.16;
      const offset = (y * width + x) * 4;
      pixels[offset] = clamp(Math.round(r * edge), 0, 255);
      pixels[offset + 1] = clamp(Math.round(g * edge), 0, 255);
      pixels[offset + 2] = clamp(Math.round(b * edge), 0, 255);
      pixels[offset + 3] = 255;
    }
  }

  const foundation = await sharp(pixels, {
    raw: { width, height, channels: 4 },
  })
    .webp({ quality: 92, effort: 6, smartSubsample: true })
    .toBuffer();
  const foundationFile = "water/water-foundation.webp";
  await writeFile(join(OUTPUT_DIR, foundationFile), foundation);

  const phone = await sharp(foundation)
    .resize(1024, 640, { kernel: sharp.kernel.lanczos3 })
    .webp({ quality: 88, effort: 6, smartSubsample: true })
    .toBuffer();
  const phoneFile = "water/water-phone.webp";
  await writeFile(join(OUTPUT_DIR, phoneFile), phone);

  const flowSize = 256;
  const flowPixels = Buffer.alloc(flowSize * flowSize * 4);
  for (let y = 0; y < flowSize; y += 1) {
    for (let x = 0; x < flowSize; x += 1) {
      const wave = Math.sin(x * 0.095 + Math.sin(y * 0.052) * 2.4);
      const ridge = Math.pow(Math.max(0, wave), 18);
      const offset = (y * flowSize + x) * 4;
      flowPixels[offset] = 98;
      flowPixels[offset + 1] = 210;
      flowPixels[offset + 2] = 205;
      flowPixels[offset + 3] = Math.round(ridge * 36);
    }
  }
  const flow = await sharp(flowPixels, {
    raw: { width: flowSize, height: flowSize, channels: 4 },
  })
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
  const flowFile = "water/water-flow.webp";
  await writeFile(join(OUTPUT_DIR, flowFile), flow);

  return {
    foundation: fileRecord(
      foundationFile,
      foundation,
      width,
      height,
      width * height * 4,
    ),
    phone: fileRecord(phoneFile, phone, 1024, 640, 1024 * 640 * 4),
    flow: fileRecord(
      flowFile,
      flow,
      flowSize,
      flowSize,
      flowSize * flowSize * 4,
    ),
  };
}

function fileRecord(file, buffer, width, height, decodedBytes) {
  return {
    file,
    width,
    height,
    bytes: buffer.length,
    decodedBytes,
    sha256: sha256(buffer),
  };
}

async function buildContactSheet(sprites, water) {
  const preferredKeys = [
    "ark-dir00",
    "submarine-dir00",
    "platform",
    "extractor",
    "sonar",
    "laboratory",
    "snare-armed",
    "decoy-deployed",
    "deep-site-a",
    "deep-site-b",
    "deep-site-c",
    "sample-pod",
    "specimen-ribbon-filter",
    "specimen-prism-raft",
    "specimen-luminous-pollen",
    "calibration-buoy",
  ];
  const selected = preferredKeys.map((key) =>
    sprites.find((sprite) => sprite.key === key),
  );
  if (selected.some((sprite) => !sprite))
    throw new Error("Contact sheet sprite selection is incomplete");

  const columns = 4;
  const cellWidth = 320;
  const cellHeight = 300;
  const rows = Math.ceil(selected.length / columns);
  const width = columns * cellWidth;
  const height = rows * cellHeight;
  const composites = [];
  const labels = [];

  for (const [index, sprite] of selected.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = column * cellWidth;
    const top = row * cellHeight;
    const image = await sharp(join(OUTPUT_DIR, sprite.individual.file))
      .resize(230, 210, { fit: "inside", withoutEnlargement: false })
      .toBuffer();
    const info = await sharp(image).metadata();
    composites.push({
      input: image,
      left: left + Math.floor((cellWidth - info.width) / 2),
      top: top + 20 + Math.floor((210 - info.height) / 2),
    });
    labels.push(
      `<rect x="${left + 10}" y="${top + 10}" width="${cellWidth - 20}" height="${cellHeight - 20}" rx="14" fill="#061b20" fill-opacity=".54" stroke="#2a6870"/>`,
      `<text x="${left + 24}" y="${top + 267}" fill="#f2f0e4" font-family="sans-serif" font-size="17" font-weight="650" letter-spacing="1">${sprite.key.toUpperCase()}</text>`,
    );
  }
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${labels.join("")}</svg>`,
  );
  composites.unshift({ input: overlay, left: 0, top: 0 });
  const buffer = await sharp(join(OUTPUT_DIR, water.foundation.file))
    .resize(width, height, { fit: "cover" })
    .composite(composites)
    .webp({ quality: 92, effort: 6, smartSubsample: true })
    .toBuffer();
  await writeFile(join(OUTPUT_DIR, "contact-sheet.webp"), buffer);
  return fileRecord(
    "contact-sheet.webp",
    buffer,
    width,
    height,
    width * height * 4,
  );
}

async function build() {
  await cleanDerived();
  const renderIndex = JSON.parse(
    await readFile(join(RAW_DIR, "render-index.json"), "utf8"),
  );
  if (
    renderIndex.schemaVersion !== 1 ||
    renderIndex.count !== renderIndex.sprites.length
  ) {
    throw new Error("Unsupported or invalid render-index.json");
  }

  const sprites = await prepareSprites(renderIndex);
  const pages = packSprites(sprites);
  const atlasPages = await writeAtlases(pages);
  const water = await buildWater();
  const contactSheet = await buildContactSheet(sprites, water);

  const manifestSprites = Object.fromEntries(
    sprites
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((sprite) => [
        sprite.key,
        {
          asset: sprite.asset,
          state: sprite.state,
          direction: sprite.direction,
          headingDegrees: sprite.headingDegrees,
          footprint: sprite.footprint,
          sourceSize: sprite.sourceSize,
          trim: sprite.trim,
          pivot: {
            normalized: sprite.pivot,
            trimmedPixels: sprite.pivotPixels,
          },
          individual: sprite.individual,
          atlas: {
            page: sprite.pageIndex,
            rect: {
              x: sprite.packedX + EXTRUSION,
              y: sprite.packedY + EXTRUSION,
              width: sprite.trim.width,
              height: sprite.trim.height,
            },
            extrudedRect: {
              x: sprite.packedX,
              y: sprite.packedY,
              width: sprite.packedWidth,
              height: sprite.packedHeight,
            },
          },
        },
      ]),
  );

  const individualBytes = sprites.reduce(
    (sum, sprite) => sum + sprite.individual.bytes,
    0,
  );
  const atlasBytes = atlasPages.reduce((sum, page) => sum + page.bytes, 0);
  const atlasDecodedBytes = atlasPages.reduce(
    (sum, page) => sum + page.decodedBytes,
    0,
  );
  const manifest = {
    schemaVersion: 1,
    pipelineVersion: 1,
    source: {
      renderer: renderIndex.renderer,
      renderResolution: renderIndex.resolution,
      renderCount: renderIndex.count,
      sharp: sharp.versions.sharp,
    },
    atlas: {
      size: ATLAS_SIZE,
      extrusion: EXTRUSION,
      spacing: SPACING,
      pages: atlasPages,
    },
    sprites: manifestSprites,
    water,
    contactSheet,
    budget: {
      individualBytes,
      atlasBytes,
      atlasDecodedBytes,
      waterBytes: Object.values(water).reduce(
        (sum, item) => sum + item.bytes,
        0,
      ),
      visualDeliveryBytes:
        individualBytes +
        atlasBytes +
        Object.values(water).reduce((sum, item) => sum + item.bytes, 0),
      maxVisualDeliveryBytes: MAX_VISUAL_BYTES,
    },
  };
  await writeFile(
    join(OUTPUT_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

async function verify() {
  const errors = [];
  const manifestPath = join(OUTPUT_DIR, "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read generated manifest: ${error.message}`);
  }
  const renderIndex = JSON.parse(
    await readFile(join(RAW_DIR, "render-index.json"), "utf8"),
  );
  const keys = Object.keys(manifest.sprites);
  if (keys.length !== renderIndex.count)
    errors.push(`Expected ${renderIndex.count} sprites, found ${keys.length}`);
  if (new Set(keys).size !== keys.length) errors.push("Duplicate sprite keys");
  if (manifest.atlas.pages.length > 3)
    errors.push(`Atlas spilled to ${manifest.atlas.pages.length} pages`);

  for (const source of renderIndex.sprites) {
    const sprite = manifest.sprites[source.key];
    if (!sprite) {
      errors.push(`Missing sprite ${source.key}`);
      continue;
    }
    const individualPath = join(OUTPUT_DIR, sprite.individual.file);
    try {
      const buffer = await readFile(individualPath);
      const metadata = await sharp(buffer).metadata();
      if (metadata.format !== "webp" || !metadata.hasAlpha)
        errors.push(`${source.key} is not alpha WebP`);
      if (
        metadata.width !== sprite.trim.width ||
        metadata.height !== sprite.trim.height
      ) {
        errors.push(`${source.key} manifest dimensions do not match file`);
      }
      if (sha256(buffer) !== sprite.individual.sha256)
        errors.push(`${source.key} hash mismatch`);
      const stats = await sharp(buffer).stats();
      const alpha = stats.channels[3];
      if (!alpha || alpha.min !== 0 || alpha.max < 240)
        errors.push(`${source.key} has invalid alpha coverage`);
    } catch (error) {
      errors.push(`${source.key}: ${error.message}`);
    }
    const rect = sprite.atlas.rect;
    if (
      rect.x < 0 ||
      rect.y < 0 ||
      rect.x + rect.width > ATLAS_SIZE ||
      rect.y + rect.height > ATLAS_SIZE
    ) {
      errors.push(`${source.key} atlas rectangle out of bounds`);
    }
  }

  for (const page of manifest.atlas.pages) {
    try {
      const buffer = await readFile(join(OUTPUT_DIR, page.file));
      const metadata = await sharp(buffer).metadata();
      if (
        metadata.width !== ATLAS_SIZE ||
        metadata.height !== ATLAS_SIZE ||
        !metadata.hasAlpha
      ) {
        errors.push(`${page.file} is not a ${ATLAS_SIZE}px alpha atlas`);
      }
      if (sha256(buffer) !== page.sha256)
        errors.push(`${page.file} hash mismatch`);
    } catch (error) {
      errors.push(`${page.file}: ${error.message}`);
    }
  }

  for (const [name, expected] of Object.entries(manifest.water)) {
    try {
      const buffer = await readFile(join(OUTPUT_DIR, expected.file));
      const metadata = await sharp(buffer).metadata();
      if (
        metadata.width !== expected.width ||
        metadata.height !== expected.height
      ) {
        errors.push(`${name} dimensions do not match manifest`);
      }
      if (sha256(buffer) !== expected.sha256)
        errors.push(`${name} hash mismatch`);
      if (name === "foundation" && metadata.hasAlpha)
        errors.push("Water foundation should be opaque");
    } catch (error) {
      errors.push(`${name}: ${error.message}`);
    }
  }

  try {
    const buffer = await readFile(join(OUTPUT_DIR, manifest.contactSheet.file));
    const metadata = await sharp(buffer).metadata();
    if (
      metadata.width !== manifest.contactSheet.width ||
      metadata.height !== manifest.contactSheet.height ||
      metadata.format !== "webp"
    ) {
      errors.push("Contact sheet dimensions or format do not match manifest");
    }
    if (sha256(buffer) !== manifest.contactSheet.sha256)
      errors.push("Contact sheet hash mismatch");
  } catch (error) {
    errors.push(`contact sheet: ${error.message}`);
  }

  if (
    manifest.budget.visualDeliveryBytes > manifest.budget.maxVisualDeliveryBytes
  ) {
    errors.push(
      `Visual delivery ${manifest.budget.visualDeliveryBytes} exceeds ${manifest.budget.maxVisualDeliveryBytes}`,
    );
  }
  if (manifest.budget.atlasDecodedBytes > 64 * 1024 * 1024) {
    errors.push("Equipment atlas decoded memory exceeds 64 MiB");
  }

  if (errors.length) {
    throw new Error(`Asset verification failed:\n- ${errors.join("\n- ")}`);
  }
  return {
    sprites: keys.length,
    atlasPages: manifest.atlas.pages.length,
    visualBytes: manifest.budget.visualDeliveryBytes,
    decodedAtlasBytes: manifest.budget.atlasDecodedBytes,
  };
}

try {
  if (!verifyOnly) await build();
  const summary = await verify();
  console.log(
    `Asset verification passed: ${summary.sprites} sprites, ${summary.atlasPages} atlas page(s), ` +
      `${(summary.visualBytes / 1024 / 1024).toFixed(2)} MiB delivered, ` +
      `${(summary.decodedAtlasBytes / 1024 / 1024).toFixed(1)} MiB decoded atlas.`,
  );
} catch (error) {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
}
