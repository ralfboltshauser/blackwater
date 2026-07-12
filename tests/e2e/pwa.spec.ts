import { expect, test, type BrowserContext } from "@playwright/test";

async function suppressAutomaticInstallPrompt(
  context: BrowserContext,
): Promise<void> {
  await context.addInitScript(() => {
    window.addEventListener(
      "beforeinstallprompt",
      (event) => event.stopImmediatePropagation(),
      { capture: true },
    );
  });
}

async function emulateInstalledApp(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => {
        if (
          query !== "(display-mode: standalone)" &&
          query !== "(display-mode: fullscreen)"
        ) {
          return nativeMatchMedia(query);
        }
        return {
          matches: query === "(display-mode: standalone)",
          media: query,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() {
            return true;
          },
        };
      },
    });
  });
}

test.describe("installable field console", () => {
  test("publishes a safe manifest and worker from the phone origin", async ({
    page,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    const origin = baseURL ?? "http://127.0.0.1:8796";

    await page.goto(origin + "/play");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );

    const manifestResponse = await page.request.get(
      origin + "/manifest.webmanifest",
    );
    expect(manifestResponse.ok()).toBe(true);
    expect(manifestResponse.headers()["cache-control"]).toContain("no-cache");
    expect(await manifestResponse.json()).toMatchObject({
      id: "/play",
      start_url: "/play?source=installed",
      display: "standalone",
      orientation: "landscape",
    });

    const workerResponse = await page.request.get(origin + "/sw.js");
    expect(workerResponse.ok()).toBe(true);
    expect(workerResponse.headers()["cache-control"]).toContain("no-cache");
    expect(workerResponse.headers()["service-worker-allowed"]).toBe("/");
    const worker = await workerResponse.text();
    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain('url.pathname.startsWith("/socket.io/")');

    const registration = await page.evaluate(async () => {
      const ready = await navigator.serviceWorker.ready;
      return {
        scope: ready.scope,
        script: ready.active?.scriptURL ?? "",
      };
    });
    expect(registration.scope).toBe(origin + "/");
    expect(registration.script).toBe(origin + "/sw.js");
  });

  test("teaches the manual iPhone install handoff without overflowing landscape", async ({
    context,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-landscape");
    await suppressAutomaticInstallPrompt(context);

    await page.goto("/j/ABC234");
    await expect(page.getByLabel("Room code")).toHaveValue("ABC234");
    await expect(
      page.getByRole("region", {
        name: "Install the Blackwater field console",
      }),
    ).toContainText("Lose the browser bars");
    await page.getByRole("button", { name: "How to install" }).click();
    const guide = page.getByRole("dialog", {
      name: "Install the field console",
    });
    await expect(guide).toBeVisible();
    await expect(guide).toContainText("Tap Safari’s Share button");
    await expect(guide).toContainText("ABC234");
    const closeButton = guide.locator(
      '.icon-button[aria-label="Close install instructions"]',
    );
    await expect(closeButton).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(
      guide.getByRole("button", { name: "I know what to do" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(closeButton).toBeFocused();

    const geometry = await page.evaluate(() => ({
      widthOverflow: document.documentElement.scrollWidth - innerWidth,
      heightOverflow: document.documentElement.scrollHeight - innerHeight,
      guide: document
        .querySelector(".pwa-guide__sheet")
        ?.getBoundingClientRect()
        .toJSON(),
    }));
    expect(geometry.widthOverflow).toBeLessThanOrEqual(1);
    expect(geometry.heightOverflow).toBeLessThanOrEqual(1);
    expect(geometry.guide?.left).toBeGreaterThanOrEqual(0);
    expect(geometry.guide?.right).toBeLessThanOrEqual(844);
    expect(geometry.guide?.top).toBeGreaterThanOrEqual(0);
    expect(geometry.guide?.bottom).toBeLessThanOrEqual(390);
  });

  test("shows the secure Android install path and a usable portrait fallback", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    const origin = baseURL ?? "http://127.0.0.1:8796";
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
    });
    await suppressAutomaticInstallPrompt(context);
    const page = await context.newPage();
    try {
      await page.goto(origin + "/j/DEF567");
      await page.getByRole("button", { name: "How to install" }).click();
      const guide = page.getByRole("dialog", {
        name: "Install the field console",
      });
      await expect(guide).toContainText("HTTPS address supplied by the host");
      await expect(guide).toContainText("not Create shortcut");

      await page.setViewportSize({ width: 390, height: 844 });
      const geometry = await page.evaluate(() => ({
        widthOverflow: document.documentElement.scrollWidth - innerWidth,
        guide: document
          .querySelector(".pwa-guide__sheet")
          ?.getBoundingClientRect()
          .toJSON(),
      }));
      expect(geometry.widthOverflow).toBeLessThanOrEqual(1);
      expect(geometry.guide?.left).toBeGreaterThanOrEqual(0);
      expect(geometry.guide?.right).toBeLessThanOrEqual(390);
      expect(geometry.guide?.top).toBeGreaterThanOrEqual(0);
      expect(geometry.guide?.bottom).toBeLessThanOrEqual(844);
    } finally {
      await context.close();
    }
  });

  test("cold-launches the installed app back into its cookie-backed seat", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-landscape");
    const origin = baseURL ?? "http://127.0.0.1:8796";
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
    });
    await emulateInstalledApp(context);
    const page = await context.newPage();
    try {
      const created = await context.request.post(origin + "/api/v1/matches", {
        data: {
          protocol: 1,
          playerCount: 3,
          planningSeconds: 90,
          factionsEnabled: false,
        },
      });
      expect(created.ok()).toBe(true);
      const { roomCode } = (await created.json()) as { roomCode: string };

      await page.goto(origin + "/j/" + roomCode);
      await expect(page.getByText("Full-screen console active")).toBeVisible();
      await page.getByLabel("Your name").fill("Rook");
      await page.getByRole("button", { name: "Join the survey" }).click();
      await expect(page.locator(".lobby-phone")).toBeVisible();
      await page.getByRole("button", { name: "Close calibration" }).click();

      await page.route(
        "**/api/v1/sessions/resume",
        async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 250));
          await route.continue();
        },
        { times: 1 },
      );
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await page.goto(origin + "/play?source=installed");
      await expect(
        page.getByRole("heading", { name: "Restoring your field console" }),
      ).toBeVisible();
      await expect(page.locator(".lobby-phone")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Rook", exact: true }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("escapes cold-start restoration when the LAN stops answering", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-landscape");
    const origin = baseURL ?? "http://127.0.0.1:8796";
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
    });
    await emulateInstalledApp(context);
    const page = await context.newPage();
    try {
      await page.route("**/api/v1/sessions/resume", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        await route.abort().catch(() => undefined);
      });
      await page.goto(origin + "/play?source=installed");
      await expect(
        page.getByRole("heading", { name: "Restoring your field console" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Calibrate your console" }),
      ).toBeVisible({ timeout: 6_000 });
    } finally {
      await context.close();
    }
  });
});
