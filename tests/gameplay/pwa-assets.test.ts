import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("field console PWA contract", () => {
  it("keeps the installed app reusable, standalone, and landscape-first", async () => {
    const manifest = JSON.parse(
      await readFile(
        resolve(root, "assets/source/pwa/manifest.webmanifest"),
        "utf8",
      ),
    ) as Record<string, unknown>;

    expect(manifest).toMatchObject({
      id: "/play",
      start_url: "/play?source=installed",
      scope: "/",
      display: "standalone",
      orientation: "landscape",
      background_color: "#03191d",
      theme_color: "#03191d",
    });
    expect(manifest.start_url).not.toContain("room");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", purpose: "any" }),
        expect.objectContaining({ sizes: "512x512", purpose: "any" }),
        expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
      ]),
    );
  });

  it("never lets the worker cache navigation, API, health, or realtime state", async () => {
    const worker = await readFile(
      resolve(root, "assets/source/pwa/sw.js"),
      "utf8",
    );

    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain('url.pathname.startsWith("/api/")');
    expect(worker).toContain('url.pathname.startsWith("/socket.io/")');
    expect(worker).toContain('url.pathname.startsWith("/health/")');
    expect(worker).toContain('.filter((key) => key.startsWith("blackwater-"))');
    expect(worker).not.toContain("caches.addAll");
  });

  it("links the manifest and iOS standalone metadata only from the phone entry", async () => {
    const phoneHtml = await readFile(
      resolve(root, "apps/web/play.html"),
      "utf8",
    );
    const hostHtml = await readFile(
      resolve(root, "apps/web/host.html"),
      "utf8",
    );

    expect(phoneHtml).toContain('rel="manifest"');
    expect(phoneHtml).toContain("apple-mobile-web-app-capable");
    expect(phoneHtml).toContain("apple-touch-icon");
    expect(hostHtml).not.toContain('rel="manifest"');
  });
});
