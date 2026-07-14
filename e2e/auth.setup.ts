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

  const haveStorageState = fs.existsSync(STORAGE_PATH);
  const haveSessionSnapshot = fs.existsSync(SESSION_STORAGE_PATH);

  if (haveStorageState && haveSessionSnapshot) {
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
    // A PARTIAL snapshot (one file without the other — e.g. an old
    // user.json from before the sessionStorage split, or a stale cache)
    // must fail loudly: with only user.json the chromium-authed project
    // would happily load cookies while authedTest has no sessionStorage to
    // replay, so every authed spec would run logged out and bounce to
    // /auth with a confusing failure far from the real cause.
    if (haveStorageState || haveSessionSnapshot) {
      throw new Error(
        "Partial auth state in e2e/.auth/ (found " +
          (haveStorageState ? "user.json" : "session-storage.json") +
          " without its counterpart). Delete the e2e/.auth/ directory, or " +
          "set E2E_TEST_EMAIL / E2E_TEST_PASSWORD so this setup can " +
          "regenerate both files together.",
      );
    }
    setup.skip(
      true,
      "Missing E2E_TEST_EMAIL / E2E_TEST_PASSWORD and no pre-generated " +
        "e2e/.auth/ state. See e2e/README.md for safe setup instructions.",
    );
    return;
  }
  // Credentials present: fall through to a fresh login, which rewrites BOTH
  // files together (a partial snapshot is treated as stale, not reused).

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
  //
  // Record the ORIGIN we actually signed in on rather than assuming
  // E2E_BASE_URL: published hosts can 302 to the canonical custom domain
  // (e.g. *.lovable.app -> verdantgrowdiary.com), and sessionStorage is
  // origin-scoped — injecting on the configured-but-redirected origin would
  // silently leave every authed spec logged out.
  const entries = await page.evaluate(() =>
    JSON.stringify(window.sessionStorage),
  );
  const signedInOrigin = new URL(page.url()).origin;
  fs.writeFileSync(
    SESSION_STORAGE_PATH,
    JSON.stringify({ origin: signedInOrigin, entries: JSON.parse(entries) }),
  );
});
