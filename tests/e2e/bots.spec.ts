import { expect, test, type BrowserContext } from "@playwright/test";

const PHONE_VIEWPORT = { width: 844, height: 390 };

async function configurePhone(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    localStorage.setItem(
      "blackwater.player-settings",
      JSON.stringify({
        reducedMotion: true,
        highContrast: false,
        autoPrivacy: false,
        sound: false,
      }),
    );
    localStorage.setItem("blackwater.sound-enabled", "false");
  });
}

test.describe("server-controlled rivals", () => {
  test("the host can remove a joined human while assembling the crew", async ({
    browser,
    page: host,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    const origin = baseURL ?? "http://127.0.0.1:8796";
    const contexts: BrowserContext[] = [];
    try {
      await host.goto(`${origin}/host`);
      await host
        .locator(".host-create__setting", { hasText: "Expedition seats" })
        .getByRole("button", { name: "3", exact: true })
        .click();
      await host.getByRole("button", { name: "Create expedition" }).click();
      const roomCode = (
        await host.locator(".host-nav strong").innerText()
      ).trim();

      const phoneContext = await browser.newContext({
        viewport: PHONE_VIEWPORT,
        isMobile: true,
        hasTouch: true,
      });
      contexts.push(phoneContext);
      await configurePhone(phoneContext);
      const phone = await phoneContext.newPage();
      await phone.goto(`${origin}/j/${roomCode}`);
      await phone.getByLabel("Your name").fill("Nora");
      await phone.getByRole("button", { name: "Join the survey" }).click();

      const seat = host.locator(".host-lobby__seats article", {
        hasText: "Nora",
      });
      await expect(seat).toBeVisible();
      host.once("dialog", (dialog) => dialog.accept());
      await seat.getByRole("button", { name: "Remove Nora" }).click();
      await expect(
        host.locator(".host-lobby__seats article").first(),
      ).toContainText("Open seat");
      await expect(host.locator(".host-lobby__composition")).toContainText(
        "0 humans joined",
      );
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });

  test("one human can run a complete one-seat expedition without AI", async ({
    browser,
    page: host,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    const origin = baseURL ?? "http://127.0.0.1:8796";
    const contexts: BrowserContext[] = [];
    try {
      await host.goto(`${origin}/host`);
      await host
        .locator(".host-create__setting", { hasText: "Expedition seats" })
        .getByRole("button", { name: "1", exact: true })
        .click();
      await expect(host.locator(".bot-stepper output")).toHaveText("0 AI");
      await host.getByRole("button", { name: "Create expedition" }).click();

      const roomCode = (
        await host.locator(".host-nav strong").innerText()
      ).trim();
      await expect(
        host.getByRole("button", { name: "LAN browser" }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(host.locator(".host-lobby__invite")).toContainText(
        "Works on home Wi-Fi without DNS changes",
      );
      await host.getByRole("button", { name: "HTTPS PWA" }).click();
      await expect(host.locator(".host-lobby__invite")).toContainText(
        "Requires Private DNS or local DNS",
      );
      await host.getByRole("button", { name: "LAN browser" }).click();
      await expect(host.locator(".host-lobby__composition")).toContainText(
        "0 / 1 ready · 0 humans joined · 0 AI · 1 open",
      );

      const phoneContext = await browser.newContext({
        viewport: PHONE_VIEWPORT,
        isMobile: true,
        hasTouch: true,
      });
      contexts.push(phoneContext);
      await configurePhone(phoneContext);
      const phone = await phoneContext.newPage();
      await phone.goto(`${origin}/j/${roomCode}`);
      await phone.getByLabel("Your name").fill("Solo Human");
      await phone.getByRole("button", { name: "Join the survey" }).click();
      for (let step = 0; step < 3; step += 1)
        await phone.getByRole("button", { name: "Continue" }).click();
      await phone.getByRole("button", { name: "Calibration complete" }).click();
      await expect(phone.locator(".lobby-phone__seats article")).toHaveCount(1);
      await expect(phone.locator(".lobby-phone__seats .ai-badge")).toHaveCount(
        0,
      );
      await phone.getByRole("button", { name: "Ready for the deep" }).click();

      const displayContext = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      });
      contexts.push(displayContext);
      const display = await displayContext.newPage();
      await display.goto(`${origin}/display/${roomCode}`);
      const start = host.getByRole("button", { name: "Begin calibration" });
      await expect(start).toBeEnabled();
      await start.click();

      await expect(display.locator(".expedition-card")).toHaveCount(1);
      await expect(
        phone.getByRole("button", { name: "Lock & ready" }),
      ).toBeVisible();
      await phone.getByRole("button", { name: "Lock & ready" }).click();
      await expect(
        display
          .locator(".display-metric", { hasText: "Phase" })
          .locator("strong"),
      ).toHaveText(/Resolution|Charter Check/);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });

  test("one phone can start and resolve a round against two AI rivals", async ({
    browser,
    page: host,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    const origin = baseURL ?? "http://127.0.0.1:8796";
    const contexts: BrowserContext[] = [];
    try {
      await host.goto(`${origin}/host`);
      await host
        .locator(".host-create__setting", { hasText: "Expedition seats" })
        .getByRole("button", { name: "3", exact: true })
        .click();
      await host.getByRole("button", { name: "Solo lineup" }).click();
      await expect(host.locator(".bot-stepper output")).toHaveText("2 AI");
      await host.getByRole("button", { name: "Create expedition" }).click();

      const roomCode = (
        await host.locator(".host-nav strong").innerText()
      ).trim();
      await expect(host.locator(".host-lobby__seats .ai-badge")).toHaveCount(2);
      await expect(host.locator(".host-lobby__composition")).toContainText(
        "2 / 3 ready · 0 humans joined · 2 AI · 1 open",
      );
      await host.getByRole("button", { name: "− AI" }).click();
      await expect(host.locator(".host-lobby__seats .ai-badge")).toHaveCount(1);
      await host.getByRole("button", { name: "+ AI rival" }).click();
      await expect(host.locator(".host-lobby__seats .ai-badge")).toHaveCount(2);

      const phoneContext = await browser.newContext({
        viewport: PHONE_VIEWPORT,
        isMobile: true,
        hasTouch: true,
      });
      contexts.push(phoneContext);
      await configurePhone(phoneContext);
      const phone = await phoneContext.newPage();
      await phone.goto(`${origin}/j/${roomCode}`);
      await phone.getByLabel("Your name").fill("Solo");
      await phone.getByRole("button", { name: "Join the survey" }).click();
      for (let step = 0; step < 3; step += 1)
        await phone.getByRole("button", { name: "Continue" }).click();
      await phone.getByRole("button", { name: "Calibration complete" }).click();
      await expect(phone.locator(".lobby-phone__seats .ai-badge")).toHaveCount(
        2,
      );
      await phone.getByRole("button", { name: "Ready for the deep" }).click();

      const displayContext = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      });
      contexts.push(displayContext);
      const display = await displayContext.newPage();
      await display.goto(`${origin}/display/${roomCode}`);
      const start = host.getByRole("button", { name: "Begin calibration" });
      await expect(start).toBeEnabled();
      await start.click();

      await expect(
        phone.getByRole("button", { name: "Lock & ready" }),
      ).toBeVisible();
      await expect(
        display.locator(".expedition-card", { hasText: "Manta" }),
      ).toContainText("Locked");
      await expect(
        display.locator(".expedition-card", { hasText: "Lantern" }),
      ).toContainText("Locked");
      await phone.getByRole("button", { name: "Lock & ready" }).click();
      await expect(
        display
          .locator(".display-metric", { hasText: "Phase" })
          .locator("strong"),
      ).toHaveText(/Resolution|Charter Check/);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
