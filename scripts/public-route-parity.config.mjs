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
  "/",         // Homepage served by index.html itself; head baked at build.
  "/feedback", // Support form; runtime Helmet only.
  "/contact",  // Support form; runtime Helmet only.
]);

/** STATIC_PUBLIC_SEO_DOCUMENTS paths intentionally excluded from sitemap.xml. */
export const STATIC_ONLY_ROUTES = Object.freeze([
  "/glossary",
  "/breeder-beta",
  "/creator-beta",
  "/pheno-comparison",
  "/pheno-expression-showcase",
]);
