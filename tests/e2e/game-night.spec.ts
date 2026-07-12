import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { io as connectSocket, type Socket } from "socket.io-client";

import {
  PlayerProjectionEnvelopeSchema,
  PlayerSessionBootstrapSchema,
  type PlayerProjection,
  type PlayerSessionBootstrap,
} from "@blackwater/protocol";

const PHONE_VIEWPORT = { width: 844, height: 390 };
const PORTRAIT_VIEWPORT = { width: 390, height: 844 };
const SETTINGS = {
  reducedMotion: false,
  highContrast: false,
  autoPrivacy: false,
  sound: false,
};

type Phone = {
  context: BrowserContext;
  page: Page;
  name: string;
  bootstrap: PlayerSessionBootstrap;
};

function metric(page: Page, label: string) {
  return page.locator(".display-metric", { hasText: label }).locator("strong");
}

async function configurePrivatePhone(context: BrowserContext): Promise<void> {
  await context.addInitScript((settings) => {
    localStorage.setItem(
      "blackwater.player-settings",
      JSON.stringify(settings),
    );
    localStorage.setItem("blackwater.sound-enabled", "false");
  }, SETTINGS);
}

async function readBootstrap(
  page: Page,
  roomCode: string,
): Promise<PlayerSessionBootstrap> {
  const value = await page.evaluate((room) => {
    return sessionStorage.getItem(`blackwater.player-session.${room}`);
  }, roomCode);
  if (!value)
    throw new Error("Player bootstrap was not stored in sessionStorage");
  return PlayerSessionBootstrapSchema.parse(JSON.parse(value));
}

async function finishCalibration(page: Page): Promise<void> {
  await expect(
    page.getByRole("dialog", { name: "Equipment calibration" }),
  ).toBeVisible();
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.getByRole("button", { name: "Calibration complete" }).click();
  await expect(
    page.getByRole("dialog", { name: "Equipment calibration" }),
  ).toBeHidden();
}

async function submitAllPulses(page: Page): Promise<void> {
  const ready = page.getByRole("button", { name: "Lock & ready" });
  await expect(ready).toBeDisabled();
  for (const pulse of [1, 2, 3]) {
    await page
      .getByRole("button", { name: `Save Pulse ${pulse}`, exact: true })
      .click();
    if (pulse < 3) await expect(ready).toBeDisabled();
  }
  await expect(ready).toBeEnabled();
}

async function joinPrivatePhone(
  browser: Browser,
  baseURL: string,
  roomCode: string,
  name: string,
): Promise<Phone> {
  const context = await browser.newContext({
    viewport: PHONE_VIEWPORT,
    isMobile: true,
    hasTouch: true,
  });
  await configurePrivatePhone(context);
  const page = await context.newPage();
  await page.goto(`${baseURL}/j/${roomCode}`);
  await expect(page.getByLabel("Room code")).toHaveValue(roomCode);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Join the survey" }).click();
  await finishCalibration(page);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const bootstrap = await readBootstrap(page, roomCode);
  return { context, page, name, bootstrap };
}

async function capturePrivateProjection(
  context: BrowserContext,
  baseURL: string,
  roomCode: string,
): Promise<PlayerProjection> {
  const cookies = await context.cookies(baseURL);
  const cookie = cookies.map((item) => `${item.name}=${item.value}`).join("; ");
  return new Promise<PlayerProjection>((resolve, reject) => {
    const socket: Socket = connectSocket(baseURL, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      auth: { role: "player", roomCode },
      extraHeaders: { cookie },
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error("Timed out waiting for a private projection"));
    }, 8_000);
    socket.on("connect", () => {
      socket.emit(
        "viewer:subscribe",
        { role: "player", roomCode },
        (result: { ok: boolean; error?: string }) => {
          if (result.ok) return;
          clearTimeout(timer);
          socket.disconnect();
          reject(new Error(result.error ?? "Private subscription failed"));
        },
      );
    });
    socket.on("projection", (candidate: unknown) => {
      const parsed = PlayerProjectionEnvelopeSchema.safeParse(candidate);
      if (!parsed.success) return;
      clearTimeout(timer);
      socket.disconnect();
      resolve(parsed.data.payload);
    });
    socket.on("connect_error", (error) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(error);
    });
  });
}

async function attachFailureScreens(
  testInfo: TestInfo,
  pages: Array<{ label: string; page: Page }>,
): Promise<void> {
  await Promise.all(
    pages.map(async ({ label, page }) => {
      if (page.isClosed()) return;
      await testInfo.attach(label, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    }),
  );
}

async function runHostControl(
  hostPage: Page,
  roomCode: string,
  action: "skip-presentation",
): Promise<void> {
  const result = await hostPage.evaluate(
    async ({ room, control }) => {
      const response = await fetch(`/api/v1/matches/${room}/host/${control}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ protocol: 1 }),
      });
      return {
        ok: response.ok,
        status: response.status,
        body: await response.text(),
      };
    },
    { room: roomCode, control: action },
  );
  expect(result, result.body).toMatchObject({ ok: true, status: 200 });
}

test.describe("one-screen game night", () => {
  test("three isolated phones can complete a full match with a required TV", async ({
    browser,
    page: hostPage,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    test.setTimeout(180_000);
    const origin = baseURL ?? "http://127.0.0.1:8787";
    const ownedContexts: BrowserContext[] = [];
    const diagnosticPages: Array<{ label: string; page: Page }> = [
      { label: "host", page: hostPage },
    ];

    try {
      await hostPage.goto(`${origin}/host`);
      await expect(
        hostPage.getByRole("heading", { name: /Open a new basin survey/i }),
      ).toBeVisible();
      await hostPage
        .locator(".host-create__setting", { hasText: "Expedition seats" })
        .getByRole("button", { name: "3", exact: true })
        .click();
      await hostPage.getByRole("button", { name: "Create expedition" }).click();

      const roomCode = (
        await hostPage.locator(".host-nav strong").innerText()
      ).trim();
      expect(roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      const startButton = hostPage.getByRole("button", {
        name: "Begin calibration",
      });
      await expect(startButton).toBeDisabled();

      const phones: Phone[] = [];
      for (const name of ["Nora", "Miro", "June"]) {
        const phone = await joinPrivatePhone(browser, origin, roomCode, name);
        phones.push(phone);
        ownedContexts.push(phone.context);
        diagnosticPages.push({
          label: `phone-${name.toLowerCase()}`,
          page: phone.page,
        });
        await phone.page
          .getByRole("button", { name: "Ready for the deep" })
          .click();
        await expect(
          phone.page.getByRole("button", { name: "Not ready" }),
        ).toBeVisible();
      }

      await expect(
        hostPage.locator(".host-lobby__seats article small", {
          hasText: "Ready",
        }),
      ).toHaveCount(3);
      await expect(hostPage.locator(".host-lobby__footer")).toContainText(
        "3 / 3 ready · 3 humans joined · 0 AI",
      );
      await expect(startButton).toBeDisabled();
      await expect(
        hostPage.locator(".health-row", { hasText: "Public display" }),
      ).toContainText("Not ready");

      const displayContext = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      });
      ownedContexts.push(displayContext);
      const displayPage = await displayContext.newPage();
      diagnosticPages.push({ label: "display", page: displayPage });
      await displayPage.goto(`${origin}/display/${roomCode}`);
      await expect(
        displayPage.getByRole("heading", { name: "Expeditions assembling" }),
      ).toBeVisible();
      await expect(
        displayPage.locator(".display-lobby__expeditions article"),
      ).toHaveCount(3);
      await expect(displayPage.locator(".display-lobby__footer")).toContainText(
        roomCode,
      );
      await expect(displayPage.locator(".display-lobby__footer")).toContainText(
        "3 / 3 expeditions arrived",
      );
      await expect(
        hostPage.locator(".health-row", { hasText: "Public display" }),
      ).toContainText("Ready");
      await expect(startButton).toBeEnabled();
      await startButton.click();

      await Promise.all(
        phones.map(async ({ page }) => {
          await expect(
            page.getByRole("button", { name: "Lock & ready" }),
          ).toBeVisible({
            timeout: 12_000,
          });
          await expect(
            page.getByRole("navigation", { name: "Field console sections" }),
          ).toBeVisible();
        }),
      );
      await expect(
        displayPage.locator(".display-header__signal"),
      ).toContainText("Live");
      await expect(metric(displayPage, "Phase")).toHaveText("Open Water");
      await expect(metric(displayPage, "Round")).toHaveText("1 / 7");

      const privateViews = await Promise.all(
        phones.map((phone) =>
          capturePrivateProjection(phone.context, origin, roomCode),
        ),
      );
      for (const [index, projection] of privateViews.entries()) {
        expect(projection.seatId).toBe(phones[index]?.bootstrap.seatId);
        expect(projection.submarines.length).toBeGreaterThan(0);
        const serialized = JSON.stringify(projection);
        for (const [otherIndex, other] of privateViews.entries()) {
          if (otherIndex === index) continue;
          for (const submarine of other.submarines) {
            expect(serialized).not.toContain(submarine.assetId);
          }
        }
      }

      await phones[0]!.context.setOffline(true);
      await expect(phones[0]!.page.locator(".reconnect-banner")).toBeVisible();
      await phones[0]!.context.setOffline(false);
      await expect(phones[0]!.page.locator(".field-head__link")).toContainText(
        "Live",
      );

      const seatBeforeReload = phones[1]!.bootstrap.seatId;
      await phones[1]!.page.reload();
      await expect(
        phones[1]!.page.getByRole("button", { name: "Lock & ready" }),
      ).toBeVisible({ timeout: 12_000 });
      expect((await readBootstrap(phones[1]!.page, roomCode)).seatId).toBe(
        seatBeforeReload,
      );

      for (const [index, phone] of phones.entries()) {
        await submitAllPulses(phone.page);
        await phone.page.getByRole("button", { name: "Lock & ready" }).click();
        await expect(
          phone.page.getByRole("button", { name: "Reveal private console" }),
        ).toBeVisible();
        if (index < phones.length - 1) {
          await expect(metric(displayPage, "Locked")).toHaveText(
            `${index + 1} / 3`,
          );
        }
      }

      await expect(metric(displayPage, "Phase")).toHaveText("Resolution", {
        timeout: 12_000,
      });
      await expect(
        displayPage.locator(".pulse-track .is-active"),
      ).toContainText("Pulse 1");
      await expect(
        displayPage.locator(".pulse-track .is-active"),
      ).toContainText("Pulse 2", { timeout: 8_000 });
      await expect(
        displayPage.locator(".pulse-track .is-active"),
      ).toContainText("Pulse 3", { timeout: 8_000 });
      await expect(
        displayPage.locator(".pulse-track .is-active"),
      ).toContainText("Charter", { timeout: 8_000 });
      await expect(metric(displayPage, "Round")).toHaveText("2 / 7", {
        timeout: 8_000,
      });
      await expect(metric(displayPage, "Phase")).toHaveText("Open Water");

      for (const phone of phones) {
        const veil = phone.page.getByRole("button", {
          name: "Reveal private console",
        });
        if (await veil.isVisible()) await veil.click();
        await expect(
          phone.page.getByRole("button", { name: "Lock & ready" }),
        ).toBeVisible();
        await expect(phone.page.locator(".field-head__phase")).toContainText(
          "Round 2 / 7",
        );
      }

      await phones[2]!.page.setViewportSize(PORTRAIT_VIEWPORT);
      await expect(phones[2]!.page.locator(".rotate-hint")).toBeVisible();
      await expect(
        phones[2]!.page.getByRole("navigation", {
          name: "Field console sections",
        }),
      ).toBeVisible();
      await expect(
        phones[2]!.page.getByRole("button", { name: "Lock & ready" }),
      ).toBeVisible();
      const portraitWidth = await phones[2]!.page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(portraitWidth.scroll).toBeLessThanOrEqual(
        portraitWidth.client + 1,
      );
      await phones[2]!.page.setViewportSize(PHONE_VIEWPORT);

      for (let round = 2; round <= 7; round += 1) {
        for (const phone of phones) {
          const veil = phone.page.getByRole("button", {
            name: "Reveal private console",
          });
          if (await veil.isVisible()) await veil.click();
          await submitAllPulses(phone.page);
          await phone.page
            .getByRole("button", { name: "Lock & ready" })
            .click();
          await expect(
            phone.page.getByRole("button", {
              name: "Reveal private console",
            }),
          ).toBeVisible();
        }

        await expect(metric(displayPage, "Phase")).toHaveText("Resolution", {
          timeout: 12_000,
        });
        await runHostControl(hostPage, roomCode, "skip-presentation");

        if (round < 7) {
          await expect(metric(displayPage, "Round")).toHaveText(
            `${round + 1} / 7`,
          );
          await expect(metric(displayPage, "Phase")).toHaveText("Open Water");
        }
      }

      const victory = displayPage.getByRole("dialog", {
        name: "Expedition complete",
      });
      await expect(victory).toBeVisible({ timeout: 12_000 });
      await expect(victory).toContainText("Round cap");
      await expect(victory.locator(".victory-overlay__scores")).toBeVisible();
      expect(
        await victory.locator(".victory-overlay__winners > div").count(),
      ).toBeGreaterThan(0);

      for (const phone of phones) {
        const veil = phone.page.getByRole("button", {
          name: "Reveal private console",
        });
        if (await veil.isVisible()) await veil.click();
        const endgame = phone.page.locator(".endgame-panel");
        await expect(endgame).toBeVisible();
        await expect(endgame).toContainText(
          "Round 7 ended without a completed Charter",
        );
        await expect(endgame.locator(".fallback-scoreboard")).toBeVisible();
        await expect(endgame).toContainText("Your final private record");
      }

      const rematchPhone = phones[0]!.page;
      await rematchPhone
        .getByRole("button", { name: "Join a rematch" })
        .click();
      await expect(
        rematchPhone.getByRole("heading", { name: "Calibrate your console" }),
      ).toBeVisible();
      await expect(rematchPhone.getByLabel("Room code")).toHaveValue("");
      await expect(rematchPhone.getByLabel("Your name")).toHaveValue("Nora");
      await expect(rematchPhone).toHaveURL(/\/play\.html$/);

      await hostPage.getByRole("button", { name: "Close console" }).click();
      await expect(
        hostPage.getByRole("heading", { name: /Open a new basin survey/i }),
      ).toBeVisible();
      await hostPage
        .locator(".host-create__setting", { hasText: "Expedition seats" })
        .getByRole("button", { name: "1", exact: true })
        .click();
      await hostPage.getByRole("button", { name: "Create expedition" }).click();
      const rematchRoom = (
        await hostPage.locator(".host-nav strong").innerText()
      ).trim();
      expect(rematchRoom).not.toBe(roomCode);

      await rematchPhone.getByLabel("Room code").fill(rematchRoom);
      await rematchPhone
        .getByRole("button", { name: "Join the survey" })
        .click();
      await finishCalibration(rematchPhone);
      await rematchPhone
        .getByRole("button", { name: "Ready for the deep" })
        .click();

      await displayPage.goto(`${origin}/display/${rematchRoom}`);
      await expect(
        displayPage.getByRole("heading", { name: "Expeditions assembling" }),
      ).toBeVisible();
      const rematchStart = hostPage.getByRole("button", {
        name: "Begin calibration",
      });
      await expect(rematchStart).toBeEnabled();
      await rematchStart.click();
      const rematchReady = rematchPhone.getByRole("button", {
        name: "Lock & ready",
      });
      await expect(rematchReady).toBeVisible({ timeout: 12_000 });
      await expect(rematchReady).toBeDisabled();
      await submitAllPulses(rematchPhone);
      await rematchReady.click();
      await expect(metric(displayPage, "Phase")).toHaveText(
        /Resolution|Charter Check/,
      );
    } catch (error) {
      await attachFailureScreens(testInfo, diagnosticPages);
      throw error;
    } finally {
      await Promise.allSettled(
        ownedContexts.reverse().map((context) => context.close()),
      );
    }
  });
});

test.describe("responsive entry screens", () => {
  test("landscape phone entry stays within the viewport", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-landscape");
    await page.goto("/play");
    await expect(
      page.getByRole("heading", { name: "Calibrate your console" }),
    ).toBeVisible();
    await expect(page.getByLabel("Room code")).toBeVisible();
    const width = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
  });

  test("portrait phone entry remains fully actionable", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-portrait");
    await page.goto("/play");
    await expect(page.getByLabel("Room code")).toBeVisible();
    await expect(page.getByLabel("Your name")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Join the survey" }),
    ).toBeVisible();
    const width = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
  });
});
