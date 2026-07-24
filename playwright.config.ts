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

// CI retry policy for flake triage.
//
// A single retry (2 total attempts) is enough to distinguish a real regression
// (fails both attempts) from a flake (passes on retry) while keeping the smoke
// fast. Locally, retries stay at 0 so a failing test surfaces immediately.
// Override with PLAYWRIGHT_RETRIES for one-off deeper investigations.
const parsedRetries = Number.parseInt(process.env.PLAYWRIGHT_RETRIES ?? "", 10);
const RETRIES = Number.isFinite(parsedRetries) && parsedRetries >= 0
  ? parsedRetries
  : process.env.CI
    ? 1
    : 0;

// Trace policy.
//
// `on-first-retry` guarantees a trace zip for the retried attempt whenever a
// test fails once — that's the artifact the CI upload steps grab and the
// exact evidence needed to pinpoint a Quick Log smoke failure. Real-auth runs
// (E2E_TEST_EMAIL present) still turn tracing OFF because trace zips would
// bake the disposable test account's Supabase bearer/session tokens into a
// publicly-downloadable CI artifact; those runs rely on screenshots + video
// (pixels only, no headers) for triage.
const TRACE_MODE: "off" | "on-first-retry" | "retain-on-failure" =
  process.env.E2E_TEST_EMAIL ? "off" : "on-first-retry";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: RETRIES,
  // The list reporter feeds CI logs; the html reporter produces the
  // playwright-report/ directory that the workflow's artifact guard requires
  // and uploads. With tracing disabled on real-auth runs (see `use` below),
  // the report contains only screenshots/videos — no network headers.
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    // Debugging artifacts kept only when a test fails (CI uploads them).
    // Screenshots + videos are retained per-attempt when retries fire, so a
    // flake produces `retry1` media alongside the original attempt — both
    // land in test-results/ and are uploaded by the workflow. See TRACE_MODE
    // above for the token-safety carve-out on real-auth runs.
    trace: TRACE_MODE,
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
