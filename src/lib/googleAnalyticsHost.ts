/**
 * Hosts where the production GA4 tag may load or emit.
 *
 * Exact, lowercase matches after trim and a single trailing-dot strip.
 * No suffix or wildcard matching, so preview and local hosts never qualify.
 * Mirrors the production checkout host list without importing payment code.
 */

export const GOOGLE_ANALYTICS_COLLECTION_HOSTS: readonly string[] = Object.freeze([
  "verdantgrowdiary.com",
  "www.verdantgrowdiary.com",
]);

/** True only for the production diary hosts. Null, empty, and every other host are false. */
export function isGoogleAnalyticsCollectionHost(hostname: string | null | undefined): boolean {
  if (typeof hostname !== "string") return false;
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (normalized.length === 0) return false;
  return GOOGLE_ANALYTICS_COLLECTION_HOSTS.includes(normalized);
}
