import { test, expect } from "@playwright/test";

/**
 * /pheno-comparison responsive visual + layout regression.
 *
 * Renders the read-only preview at mobile (375px) and tablet (768px)
 * widths and asserts that:
 *  - the page mounts
 *  - the demo banner, confidence caveat, read-only badge, and source
 *    legend (all six sources) are visible
 *  - the candidate grid renders at least two candidates
 *  - missing-context empty states remain visible on incomplete candidates
 *  - full-page screenshots are captured for visual regression review
 *
 * Read-only: no clicks, no writes, no auth, no Supabase calls.
 */

const SOURCES = ["live", "manual", "csv", "demo", "stale", "invalid"] as const;

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 900 },
  { name: "tablet-768", width: 768, height: 1024 },
];

for (const vp of VIEWPORTS) {
  test(`/pheno-comparison renders cleanly at ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/pheno-comparison", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("pheno-comparison-page")).toBeVisible();
    await expect(
      page.getByTestId("pheno-comparison-read-only-badge"),
    ).toBeVisible();
    await expect(
      page.getByTestId("pheno-comparison-demo-banner"),
    ).toBeVisible();
    await expect(
      page.getByTestId("pheno-comparison-confidence-caveat"),
    ).toBeVisible();

    const legend = page.getByTestId("pheno-comparison-source-legend");
    await expect(legend).toBeVisible();
    for (const src of SOURCES) {
      await expect(legend.getByTestId(`legend-${src}`)).toBeVisible();
    }

    const grid = page.getByTestId("pheno-comparison-grid");
    await expect(grid).toBeVisible();
    const cards = grid.locator('[data-testid^="pheno-candidate-"]');
    expect(await cards.count()).toBeGreaterThanOrEqual(2);

    // Incomplete-candidate empty states must still be visible on both viewports.
    await expect(
      page.getByTestId("pheno-candidate-demo-cand-bravo-no-photo"),
    ).toBeVisible();
    await expect(
      page.getByTestId("pheno-candidate-demo-cand-charlie-no-photo"),
    ).toBeVisible();

    await page.screenshot({
      path: `e2e/screenshots/pheno-comparison-${vp.name}.png`,
    });
  });
}
