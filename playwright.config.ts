import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * E2E tests run against a production build (`pnpm build` first) in DEMO_MODE,
 * with the demo seed loaded. Chromium gets a fake camera/microphone and a
 * fixed geolocation so capture flows are fully testable.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    geolocation: { latitude: 52.5125, longitude: 6.0944, accuracy: 6 },
    permissions: ["geolocation", "camera", "microphone"],
    serviceWorkers: "allow",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
        },
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm start --port ${PORT}`,
        url: `${baseURL}/demo-login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { DEMO_MODE: "true", PORT: String(PORT) },
      },
});
