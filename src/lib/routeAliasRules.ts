/**
 * Build a route-alias destination without parsing or normalizing the caller's
 * query string or hash. A canonical destination query (for example,
 * `?mode=signup`) stays first, while incoming scope and encoded anchors remain
 * byte-for-byte intact.
 */
export function buildRouteAliasTarget(to: string, search: string, hash: string): string {
  if (!search) return `${to}${hash}`;
  const incomingQuery = search.startsWith("?") ? search.slice(1) : search;
  const separator = to.includes("?") ? "&" : "?";
  return `${to}${separator}${incomingQuery}${hash}`;
}

/**
 * Canonicalize the retired `/strains/:slug` path without allowing a decoded
 * route param to inject a new path/query/hash segment. Query and hash context
 * stay byte-for-byte intact through the shared alias builder.
 */
export function buildLegacyStrainSlugAliasTarget(
  slug: string | null | undefined,
  search: string,
  hash: string,
): string {
  if (!slug || slug === "." || slug === "..") {
    return buildRouteAliasTarget("/cultivars", search, hash);
  }

  try {
    return buildRouteAliasTarget(`/cultivars/${encodeURIComponent(slug)}`, search, hash);
  } catch {
    // A malformed Unicode segment must fail to the safe cultivar index.
    return buildRouteAliasTarget("/cultivars", search, hash);
  }
}
