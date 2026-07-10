/**
 * pheno-workspace-missing-evidence-anchors — E2E coverage for missing-
 * evidence next-step anchors and the intentionally inert replication
 * readiness item.
 *
 * SAFETY / SCOPE:
 *  - Read-only. No writes, no schema, no RLS, no entitlement changes.
 *  - Env-gated per fixture; missing env skips cleanly (no fake pass).
 *  - Product rules under test:
 *      * Missing-evidence links may deep-link to a workspace anchor.
 *      * Anchor navigation MUST NOT enable Compare candidates.
 *      * replication_readiness has no workspace target — item renders as
 *        plain helper text, not an anchor/button, not tabbable to a target,
 *        cannot activate scroll, cannot change route/hash, cannot enable
 *        Compare.
 */
import { test, expect } from "./lib/authedTest";

const MISSING_ID = process.env.E2E_PHENO_HUNT_ID_MISSING_EVIDENCE?.trim() || "";
const REPLICATION_ID =
  process.env.E2E_PHENO_HUNT_ID_REPLICATION_PENDING?.trim() || "";

test.describe("missing-evidence anchors deep-link to workspace, not /compare", () => {
  test.skip(
    !MISSING_ID,
    "Set E2E_PHENO_HUNT_ID_MISSING_EVIDENCE to run anchor deep-link tests",
  );

  test("clicking a next-step link scrolls to workspace anchor; Compare stays disabled", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1600 });
    const workspaceUrl = `/pheno-hunts/${MISSING_ID}/workspace`;
    await page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });

    const action = page.getByTestId("pheno-workspace-compare-action");
    await expect(action).toBeVisible();
    await expect(action).toHaveAttribute("data-enabled", "false");

    const links = action.locator('a[data-testid^="pheno-workspace-compare-action-next-step-"]');
    const count = await links.count();
    test.skip(count === 0, "No next-step links rendered for this fixture");

    // Every next-step link must target the workspace (never /compare).
    for (let i = 0; i < count; i++) {
      const href = (await links.nth(i).getAttribute("href")) ?? "";
      expect(href).toContain(`/pheno-hunts/${MISSING_ID}/workspace`);
      expect(href.includes("/compare")).toBe(false);
    }

    const first = links.first();
    const href = (await first.getAttribute("href")) ?? "";
    const anchor = href.split("#")[1];
    expect(anchor, "next-step href should carry a #anchor").toBeTruthy();

    await first.click();
    await expect(page).toHaveURL(new RegExp(`#${anchor}$`));

    // Anchor target exists and is reachable.
    const target = page.locator(`#${anchor}`);
    await expect(target).toBeVisible();

    // Compare stays disabled.
    await expect(action).toHaveAttribute("data-enabled", "false");
    await expect(
      page.getByTestId("pheno-workspace-compare-action-disabled"),
    ).toBeDisabled();
  });
});

test.describe("replication_readiness renders inert", () => {
  test.skip(
    !REPLICATION_ID,
    "Set E2E_PHENO_HUNT_ID_REPLICATION_PENDING to run inert-item tests",
  );

  test("replication readiness has no anchor/button; cannot change route/hash or enable Compare", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1600 });
    const workspaceUrl = `/pheno-hunts/${REPLICATION_ID}/workspace`;
    await page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });

    const action = page.getByTestId("pheno-workspace-compare-action");
    await expect(action).toBeVisible();
    await expect(action).toHaveAttribute("data-enabled", "false");

    const item = action.locator(
      '[data-testid="pheno-workspace-compare-action-missing-item"][data-missing-id="replication_readiness"]',
    );
    await expect(item).toBeVisible();

    // Inert: no anchor, no href, no button, no next-step link testid.
    expect(await item.locator("a").count()).toBe(0);
    expect(await item.locator("[href]").count()).toBe(0);
    expect(await item.locator('[role="button"]').count()).toBe(0);
    expect(
      await item
        .locator('[data-testid="pheno-workspace-compare-action-next-step-replication_readiness"]')
        .count(),
    ).toBe(0);

    // Capture hash/url before interaction.
    const urlBefore = page.url();
    const hashBefore = await page.evaluate(() => window.location.hash);

    // Try to click and key into the container — must not change route.
    await item.click();
    // Focus the item and try Enter/Space (should be no-op).
    await item.focus().catch(() => {});
    await page.keyboard.press("Enter").catch(() => {});
    await page.keyboard.press("Space").catch(() => {});

    expect(page.url()).toBe(urlBefore);
    expect(await page.evaluate(() => window.location.hash)).toBe(hashBefore);

    // Compare still disabled and no /compare link.
    await expect(action).toHaveAttribute("data-enabled", "false");
    await expect(
      page.getByTestId("pheno-workspace-compare-action-disabled"),
    ).toBeDisabled();
    expect(await action.locator('a[href*="/compare"]').count()).toBe(0);
  });
});
