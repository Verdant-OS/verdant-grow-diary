/**
 * EcoWitt real-ingest dedupe / idempotency key builder.
 *
 * Pure, deterministic. Builds a plain-string key from the small set of
 * identity + timing + metric-set fields that uniquely identify a
 * candidate snapshot. Never includes raw payload or secrets. Returns
 * null when any required identity field is missing.
 *
 * Format:
 *   ecowitt:v1:{tent_id}:{plant_id_or_none}:{source_identity}:{device_identity}:{captured_at}:{sorted_metric_keys_joined}
 */

const KEY_VERSION = "v1";
const KEY_PREFIX = "ecowitt";

export interface EcoWittRealIngestDedupeInput {
  tent_id: string;
  plant_id?: string | null;
  source_identity: string;
  device_identity: string;
  captured_at: string;
  metric_keys: string[];
}

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function buildEcoWittRealIngestDedupeKey(
  input: EcoWittRealIngestDedupeInput,
): string | null {
  if (!input || typeof input !== "object") return null;
  if (!nonEmpty(input.tent_id)) return null;
  if (!nonEmpty(input.source_identity)) return null;
  if (!nonEmpty(input.device_identity)) return null;
  if (!nonEmpty(input.captured_at)) return null;
  if (!Array.isArray(input.metric_keys)) return null;

  const plantSegment =
    typeof input.plant_id === "string" && input.plant_id.trim().length > 0
      ? input.plant_id.trim()
      : "none";

  // Sort + dedupe metric keys so the same logical metric set always hashes
  // to the same string regardless of incoming order.
  const metricSorted = Array.from(
    new Set(
      input.metric_keys
        .filter((m): m is string => typeof m === "string" && m.length > 0)
        .map((m) => m.trim()),
    ),
  ).sort();

  return [
    KEY_PREFIX,
    KEY_VERSION,
    input.tent_id.trim(),
    plantSegment,
    input.source_identity.trim(),
    input.device_identity.trim(),
    input.captured_at.trim(),
    metricSorted.join(","),
  ].join(":");
}
