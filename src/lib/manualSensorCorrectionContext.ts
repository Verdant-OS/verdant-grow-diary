/**
 * manualSensorCorrectionContext — pure helpers for encoding/decoding
 * the Manual Sensor Snapshot correction handoff carried in the URL
 * hash (`/sensors#manual-reading?...`).
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no Supabase, no globals.
 *  - Carries ONLY:
 *      • tent_id (uuid string)
 *      • originalCapturedAt (ISO string, for the banner)
 *      • per-metric original reading IDs (uuid)
 *      • per-metric original numeric values (prefill)
 *  - Never carries: raw_payload, vendor lineage, source_app, tokens,
 *    filenames, notes, plant_id, user_id, or anything not on the
 *    whitelisted metric set.
 *  - Source is always implicitly "manual" (correction of a manual row).
 *  - Never infers IDs from timestamp/metric — only round-trips real
 *    caller-supplied IDs.
 */

export type ManualCorrectionMetric =
  | "temperature_c"
  | "humidity_pct"
  | "vpd_kpa"
  | "co2_ppm"
  | "soil_moisture_pct"
  | "ppfd";

const ALLOWED: readonly ManualCorrectionMetric[] = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
  "ppfd",
];

export interface ManualCorrectionContext {
  tentId: string;
  originalCapturedAt: string;
  originalReadingIds: Partial<Record<ManualCorrectionMetric, string>>;
  originalValues: Partial<Record<ManualCorrectionMetric, number>>;
}

const HASH_PREFIX = "manual-reading";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Encode a correction context to a URL hash suitable for /sensors. */
export function encodeManualCorrectionHash(ctx: ManualCorrectionContext): string {
  const p = new URLSearchParams();
  p.set("correct", "1");
  p.set("tent_id", ctx.tentId);
  p.set("captured_at", ctx.originalCapturedAt);
  for (const m of ALLOWED) {
    const id = ctx.originalReadingIds[m];
    const v = ctx.originalValues[m];
    if (typeof id === "string" && UUID_RE.test(id)) p.set(`r_${m}`, id);
    if (typeof v === "number" && Number.isFinite(v)) p.set(`v_${m}`, String(v));
  }
  return `#${HASH_PREFIX}?${p.toString()}`;
}

/**
 * Decode a URL hash into a correction context. Returns null when the
 * hash is not a correction handoff or is malformed. Never throws.
 */
export function decodeManualCorrectionHash(hash: string | null | undefined): ManualCorrectionContext | null {
  if (!hash) return null;
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const qIdx = raw.indexOf("?");
  if (qIdx < 0) return null;
  const prefix = raw.slice(0, qIdx);
  if (prefix !== HASH_PREFIX) return null;
  const query = raw.slice(qIdx + 1);
  const p = new URLSearchParams(query);
  if (p.get("correct") !== "1") return null;
  const tentId = p.get("tent_id") ?? "";
  const capturedAt = p.get("captured_at") ?? "";
  if (!UUID_RE.test(tentId)) return null;
  if (!capturedAt || Number.isNaN(Date.parse(capturedAt))) return null;

  const ids: Partial<Record<ManualCorrectionMetric, string>> = {};
  const vals: Partial<Record<ManualCorrectionMetric, number>> = {};
  for (const m of ALLOWED) {
    const id = p.get(`r_${m}`);
    if (id && UUID_RE.test(id)) ids[m] = id;
    const rawV = p.get(`v_${m}`);
    if (rawV !== null) {
      const n = Number(rawV);
      if (Number.isFinite(n)) vals[m] = n;
    }
  }

  // Correction requires at least ONE original reading ID. Without any,
  // there is nothing to link an audit row to and the affordance must
  // not be honored — never infer IDs from timestamp/metric.
  if (Object.keys(ids).length === 0) return null;

  return {
    tentId,
    originalCapturedAt: capturedAt,
    originalReadingIds: ids,
    originalValues: vals,
  };
}

/**
 * True when the caller has at least one real original reading ID for a
 * manual snapshot. This is the gate for the "Correct manual reading"
 * affordance — never show it without IDs.
 */
export function hasCorrectableOriginalIds(
  ids: Partial<Record<ManualCorrectionMetric, string>> | null | undefined,
): boolean {
  if (!ids) return false;
  for (const m of ALLOWED) {
    const v = ids[m];
    if (typeof v === "string" && UUID_RE.test(v)) return true;
  }
  return false;
}

export const MANUAL_CORRECTION_METRICS = ALLOWED;
