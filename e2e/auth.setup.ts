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

setup("authenticate", async ({ page }) => {
  fs.mkdirSync(path.dirname(STORAGE_PATH), { recursive: true });

  if (fs.existsSync(STORAGE_PATH)) {
    setup.info().annotations.push({
      type: "auth",
      description: "Reusing existing storageState at e2e/.auth/user.json.",
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
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page
    .getByRole("button", { name: /sign in|log in|continue/i })
    .first()
    .click();

  // Wait for an authenticated landmark — any non-/auth route is sufficient.
  await expect
    .poll(() => page.url(), { timeout: 20_000 })
    .not.toContain("/auth");

  await page.context().storageState({ path: STORAGE_PATH });
});
