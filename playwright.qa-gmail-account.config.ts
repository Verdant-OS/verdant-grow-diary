import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /qa-gmail-account-live\.spec\.ts/,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report-gmail-qa", open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.E2E_BASE_URL ?? "https://verdantgrowdiary-com.lovable.app",
    trace: "on",
    video: "on",
    screenshot: "only-on-failure",
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },
  outputDir: "test-results/qa-gmail-account",
  projects: [{ name: "chromium-live-qa", use: { ...devices["Desktop Chrome"] } }],
});
