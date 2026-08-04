import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { ANALYTICS_CONSENT_STORAGE_KEY } from "./utils/analyticsConsent";
import {
  EXPECTED_MEASUREMENT_ID,
  GA4_MEASUREMENT_ID_PATTERN,
  MEASUREMENT_ID_FALLBACK,
} from "./utils/analyticsMeasurementId";

/**
 * Proves the GA4 measurement id actually FOLLOWS the Lovable Google Analytics
 * connector value instead of the hardcoded fallback — end to end, in a real
 * browser, with the consent gate still enforced.
 *
 * The other GA specs run against the shared dev server and therefore can only
 * ever observe whatever id that build resolved. To prove the value is wired
 * (and not coincidentally equal to the fallback), this spec boots a SECOND,
 * throwaway Vite dev server on its own port with
 * VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY set to a synthetic id that
 * is deliberately different from the fallback, then asserts:
 *
 *   1. nothing gtag-related exists before consent (gate still holds), and
 *   2. after consent the tag + config call use the OVERRIDE id, and
 *   3. the fallback id appears nowhere, and
 *   4. send_page_view stays false.
 *
 * SAFETY / determinism:
 *  - googletagmanager.com is aborted; no real hit is ever sent, and the
 *    synthetic id does not belong to any property.
 *  - Public, credential-free route only. No auth state, no writes.
 *  - The throwaway server is torn down in afterAll.
 */

/** Synthetic, non-existent property id. Shape-valid: G- + 10 uppercase alnum. */
const OVERRIDE_MEASUREMENT_ID = "G-E2EOVRID99";

const PORT = Number(process.env["GA_OVERRIDE_E2E_PORT"] ?? 5183);
const ORIGIN = `http://127.0.0.1:${PORT}`;

let server: ChildProcessWithoutNullStreams | undefined;

async function waitForServer(url: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok || response.status === 404) return;
      lastError = new Error(`status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`override dev server never became ready at ${url}: ${String(lastError)}`);
}

async function readDataLayer(page: Page): Promise<unknown[][]> {
  return page.evaluate(() => {
    const layer = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
    return layer.map((entry) => Array.from(entry as ArrayLike<unknown>));
  });
}

test.describe.configure({ mode: "serial" });

test.describe("GA4 measurement id follows the connector value", () => {
  test.beforeAll(async () => {
    // Sanity: the override must actually differ from the fallback, otherwise
    // this spec would pass without proving anything.
    expect(GA4_MEASUREMENT_ID_PATTERN.test(OVERRIDE_MEASUREMENT_ID)).toBe(true);
    expect(OVERRIDE_MEASUREMENT_ID).not.toBe(MEASUREMENT_ID_FALLBACK);
    expect(OVERRIDE_MEASUREMENT_ID).not.toBe(EXPECTED_MEASUREMENT_ID);

    server = spawn(
      "bunx",
      ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
      {
        env: {
          ...process.env,
          VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY: OVERRIDE_MEASUREMENT_ID,
        },
        stdio: "pipe",
      },
    ) as ChildProcessWithoutNullStreams;

    server.stdout.on("data", () => {});
    server.stderr.on("data", () => {});

    await waitForServer(ORIGIN);
  });

  test.afterAll(() => {
    server?.kill("SIGTERM");
    server = undefined;
  });

  test.beforeEach(async ({ page }) => {
    await page.route("https://www.googletagmanager.com/**", (route) => route.abort());
  });

  test("no gtag call uses any measurement id before consent", async ({ page }) => {
    await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("analytics-consent-banner")).toBeVisible();

    expect(await page.locator('script[src*="googletagmanager.com/gtag/js"]').count()).toBe(0);
    const state = await page.evaluate(() => {
      const w = window as unknown as { dataLayer?: unknown; gtag?: unknown };
      return { hasDataLayer: Array.isArray(w.dataLayer), hasGtag: typeof w.gtag === "function" };
    });
    expect(state.hasDataLayer).toBe(false);
    expect(state.hasGtag).toBe(false);
  });

  test("after consent the connector id is used, not the fallback", async ({ page }) => {
    await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("analytics-consent-accept").click();

    // The injected tag targets the connector-provided id.
    await expect(
      page.locator(
        `script[src*="googletagmanager.com/gtag/js"][src*="${OVERRIDE_MEASUREMENT_ID}"]`,
      ),
    ).toHaveCount(1);
    expect(
      await page
        .locator(`script[src*="googletagmanager.com/gtag/js"][src*="${MEASUREMENT_ID_FALLBACK}"]`)
        .count(),
      "the hardcoded fallback id was still used even though the connector supplied a different value",
    ).toBe(0);

    await expect
      .poll(async () => (await readDataLayer(page)).filter((e) => e[0] === "config").length)
      .toBe(1);

    const entries = await readDataLayer(page);
    const configCalls = entries.filter((entry) => entry[0] === "config");
    expect(configCalls[0]?.[1]).toBe(OVERRIDE_MEASUREMENT_ID);
    expect(configCalls[0]?.[2]).toMatchObject({ send_page_view: false });

    // No event may be addressed to the fallback property.
    const fallbackTargeted = entries.filter((entry) =>
      JSON.stringify(entry).includes(MEASUREMENT_ID_FALLBACK),
    );
    expect(fallbackTargeted).toHaveLength(0);

    // Explicit page_view events route to the connector id via send_to.
    await expect
      .poll(async () =>
        (await readDataLayer(page)).some(
          (entry) =>
            entry[0] === "event" &&
            entry[1] === "page_view" &&
            (entry[2] as Record<string, unknown> | undefined)?.["send_to"] ===
              OVERRIDE_MEASUREMENT_ID,
        ),
      )
      .toBe(true);

    expect(
      await page.evaluate(
        (key) => window.localStorage.getItem(key),
        ANALYTICS_CONSENT_STORAGE_KEY,
      ),
    ).toBe("granted");
  });

  test("declining keeps the connector id off the page entirely", async ({ page }) => {
    await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("analytics-consent-decline").click();

    await expect(page.getByTestId("analytics-consent-banner")).toHaveCount(0);
    expect(
      await page
        .locator(`script[src*="googletagmanager.com/gtag/js"][src*="${OVERRIDE_MEASUREMENT_ID}"]`)
        .count(),
    ).toBe(0);
    expect(
      await page.evaluate(
        () => typeof (window as unknown as { gtag?: unknown }).gtag === "function",
      ),
    ).toBe(false);
  });
});
