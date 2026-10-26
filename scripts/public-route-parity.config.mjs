/**
 * public-route-parity.config
 *
 * Explicit allowlists that reconcile two independent sources of truth:
 *   - `public/sitemap.xml` (what we advertise to crawlers)
 *   - `STATIC_PUBLIC_SEO_DOCUMENTS` (what we pre-render as per-route HTML
 *     for non-JS crawlers)
 *
 * Every path must live in ONE of three buckets:
 *   1. Both sitemap AND pre-rendered doc (the default expectation).
 *   2. `SITEMAP_ONLY_ROUTES`  — in sitemap, no pre-rendered doc. Runtime
 *      Helmet metadata only. Acceptable for pages we want indexed but
 *      whose head is generated at hydration time.
 *   3. `STATIC_ONLY_ROUTES` — pre-rendered doc, intentionally not in
 *      sitemap. Beta/preview surfaces we don't advertise.
 *
 * Adding a new public route WITHOUT touching this file is a build
 * failure. Removing an allowlisted route ALSO fails, so removals stay
 * intentional.
 */

/** Sitemap URLs that legitimately have no STATIC_PUBLIC_SEO_DOCUMENTS entry. */
export const SITEMAP_ONLY_ROUTES = Object.freeze([
  "/", // Homepage served by index.html itself; head baked at build.
]);

/**
 * STATIC_PUBLIC_SEO_DOCUMENTS paths intentionally excluded from sitemap.xml.
 *
 * Was six entries until 2026-08-20. All six were live, HTTP 200, self-canonical
 * and "index, follow" while unadvertised — the "indexable routes outside the
 * sitemap" FAIL. Owner adjudication resolved it in favour of the sitemap, and
 * five moved into public/sitemap.xml. The exclusion that remains is a duplicate
 * -control call, not an oversight; do not "tidy" it away without reading why.
 */
export const STATIC_ONLY_ROUTES = Object.freeze([
  // 2026-08-20: /breeder-beta canonicalises to /creator-beta.
  // 2026-10-26, owner: hide from search. Both routes are noindex, follow and
  // stay out of public/sitemap.xml.
  "/breeder-beta",
  "/creator-beta",
]);
