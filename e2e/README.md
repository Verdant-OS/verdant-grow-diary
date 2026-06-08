# Verdant Grow OS — Authenticated Playwright Smoke

Playwright is the source of truth for browser-level Quick Log keyboard,
focus, and post-save flows. Vitest covers deterministic component logic in
jsdom but cannot prove real Tab order or focus restoration.

## Safety guarantees

- No app-level auth bypass.
- No hardcoded credentials in the repo.
- No `service_role` or bridge tokens in browser context.
- No localStorage token injection (unless produced by a real Playwright login).
- No fake live sensor data; stale/non-usable snapshots are never attached.
- No Action Queue / device-control writes.

## Local setup

1. Install dev deps once (Playwright is *not* installed by default):

   ```bash
   bun add -D @playwright/test
   bunx playwright install chromium
   ```

2. Choose an auth strategy:

   **A. Env credentials (recommended for CI-style runs)**

   ```bash
   export E2E_TEST_EMAIL="you+e2e@example.com"
   export E2E_TEST_PASSWORD="••••••••"
   export E2E_BASE_URL="http://localhost:5173"
   export E2E_GROW_1_PLANT_URL="http://localhost:5173/plants/<grow1-plant-id>"
   export E2E_GROW_2_PLANT_NAME="505 Headbanger"
   ```

   The setup project signs in through the real `/auth` UI and writes
   `e2e/.auth/user.json` (gitignored).

   **B. Pre-generated storageState (recommended for local dev)**

   Sign in once in a normal browser session, then export the storage state
   via Playwright codegen or your own script into `e2e/.auth/user.json`.
   The setup step will reuse it as-is.

3. Run:

   ```bash
   bun run dev &           # serve the app on E2E_BASE_URL
   bunx playwright test
   ```

If neither strategy is available, the tests skip with a clear message.
There is no fallback that bypasses auth.

## Quick Log smoke checklist

Implemented in `quicklog-smoke.spec.ts`. Each step is recorded by a pure
`SmokeChecklistReporter` and printed as a pass/fail report. A JSON copy is
attached to the Playwright test result.
