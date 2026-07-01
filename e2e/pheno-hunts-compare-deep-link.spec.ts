import { test, expect } from "@playwright/test";

/**
 * /pheno-hunts/:id/compare deep-link browser regression.
 *
 * SAFETY:
 *  - The Pheno Comparison route is mounted OUTSIDE the AppShell auth
 *    wall in src/App.tsx, using fixture-only data. Deep-linking requires
 *    no auth bypass, no credentials, no tokens, no storageState.
 *  - No writes, no Supabase, no AI calls are performed by the surface.
 *  - This spec only NAVIGATES and READS the DOM.
 *
 * Assertions:
 *  - No console errors
 *  - No failed network requests
 *  - Both candidate panels render (>=2)
 *  - Six-source legend renders
 *  - Read-only / demo / not-live disclaimer renders
 *  - Missing-data flags render
 *  - No write controls render
 */

const SOURCES = ["live", "manual", "csv", "demo", "stale", "invalid"] as const;

const DEEP_LINK_ROUTES = [
  "/pheno-hunts/demo-hunt-abc/compare",
  "/pheno-hunts/00000000-0000-0000-0000-000000000000/compare",
  "/pheno-comparison",
];

for (const route of DEEP_LINK_ROUTES) {
  test(`deep-link to ${route} renders both candidate panels + legend`, async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      consoleErrors.push(err.message);
    });
    page.on("requestfailed", (req) => {
      failedRequests.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText ?? ""}`);
    });

    await page.goto(route, { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("pheno-comparison-page")).toBeVisible();
    await expect(
      page.getByTestId("pheno-comparison-read-only-badge"),
    ).toBeVisible();
    await expect(
      page.getByTestId("pheno-comparison-demo-banner"),
    ).toContainText(/not live/i);

    const legend = page.getByTestId("pheno-comparison-source-legend");
    await expect(legend).toBeVisible();
    for (const src of SOURCES) {
      await expect(legend.getByTestId(`legend-${src}`)).toBeVisible();
    }

    const grid = page.getByTestId("pheno-comparison-grid");
    await expect(grid).toBeVisible();
    const cards = grid.locator('[data-testid^="pheno-candidate-"]');
    expect(await cards.count()).toBeGreaterThanOrEqual(2);

    // Missing-data flags must render on the demo fixtures.
    await expect(
      page.getByTestId("pheno-candidate-demo-cand-bravo-no-photo"),
    ).toBeVisible();

    // No write-style controls.
    expect(await page.locator("button").count()).toBe(0);
    expect(await page.locator("form").count()).toBe(0);
    expect(await page.locator("input").count()).toBe(0);
    expect(await page.locator("textarea").count()).toBe(0);
    expect(await page.locator("select").count()).toBe(0);

    expect(consoleErrors, `console errors on ${route}`).toEqual([]);
    // Ignore favicon/etc. dev-only 404s that don't originate from the app surface.
    const relevant = failedRequests.filter(
      (r) => !/favicon|\.map($|\?)/i.test(r),
    );
    expect(relevant, `failed requests on ${route}`).toEqual([]);
  });
}
