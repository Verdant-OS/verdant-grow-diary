/**
 * ggsSentinelSmokeRunner — pure evaluator that decides whether a tent's
 * recent sensor data clears the live Sentinel sign-off for the Spider
 * Farmer GGS 3-in-1 Soil Sensor Pro path.
 *
 * HARD CONSTRAINTS (stop-ship if violated):
 *   - Pure. No I/O, no Supabase, no fetch, no timers, no console.
 *   - Read-only. NEVER returns rows that would mutate state.
 *   - NEVER surfaces `raw_payload.payload` bodies — only the safe
 *     `source_app` provenance tag, captured_at, source, metric, value.
 *   - Source classification is read from the rows; we never promote a
 *     non-canonical source (`ggs_live`, `ggs_csv`, etc.) to `live`.
 *   - Freshness threshold matches `SPIDER_FARMER_GGS_STALE_MS` (15min).
 */
import { SPIDER_FARMER_GGS_STALE_MS } from "@/lib/spiderFarmerGgsMappingRules";
import { GGS_REAL_PAYLOAD_SOURCE_APP } from "@/lib/ggsRealPayloadIngestRules";

export const GGS_SENTINEL_METRICS = ["soil_moisture_pct", "ec", "soil_temp_c"] as const;
export type GgsSentinelMetric = (typeof GGS_SENTINEL_METRICS)[number];

export const CANONICAL_LIVE_SOURCES = new Set(["live"]);
export const FORBIDDEN_NON_CANONICAL_SOURCES = new Set(["ggs_live", "ggs_csv"]);

export type GgsSentinelState =
  | "PASS_LIVE_SENTINEL_READY"
  | "BLOCKED_NO_GGS_ROWS"
  | "BLOCKED_NO_SOIL_TEMP_C"
  | "BLOCKED_NO_EC"
  | "BLOCKED_VENDOR_PROVENANCE_MISSING"
  | "BLOCKED_SOURCE_NOT_CANONICAL"
  | "BLOCKED_STALE_READING"
  | "BLOCKED_RAW_PAYLOAD_RENDER_RISK"
  | "BLOCKED_VALIDATION_ERROR";

/** Minimal row shape consumed by the evaluator. Pulled from sensor_readings. */
export interface GgsSentinelInputRow {
  metric: string;
  value: number | null;
  source: string | null;
  captured_at: string;
  raw_payload: unknown;
}

/** Shape of `get_latest_tent_sensor_snapshot` RPC return. */
export interface GgsSentinelSnapshot {
  captured_at: string | null;
  source: string | null;
  soil_moisture?: number | null;
  soil_temp?: number | null;
  soil_ec?: number | null;
  temperature?: number | null;
  humidity?: number | null;
  vpd?: number | null;
  ppfd?: number | null;
}

export type GgsSentinelCheckStatus = "pass" | "fail" | "warn" | "skipped";
export interface GgsSentinelCheck {
  id: string;
  label: string;
  status: GgsSentinelCheckStatus;
  detail?: string;
}

export type GgsFreshnessStatus = "fresh" | "aging" | "stale" | "missing";

export interface GgsSentinelMetricFreshness {
  metric: GgsSentinelMetric;
  capturedAt: string | null;
  ageMs: number | null;
  ageLabel: string;
  freshnessWindowMs: number;
  freshnessWindowLabel: string;
  freshnessStatus: GgsFreshnessStatus;
  fresh: boolean;
  stale: boolean;
  missing: boolean;
  nextActionLabel: string;
}

export interface GgsSentinelSafeMetricSummary {
  metric: GgsSentinelMetric;
  value: number;
  source: string;
  vendor: string | null;
  captured_at: string;
  age_seconds: number;
  freshness: GgsSentinelMetricFreshness;
}

export interface GgsSentinelEvaluation {
  state: GgsSentinelState;
  checks: GgsSentinelCheck[];
  safeMetrics: GgsSentinelSafeMetricSummary[];
  metricFreshness: GgsSentinelMetricFreshness[];
  snapshot: {
    captured_at: string | null;
    source: string | null;
    age_seconds: number | null;
    soil_moisture: number | null;
    soil_temp: number | null;
    soil_ec: number | null;
  } | null;
  /** True only when no failed checks remain. */
  passed: boolean;
}

export interface GgsSentinelEvaluateInput {
  rows: GgsSentinelInputRow[];
  snapshot: GgsSentinelSnapshot | null;
  now?: Date;
  /** Freshness threshold; defaults to GGS 15-minute stale window. */
  staleMs?: number;
}

export const GGS_METRIC_FRIENDLY_NAME: Record<GgsSentinelMetric, string> = {
  soil_moisture_pct: "soil moisture",
  ec: "EC",
  soil_temp_c: "soil temperature",
};

export function formatGgsAgeLabel(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) return "just now";
  const totalSec = Math.round(ageMs / 1000);
  if (totalSec === 0) return "0m ago";
  if (totalSec < 60) return `${totalSec}s ago`;
  const totalMin = Math.floor(totalSec / 60);
  const remainingSec = totalSec % 60;
  if (totalMin < 60) {
    return remainingSec === 0
      ? `${totalMin}m ago`
      : `${totalMin}m ${remainingSec}s ago`;
  }
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins === 0 ? `${hours}h ago` : `${hours}h ${mins}m ago`;
}

export function formatGgsWindowLabel(ms: number): string {
  const mins = Math.round(ms / 60000);
  return `${mins} min`;
}

function buildFreshness(
  metric: GgsSentinelMetric,
  capturedAt: string | null,
  now: Date,
  windowMs: number,
): GgsSentinelMetricFreshness {
  const windowLabel = formatGgsWindowLabel(windowMs);
  if (!capturedAt) {
    return {
      metric,
      capturedAt: null,
      ageMs: null,
      ageLabel: "—",
      freshnessWindowMs: windowMs,
      freshnessWindowLabel: windowLabel,
      freshnessStatus: "missing",
      fresh: false,
      stale: false,
      missing: true,
      nextActionLabel: `Missing — no recent GGS ${GGS_METRIC_FRIENDLY_NAME[metric]} row found.`,
    };
  }
  const t = new Date(capturedAt).getTime();
  const ageMs = Number.isFinite(t) ? Math.max(0, now.getTime() - t) : Number.POSITIVE_INFINITY;
  const ageLabel = formatGgsAgeLabel(ageMs);
  if (ageMs > windowMs) {
    return {
      metric,
      capturedAt,
      ageMs,
      ageLabel,
      freshnessWindowMs: windowMs,
      freshnessWindowLabel: windowLabel,
      freshnessStatus: "stale",
      fresh: false,
      stale: true,
      missing: false,
      nextActionLabel: `Stale — captured ${ageLabel}. Ingest a new real GGS reading to clear live Sentinel.`,
    };
  }
  const aging = ageMs > windowMs * 0.75;
  if (aging) {
    return {
      metric,
      capturedAt,
      ageMs,
      ageLabel,
      freshnessWindowMs: windowMs,
      freshnessWindowLabel: windowLabel,
      freshnessStatus: "aging",
      fresh: true,
      stale: false,
      missing: false,
      nextActionLabel: `Fresh but aging — captured ${ageLabel}. Recheck soon; stale at ${windowLabel}.`,
    };
  }
  return {
    metric,
    capturedAt,
    ageMs,
    ageLabel,
    freshnessWindowMs: windowMs,
    freshnessWindowLabel: windowLabel,
    freshnessStatus: "fresh",
    fresh: true,
    stale: false,
    missing: false,
    nextActionLabel: `Fresh — captured ${ageLabel}. Valid for live Sentinel.`,
  };
}

function ageSeconds(capturedAt: string, now: Date): number {
  const t = new Date(capturedAt).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.round((now.getTime() - t) / 1000);
}

function readVendor(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = (raw as Record<string, unknown>).source_app;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function check(
  id: string,
  label: string,
  status: GgsSentinelCheckStatus,
  detail?: string,
): GgsSentinelCheck {
  return detail === undefined ? { id, label, status } : { id, label, status, detail };
}

/**
 * Evaluate Sentinel readiness from already-fetched rows + snapshot.
 * Read-only. Deterministic. Safe to call from tests with fixtures.
 */
export function evaluateGgsSentinelReadiness(
  input: GgsSentinelEvaluateInput,
): GgsSentinelEvaluation {
  const now = input.now ?? new Date();
  const staleMs = input.staleMs ?? SPIDER_FARMER_GGS_STALE_MS;
  const checks: GgsSentinelCheck[] = [];

  const rows = Array.isArray(input.rows) ? input.rows : [];
  // Bucket the latest row per canonical metric, preferring vendor-tagged rows.
  const latestByMetric = new Map<GgsSentinelMetric, GgsSentinelInputRow>();
  for (const r of rows) {
    if (!r || typeof r.metric !== "string") continue;
    if (!GGS_SENTINEL_METRICS.includes(r.metric as GgsSentinelMetric)) continue;
    if (typeof r.value !== "number" || !Number.isFinite(r.value)) continue;
    const metric = r.metric as GgsSentinelMetric;
    const existing = latestByMetric.get(metric);
    if (!existing) {
      latestByMetric.set(metric, r);
      continue;
    }
    if (new Date(r.captured_at).getTime() > new Date(existing.captured_at).getTime()) {
      latestByMetric.set(metric, r);
    }
  }

  const hasAny = latestByMetric.size > 0;
  checks.push(
    check(
      "ggs_rows_exist",
      "Recent GGS sensor rows exist",
      hasAny ? "pass" : "fail",
      hasAny ? `${latestByMetric.size}/3 canonical metrics present` : "no rows found",
    ),
  );

  if (!hasAny) {
    return {
      state: "BLOCKED_NO_GGS_ROWS",
      checks,
      safeMetrics: [],
      metricFreshness: GGS_SENTINEL_METRICS.map((m) =>
        buildFreshness(m, null, now, staleMs),
      ),
      snapshot: summarizeSnapshot(input.snapshot, now),
      passed: false,
    };
  }


  const hasSoilTemp = latestByMetric.has("soil_temp_c");
  checks.push(
    check(
      "soil_temp_c_present",
      "soil_temp_c row present",
      hasSoilTemp ? "pass" : "fail",
    ),
  );
  const hasEc = latestByMetric.has("ec");
  checks.push(check("ec_present", "ec row present", hasEc ? "pass" : "fail"));
  const hasMoisture = latestByMetric.has("soil_moisture_pct");
  checks.push(
    check(
      "soil_moisture_pct_present",
      "soil_moisture_pct row present",
      hasMoisture ? "pass" : "fail",
    ),
  );

  // Source canonical + vendor provenance on the rows we DO have.
  let sawForbiddenSource: string | null = null;
  let missingVendorFor: GgsSentinelMetric | null = null;
  let staleMetric: { metric: GgsSentinelMetric; age: number } | null = null;
  const safeMetrics: GgsSentinelSafeMetricSummary[] = [];

  for (const metric of GGS_SENTINEL_METRICS) {
    const row = latestByMetric.get(metric);
    if (!row) continue;
    const src = (row.source ?? "").trim();
    if (FORBIDDEN_NON_CANONICAL_SOURCES.has(src)) {
      sawForbiddenSource = src;
    }
    const vendor = readVendor(row.raw_payload);
    if (vendor !== GGS_REAL_PAYLOAD_SOURCE_APP) {
      missingVendorFor = metric;
    }
    const age = ageSeconds(row.captured_at, now);
    if (age * 1000 > staleMs) {
      if (!staleMetric || age > staleMetric.age) staleMetric = { metric, age };
    }
    const freshness = buildFreshness(metric, row.captured_at, now, staleMs);
    safeMetrics.push({
      metric,
      value: row.value as number,
      source: src,
      vendor,
      captured_at: row.captured_at,
      age_seconds: age,
      freshness,
    });
  }

  const metricFreshness: GgsSentinelMetricFreshness[] = GGS_SENTINEL_METRICS.map((m) => {
    const found = safeMetrics.find((s) => s.metric === m);
    return found ? found.freshness : buildFreshness(m, null, now, staleMs);
  });


  checks.push(
    check(
      "source_canonical",
      "All GGS rows use canonical source",
      sawForbiddenSource ? "fail" : "pass",
      sawForbiddenSource ? `forbidden source: ${sawForbiddenSource}` : undefined,
    ),
  );
  checks.push(
    check(
      "vendor_provenance",
      `raw_payload.source_app = "${GGS_REAL_PAYLOAD_SOURCE_APP}"`,
      missingVendorFor ? "fail" : "pass",
      missingVendorFor ? `missing/invalid for ${missingVendorFor}` : undefined,
    ),
  );
  checks.push(
    check(
      "freshness",
      `Rows fresh within ${Math.round(staleMs / 60000)} min`,
      staleMetric ? "fail" : "pass",
      staleMetric ? `${staleMetric.metric} age ${staleMetric.age}s` : undefined,
    ),
  );

  // Snapshot RPC checks.
  const snapshot = summarizeSnapshot(input.snapshot, now);
  const snapMoisture = snapshot?.soil_moisture ?? null;
  const snapTemp = snapshot?.soil_temp ?? null;
  const snapEc = snapshot?.soil_ec ?? null;
  checks.push(
    check(
      "snapshot_populated",
      "Snapshot RPC populated for moisture / EC / soil temp",
      snapMoisture !== null && snapTemp !== null && snapEc !== null ? "pass" : "warn",
      JSON.stringify({
        soil_moisture: snapMoisture,
        soil_temp: snapTemp,
        soil_ec: snapEc,
      }),
    ),
  );

  // Decide terminal state in priority order.
  let state: GgsSentinelState;
  if (sawForbiddenSource) {
    state = "BLOCKED_SOURCE_NOT_CANONICAL";
  } else if (missingVendorFor) {
    state = "BLOCKED_VENDOR_PROVENANCE_MISSING";
  } else if (!hasSoilTemp) {
    state = "BLOCKED_NO_SOIL_TEMP_C";
  } else if (!hasEc) {
    state = "BLOCKED_NO_EC";
  } else if (!hasMoisture) {
    // Treat as BLOCKED_NO_GGS_ROWS-ish, but more specific: moisture missing.
    state = "BLOCKED_NO_GGS_ROWS";
  } else if (staleMetric) {
    state = "BLOCKED_STALE_READING";
  } else {
    state = "PASS_LIVE_SENTINEL_READY";
  }

  return {
    state,
    checks,
    safeMetrics,
    metricFreshness,
    snapshot,
    passed: state === "PASS_LIVE_SENTINEL_READY",
  };
}


function summarizeSnapshot(
  snapshot: GgsSentinelSnapshot | null,
  now: Date,
): GgsSentinelEvaluation["snapshot"] {
  if (!snapshot) return null;
  const capturedAt = snapshot.captured_at ?? null;
  return {
    captured_at: capturedAt,
    source: snapshot.source ?? null,
    age_seconds: capturedAt ? ageSeconds(capturedAt, now) : null,
    soil_moisture: snapshot.soil_moisture ?? null,
    soil_temp: snapshot.soil_temp ?? null,
    soil_ec: snapshot.soil_ec ?? null,
  };
}
