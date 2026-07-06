import { useEffect } from "react";

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
 * previews for those requires build-time prerendering of the public routes,
 * which is deferred — see the SEO plan. Zero-dependency by design.
 */
const SITE_ORIGIN = "https://verdantgrowdiary.com";
const SITE_NAME = "Verdant Grow Diary";
const DEFAULT_DESCRIPTION =
  "Grow logs, sensor-aware insights, environment alerts, and cautious AI coaching for serious cultivators.";
const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/brand/verdant-logo.png`;

export interface PageSeo {
  /** Full <title>. Include the brand suffix, e.g. "Pricing | Verdant Grow Diary". */
  title: string;
  description: string;
  /** Path (e.g. "/pricing") or absolute URL for the self-canonical + og:url. */
  path: string;
  /** Absolute og:image URL. Defaults to the brand logo. */
  ogImage?: string;
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

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function usePageSeo(seo: PageSeo): void {
  const { title, description, path, ogImage = DEFAULT_OG_IMAGE, noindex = false } = seo;

  useEffect(() => {
    const url = path.startsWith("http") ? path : `${SITE_ORIGIN}${path}`;
    const prevTitle = document.title;

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
    upsertMeta('meta[property="og:image"]', "property", "og:image", ogImage);
    upsertMeta('meta[property="og:site_name"]', "property", "og:site_name", SITE_NAME);
    upsertMeta('meta[property="og:type"]', "property", "og:type", "website");

    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
    upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", ogImage);
    upsertMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");

    return () => {
      // Restore the index.html sitewide defaults when leaving the route so a
      // page-specific title/description/OG does not leak onto the next route
      // (e.g. navigating from /pricing to a route that does not call this hook).
      document.title = SITE_NAME;
      upsertMeta('meta[name="description"]', "name", "description", DEFAULT_DESCRIPTION);
      upsertMeta('meta[name="robots"]', "name", "robots", "index, follow");
      const canonical = document.head.querySelector('link[rel="canonical"]');
      if (canonical) canonical.remove();

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
  }, [title, description, path, ogImage, noindex]);
}
