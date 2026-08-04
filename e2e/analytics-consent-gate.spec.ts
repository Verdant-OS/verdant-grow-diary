import { test, expect } from "@playwright/test";
import { ANALYTICS_CONSENT_STORAGE_KEY } from "./utils/analyticsConsent";

/**
 * Consent gate: no gtag.js tag, no `dataLayer`, and no `gtag()` call may exist
 * before the grower explicitly accepts. After Accept, the tag bootstraps once
 * and keeps `send_page_view: false`. After Decline, nothing loads.
 */
import { EXPECTED_MEASUREMENT_ID as MEASUREMENT_ID } from "./utils/analyticsMeasurementId";
const TAG_SELECTOR = `script[src*="googletagmanager.com/gtag/js"][src*="${MEASUREMENT_ID}"]`;

test.describe("analytics consent gate", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("https://www.googletagmanager.com/**", (route) => route.abort());
  });

  test("nothing analytics-related runs before consent", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("analytics-consent-banner")).toBeVisible();

    expect(await page.locator(TAG_SELECTOR).count()).toBe(0);
    const state = await page.evaluate(() => {
      const w = window as unknown as { dataLayer?: unknown; gtag?: unknown };
      return { hasDataLayer: Array.isArray(w.dataLayer), hasGtag: typeof w.gtag === "function" };
    });
    expect(state.hasDataLayer).toBe(false);
    expect(state.hasGtag).toBe(false);
  });

  test("accepting loads the tag once with send_page_view false", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByTestId("analytics-consent-accept").click();

    await expect(page.locator(TAG_SELECTOR)).toHaveCount(1);
    await expect(page.getByTestId("analytics-consent-banner")).toHaveCount(0);

    const configs = await page.evaluate(() => {
      const layer = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
      return layer
        .map((entry) => Array.from(entry as ArrayLike<unknown>))
        .filter((args) => args[0] === "config")
        .map((args) => ({ id: args[1], config: args[2] as Record<string, unknown> | undefined }));
    });
    expect(configs).toHaveLength(1);
    expect(configs[0].id).toBe(MEASUREMENT_ID);
    expect(configs[0].config?.send_page_view).toBe(false);

    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      ANALYTICS_CONSENT_STORAGE_KEY,
    );
    expect(stored).toBe("granted");
  });

  test("declining keeps analytics off and hides the banner", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByTestId("analytics-consent-decline").click();

    await expect(page.getByTestId("analytics-consent-banner")).toHaveCount(0);
    expect(await page.locator(TAG_SELECTOR).count()).toBe(0);
    expect(
      await page.evaluate(
        () => typeof (window as unknown as { gtag?: unknown }).gtag === "function",
      ),
    ).toBe(false);

    await page.goto("/pricing", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("analytics-consent-banner")).toHaveCount(0);
    expect(await page.locator(TAG_SELECTOR).count()).toBe(0);
  });

  test("granted consent persists across reloads and new tabs", async ({ page, context }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByTestId("analytics-consent-accept").click();
    await expect(page.locator(TAG_SELECTOR)).toHaveCount(1);

    await page.goto("/pricing", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("analytics-consent-banner")).toHaveCount(0);
    await expect(page.locator(TAG_SELECTOR)).toHaveCount(1);
    expect(
      await page.evaluate((key) => window.localStorage.getItem(key), ANALYTICS_CONSENT_STORAGE_KEY),
    ).toBe("granted");

    const secondTab = await context.newPage();
    await secondTab.route("https://www.googletagmanager.com/**", (route) => route.abort());
    await secondTab.goto("/", { waitUntil: "domcontentloaded" });
    await expect(secondTab.getByTestId("analytics-consent-banner")).toHaveCount(0);
    await expect(secondTab.locator(TAG_SELECTOR)).toHaveCount(1);
    await secondTab.close();
  });
});
