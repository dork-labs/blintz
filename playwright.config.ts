import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.BLINTZ_TEST_PORT || 5191);

/** A separate, disposable dev server keeps visual tests away from an operator's editor. */
export default defineConfig({
  testDir: "./browser-tests",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    reducedMotion: "reduce",
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.005, animations: "disabled" },
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `npm run dev -w bakeoff -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/playground`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
