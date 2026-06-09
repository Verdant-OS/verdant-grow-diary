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
  // Mocked, non-destructive specs navigate to relative routes
  // (e.g. page.goto("/auth")), so baseURL must be backed by a running app.
  // When E2E_BASE_URL points at a real deployment (authenticated smoke), we
  // skip the local server and use that deployment instead. The local dev
  // server reads the committed public client config from `.env` and needs no
  // login secrets — all Supabase traffic is intercepted in the specs.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "bunx vite --port 5173 --strictPort",
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
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
    {
      // Mocked, non-destructive specs (auth-loading and friends) that
      // intercept all /auth/v1/** + /rest/v1/** traffic via page.route().
      // They must NOT use real saved auth state or the `setup` login flow, so
      // they require no E2E_TEST_EMAIL / E2E_TEST_PASSWORD secrets.
      name: "chromium-mocked",
      use: {
        ...devices["Desktop Chrome"],
      },
      testIgnore: /auth\.setup\.ts/,
    },
  ],
});
