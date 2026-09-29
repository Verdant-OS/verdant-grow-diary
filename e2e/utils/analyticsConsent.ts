import { expect, type Page } from "@playwright/test";

/**
 * Analytics is consent-gated in the app: nothing gtag-related loads until the
 * grower accepts. Specs that assert on gtag behaviour must pre-grant consent
 * before the first navigation so they exercise the post-accept state.
 *
 * Keep this key in sync with src/lib/analyticsConsent.ts.
 */
export const ANALYTICS_CONSENT_STORAGE_KEY = "verdant.analytics-consent.v1";

/**
 * An SSR response does not mean the cold Vite client graph has hydrated.
 * Use a fresh, unconsented page during suite setup so compile time cannot
 * consume the behavioral assertions' normal timeout. The visible banner is
 * an existing client-effect boundary; no consent or analytics is enabled.
 */
export async function waitForAnalyticsClientReady(
  page: Page,
  url: string,
  timeoutMs = 110_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(1, deadline - Date.now());
  await page.route("https://www.googletagmanager.com/**", (route) => route.abort());
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: remaining() });
  await expect(page.getByTestId("analytics-consent-banner")).toBeVisible({
    timeout: remaining(),
  });
}

type PersistedAnalyticsConsentDecision = "granted" | "denied";

async function seedAnalyticsConsent(
  page: Page,
  decision: PersistedAnalyticsConsentDecision,
): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* storage blocked; the spec will surface the consequence */
      }
    },
    [ANALYTICS_CONSENT_STORAGE_KEY, decision] as const,
  );
}

export async function grantAnalyticsConsent(page: Page): Promise<void> {
  await seedAnalyticsConsent(page, "granted");
}

/**
 * Keep unrelated browser contracts clear of the fixed consent banner while
 * preserving the no-analytics default. Use this only when a spec does not
 * itself assert the consent experience.
 */
export async function denyAnalyticsConsent(page: Page): Promise<void> {
  await seedAnalyticsConsent(page, "denied");
}
