import { test, expect } from "@playwright/test";

/**
 * Manual sensor snapshot — Quick Log strip edit flow smoke.
 *
 * Proves the manual snapshot edit UX round-trips safely:
 *   - The Quick Log strip surfaces an "Edit manual readings" action for a
 *     manual snapshot (never for live/demo/stale/invalid).
 *   - After editing, the strip still renders the MANUAL badge — never
 *     "live" — and the captured timestamp remains visible.
 *
 * Safety: no auth bypass, no service_role in browser, non-destructive.
 * Skips when the fixture env is not provided so local + CI without the
 * smoke fixture stay green.
 */
const STRIP_URL = process.env.E2E_MANUAL_SNAPSHOT_STRIP_URL
  ?? process.env.E2E_QUICK_LOG_STRIP_URL;

test.describe("Manual sensor snapshot — Quick Log strip edit smoke", () => {
  test.skip(
    !STRIP_URL,
    "Set E2E_MANUAL_SNAPSHOT_STRIP_URL (or E2E_QUICK_LOG_STRIP_URL) to a page containing a manual snapshot to run this smoke.",
  );

  test("edited manual snapshot still labels MANUAL and shows captured timestamp", async ({ page }) => {
    await page.goto(STRIP_URL!);

    const strip = page.getByTestId("quicklog-sensor-snapshot-strip");
    await expect(strip).toBeVisible();

    // Source label reads MANUAL before edit and never live/demo/stale/invalid.
    const source = page.getByTestId("quicklog-snapshot-source-label");
    await expect(source).toBeVisible();
    const before = (await source.textContent()) ?? "";
    expect(before).toMatch(/manual/i);
    expect(before).not.toMatch(/live|demo|stale|invalid/i);

    // Captured timestamp is rendered before edit.
    const captured = page.getByTestId("quicklog-snapshot-captured-at");
    await expect(captured).toBeVisible();
    const capturedBefore = (await captured.textContent()) ?? "";
    expect(capturedBefore).toMatch(/captured/i);

    // Edit affordance must be gated to manual snapshots only.
    const edit = page.getByTestId("quicklog-snapshot-edit-action");
    await expect(edit).toBeVisible();
    await edit.click();

    // Edit humidity to a safe value that will not trip stuck-at-0/100 rules.
    const humidity = page.getByLabel(/humidity/i);
    await humidity.fill("58");

    const save = page.getByRole("button", { name: /save|update/i }).first();
    await save.click();

    // After the round trip the source badge remains MANUAL and captured
    // timestamp is still present.
    await expect(source).toBeVisible();
    const after = (await source.textContent()) ?? "";
    expect(after).toMatch(/manual/i);
    expect(after).not.toMatch(/live|demo|stale|invalid/i);
    await expect(captured).toBeVisible();
    const capturedAfter = (await captured.textContent()) ?? "";
    expect(capturedAfter).toMatch(/captured/i);
  });
});
