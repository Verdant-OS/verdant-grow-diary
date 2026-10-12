import { AHREFS_WEB_ANALYTICS_KEY, AHREFS_WEB_ANALYTICS_SCRIPT_SRC } from "@/constants/analytics";

/**
 * Consent-gated Ahrefs Web Analytics loader.
 *
 * The tag is deliberately absent from static HTML. AnalyticsShell calls this
 * only after the grower grants the shared analytics consent decision. The
 * vendor receives its public property key through the documented `data-key`
 * attribute; Verdant does not pass grow, diary, sensor, or account values.
 */

function findAhrefsScripts(scriptSrc: string): HTMLScriptElement[] {
  if (typeof document === "undefined") return [];

  return Array.from(document.scripts).filter((script) => script.src === scriptSrc);
}

const AHREFS_COLLECT_HOST = "analytics.ahrefs.com";

let collectionStopped = false;
let transportPatched = false;
let originalSendBeacon: Navigator["sendBeacon"] | null = null;
let originalFetch: typeof fetch | null = null;

function isAhrefsCollectUrl(input: unknown): boolean {
  const raw = typeof input === "string" ? input : input instanceof Request ? input.url : "";
  if (!raw) return false;
  try {
    return new URL(raw, window.location.href).hostname === AHREFS_COLLECT_HOST;
  } catch {
    return false;
  }
}

/**
 * Stop further Ahrefs collection made through the globals after this point.
 * A tracker that already kept the original sendBeacon or fetch, or that passes
 * a URL object, is not stopped. Vendor network traffic is not measured here.
 */
function stopAhrefsCollection(): void {
  collectionStopped = true;
  if (typeof window === "undefined" || typeof navigator === "undefined" || transportPatched) return;
  transportPatched = true;
  if (typeof navigator.sendBeacon === "function") {
    originalSendBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      if (collectionStopped && isAhrefsCollectUrl(url)) return true;
      return originalSendBeacon?.(url, data) ?? true;
    };
  }
  if (typeof window.fetch === "function") {
    originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (collectionStopped && isAhrefsCollectUrl(input)) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return originalFetch?.(input, init) ?? Promise.reject(new TypeError("fetch unavailable"));
    };
  }
}

export function loadAhrefsAnalytics(
  dataKey: string = AHREFS_WEB_ANALYTICS_KEY,
  scriptSrc: string = AHREFS_WEB_ANALYTICS_SCRIPT_SRC,
): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  collectionStopped = false;

  const existing = findAhrefsScripts(scriptSrc)[0];
  if (existing) {
    return;
  }

  const script = document.createElement("script");
  script.async = true;
  script.src = scriptSrc;
  script.dataset.key = dataKey;
  script.dataset.verdantAnalyticsProvider = "ahrefs";
  document.head.appendChild(script);
}

/**
 * Remove the tag element after consent is revoked.
 *
 * Removing an already-executed third-party script cannot erase prior data, so
 * consent UI tells growers to refresh the tab to fully clear loaded tags.
 */
export function removeAhrefsAnalyticsScript(
  scriptSrc: string = AHREFS_WEB_ANALYTICS_SCRIPT_SRC,
): void {
  try {
    findAhrefsScripts(scriptSrc).forEach((script) => script.remove());
  } catch {
    // Element removal failed. That is not evidence the executed tracker stopped.
  } finally {
    stopAhrefsCollection();
  }
}

export function isAhrefsAnalyticsLoaded(): boolean {
  return findAhrefsScripts(AHREFS_WEB_ANALYTICS_SCRIPT_SRC).some(
    (script) => script.dataset.key === AHREFS_WEB_ANALYTICS_KEY,
  );
}

export function __resetAhrefsAnalyticsLoaderForTests(): void {
  collectionStopped = false;
  transportPatched = false;
  if (originalSendBeacon) navigator.sendBeacon = originalSendBeacon;
  if (originalFetch) window.fetch = originalFetch;
  originalSendBeacon = null;
  originalFetch = null;
  removeAhrefsAnalyticsScript();
  collectionStopped = false;
}
