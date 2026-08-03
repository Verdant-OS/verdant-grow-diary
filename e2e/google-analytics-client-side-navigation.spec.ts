import { test, expect, type Page } from "@playwright/test";

/**
 * End-to-end check: client-side (SPA) navigation between key public routes
 * never re-runs or mutates the GA4 bootstrap. The single
 * `gtag('config', 'G-MCXQ9GVS5H', { send_page_view: false })` call must stay
 * exactly one call, and must keep `send_page_view: false`, across transitions.
 *
 * Why this matters: if a transition caused a full document reload, or if any
 * route re-issued `config` without the suppression flag, GA would start
 * sending automatic (unsanitized, possibly token-bearing) page views again.
 * Explicit `page_view` events are emitted separately by
 * `useGoogleAnalyticsPageViews`; this spec does not assert on those.
 *
 * SAFETY / determinism:
 *  - The real gtag.js request is aborted: no outbound hit from CI.
 *  - Public, credential-free routes only. No auth state, no writes.
 */

const MEASUREMENT_ID = "G-MCXQ9GVS5H";

// Public routes reachable without a session, linked from the public chrome.
const NAVIGATION_PATH = ["/pricing", "/welcome", "/quick-log", "/"] as const;

type DataLayerEntry = unknown[];

async function readDataLayer(page: Page): Promise<DataLayerEntry[]> {
  return page.evaluate(() => {
    const layer = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
    return layer.map((entry) => Array.from(entry as ArrayLike<unknown>));
  });
}

function configCalls(entries: DataLayerEntry[]): DataLayerEntry[] {
  return entries.filter((entry) => entry[0] === "config" && entry[1] === MEASUREMENT_ID);
}

/**
 * Navigate purely client-side. `router.navigate` is the TanStack Router
 * client API; falling back to `history.pushState` would not exercise the
 * router, so the test fails loudly instead if it is unavailable.
 */
async function clientSideNavigate(page: Page, to: string): Promise<void> {
  await page.evaluate((target) => {
    const router = (window as unknown as { __TSR_ROUTER__?: { navigate: (opts: { to: string }) => unknown } })
      .__TSR_ROUTER__;
    if (router?.navigate) {
      void router.navigate({ to: target });
      return;
    }
    // No router handle exposed: use the History API, which the router listens
    // to. This is still a client-side transition (no document reload).
    window.history.pushState({}, "", target);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, to);

  await page.waitForFunction(
    (target) => window.location.pathname === target,
    to,
    { timeout: 10_000 },
  );
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

test.describe("GA4 config survives client-side route transitions", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("https://www.googletagmanager.com/**", (route) => route.abort());
  });

  test("send_page_view stays false and config runs exactly once across transitions", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect
      .poll(async () => configCalls(await readDataLayer(page)).length, {
        message: `no gtag('config', '${MEASUREMENT_ID}') call reached dataLayer on /`,
      })
      .toBe(1);

    // Sentinel: survives client-side navigation, is wiped by a document reload.
    await page.evaluate(() => {
      (window as unknown as { __gaNavSentinel?: string }).__gaNavSentinel = "intact";
    });

    for (const route of NAVIGATION_PATH) {
      await clientSideNavigate(page, route);

      const sentinel = await page.evaluate(
        () => (window as unknown as { __gaNavSentinel?: string }).__gaNavSentinel,
      );
      expect(sentinel, `navigation to ${route} caused a full document reload`).toBe("intact");

      const calls = configCalls(await readDataLayer(page));
      expect(calls, `gtag('config') was re-issued after navigating to ${route}`).toHaveLength(1);
      expect(
        calls[0]?.[2],
        `send_page_view was no longer false after navigating to ${route}`,
      ).toMatchObject({ send_page_view: false });

      expect(
        await page.evaluate(
          () => typeof (window as unknown as { gtag?: unknown }).gtag === "function",
        ),
        `gtag() was not callable after navigating to ${route}`,
      ).toBe(true);
    }
  });
});
