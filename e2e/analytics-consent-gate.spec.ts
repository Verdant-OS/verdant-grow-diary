import { test, expect } from "@playwright/test";
import { ANALYTICS_CONSENT_STORAGE_KEY } from "./utils/analyticsConsent";
import { pointSpecAtGoogleAnalyticsCollectionHost } from "./utils/googleAnalyticsCollectionHost";

/**
 * Consent gate: no gtag.js tag, no `dataLayer`, and no `gtag()` call may exist
 * before the grower explicitly accepts. After Accept, the tag bootstraps once
 * and keeps `send_page_view: false`. After Decline, nothing loads.
 */
import { EXPECTED_MEASUREMENT_ID as MEASUREMENT_ID } from "./utils/analyticsMeasurementId";
const TAG_SELECTOR = `script[src*="googletagmanager.com/gtag/js"][src*="${MEASUREMENT_ID}"]`;
// Third-party analytics hosts, plus the PostHog SDK chunk the client imports on demand.
const ANALYTICS_REQUEST =
  /googletagmanager\.com|google-analytics\.com|analytics\.ahrefs\.com|posthog\.com|posthog-js/;

pointSpecAtGoogleAnalyticsCollectionHost(5191);

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

  // #2714: the creator beta page tells visitors "No analytics." Consent does not change that.
  test("the creator beta page loads no analytics, even after accepting", async ({ page }) => {
    const analyticsRequests: string[] = [];
    // Nothing from this run may reach a real analytics property.
    await page.route(ANALYTICS_REQUEST, (route) => route.abort());
    page.on("request", (request) => {
      if (ANALYTICS_REQUEST.test(request.url())) analyticsRequests.push(request.url());
    });
    const googleOptOut = () =>
      page.evaluate(
        (id) => (window as unknown as Record<string, unknown>)[`ga-disable-${id}`],
        MEASUREMENT_ID,
      );

    await page.goto("/creator-beta", { waitUntil: "domcontentloaded" });
    await page.getByTestId("analytics-consent-accept").click();
    await expect(page.getByTestId("analytics-consent-banner")).toHaveCount(0);
    expect(
      await page.evaluate((key) => window.localStorage.getItem(key), ANALYTICS_CONSENT_STORAGE_KEY),
    ).toBe("granted");
    // The opt-out flag is set by the same pass that would have loaded the tag.
    await expect.poll(googleOptOut).toBe(true);
    expect(await page.locator(TAG_SELECTOR).count()).toBe(0);

    // A second load starts from the saved "granted" decision.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(googleOptOut).toBe(true);
    expect(await page.locator(TAG_SELECTOR).count()).toBe(0);
    expect(
      await page.evaluate(
        () => typeof (window as unknown as { gtag?: unknown }).gtag === "function",
      ),
    ).toBe(false);
    expect(analyticsRequests).toEqual([]);

    // The saved decision still turns measurement on for a normal page.
    await page.goto("/pricing", { waitUntil: "domcontentloaded" });
    await expect(page.locator(TAG_SELECTOR)).toHaveCount(1);
  });
});
