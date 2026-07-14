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
// Treat an empty / whitespace-only E2E_BASE_URL the same as unset — a missing
// GitHub Actions var referenced via `env:` arrives as "" and must fall back to
// the local dev server rather than producing an empty baseURL.
const configuredBaseUrl = process.env.E2E_BASE_URL?.trim() || undefined;
const BASE_URL = configuredBaseUrl ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  // The list reporter feeds CI logs; the html reporter produces the
  // playwright-report/ directory that the workflow's artifact guard requires
  // and uploads. With tracing disabled on real-auth runs (see `use` below),
  // the report contains only screenshots/videos — no network headers.
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    // Debugging artifacts kept only when a test fails (CI uploads them).
<<<<<<< HEAD
    //
    // Traces record network request/response headers and bodies. Real-auth
    // runs (E2E_TEST_EMAIL present) would bake the disposable test account's
    // Supabase bearer/session tokens into trace zips that the workflow
    // uploads as public-ish CI artifacts — so tracing is DISABLED for those
    // runs. Screenshots and videos are pixels (no headers) and stay on.
    // Mocked/unauthenticated runs keep failure traces (no real tokens).
    trace: process.env.E2E_TEST_EMAIL ? "off" : "retain-on-failure",
=======
    trace: "retain-on-failure",
>>>>>>> origin/main
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Mocked, non-destructive specs navigate to relative routes
  // (e.g. page.goto("/auth")), so baseURL must be backed by a running app.
  // When E2E_BASE_URL points at a real deployment (authenticated smoke), we
  // skip the local server and use that deployment instead. The local dev
  // server reads the committed public client config from `.env` and needs no
  // login secrets — all Supabase traffic is intercepted in the specs.
  webServer: configuredBaseUrl
    ? undefined
    : {
        command: "bunx vite --port 5173 --strictPort",
        url: BASE_URL,
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
