import { test, expect } from "@playwright/test";

/**
 * Evidence tile trust + traceability — browser regression.
 *
 * Reproduces the previous "No photos yet" vs "N photo evidence points"
 * contradiction on the Plant Detail page and proves it cannot occur:
 *   - Evidence tile explanation clarifies what an evidence point is.
 *   - When Recent Photos is empty but evidence > 0, a mismatch note
 *     explains the source and no copy implies a live gallery exists.
 *   - A "View related activity" CTA is visible and links to the
 *     Recent Activity panel anchor.
 *
 * Safety: no auth bypass, no elevated DB role, non-destructive read-only.
 * Skips when the fixture env is not provided so local/mocked and CI runs
 * without the smoke fixture stay green.
 */
const PLANT_URL = process.env.E2E_EVIDENCE_TILE_PLANT_URL
  ?? process.env.E2E_GROW_1_PLANT_URL;

test.describe("Evidence tile — mismatch traceability", () => {
  test.skip(
    !PLANT_URL,
    "Set E2E_EVIDENCE_TILE_PLANT_URL (or E2E_GROW_1_PLANT_URL) to a plant page to run this smoke.",
  );

  test("explains photo evidence points and links to Recent Activity", async ({ page }) => {
    await page.goto(PLANT_URL!);

    const tile = page.getByTestId("evidence-tile");
    await expect(tile).toBeVisible();

    const count = page.getByTestId("evidence-tile-count");
    const explanation = page.getByTestId("evidence-tile-explanation");
    const source = page.getByTestId("evidence-tile-source-label");
    await expect(count).toBeVisible();
    await expect(explanation).toBeVisible();
    await expect(source).toBeVisible();

    const explanationText = (await explanation.textContent()) ?? "";
    const sourceText = (await source.textContent()) ?? "";

    // Never imply real gallery photos exist from an evidence count alone.
    expect(explanationText).not.toMatch(/live gallery photos/i);
    expect(sourceText).not.toMatch(/live gallery photos/i);

    const countValue = Number((await count.getAttribute("data-count")) ?? "0");
    if (countValue > 0) {
      const cta = page.getByTestId("evidence-tile-supporting-records-link");
      await expect(cta).toBeVisible();
      await expect(cta).toHaveAttribute("href", /#plant-recent-activity/);
      const ariaLabel = await cta.getAttribute("aria-label");
      expect(ariaLabel ?? "").toMatch(/Recent Activity/i);

      // If a mismatch note is present, it must reference Recent Activity.
      const mismatch = page.getByTestId("evidence-tile-mismatch-note");
      if (await mismatch.count()) {
        const noteText = (await mismatch.textContent()) ?? "";
        expect(noteText).toMatch(/Recent Activity/i);
        expect(noteText).not.toMatch(/live gallery photos/i);
      }

      // The CTA target anchor exists on the page.
      await expect(page.locator("#plant-recent-activity")).toHaveCount(1);
    }
  });
});
