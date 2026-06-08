import { defineConfig, devices } from "@playwright/test";

/**
 * Minimal Playwright config for Verdant Grow OS authenticated smoke tests.
 *
 * SAFETY:
 *  - No app-level auth bypass.
 *  - No hardcoded credentials.
 *  - No service_role in browser.
 *  - Uses env vars E2E_TEST_EMAIL / E2E_TEST_PASSWORD or pre-generated
 *    storageState (e2e/.auth/user.json) created locally by the user.
 *
 * Run locally:
 *   E2E_TEST_EMAIL=... E2E_TEST_PASSWORD=... E2E_BASE_URL=http://localhost:5173 \
 *     bunx playwright test
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium-authed",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
});
