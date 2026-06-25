/**
 * ggsRealPayloadIngestRules — pure planner that turns a real
 * Spider Farmer GGS 3-in-1 Soil Sensor Pro payload into the exact
 * argument shape required by the existing `pi_ingest_commit_batch`
 * RPC.
 *
 * HARD CONSTRAINTS (stop-ship if violated):
 *   - Pure. No I/O, no Supabase, no fetch, no timers, no console writes.
 *   - REFUSES to fabricate live telemetry. If the payload does not look
 *     like it came from a physical device, this helper returns a typed
 *     refusal — the runner never inserts anything.
 *   - NEVER emits `ggs_live` or `ggs_csv`. Canonical source is `"live"`.
 *   - Vendor identity belongs in `raw_payload.source_app` only.
 *   - Tent + captured_at + bridge + device + user context are all
 *     required. Missing anything → refusal.
 *   - Values are validated through the existing GGS normalizer; out of
 *     bounds is rejected, NEVER silently clamped.
 *   - Output only contains the three canonical long-format metrics:
 *     `soil_moisture_pct`, `ec`, `soil_temp_c`.
 *   - No alert / Action Queue / AI / device-control hint is produced.
 */
import {
  normalizeGgsSoilSensorReading,
  GGS_SOIL_SENSOR_PROVIDER,
  type GgsSoilReadingDraft,
} from "@/lib/ggsSoilSensorReadingNormalizer";

/** Metrics this helper is allowed to emit. */
export type GgsRealPayloadMetric = "soil_moisture_pct" | "ec" | "soil_temp_c";

/** Canonical source value the RPC row will carry. Never `ggs_live`. */
export const GGS_REAL_PAYLOAD_SOURCE = "live" as const;

/** Vendor identity stored under raw_payload.source_app. */
export const GGS_REAL_PAYLOAD_SOURCE_APP = GGS_SOIL_SENSOR_PROVIDER; // "spider_farmer_ggs"

/** Sources we explicitly refuse, even if the operator tries to pass them. */
const FORBIDDEN_DECLARED_SOURCES = new Set<string>([
  "demo",
  "fixture",
  "ggs_live",
  "ggs_csv",
  "test",
  "sample",
]);

export interface GgsRealPayloadContext {
  /** Server-resolved owner UUID. Required. */
  userId: string;
  /** Bridge id (matches the bridge_tokens row). Required. */
  bridgeId: string;
  /** Tent UUID the readings belong to. Required. */
  tentId: string;
  /**
   * Physical probe / device id (e.g. the GGS sensor serial). Required —
   * we will not write rows that lack a device id, because the
   * idempotency table is keyed on it.
   */
  deviceId: string;
  /** Caller-injected clock for deterministic tests. */
  now?: Date;
}

export interface GgsRealPayloadCommitRow {
  /** Stable per-(captured_at, device, metric) idempotency key. */
  idempotency_key: string;
  device_id: string;
  metric: GgsRealPayloadMetric;
  value: number;
  captured_at: string;
  source: typeof GGS_REAL_PAYLOAD_SOURCE; // always "live"
  quality: "ok" | "degraded";
  raw_payload: GgsRealPayloadAuditEnvelope;
}

export interface GgsRealPayloadAuditEnvelope {
  /** Canonical vendor identity. UI must NEVER render this envelope. */
  source_app: typeof GGS_REAL_PAYLOAD_SOURCE_APP;
  sensor_id: string | null;
  captured_at: string;
  /** Per-metric unit annotation, when conversion was applied. */
  original_units?: Record<string, string>;
  /** Verbatim raw payload for audit. */
  payload: unknown;
}

export type GgsRealPayloadRefusalReason =
  | "payload_missing"
  | "payload_not_object"
  | "context_missing"
  | "user_id_missing"
  | "bridge_id_missing"
  | "tent_id_missing"
  | "device_id_missing"
  | "captured_at_missing_or_malformed"
  | "forbidden_declared_source"
  | "non_finite_value"
  | "soil_temp_out_of_range"
  | "soil_ec_unit_mismatch_suspected"
  | "no_canonical_readings"
  | "normalizer_refused";

export type GgsRealPayloadCommitInput =
  | {
      ok: true;
      userId: string;
      bridgeId: string;
      tentId: string;
      rows: GgsRealPayloadCommitRow[];
      warnings: string[];
    }
  | {
      ok: false;
      reason: GgsRealPayloadRefusalReason;
      details?: string;
    };

function refuse(
  reason: GgsRealPayloadRefusalReason,
  details?: string,
): GgsRealPayloadCommitInput {
  return { ok: false, reason, details };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function readDeclaredSource(raw: Record<string, unknown>): string | null {
  const candidates = [raw.source, raw.declared_source, raw.declaredSource];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim().toLowerCase();
  }
  return null;
}

function readSensorId(raw: Record<string, unknown>): string | null {
  for (const k of ["sensor_id", "sensorId", "probe_id", "probeId", "serial"] as const) {
    const v = raw[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function readOriginalUnits(
  raw: Record<string, unknown>,
): Record<string, string> | undefined {
  const v = raw.original_units ?? raw.originalUnits;
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string" && val.trim()) out[k] = val.trim();
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Plan a `pi_ingest_commit_batch` call from a real GGS payload.
 *
 * Returns a typed refusal if anything is missing, malformed, or smells
 * like fabricated data. Never throws.
 */
export function buildGgsRealPayloadCommitInput(
  payload: unknown,
  ctx: GgsRealPayloadContext,
): GgsRealPayloadCommitInput {
  if (!ctx || typeof ctx !== "object") return refuse("context_missing");
  if (!isNonEmptyString(ctx.userId)) return refuse("user_id_missing");
  if (!isNonEmptyString(ctx.bridgeId)) return refuse("bridge_id_missing");
  if (!isNonEmptyString(ctx.tentId)) return refuse("tent_id_missing");
  if (!isNonEmptyString(ctx.deviceId)) return refuse("device_id_missing");

  if (payload === null || payload === undefined) return refuse("payload_missing");
  if (typeof payload !== "object" || Array.isArray(payload)) {
    return refuse("payload_not_object");
  }
  const raw = payload as Record<string, unknown>;

  const declared = readDeclaredSource(raw);
  if (declared && FORBIDDEN_DECLARED_SOURCES.has(declared)) {
    return refuse("forbidden_declared_source", declared);
  }

  // Run the existing pure normalizer to validate units, ranges, freshness,
  // tent context, and to detect EC unit mismatches and non-finite values.
  let draft: GgsSoilReadingDraft;
  try {
    draft = normalizeGgsSoilSensorReading(raw, {
      now: ctx.now,
      declaredSource: "live",
    });
  } catch {
    return refuse("normalizer_refused", "normalizer threw");
  }

  if (!draft.captured_at) return refuse("captured_at_missing_or_malformed");
  if (!draft.tent_id || draft.tent_id !== ctx.tentId) {
    return refuse("tent_id_missing", "payload tent_id does not match ctx.tentId");
  }
  if (draft.warnings.includes("non_finite_value")) {
    return refuse("non_finite_value");
  }
  if (draft.warnings.includes("soil_ec_unit_mismatch_suspected")) {
    return refuse("soil_ec_unit_mismatch_suspected");
  }
  if (draft.source !== "live") {
    return refuse("normalizer_refused", `source=${draft.source}`);
  }

  const r = draft.readings;
  if (r.soil_moisture_pct === undefined && r.ec === undefined && r.soil_temp_c === undefined) {
    return refuse("no_canonical_readings");
  }
  // Bounds check (defense in depth — DB trigger also enforces -20..80).
  if (typeof r.soil_temp_c === "number" && (r.soil_temp_c < -20 || r.soil_temp_c > 80)) {
    return refuse("soil_temp_out_of_range");
  }

  const sensorId = readSensorId(raw);
  const originalUnits = readOriginalUnits(raw);
  const capturedAt = draft.captured_at;

  const envelope: GgsRealPayloadAuditEnvelope = {
    source_app: GGS_REAL_PAYLOAD_SOURCE_APP,
    sensor_id: sensorId,
    captured_at: capturedAt,
    ...(originalUnits ? { original_units: originalUnits } : {}),
    payload: raw,
  };

  const quality: "ok" | "degraded" = draft.status === "accepted" ? "ok" : "degraded";

  const rows: GgsRealPayloadCommitRow[] = [];
  const idKeyPrefix = `ggs:${ctx.deviceId}:${capturedAt}`;

  const orderedMetrics: Array<[GgsRealPayloadMetric, number | undefined]> = [
    ["soil_moisture_pct", r.soil_moisture_pct],
    ["ec", r.ec],
    ["soil_temp_c", r.soil_temp_c],
  ];
  for (const [metric, value] of orderedMetrics) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    rows.push({
      idempotency_key: `${idKeyPrefix}:${metric}`,
      device_id: ctx.deviceId,
      metric,
      value,
      captured_at: capturedAt,
      source: GGS_REAL_PAYLOAD_SOURCE,
      quality,
      raw_payload: envelope,
    });
  }

  if (rows.length === 0) return refuse("no_canonical_readings");

  return {
    ok: true,
    userId: ctx.userId,
    bridgeId: ctx.bridgeId,
    tentId: ctx.tentId,
    rows,
    warnings: draft.warnings,
  };
}
