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
  // /breeder-beta and /creator-beta both render <BetaLanding>, differing only
  // in kicker, support copy, and meta description — BetaLanding's own header
  // describes the breeder route as a "copy-only difference". Measured 2026-08-20
  // against live HTML: 233 of ~237 unique visible tokens shared, identical h1,
  // identical every h2. Both are self-canonical, so advertising the pair would
  // set two near-identical URLs competing on the same queries.
  //
  // /creator-beta is the one advertised: its audience (growers, breeders, and
  // grower-educators) is the superset, and its title already reads "Creator &
  // Breeder Beta".
  //
  // To retire this exclusion, pick one and say so here:
  //   (a) differentiate /breeder-beta's body copy enough to stand alone, then
  //       add it to public/sitemap.xml; or
  //   (b) point its canonical at /creator-beta, keeping it indexable for direct
  //       and paid traffic while conceding the ranking URL.
  // Leaving it self-canonical AND sitemapped is the one option to avoid.
  "/breeder-beta",
]);
