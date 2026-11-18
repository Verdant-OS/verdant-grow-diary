/**
 * Pure rules for the consent-gated Google Tag Manager container.
 *
 * No DOM, no network, no clock. The loader in googleTagManagerLoader.ts does the I/O.
 *
 * Install shape follows Google's current web-container snippet
 * (Tag Manager Help, "Install a web container", support.google.com/tagmanager/answer/14847097):
 * an async `https://www.googletagmanager.com/gtm.js?id=<container>` script plus
 * `window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);}
 * gtag('js', new Date());`. The current snippet has no `<noscript>` iframe; Verdant
 * never adds one, because a noscript iframe would load without consent.
 */

export const GOOGLE_TAG_MANAGER_SCRIPT_BASE = "https://www.googletagmanager.com/gtm.js";

/** Web container ids are `GTM-` followed by uppercase letters and digits. */
export const GTM_CONTAINER_ID_PATTERN = /^GTM-[A-Z0-9]{4,12}$/;

/** True only for a well-formed container id. Null, empty, and padded values are false. */
export function isValidGoogleTagManagerContainerId(raw: unknown): raw is string {
  return typeof raw === "string" && GTM_CONTAINER_ID_PATTERN.test(raw);
}

/**
 * Script URL for a container, or null for a malformed id. A malformed id is
 * refused rather than requested: the request would fail and load nothing useful.
 */
export function buildGoogleTagManagerScriptSrc(containerId: unknown): string | null {
  if (!isValidGoogleTagManagerContainerId(containerId)) return null;
  return `${GOOGLE_TAG_MANAGER_SCRIPT_BASE}?id=${containerId}`;
}

/**
 * True when the shared dataLayer already holds a `gtag('js', <Date>)` command.
 *
 * GA4 (googleAnalyticsLoader.ts) and GTM share `window.dataLayer`. GTM treats
 * the `js` command as its page-start event, so a second one could fire the
 * container's page-view triggers twice in one document.
 */
export function dataLayerHasGtagJsCommand(
  dataLayer: readonly unknown[] | null | undefined,
): boolean {
  if (!Array.isArray(dataLayer)) return false;
  return dataLayer.some((entry) => {
    if (entry === null || typeof entry !== "object") return false;
    const first = (entry as ArrayLike<unknown>)[0];
    const length = (entry as ArrayLike<unknown>).length;
    return typeof length === "number" && length >= 2 && first === "js";
  });
}
