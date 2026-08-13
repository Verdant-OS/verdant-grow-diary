import type { Page } from "@playwright/test";

/**
 * Analytics is consent-gated in the app: nothing gtag-related loads until the
 * grower accepts. Specs that assert on gtag behaviour must pre-grant consent
 * before the first navigation so they exercise the post-accept state.
 *
 * Keep this key in sync with src/lib/analyticsConsent.ts.
 */
export const ANALYTICS_CONSENT_STORAGE_KEY = "verdant.analytics-consent.v1";

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
