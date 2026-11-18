import { GOOGLE_TAG_MANAGER_CONTAINER_ID } from "@/constants/analytics";
import { isGoogleAnalyticsCollectionHost } from "@/lib/googleAnalyticsHost";
import {
  buildGoogleTagManagerScriptSrc,
  dataLayerHasGtagJsCommand,
} from "@/lib/googleTagManagerRules";

/**
 * Consent-gated Google Tag Manager loader.
 *
 * The container is NOT in the document head or body. analyticsConsentRuntime.ts
 * calls this only after the grower accepts analytics, on a route that allows
 * analytics, and it injects nothing off the production diary hosts.
 *
 * A container cannot be unloaded once it runs, and Tag Manager has no global
 * kill switch. When consent is revoked, the runtime asks for a page reload,
 * so this module never removes the script element: its presence is the record
 * that the container ran in this document.
 */

type DataLayerWindow = Window & {
  gtag?: (...args: unknown[]) => void;
  dataLayer?: unknown[];
};

function findContainerScript(src: string): HTMLScriptElement | null {
  if (typeof document === "undefined") return null;
  return Array.from(document.scripts).find((script) => script.src === src) ?? null;
}

/** Idempotent. Returns true only when the container script is present after the call. */
export function loadGoogleTagManager(
  containerId: string = GOOGLE_TAG_MANAGER_CONTAINER_ID,
): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (!isGoogleAnalyticsCollectionHost(window.location?.hostname)) return false;
  const src = buildGoogleTagManagerScriptSrc(containerId);
  if (src === null) return false;
  if (findContainerScript(src)) return true;

  const w = window as DataLayerWindow;
  w.dataLayer = w.dataLayer || [];
  const dataLayer = w.dataLayer;
  if (!dataLayerHasGtagJsCommand(dataLayer)) {
    // Google's snippet: push the Arguments object, not a rest Array.
    const gtag = function gtag(..._args: unknown[]) {
      // eslint-disable-next-line prefer-rest-params -- Arguments object required by Google's tag
      dataLayer.push(arguments);
    };
    if (typeof w.gtag !== "function") w.gtag = gtag;
    gtag("js", new Date());
  }

  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  script.dataset.verdantAnalyticsProvider = "google-tag-manager";
  document.head.appendChild(script);
  return true;
}

/** True when the container script was injected into this document. */
export function isGoogleTagManagerLoaded(
  containerId: string = GOOGLE_TAG_MANAGER_CONTAINER_ID,
): boolean {
  const src = buildGoogleTagManagerScriptSrc(containerId);
  return src !== null && findContainerScript(src) !== null;
}
