import { test, expect, type Page } from "@playwright/test";
import { grantAnalyticsConsent } from "./utils/analyticsConsent";

/**
 * End-to-end check: the GA4 bootstrap declared in the TanStack root route head
 * (src/routes/__root.tsx) actually EXECUTES in the browser on the main app
 * routes — i.e. `gtag('config', <resolved measurement id>, { send_page_view: false })`
 * lands in `window.dataLayer`.
 *
 * The static vitest check only proves the markup exists. This proves it runs.
 *
 * SAFETY / determinism:
 *  - The external gtag.js request is aborted, so no real hit is sent to Google
 *    and the assertion never depends on network egress. The inline bootstrap
 *    defines `gtag()` and pushes to `dataLayer` independently of that script.
 *  - Public, credential-free routes only. No auth state, no writes.
 */

import { EXPECTED_MEASUREMENT_ID as MEASUREMENT_ID } from "./utils/analyticsMeasurementId";

// Public routes reachable without a session. `/` renders the signed-out
// landing surface; the others are static public pages.
const PUBLIC_ROUTES = ["/", "/pricing", "/welcome", "/quick-log"] as const;

type DataLayerEntry = unknown[];

async function readDataLayer(page: Page): Promise<DataLayerEntry[]> {
  return page.evaluate(() => {
    const layer = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
    // `dataLayer` entries are `arguments` objects; normalize to plain arrays
    // so they survive serialization across the CDP boundary.
    return layer.map((entry) => Array.from(entry as ArrayLike<unknown>));
  });
}

function findConfigCall(entries: DataLayerEntry[]): DataLayerEntry | undefined {
  return entries.find((entry) => entry[0] === "config" && entry[1] === MEASUREMENT_ID);
}

test.describe("GA4 gtag config executes on main app routes", () => {
  test.beforeEach(async ({ page }) => {
    // Block the real Google tag script: no outbound analytics hit from CI.
    await page.route("https://www.googletagmanager.com/**", (route) => route.abort());
    await grantAnalyticsConsent(page);
  });

  for (const route of PUBLIC_ROUTES) {
    test(`gtag('config', '${MEASUREMENT_ID}') runs on ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });

      await expect
        .poll(async () => Boolean(findConfigCall(await readDataLayer(page))), {
          message: `no gtag('config', '${MEASUREMENT_ID}') call reached dataLayer on ${route}`,
        })
        .toBe(true);

      const entries = await readDataLayer(page);

      // gtag('js', <Date>) must precede the config call.
      expect(entries.some((entry) => entry[0] === "js")).toBe(true);

      const configCall = findConfigCall(entries);
      expect(configCall).toBeDefined();

      // The initial automatic page view stays disabled so no raw (possibly
      // token-bearing) URL is ever sent before sanitization.
      expect(configCall?.[2]).toMatchObject({ send_page_view: false });

      // `gtag` itself must be a callable function, not just a leftover array.
      expect(
        await page.evaluate(
          () => typeof (window as unknown as { gtag?: unknown }).gtag === "function",
        ),
      ).toBe(true);
    });
  }

  test("the measurement ID is configured exactly once per document", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect
      .poll(async () => Boolean(findConfigCall(await readDataLayer(page))))
      .toBe(true);

    const entries = await readDataLayer(page);
    const configCalls = entries.filter(
      (entry) => entry[0] === "config" && entry[1] === MEASUREMENT_ID,
    );
    expect(configCalls).toHaveLength(1);
  });
});
