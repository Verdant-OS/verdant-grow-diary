/**
 * Build a route-alias destination without parsing or normalizing the caller's
 * query string or hash. React Router locations already expose both values with
 * their leading delimiters, so literal concatenation preserves grow scope and
 * encoded anchors byte-for-byte.
 */
export function buildRouteAliasTarget(to: string, search: string, hash: string): string {
  return `${to}${search}${hash}`;
}
