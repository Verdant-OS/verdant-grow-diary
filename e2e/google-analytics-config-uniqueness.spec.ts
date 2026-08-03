import { test, expect, type Page } from "@playwright/test";
import { grantAnalyticsConsent } from "./utils/analyticsConsent";

/**
 * Strict regression gate: a client-side page transition must NEVER produce an
 * additional `gtag('config', ...)` call.
 *
 * A second `config` call for the same measurement id re-arms GA4's automatic
 * page_view behaviour and can emit an unsanitized page_location before the
 * router's explicit, path-sanitized `page_view` event runs. One `config` per
 * document is the invariant; every route change after that must add only
 * `event` pushes.
 *
 * SAFETY / determinism:
 *  - The outbound gtag.js request is aborted; no real hit is sent and the
 *    assertions never depend on network egress. The inline bootstrap in
 *    src/routes/__root.tsx defines `gtag()` and `dataLayer` independently.
 *  - Public, credential-free routes only. No auth state, no writes.
 */

const MEASUREMENT_ID = "G-MCXQ9GVS5H";

// Public routes reachable without a session, walked in order and then back to
// `/` so the loop covers a repeat visit to an already-seen route.
const NAV_SEQUENCE = ["/pricing", "/welcome", "/quick-log", "/"] as const;

type DataLayerEntry = unknown[];

async function readDataLayer(page: Page): Promise<DataLayerEntry[]> {
  return page.evaluate(() => {
    const layer = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
    return layer.map((entry) => Array.from(entry as ArrayLike<unknown>));
  });
}

function configCalls(entries: DataLayerEntry[]): DataLayerEntry[] {
  return entries.filter((entry) => entry[0] === "config");
}

/** Marks the live document so a full reload (which clears it) is detectable. */
async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __gaNavSentinel?: true }).__gaNavSentinel = true;
  });
}

async function documentSurvived(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as unknown as { __gaNavSentinel?: true }).__gaNavSentinel === true,
  );
}

test.describe("GA4 config uniqueness across client-side navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("https://www.googletagmanager.com/**", (route) => route.abort());
    await grantAnalyticsConsent(page);
  });

  test("no page transition adds a second gtag('config') call", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect
      .poll(async () => configCalls(await readDataLayer(page)).length, {
        message: "bootstrap gtag('config') never reached dataLayer on /",
      })
      .toBe(1);

    const baseline = configCalls(await readDataLayer(page));
    expect(baseline[0]?.[1]).toBe(MEASUREMENT_ID);
    expect(baseline[0]?.[2]).toMatchObject({ send_page_view: false });

    await markDocument(page);

    for (const route of NAV_SEQUENCE) {
      const link = page.locator(`a[href="${route}"]`).first();

      if (await link.count()) {
        await link.click();
        await page.waitForURL((url) => url.pathname === route, { timeout: 15_000 });
      } else {
        // No in-page link on this surface: drive the SPA router directly so the
        // transition still stays client-side (no document reload).
        await page.evaluate((target) => {
          window.history.pushState({}, "", target);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }, route);
        await page.waitForURL((url) => url.pathname === route, { timeout: 15_000 });
      }

      // If the document reloaded, the "one config per document" invariant is
      // trivially satisfied and this transition proved nothing — fail loudly
      // rather than reporting a false green.
      expect(
        await documentSurvived(page),
        `navigation to ${route} caused a full document reload; the client-side transition was not exercised`,
      ).toBe(true);

      const entries = await readDataLayer(page);
      const calls = configCalls(entries);

      expect(
        calls.length,
        `navigating to ${route} produced ${calls.length} gtag('config') call(s); exactly 1 is allowed per document`,
      ).toBe(1);
      expect(calls[0]?.[1]).toBe(MEASUREMENT_ID);
      expect(calls[0]?.[2]).toMatchObject({ send_page_view: false });

      // The route change must still be reported — as an explicit page_view
      // event, never as a repeat config call.
      expect(
        entries.some((entry) => entry[0] === "event" && entry[1] === "page_view"),
        `no explicit page_view event was recorded after navigating to ${route}`,
      ).toBe(true);
    }
  });
});
