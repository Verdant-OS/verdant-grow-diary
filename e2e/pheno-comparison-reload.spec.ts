import { test, expect } from "@playwright/test";

/**
 * /pheno-comparison full-browser-reload E2E.
 *
 * Confirms that a real browser reload of the read-only preview surface
 * does not produce a blank page, crash, or hydration error, and that
 * core page markers remain visible after reload.
 *
 * Also fails on any uncaught page error or console error emitted during
 * the reload cycle — the preview must be crash-free.
 */
test("/pheno-comparison survives a full browser reload without crash or blank screen", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });

  await page.goto("/pheno-comparison", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pheno-comparison-page")).toBeVisible();
  await expect(page.getByTestId("pheno-comparison-grid")).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });

  // Page mounted again — not a blank body.
  await expect(page.getByTestId("pheno-comparison-page")).toBeVisible();
  await expect(page.getByTestId("pheno-comparison-grid")).toBeVisible();
  await expect(
    page.getByTestId("pheno-comparison-read-only-badge"),
  ).toBeVisible();
  await expect(
    page.getByTestId("pheno-comparison-source-legend"),
  ).toBeVisible();

  const bodyText = (await page.locator("body").innerText()).trim();
  expect(bodyText.length, "body must not be blank after reload").toBeGreaterThan(
    50,
  );

  const cards = page
    .getByTestId("pheno-comparison-grid")
    .locator('[data-testid^="pheno-candidate-"]');
  expect(await cards.count()).toBeGreaterThanOrEqual(2);

  // A second reload — belt-and-suspenders, catches HMR/state-only crashes.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pheno-comparison-page")).toBeVisible();

  expect(
    pageErrors,
    `pageerror(s) during /pheno-comparison reload: ${JSON.stringify(pageErrors, null, 2)}`,
  ).toEqual([]);
  expect(
    consoleErrors,
    `console errors during /pheno-comparison reload: ${JSON.stringify(consoleErrors, null, 2)}`,
  ).toEqual([]);
});
