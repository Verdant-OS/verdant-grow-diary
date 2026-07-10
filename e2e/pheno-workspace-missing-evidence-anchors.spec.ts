import { test, expect } from "@playwright/test";

/**
 * pheno-workspace-missing-evidence-anchors — E2E coverage for the
 * "Compare candidates" disabled surface, missing-evidence next-step
 * links, and workspace anchor scrolling.
 *
 * SAFETY:
 *  - Read-only. No writes, no auth mutations, no schema changes.
 *  - Env-gated on E2E_PHENO_HUNT_ID. Without a real incomplete hunt
 *    we cannot reliably render the disabled surface, so we skip
 *    instead of pretending to pass.
 */

const HUNT_ID = process.env.E2E_PHENO_HUNT_ID?.trim() || null;

// Known workspace anchors that map to real workspace sections.
const ANCHOR_IDS = [
  "evidence-goals",
  "candidate-labels",
  "phenotype-notes",
  "post-harvest-notes",
  "post-cure-notes",
] as const;

test.describe("Pheno workspace — missing-evidence anchors", () => {
  test.skip(!HUNT_ID, "Set E2E_PHENO_HUNT_ID to run against a real hunt");

  test("disabled Compare stays disabled and next-step links scroll workspace anchors", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1800 });
    await page.goto(`/pheno-hunts/${HUNT_ID}/workspace`, {
      waitUntil: "domcontentloaded",
    });

    const action = page.getByTestId("pheno-workspace-compare-action");
    await expect(action).toBeVisible();

    const disabledBtn = page.getByTestId(
      "pheno-workspace-compare-action-disabled",
    );
    // If the hunt is already comparison-ready in the test env, skip cleanly.
    if ((await disabledBtn.count()) === 0) {
      test.skip(true, "Test hunt is comparison-ready; no disabled surface to exercise");
    }
    await expect(disabledBtn).toBeDisabled();
    await expect(disabledBtn).toHaveAttribute("aria-disabled", "true");

    const describedBy = await disabledBtn.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const helperBefore = page.locator(`#${describedBy}`);
    const helperTextBefore = (await helperBefore.textContent()) ?? "";
    expect(helperTextBefore).toMatch(
      /Compare candidates is disabled because this hunt is not comparison-ready yet/i,
    );

    // Snapshot the disabled state.
    await page.screenshot({
      path: "e2e/screenshots/pheno-workspace-compare-disabled.png",
    });

    // For each missing-evidence next-step link that renders, click and
    // verify the URL hash + target section becomes visible.
    const nextSteps = page.locator(
      '[data-testid^="pheno-workspace-compare-action-next-step-"]',
    );
    const count = await nextSteps.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const link = nextSteps.nth(i);
      const href = await link.getAttribute("href");
      expect(href).toBeTruthy();
      expect(href!.startsWith(`/pheno-hunts/${HUNT_ID}/workspace#`)).toBe(true);
      expect(href!.includes("/compare")).toBe(false);
      const anchorId = href!.split("#")[1];
      expect(ANCHOR_IDS.includes(anchorId as (typeof ANCHOR_IDS)[number])).toBe(true);

      await link.click();
      await expect(page).toHaveURL(new RegExp(`#${anchorId}$`));
      const target = page.locator(`#${anchorId}`);
      await expect(target).toBeVisible();

      // Compare candidates action must remain disabled after anchor nav.
      await expect(disabledBtn).toBeDisabled();
      const compareAnchor = page.locator(
        `a[href="/pheno-hunts/${HUNT_ID}/compare"]`,
      );
      expect(await compareAnchor.count()).toBe(0);

      // Helper text remains present and unchanged.
      const helperText = (await helperBefore.textContent()) ?? "";
      expect(helperText).toBe(helperTextBefore);
    }

    // No ranking / verdict / keeper conclusion copy on the disabled workspace surface.
    const body = (await page.textContent("body")) ?? "";
    for (const pat of [
      /best\s+candidate\s+is/i,
      /the\s+winner\s+is/i,
      /recommended\s+keeper/i,
      /guaranteed\s+keeper/i,
      /ai\s+picks?\s+winners?/i,
    ]) {
      expect(pat.test(body)).toBe(false);
    }
  });

  test("replication_readiness item, when present, is inert (no fake link)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1800 });
    await page.goto(`/pheno-hunts/${HUNT_ID}/workspace`, {
      waitUntil: "domcontentloaded",
    });
    const inertItem = page.locator(
      '[data-testid="pheno-workspace-compare-action-missing-item"][data-missing-id="replication_readiness"]',
    );
    if ((await inertItem.count()) === 0) {
      test.skip(true, "No replication_readiness item in current fixture");
    }
    // It exists — assert no anchor and no next-step testid for it.
    expect(await inertItem.locator("a").count()).toBe(0);
    expect(
      await page
        .getByTestId(
          "pheno-workspace-compare-action-next-step-replication_readiness",
        )
        .count(),
    ).toBe(0);
  });
});
