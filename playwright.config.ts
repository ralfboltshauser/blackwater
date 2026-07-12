import { defineConfig, devices } from "@playwright/test";

// Keep automated match data and server lifecycle isolated from the production
// game-night process on 8787. An explicit URL still supports CI or external runs.
const testBaseURL = process.env.BLACKWATER_TEST_URL ?? "http://127.0.0.1:8796";
const parsedTestURL = new URL(testBaseURL);
const testPort =
  parsedTestURL.port || (parsedTestURL.protocol === "https:" ? "443" : "80");
const testDataDir =
  process.env.BLACKWATER_E2E_DATA_DIR ?? `.tmp/e2e-${testPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: testBaseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: "phone-landscape",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 844, height: 390 },
        isMobile: true,
      },
    },
    {
      name: "phone-portrait",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
      },
    },
  ],
  webServer: process.env.BLACKWATER_E2E_EXTERNAL
    ? undefined
    : {
        command: `BLACKWATER_BIND=${parsedTestURL.hostname} BLACKWATER_PORT=${testPort} BLACKWATER_PUBLIC_URL=${testBaseURL} BLACKWATER_LAN_URL=${testBaseURL} BLACKWATER_ALLOWED_CIDRS=127.0.0.0/8 BLACKWATER_DATA_DIR=${testDataDir} pnpm exec tsx apps/server/src/index.ts`,
        url: `${testBaseURL}/health/ready`,
        timeout: 120_000,
        reuseExistingServer: true,
      },
});
