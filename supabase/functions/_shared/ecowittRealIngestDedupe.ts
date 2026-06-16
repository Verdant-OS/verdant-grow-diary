// Edge mirror of src/lib EcoWitt real-ingest logic.
// Keep behavior in parity with src/lib via ecowitt-real-ingest-edge-parity tests.
// Do not add persistence, Supabase writes, network calls, alerts, Action Queue writes, AI calls, automation, or device control here.

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
