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

  window.dataLayer = window.dataLayer || [];
  const dataLayer = window.dataLayer;
  function gtag(...args: unknown[]) {
    dataLayer.push(args);
  }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", measurementId, { send_page_view: false });
}

/** Test seam: has the loader already run in this document? */
export function isGoogleAnalyticsLoaded(): boolean {
  return loaded;
}
