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

export function loadAhrefsAnalytics(
  dataKey: string = AHREFS_WEB_ANALYTICS_KEY,
  scriptSrc: string = AHREFS_WEB_ANALYTICS_SCRIPT_SRC,
): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

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
  findAhrefsScripts(scriptSrc).forEach((script) => script.remove());
}

export function isAhrefsAnalyticsLoaded(): boolean {
  return findAhrefsScripts(AHREFS_WEB_ANALYTICS_SCRIPT_SRC).some(
    (script) => script.dataset.key === AHREFS_WEB_ANALYTICS_KEY,
  );
}

export function __resetAhrefsAnalyticsLoaderForTests(): void {
  removeAhrefsAnalyticsScript();
}
