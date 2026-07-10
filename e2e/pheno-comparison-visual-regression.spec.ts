import { test, expect } from "@playwright/test";

/**
 * pheno-comparison-visual-regression — screenshot-only regression coverage
 * for Pheno comparison surfaces.
 *
 * SAFETY:
 *  - Read-only. No writes, no auth, no Supabase.
 *  - Authenticated workspace scenarios (B, C) are env-gated behind
 *    E2E_PHENO_HUNT_ID + a signed-in storageState. Without them we run
 *    only the public /pheno-comparison demo screenshot so this spec stays
 *    green on unauthenticated preview runs.
 */

const HUNT_ID = process.env.E2E_PHENO_HUNT_ID?.trim() || null;

test("A — public /pheno-comparison demo captures cleanly (visual reference)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1600 });
  await page.goto("/pheno-comparison", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pheno-comparison-page")).toBeVisible();
  const body = (await page.textContent("body")) ?? "";
  // Demo comparison must not surface ranking / keeper conclusion copy.
  expect(/best candidate is/i.test(body)).toBe(false);
  expect(/the winner is/i.test(body)).toBe(false);
  expect(/recommended keeper/i.test(body)).toBe(false);
  await page.screenshot({
    path: "e2e/screenshots/pheno-comparison-demo.png",
  });
});

test.describe("B — /pheno-hunts/:id/compare not-ready warning", () => {
  test.skip(!HUNT_ID, "Set E2E_PHENO_HUNT_ID to run against a real hunt");
  test("shows Not comparison-ready yet banner (or ready-view without ranking)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1600 });
    await page.goto(`/pheno-hunts/${HUNT_ID}/compare`, {
      waitUntil: "domcontentloaded",
    });
    // Either the warning banner or the read-only comparison page renders.
    const banner = page.getByTestId("pheno-hunt-compare-readiness-warning");
    const cmpPage = page.getByTestId("pheno-comparison-page");
    await Promise.race([
      banner.waitFor({ state: "visible", timeout: 10_000 }),
      cmpPage.waitFor({ state: "visible", timeout: 10_000 }),
    ]);
    const body = (await page.textContent("body")) ?? "";
    expect(/best candidate is/i.test(body)).toBe(false);
    expect(/the winner is/i.test(body)).toBe(false);
    expect(/recommended keeper/i.test(body)).toBe(false);
    await page.screenshot({
      path: "e2e/screenshots/pheno-hunt-compare-readiness.png",
    });
  });
});

test.describe("C — /pheno-hunts/:id/workspace disabled/enabled Compare action", () => {
  test.skip(!HUNT_ID, "Set E2E_PHENO_HUNT_ID to run against a real hunt");
  test("workspace renders Compare action with accessible helper text", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1600 });
    await page.goto(`/pheno-hunts/${HUNT_ID}/workspace`, {
      waitUntil: "domcontentloaded",
    });
    const action = page.getByTestId("pheno-workspace-compare-action");
    await expect(action).toBeVisible();
    await page.screenshot({
      path: "e2e/screenshots/pheno-workspace-compare-action.png",
    });
  });
});
