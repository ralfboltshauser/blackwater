import { expect, test } from "@playwright/test";

test.describe("host-led crew briefing", () => {
  test("controls a reconnect-safe, couch-readable lobby deck on the TV", async ({
    browser,
    page: hostPage,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    const origin = baseURL ?? "http://127.0.0.1:8787";

    await hostPage.goto(`${origin}/host`);
    await hostPage.getByRole("button", { name: "Create expedition" }).click();
    const roomCode = (
      await hostPage.locator(".host-nav strong").innerText()
    ).trim();

    const displayContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const displayPage = await displayContext.newPage();
    try {
      await displayPage.goto(`${origin}/display/${roomCode}`);
      await expect(
        displayPage.getByRole("heading", { name: "Opening the basin" }),
      ).toBeVisible();
      await expect(
        hostPage.getByRole("button", { name: "Show briefing on TV" }),
      ).toBeEnabled();

      await hostPage
        .getByRole("button", { name: "Show briefing on TV" })
        .click();
      await expect(
        displayPage.getByRole("heading", {
          name: "A new ocean world has been detected.",
        }),
      ).toBeVisible();
      await expect(
        displayPage.getByLabel("Crew briefing slide 1 of 17"),
      ).toBeVisible();
      await expect(
        hostPage.getByRole("heading", {
          name: "A new ocean world has been detected.",
        }),
      ).toBeVisible();

      await hostPage.getByRole("button", { name: "Next" }).click();
      await expect(
        displayPage.getByRole("heading", {
          name: "Four expeditions reach the same calm waters.",
        }),
      ).toBeVisible();
      await expect(
        displayPage.getByText(/shared ocean map on the TV/i),
      ).toBeVisible();

      await hostPage.getByRole("button", { name: "Next" }).click();
      await expect(
        displayPage.getByRole("heading", {
          name: "Complete one mission shown on the TV.",
        }),
      ).toBeVisible();
      await expect(
        displayPage.locator(
          'img[src="/briefing/game-screen-objective-v1.webp"]',
        ),
      ).toBeVisible();

      await displayPage.reload();
      await expect(
        displayPage.getByRole("heading", {
          name: "Complete one mission shown on the TV.",
        }),
      ).toBeVisible();

      for (const dossier of [
        {
          slide: 5,
          title: "The Ark is your large construction ship on the TV.",
          className: "is-ark",
        },
        {
          slide: 7,
          title: "Your submarine does the secret fieldwork.",
          className: "is-submarine",
        },
        {
          slide: 8,
          title: "Build a platform when you want to invest in one location.",
          className: "is-platform",
        },
        {
          slide: 9,
          title: "Devices shape what rivals know and where they dare to move.",
          className: "is-devices",
        },
      ]) {
        await hostPage
          .getByRole("button", {
            name: new RegExp(`Go to slide ${dossier.slide}:`),
          })
          .click();
        await expect(
          displayPage.getByRole("heading", { name: dossier.title }),
        ).toBeVisible();
        await expect(
          displayPage.locator(`.briefing-dossier.${dossier.className}`),
        ).toBeVisible();
      }

      await hostPage.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur(),
      );
      await hostPage.keyboard.press("End");
      await expect(
        displayPage.getByRole("heading", {
          name: "Forecast. Plan and talk. Resolve. Check the claim.",
        }),
      ).toBeVisible();

      for (const viewport of [
        { width: 1920, height: 1080 },
        { width: 1366, height: 768 },
        { width: 1280, height: 720 },
      ]) {
        await displayPage.setViewportSize(viewport);
        const overflow = await displayPage.evaluate(() => ({
          horizontal: document.documentElement.scrollWidth - window.innerWidth,
          vertical: document.documentElement.scrollHeight - window.innerHeight,
        }));
        expect(overflow.horizontal).toBeLessThanOrEqual(1);
        expect(overflow.vertical).toBeLessThanOrEqual(1);
      }

      await hostPage
        .getByRole("button", { name: "End briefing", exact: true })
        .click();
      await expect(
        displayPage.getByRole("heading", { name: "Opening the basin" }),
      ).toBeVisible();
    } finally {
      await displayContext.close();
    }
  });
});
