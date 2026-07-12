import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const PHONE_VIEWPORT = { width: 844, height: 390 };

async function configurePhone(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    try {
      localStorage.clear();
      localStorage.setItem(
        "blackwater.player-settings",
        JSON.stringify({
          reducedMotion: false,
          highContrast: false,
          autoPrivacy: false,
          sound: false,
        }),
      );
      localStorage.setItem("blackwater.sound-enabled", "false");
    } catch {
      // about:blank has an opaque origin before the first real navigation.
    }
  });
}

async function finishCalibration(page: Page): Promise<void> {
  for (let step = 0; step < 3; step += 1)
    await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Calibration complete" }).click();
}

test.describe("progressive phone discovery", () => {
  test("teaches a small Round-1 command set, contextual help, and map gestures", async ({
    browser,
    page: host,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    test.setTimeout(75_000);
    const origin = baseURL ?? "http://127.0.0.1:8796";
    const contexts: BrowserContext[] = [];
    try {
      await host.goto(`${origin}/host`);
      await host
        .locator(".host-create__setting", { hasText: "Expedition seats" })
        .getByRole("button", { name: "1", exact: true })
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
      await phone.getByLabel("Your name").fill("Learner");
      await phone.getByRole("button", { name: "Join the survey" }).click();
      await finishCalibration(phone);
      await phone.getByRole("button", { name: "Ready for the deep" }).click();

      const displayContext = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      });
      contexts.push(displayContext);
      const display = await displayContext.newPage();
      await display.goto(`${origin}/display/${roomCode}`);
      await host.getByRole("button", { name: "Begin calibration" }).click();

      await expect(
        phone.getByText("Program one simple step at a time"),
      ).toBeVisible();
      await phone.getByRole("button", { name: "SUB A", exact: true }).click();
      const core = phone.getByRole("group", { name: "Core orders" });
      await expect(core.locator("button")).toHaveCount(4);
      await expect(core).toContainText("Glide");
      await expect(core).toContainText("Sprint");
      await expect(core).toContainText("Survey");
      await expect(core).toContainText("Hold");
      await expect(
        phone.getByText("Tactical systems calibrating"),
      ).toBeVisible();

      const sprint = core.locator("button", { hasText: "Sprint" });
      const sprintBox = await sprint.boundingBox();
      expect(sprintBox).not.toBeNull();
      await sprint.dispatchEvent("pointerdown", {
        pointerId: 41,
        pointerType: "touch",
        isPrimary: true,
        buttons: 1,
        clientX: sprintBox!.x + sprintBox!.width / 2,
        clientY: sprintBox!.y + sprintBox!.height / 2,
      });
      await expect(phone.getByRole("tooltip")).toContainText(
        "Move a submarine two edges",
        { timeout: 1_500 },
      );
      await expect(phone.locator(".pulse-editor h2")).toHaveText("Glide");
      await sprint.dispatchEvent("pointerup", {
        pointerId: 41,
        pointerType: "touch",
        isPrimary: true,
        clientX: sprintBox!.x + sprintBox!.width / 2,
        clientY: sprintBox!.y + sprintBox!.height / 2,
      });
      await sprint.dispatchEvent("click", { detail: 1 });
      await expect(phone.locator(".pulse-editor h2")).toHaveText("Glide");
      await sprint.click();
      await expect(phone.locator(".pulse-editor h2")).toHaveText("Sprint");
      await phone.getByRole("button", { name: "Explain" }).click();
      await expect(phone.locator("#selected-operation-guide")).toContainText(
        "HOW SPRINT WORKS",
      );
      await expect(phone.locator("#selected-operation-guide")).toContainText(
        "Tap a glowing two-edge destination",
      );

      const map = phone.locator(".private-map .basin-map");
      await expect(map).toHaveAttribute("role", "region");
      await phone
        .locator(".private-map .basin-map__sector-hit")
        .first()
        .dispatchEvent("click");
      const sectorDossier = phone.getByRole("dialog", {
        name: /Shelf Break/,
      });
      await expect(sectorDossier).toBeVisible();
      await expect(sectorDossier).toContainText("Public right now");
      await expect(sectorDossier).toContainText("What could be hidden");
      await expect(sectorDossier).toContainText(
        "an empty public list never proves the sector is empty",
      );
      await phone.getByRole("button", { name: "Close sector details" }).click();
      await expect(
        phone.getByRole("button", { name: "Zoom in" }),
      ).toBeVisible();
      const zoomBefore = Number(await map.getAttribute("data-camera-zoom"));
      const pinchBox = await map.boundingBox();
      expect(pinchBox).not.toBeNull();
      const pinchY = pinchBox!.y + pinchBox!.height * 0.58;
      const pinchCenterX = pinchBox!.x + pinchBox!.width * 0.5;
      await map.dispatchEvent("pointerdown", {
        pointerId: 51,
        pointerType: "touch",
        isPrimary: true,
        buttons: 1,
        clientX: pinchCenterX - 28,
        clientY: pinchY,
      });
      await map.dispatchEvent("pointerdown", {
        pointerId: 52,
        pointerType: "touch",
        isPrimary: false,
        buttons: 1,
        clientX: pinchCenterX + 28,
        clientY: pinchY,
      });
      await map.dispatchEvent("pointermove", {
        pointerId: 51,
        pointerType: "touch",
        isPrimary: true,
        buttons: 1,
        clientX: pinchCenterX - 56,
        clientY: pinchY,
      });
      await map.dispatchEvent("pointermove", {
        pointerId: 52,
        pointerType: "touch",
        isPrimary: false,
        buttons: 1,
        clientX: pinchCenterX + 56,
        clientY: pinchY,
      });
      await expect
        .poll(async () => Number(await map.getAttribute("data-camera-zoom")))
        .toBeGreaterThan(zoomBefore);
      await map.dispatchEvent("pointerup", {
        pointerId: 51,
        pointerType: "touch",
        isPrimary: true,
        clientX: pinchCenterX - 56,
        clientY: pinchY,
      });
      await map.dispatchEvent("pointerup", {
        pointerId: 52,
        pointerType: "touch",
        isPrimary: false,
        clientX: pinchCenterX + 56,
        clientY: pinchY,
      });
      await phone.getByRole("button", { name: "Reset map" }).click();
      await phone.getByRole("button", { name: "Zoom in" }).click();
      await expect
        .poll(async () => Number(await map.getAttribute("data-camera-zoom")))
        .toBeGreaterThan(zoomBefore);

      const mapBounds = await map.boundingBox();
      expect(mapBounds).not.toBeNull();
      const enabledTargets = map.locator(
        ".basin-map__node.is-reachable .basin-map__sector-hit",
      );
      let target = enabledTargets.first();
      for (let index = 0; index < (await enabledTargets.count()); index += 1) {
        const candidate = enabledTargets.nth(index);
        const bounds = await candidate.boundingBox();
        if (
          bounds &&
          bounds.x + bounds.width / 2 > mapBounds!.x + 4 &&
          bounds.x + bounds.width / 2 < mapBounds!.x + mapBounds!.width - 4 &&
          bounds.y + bounds.height / 2 > mapBounds!.y + 4 &&
          bounds.y + bounds.height / 2 < mapBounds!.y + mapBounds!.height - 4
        ) {
          target = candidate;
          break;
        }
      }
      await phone.waitForTimeout(450);
      await target.click();
      await expect(phone.getByRole("dialog")).toBeVisible();
      await phone.getByRole("button", { name: "Close sector details" }).click();
      await expect(map.locator(".basin-map__node.is-selected")).toHaveCount(1);
      const selectedBeforeDrag = await map
        .locator(".basin-map__node.is-selected")
        .getAttribute("transform");

      const camera = map.locator(".basin-map__camera");
      const mapBox = await map.boundingBox();
      expect(mapBox).not.toBeNull();
      const transformBefore = await camera.evaluate(
        (element) => getComputedStyle(element).transform,
      );
      await phone.mouse.move(
        mapBox!.x + mapBox!.width * 0.45,
        mapBox!.y + mapBox!.height * 0.62,
      );
      await phone.mouse.down();
      await phone.mouse.move(
        mapBox!.x + mapBox!.width * 0.68,
        mapBox!.y + mapBox!.height * 0.47,
        { steps: 4 },
      );
      const transformDuringDrag = await camera.evaluate(
        (element) => getComputedStyle(element).transform,
      );
      expect(transformDuringDrag).not.toBe(transformBefore);
      await phone.mouse.up();
      await expect(map.locator(".basin-map__node.is-selected")).toHaveCount(1);
      await expect(map.locator(".basin-map__node.is-selected")).toHaveAttribute(
        "transform",
        selectedBeforeDrag!,
      );
      await phone.getByRole("button", { name: "Reset map" }).click();

      const widths = await phone.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);

      await phone.setViewportSize({ width: 390, height: 844 });
      await expect(map).toBeVisible();
      await expect(
        phone.getByRole("button", { name: "Zoom in" }),
      ).toBeVisible();
      const portrait = await phone.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        return {
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          scrollY: window.scrollY,
        };
      });
      expect(portrait.scrollWidth).toBeLessThanOrEqual(
        portrait.clientWidth + 1,
      );
      expect(portrait.scrollY).toBeGreaterThan(0);
      await phone.setViewportSize(PHONE_VIEWPORT);
      await phone.evaluate(() => window.scrollTo(0, 0));

      await core.getByText("Hold", { exact: true }).locator("..").click();
      await phone.getByRole("button", { name: "Lock & ready" }).click();
      await expect(
        display
          .locator(".display-metric", { hasText: "Phase" })
          .locator("strong"),
      ).toHaveText("Resolution", { timeout: 12_000 });
      const skipResult = await host.evaluate(async (room) => {
        const response = await fetch(
          `/api/v1/matches/${room}/host/skip-presentation`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ protocol: 1 }),
          },
        );
        return response.ok;
      }, roomCode);
      expect(skipResult).toBe(true);
      const veil = phone.getByRole("button", {
        name: "Reveal private console",
      });
      if (await veil.isVisible()) await veil.click();
      await expect(
        phone.getByText("Tactical systems are now online"),
      ).toBeVisible({ timeout: 12_000 });
      await phone.getByRole("button", { name: "SUB A", exact: true }).click();
      const tacticsToggle = phone.getByRole("button", {
        name: /Tactical systems.*tools/i,
      });
      await tacticsToggle.click();
      const tactics = phone.getByRole("group", { name: "Tactical orders" });
      await expect(tactics).toContainText("Deploy");
      await expect(tactics).toContainText("Go Dark");
      await expect(tactics).toContainText("Hunt");
      await expect(tactics).toContainText("Screen");
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
