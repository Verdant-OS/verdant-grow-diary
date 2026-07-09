import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Authenticated session bootstrap for Verdant Grow OS e2e tests.
 *
 * Strategy (in priority order):
 *   1. If e2e/.auth/user.json already exists (developer-generated storageState),
 *      we reuse it as-is. No login attempted.
 *   2. Otherwise, if E2E_TEST_EMAIL + E2E_TEST_PASSWORD are present, drive the
 *      real /auth UI to sign in, then persist storageState.
 *   3. Otherwise, skip — Playwright tests downstream will skip with a clear
 *      message. There is NO auth bypass, NO hardcoded credentials, NO
 *      elevated DB role usage, and NO token injection.
 */
const STORAGE_PATH = path.resolve("e2e/.auth/user.json");
// The app stores the Supabase session in sessionStorage (auth hardening; see
// docs/auth-security.md), which Playwright's storageState does NOT capture.
// We snapshot it separately; e2e/lib/authedTest.ts re-injects it per test.
const SESSION_STORAGE_PATH = path.resolve("e2e/.auth/session-storage.json");

setup("authenticate", async ({ page }) => {
  fs.mkdirSync(path.dirname(STORAGE_PATH), { recursive: true });

  if (fs.existsSync(STORAGE_PATH) && fs.existsSync(SESSION_STORAGE_PATH)) {
    setup.info().annotations.push({
      type: "auth",
      description:
        "Reusing existing auth state at e2e/.auth/ (user.json + session-storage.json).",
    });
    return;
  }

  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    setup.skip(
      true,
      "Missing E2E_TEST_EMAIL / E2E_TEST_PASSWORD and no pre-generated " +
        "e2e/.auth/user.json. See e2e/README.md for safe setup instructions.",
    );
    return;
  }

  await page.goto("/auth");
  // The Auth page keeps all three tab panels (sign in / create account /
  // forgot password) mounted, so label-based lookups match 3 email and 3
  // password inputs (Playwright strict-mode violation). Pin to the sign-in
  // panel's stable input ids instead.
  await page.locator("#signin-email").fill(email);
  await page.locator("#signin-password").fill(password);
  await page
    .getByRole("button", { name: /sign in|log in|continue/i })
    .first()
    .click();

  // Wait for an authenticated landmark — any non-/auth route is sufficient.
  await expect
    .poll(() => page.url(), { timeout: 20_000 })
    .not.toContain("/auth");

  await page.context().storageState({ path: STORAGE_PATH });

  // Snapshot sessionStorage (where the Supabase session actually lives) so
  // authed specs can re-inject it. Same sensitivity and lifecycle as
  // user.json: gitignored, never uploaded as an artifact.
  const sessionStorageDump = await page.evaluate(() =>
    JSON.stringify(window.sessionStorage),
  );
  fs.writeFileSync(SESSION_STORAGE_PATH, sessionStorageDump);
});
