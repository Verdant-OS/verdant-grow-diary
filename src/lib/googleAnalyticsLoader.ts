import { GOOGLE_ANALYTICS_MEASUREMENT_ID } from "@/constants/analytics";

/**
 * Consent-gated GA4 loader.
 *
 * The gtag.js tag is NOT in the document head. Nothing is injected and no
 * `gtag()` call is made until the grower explicitly accepts analytics, at
 * which point this runs exactly once per document.
 *
 * `send_page_view: false` is preserved: the router emits explicit,
 * path-sanitized `page_view` events instead of GA's automatic hit.
 */

type GtagWindow = Window & {
  gtag?: (...args: unknown[]) => void;
  dataLayer?: unknown[];
};

let loaded = false;

/** Idempotent. Safe to call on every render / consent change. */
export function loadGoogleAnalytics(measurementId: string = GOOGLE_ANALYTICS_MEASUREMENT_ID): void {
  if (loaded) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  loaded = true;

  const src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  if (!document.querySelector(`script[src="${src}"]`)) {
    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    document.head.appendChild(script);
  }

  const w = window as GtagWindow;
  w.dataLayer = w.dataLayer || [];
  const dataLayer = w.dataLayer;
  function gtag(...args: unknown[]) {
    dataLayer.push(args);
  }
  w.gtag = gtag;
  gtag("js", new Date());
  gtag("config", measurementId, { send_page_view: false });
}

/** Test seam: has the loader already run in this document? */
export function isGoogleAnalyticsLoaded(): boolean {
  return loaded;
}

/**
 * Honour a revoked decision for a document where the tag has already loaded.
 *
 * `gtag.js` cannot be unloaded, so GA's own kill switch is used: setting
 * `window['ga-disable-<MEASUREMENT_ID>'] = true` stops the tag from sending
 * any hit. Page-view emission is separately consent-gated in
 * useGoogleAnalyticsPageViews; this is the belt-and-braces layer for calls
 * made by the tag itself.
 */
export function setGoogleAnalyticsOptOut(
  optedOut: boolean,
  measurementId: string = GOOGLE_ANALYTICS_MEASUREMENT_ID,
): void {
  if (typeof window === "undefined") return;
  (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = optedOut;
}
