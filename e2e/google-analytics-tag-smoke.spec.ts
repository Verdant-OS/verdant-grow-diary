import { test, expect } from "@playwright/test";
import { grantAnalyticsConsent } from "./utils/analyticsConsent";

/**
 * Lightweight smoke: load the app once and confirm the GA4 tag is actually in
 * the live document — the script tag is in the DOM and `window.dataLayer`
 * exists as an array.
 *
 * Deliberately shallow. The deeper runtime assertions (config call, payload,
 * per-route coverage) live in
 * e2e/google-analytics-gtag-config-runtime.spec.ts.
 *
 * The outbound gtag.js request is aborted so this never sends a real analytics
 * hit or depends on network egress; the tag element and inline bootstrap are
 * present either way.
 */

import { EXPECTED_MEASUREMENT_ID as MEASUREMENT_ID } from "./utils/analyticsMeasurementId";

test.describe("GA4 tag smoke", () => {
  test("script tag and dataLayer are present after load", async ({ page }) => {
    await page.route("https://www.googletagmanager.com/**", (route) => route.abort());
    await grantAnalyticsConsent(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // 1. The gtag.js script tag exists in the document with the right id.
    const tag = page.locator(
      `script[src*="googletagmanager.com/gtag/js"][src*="${MEASUREMENT_ID}"]`,
    );
    await expect(tag).toHaveCount(1);

    // 2. The inline bootstrap ran: dataLayer is a real array and gtag is callable.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const w = window as unknown as { dataLayer?: unknown; gtag?: unknown };
          return Array.isArray(w.dataLayer) && typeof w.gtag === "function";
        }),
      )
      .toBe(true);

    // 3. dataLayer is non-empty — the bootstrap pushed, it wasn't just declared.
    expect(
      await page.evaluate(
        () => ((window as unknown as { dataLayer: unknown[] }).dataLayer ?? []).length,
      ),
    ).toBeGreaterThan(0);

    // 4. The bootstrap `config` call targets this id and suppresses the
    //    automatic initial hit, so the only page views are the explicit,
    //    path-sanitized SPA events. A `config` without send_page_view:false
    //    would emit an unsanitized view before the router ever runs.
    const configCall = await page.evaluate(() => {
      const layer = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
      const found = layer
        .map((entry) => Array.from(entry as ArrayLike<unknown>))
        .find((args) => args[0] === "config");
      return found ? JSON.parse(JSON.stringify(found)) : null;
    });

    expect(configCall).not.toBeNull();
    expect(configCall?.[1]).toBe(MEASUREMENT_ID);
    expect(configCall?.[2]).toMatchObject({ send_page_view: false });
  });
});

