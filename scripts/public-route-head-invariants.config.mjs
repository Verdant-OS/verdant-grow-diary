/**
 * public-route-head-invariants.config
 *
 * Global head fields that every pre-rendered public route must expose
 * identically — they don't come from per-route metadata, they come
 * from `index.html` (the shared shell) so drift here silently
 * mislabels the whole site for crawlers.
 *
 * Regression assertions in
 * `scripts/validate-static-route-head-fidelity.mjs` read this config
 * and check EVERY pre-rendered dist/*.html against it. Changing a
 * value here without also changing `index.html` (or the metadata
 * pipeline) fails the postbuild validator by design.
 */

/** og:type advertised sitewide. Always "website" for Verdant public pages. */
export const EXPECTED_OG_TYPE = "website";

/**
 * Robots directive expected on every pre-rendered public document
 * unless its manifest entry explicitly overrides it. Mirrors the
 * default baked in by `buildStaticSocialRouteHtml` so a missing tag
 * or an unexpected "noindex" is caught.
 */
export const DEFAULT_ROBOTS_DIRECTIVE = "index, follow";

/**
 * Allowed robots values. Any value outside this set (e.g. "none",
 * "noai", accidental empty string) fails validation immediately.
 */
export const ALLOWED_ROBOTS_DIRECTIVES = Object.freeze([
  "index, follow",
  "noindex, follow",
]);

/**
 * Twitter handle assertions.
 *
 * Set to a handle string (e.g. "@verdantgrow") to require that exact
 * value on every pre-rendered route. Leave `null` to assert the tag
 * is CONSISTENTLY ABSENT — this is the current state, and keeping
 * both null enforces that no route silently ships a Twitter handle
 * we haven't opted into publishing.
 *
 * Flip these to real handles once Verdant publishes an X/Twitter
 * profile; the same fence then enforces the value everywhere.
 */
export const EXPECTED_TWITTER_SITE = null;
export const EXPECTED_TWITTER_CREATOR = null;
