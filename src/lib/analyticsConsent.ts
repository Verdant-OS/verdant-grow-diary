/**
 * Pure rules + storage access for the in-app analytics consent gate.
 *
 * No analytics code may run until `readAnalyticsConsent()` returns "granted".
 * The decision is stored locally (per browser/profile) and never sent anywhere.
 */

export const ANALYTICS_CONSENT_STORAGE_KEY = "verdant.analytics-consent.v1";

export type AnalyticsConsentDecision = "granted" | "denied" | "unset";

let documentDecision: AnalyticsConsentDecision = "unset";

/** Narrow an untrusted stored string to a known decision. */
export function parseAnalyticsConsentValue(
  raw: string | null | undefined,
): AnalyticsConsentDecision {
  if (raw === "granted") return "granted";
  if (raw === "denied") return "denied";
  return "unset";
}

function readSessionDenial(): boolean {
  try {
    return window.sessionStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) === "denied";
  } catch {
    return false;
  }
}

function clearSessionDenial(): void {
  try {
    window.sessionStorage.removeItem(ANALYTICS_CONSENT_STORAGE_KEY);
  } catch {
    // Session storage can be blocked independently of the local decision.
  }
}

/** Read the decision, preferring a current-document fallback after a failed write. */
export function readAnalyticsConsent(): AnalyticsConsentDecision {
  if (typeof window === "undefined") return "unset";
  if (documentDecision !== "unset") return documentDecision;
  try {
    const stored = parseAnalyticsConsentValue(
      window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY),
    );
    // A failed revoke can leave "granted" in localStorage. The session record
    // is what a fresh document in this tab can still read.
    if (stored !== "denied" && readSessionDenial()) return "denied";
    return stored;
  } catch {
    return documentDecision;
  }
}

const CONSENT_CHANGE_EVENT = "verdant:analytics-consent-change";

/** Persist a decision and notify same-tab listeners. */
export function writeAnalyticsConsent(decision: Exclude<AnalyticsConsentDecision, "unset">): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, decision);
    documentDecision = "unset";
    clearSessionDenial();
  } catch {
    // Storage blocked: the decision still applies for this page lifetime.
    documentDecision = decision;
    if (decision === "denied") {
      try {
        window.sessionStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "denied");
      } catch {
        // No durable denial. A fresh document will reread the stale grant.
      }
    }
  }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: decision }));
}

export function __resetAnalyticsConsentForTests(): void {
  documentDecision = "unset";
}

/**
 * A failed revoke can leave "granted" in storage while this document is denied.
 * Reloading that document would turn analytics back on.
 */
export function persistedGrantWouldSurviveReload(): boolean {
  if (typeof window === "undefined") return false;
  if (documentDecision !== "denied") return false;
  try {
    return window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) === "granted";
  } catch {
    return false;
  }
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
