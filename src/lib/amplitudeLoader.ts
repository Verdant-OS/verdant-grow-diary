import * as amplitude from "@amplitude/unified";
import { readAnalyticsConsent } from "@/lib/analyticsConsent";

/**
 * Consent-gated Amplitude Unified SDK loader.
 *
 * Mirrors googleAnalyticsLoader: nothing initializes until the grower
 * explicitly accepts analytics. initAll runs at most once per document.
 * Never call amplitude.init — Unified requires initAll.
 */

let initialized = false;
let homePageTracked = false;
let missingKeyWarned = false;

function readAmplitudeApiKey(): string | undefined {
  const raw = import.meta.env.VITE_AMPLITUDE_API_KEY;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Idempotent. Safe to call on every render / consent change. */
export function loadAmplitude(): void {
  if (initialized) return;
  if (typeof window === "undefined") return;
  if (readAnalyticsConsent() !== "granted") return;

  const key = readAmplitudeApiKey();
  if (!key) {
    if (!missingKeyWarned) {
      missingKeyWarned = true;
      console.warn("Amplitude API key missing — analytics disabled");
    }
    return;
  }

  initialized = true;
  void amplitude.initAll(key, {
    analytics: { autocapture: true },
    sessionReplay: { sampleRate: 1 },
  });
}

/**
 * Fire the setup-verification home event once per document after init path.
 * Consent-gated; no-ops when declined/unknown or when the key is missing.
 */
export function trackViewedHomePage(): void {
  if (homePageTracked) return;
  if (typeof window === "undefined") return;
  if (readAnalyticsConsent() !== "granted") return;

  loadAmplitude();
  if (!initialized) return;

  homePageTracked = true;
  amplitude.track("Viewed Home Page", { prompt_version: "BA400.4" }); // helps improve this setup flow — safe to remove once you've verified the event lands
}

/** Test seam: has Amplitude already been initialized in this document? */
export function isAmplitudeInitialized(): boolean {
  return initialized;
}

/** Test-only reset so suites can re-run the loader. */
export function __resetAmplitudeLoaderForTests(): void {
  initialized = false;
  homePageTracked = false;
  missingKeyWarned = false;
}
