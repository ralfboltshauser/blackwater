import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const origin = process.env.BLACKWATER_CAPTURE_URL ?? "http://127.0.0.1:8797";
const output = resolve("docs/images");

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const hostContext = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
});
const displayContext = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const phoneContext = await browser.newContext({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
});

try {
  await phoneContext.addInitScript(() => {
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

  const host = await hostContext.newPage();
  await host.goto(`${origin}/host`);
  await host
    .locator(".host-create__setting", { hasText: "Expedition seats" })
    .getByRole("button", { name: "3", exact: true })
    .click();
  await host.getByRole("button", { name: "Solo lineup" }).click();
  await host.getByRole("button", { name: "Create expedition" }).click();
  const roomCode = (await host.locator(".host-nav strong").innerText()).trim();

  const phone = await phoneContext.newPage();
  await phone.goto(`${origin}/j/${roomCode}`);
  await phone.getByLabel("Your name").fill("Nora");
  await phone.getByRole("button", { name: "Join the survey" }).click();
  for (let step = 0; step < 3; step += 1) {
    await phone.getByRole("button", { name: "Continue" }).click();
  }
  await phone.getByRole("button", { name: "Calibration complete" }).click();
  await phone.getByRole("button", { name: "Ready for the deep" }).click();

  const display = await displayContext.newPage();
  await display.goto(`${origin}/display/${roomCode}`);
  await host.getByRole("button", { name: "Begin calibration" }).click();
  await phone.getByRole("button", { name: "SUB A", exact: true }).click();
  await phone
    .getByRole("group", { name: "Core orders" })
    .getByRole("button", { name: /Survey/ })
    .click();

  await display.locator(".display-app").waitFor({ state: "visible" });
  await phone.locator(".private-map").waitFor({ state: "visible" });
  await display.screenshot({
    path: resolve(output, "gameplay-tv.png"),
    animations: "disabled",
  });
  await phone.screenshot({
    path: resolve(output, "gameplay-phone.png"),
    animations: "disabled",
  });
} finally {
  await Promise.all([
    hostContext.close(),
    displayContext.close(),
    phoneContext.close(),
  ]);
  await browser.close();
}
