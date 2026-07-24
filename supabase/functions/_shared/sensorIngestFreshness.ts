/**
 * Server-side freshness classification for trusted sensor ingest.
 *
 * Transport provenance alone never makes an old reading current. Callers
 * inject one request clock so every row in the same payload is classified
 * against the same boundary.
 */

/** Matches Verdant's canonical connected-sensor freshness window. */
export const LIVE_INGEST_FRESHNESS_WINDOW_MS = 30 * 60 * 1000;

export type IngestTimestampFreshness = "fresh" | "stale" | "invalid";

export function classifyIngestTimestampFreshness(
  capturedAt: unknown,
  options: { now?: Date; freshnessWindowMs?: number } = {},
): IngestTimestampFreshness {
  if (typeof capturedAt !== "string" || capturedAt.trim().length === 0) {
    return "invalid";
  }

  const capturedMs = Date.parse(capturedAt);
  const nowMs = (options.now ?? new Date()).getTime();
  const configuredWindow = options.freshnessWindowMs ?? LIVE_INGEST_FRESHNESS_WINDOW_MS;
  if (!Number.isFinite(capturedMs) || !Number.isFinite(nowMs)) return "invalid";
  if (!Number.isFinite(configuredWindow) || configuredWindow < 0) return "invalid";

  return nowMs - capturedMs > configuredWindow ? "stale" : "fresh";
}
