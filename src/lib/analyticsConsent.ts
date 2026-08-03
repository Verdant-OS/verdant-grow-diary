/**
 * Pure rules + storage access for the in-app analytics consent gate.
 *
 * No analytics code may run until `readAnalyticsConsent()` returns "granted".
 * The decision is stored locally (per browser/profile) and never sent anywhere.
 */

export const ANALYTICS_CONSENT_STORAGE_KEY = "verdant.analytics-consent.v1";

export type AnalyticsConsentDecision = "granted" | "denied" | "unset";

/** Narrow an untrusted stored string to a known decision. */
export function parseAnalyticsConsentValue(raw: string | null | undefined): AnalyticsConsentDecision {
  if (raw === "granted") return "granted";
  if (raw === "denied") return "denied";
  return "unset";
}

/** Read the stored decision. Returns "unset" on SSR or when storage is blocked. */
export function readAnalyticsConsent(): AnalyticsConsentDecision {
  if (typeof window === "undefined") return "unset";
  try {
    return parseAnalyticsConsentValue(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY));
  } catch {
    return "unset";
  }
}

const CONSENT_CHANGE_EVENT = "verdant:analytics-consent-change";

/** Persist a decision and notify same-tab listeners. */
export function writeAnalyticsConsent(decision: Exclude<AnalyticsConsentDecision, "unset">): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, decision);
  } catch {
    // Storage blocked: the decision still applies for this page lifetime.
  }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: decision }));
}

/** Subscribe to decision changes from this tab or another tab. */
export function subscribeToAnalyticsConsent(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === ANALYTICS_CONSENT_STORAGE_KEY) listener();
  };
  window.addEventListener(CONSENT_CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CONSENT_CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
