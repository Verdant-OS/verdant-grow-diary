import { test, expect } from "@playwright/test";
import {
  validateFixtureEnv,
  pageTextMatchesFixture,
} from "./lib/fixtureSafety";

/**
 * Disposable E2E fixture safety check.
 *
 * Must pass before the Quick Log Playwright smoke is allowed to run.
 *
 * SAFETY:
 *   - no destructive write operations
 *   - never overwrites grow/tent/plant names
 *   - no elevated DB role
 *   - never bypasses auth (relies on the normal storageState from auth.setup.ts)
 *   - hard-fails if the target plant/grow/tent is not clearly a disposable
 *     E2E fixture owned by a dedicated test account
 */
test("disposable E2E fixture is configured and visible on the target plant page", async ({
  page,
}) => {
  const env = {
    E2E_FIXTURE_MODE: process.env.E2E_FIXTURE_MODE,
    E2E_GROW_1_PLANT_URL: process.env.E2E_GROW_1_PLANT_URL,
    E2E_FIXTURE_EXPECTED_GROW_NAME:
      process.env.E2E_FIXTURE_EXPECTED_GROW_NAME,
    E2E_FIXTURE_EXPECTED_TENT_NAME:
      process.env.E2E_FIXTURE_EXPECTED_TENT_NAME,
    E2E_FIXTURE_EXPECTED_PLANT_NAME:
      process.env.E2E_FIXTURE_EXPECTED_PLANT_NAME,
  };

  const envCheck = validateFixtureEnv(env);
  expect(
    envCheck.ok,
    `Fixture env validation failed:\n - ${envCheck.errors.join("\n - ")}`,
  ).toBe(true);

  await page.goto(env.E2E_GROW_1_PLANT_URL!);

  // Confirm we are not bounced back to /auth.
  await expect
    .poll(() => page.url(), { timeout: 20_000 })
    .not.toContain("/auth");

  const bodyText = (await page.locator("body").innerText()).slice(0, 50_000);
  const pageCheck = pageTextMatchesFixture(bodyText, envCheck.expected, {
    accountHint: process.env.E2E_FIXTURE_EXPECTED_ACCOUNT_HINT,
  });
  expect(
    pageCheck.ok,
    `Target page does not look like a disposable E2E fixture:\n - ${pageCheck.errors.join("\n - ")}`,
  ).toBe(true);
});
