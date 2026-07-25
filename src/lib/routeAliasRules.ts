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
