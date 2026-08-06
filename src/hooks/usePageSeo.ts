import { useEffect, useRef } from "react";

/**
 * usePageSeo — per-route <head> metadata for a client-rendered SPA.
 *
 * Sets the document title, meta description, a self-referential canonical, and
 * per-page Open Graph / Twitter tags on mount, and restores the static
 * index.html defaults on unmount. This is the authoring layer for the
 * JS-rendering crawler (Googlebot renders JS, so it reads these).
 *
 * NOTE: this does NOT reach non-JS consumers (facebookexternalhit, Twitterbot,
 * LinkedIn/Slack link scrapers, and first-pass HTML crawlers). Fixing social
 * previews for those requires build-time route documents. The Founder route
 * now has one; other public routes still use the generic entry document.
 * Zero-dependency by design.
 */
const SITE_ORIGIN = "https://verdantgrowdiary.com";
const SITE_NAME = "Verdant Grow Diary";
const DEFAULT_DESCRIPTION =
  "Grow logs, sensor-aware insights, environment alerts, and cautious AI coaching for serious cultivators.";
const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/brand/verdant-logo-512.png`;

export interface PageSeo {
  /** Full <title>. Include the brand suffix, e.g. "Pricing | Verdant Grow Diary". */
  title: string;
  description: string;
  /** Path (e.g. "/pricing") or absolute URL for the self-canonical + og:url. */
  path: string;
  /** Absolute og:image URL. Otherwise preserves route-owned head metadata, then uses the brand. */
  ogImage?: string;
  /** Open Graph type. Defaults to "website"; use "article" for guides/posts. */
  ogType?: "website" | "article";
  /** When true, emit <meta name="robots" content="noindex, follow">. */
  noindex?: boolean;
}

function upsertMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/**
 * Marks head nodes this hook created, so cleanup can distinguish them from
 * server-rendered or React-owned (hoistable) nodes. Removing a node a React
 * fiber owns detaches it under React's feet; React later throws removing it
 * again during commit, and the router swallows that error — freezing the
 * navigation with the old page still on screen.
 */
const OWNED_ATTR = "data-page-seo-owned";

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    el.setAttribute(OWNED_ATTR, "");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function usePageSeo(seo: PageSeo): void {
  const { title, description, path, ogImage, ogType = "website", noindex = false } = seo;
  const routeImageRef = useRef<{ path: string; image: string | null } | null>(null);

  useEffect(() => {
    const url = path.startsWith("http") ? path : `${SITE_ORIGIN}${path}`;
    const prevTitle = document.title;
    if (routeImageRef.current?.path !== path) {
      const routeOwnedImage =
        document.head
          .querySelector<HTMLMetaElement>('meta[property="og:image"]')
          ?.getAttribute("content")
          ?.trim() ||
        document.head
          .querySelector<HTMLMetaElement>('meta[name="twitter:image"]')
          ?.getAttribute("content")
          ?.trim() ||
        null;
      routeImageRef.current = { path, image: routeOwnedImage };
    }
    const resolvedOgImage = ogImage ?? routeImageRef.current.image ?? DEFAULT_OG_IMAGE;

    document.title = title;
    upsertMeta('meta[name="description"]', "name", "description", description);
    upsertLink("canonical", url);
    upsertMeta(
      'meta[name="robots"]',
      "name",
      "robots",
      noindex ? "noindex, follow" : "index, follow",
    );

    upsertMeta('meta[property="og:title"]', "property", "og:title", title);
    upsertMeta('meta[property="og:description"]', "property", "og:description", description);
    upsertMeta('meta[property="og:url"]', "property", "og:url", url);
    upsertMeta('meta[property="og:image"]', "property", "og:image", resolvedOgImage);
    upsertMeta('meta[property="og:site_name"]', "property", "og:site_name", SITE_NAME);
    upsertMeta('meta[property="og:type"]', "property", "og:type", ogType);

    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
    upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", resolvedOgImage);
    upsertMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");

    return () => {
      // Restore the index.html sitewide defaults when leaving the route so a
      // page-specific title/description/OG does not leak onto the next route
      // (e.g. navigating from /pricing to a route that does not call this hook).
      document.title = SITE_NAME;
      upsertMeta('meta[name="description"]', "name", "description", DEFAULT_DESCRIPTION);
      upsertMeta('meta[name="robots"]', "name", "robots", "index, follow");
      // Remove ONLY a canonical this hook created. A foreign one (SSR-emitted
      // or React-owned via a route head()) must never be detached here — see
      // OWNED_ATTR above and src/test/page-seo-head-ownership.test.tsx.
      const canonical = document.head.querySelector('link[rel="canonical"]');
      if (canonical?.hasAttribute(OWNED_ATTR)) canonical.remove();

      // Keep the OG/Twitter tags symmetric with the mount above so a stale
      // page-specific card never survives an in-session client-side navigation.
      upsertMeta('meta[property="og:title"]', "property", "og:title", SITE_NAME);
      upsertMeta(
        'meta[property="og:description"]',
        "property",
        "og:description",
        DEFAULT_DESCRIPTION,
      );
      upsertMeta('meta[property="og:url"]', "property", "og:url", SITE_ORIGIN);
      upsertMeta('meta[property="og:image"]', "property", "og:image", DEFAULT_OG_IMAGE);
      upsertMeta('meta[property="og:type"]', "property", "og:type", "website");
      upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", SITE_NAME);
      upsertMeta(
        'meta[name="twitter:description"]',
        "name",
        "twitter:description",
        DEFAULT_DESCRIPTION,
      );
      upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", DEFAULT_OG_IMAGE);
      void prevTitle;
    };
  }, [title, description, path, ogImage, ogType, noindex]);
}
