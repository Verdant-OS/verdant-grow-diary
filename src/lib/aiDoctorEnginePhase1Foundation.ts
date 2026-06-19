/**
 * AI Doctor Engine — Phase 1 Foundation.
 *
 * Pure, deterministic engine foundation for Verdant's cautious AI Doctor.
 *
 * This module is intentionally additive and lives alongside the existing
 * `aiDoctorEngine.ts` (which already exports a busy public surface used
 * widely across components and tests). To avoid colliding with the
 * already-shipped `compileAiDoctorContextFromRows` / `AiDoctorContext`
 * exports, the foundation uses distinct names:
 *
 *   - `compileAiDoctorContextPayloadFromRows` — the requested
 *     "compileAiDoctorContextFromRows(input): AiDoctorContextPayload"
 *     surface, renamed to avoid breaking ~7 existing consumers of the
 *     legacy compiler.
 *   - `executeAiDoctorEngine` — cautious stubbed execution, never calls
 *     an external model.
 *
 * Hard safety constraints:
 *   - No I/O. No Supabase reads or writes. No alerts. No Action Queue
 *     writes. No automation. No device control.
 *   - No external AI / model calls.
 *   - No use of service_role, bridge tokens, or any privileged secret.
 *   - Never classifies stale / invalid telemetry as healthy.
 *   - Never merges csv / manual / demo readings into the `live` bucket.
 *   - Never emits executable device commands in `action_queue_suggestion`.
 */

// ---------------------------------------------------------------------------
// Source labels
// ---------------------------------------------------------------------------

/** Canonical sensor source labels accepted by this engine. */
export type AiDoctorSensorSource =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid";

export const AI_DOCTOR_SENSOR_SOURCES: readonly AiDoctorSensorSource[] = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
] as const;

/** Sources the engine considers as trustworthy live-ish telemetry. */
const TRUSTWORTHY_SOURCES: ReadonlySet<AiDoctorSensorSource> = new Set([
  "live",
  "manual",
]);

/** Sources the engine never treats as healthy current readings. */
const UNHEALTHY_SOURCES: ReadonlySet<AiDoctorSensorSource> = new Set([
  "stale",
  "invalid",
]);

// ---------------------------------------------------------------------------
// Vision observation (stubbed)
// ---------------------------------------------------------------------------

export interface AiDoctorVisionObservation {
  visual_summary: string;
  leaf_observations: readonly string[];
  structure_observations: readonly string[];
  color_notes: readonly string[];
  pest_or_disease_indicators: readonly string[];
  image_quality_notes: readonly string[];
  /** 0..1 — 0 means "no image inspected / unknown quality". */
  image_quality_score: number;
  /** 0..1 raw self-reported model confidence. Stubs always return 0. */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Context payload
// ---------------------------------------------------------------------------

export type AiDoctorContextTrustLevel = "low" | "medium" | "high";

export interface AiDoctorRecentLogSummary {
  occurred_at: string;
  event_type: string;
  source: string;
  note?: string | null;
}

export type AiDoctorMetricKey =
  | "temperature_c"
  | "humidity_pct"
  | "vpd_kpa"
  | "co2_ppm"
  | "soil_moisture_pct"
  | "soil_ec_ms_cm"
  | "ppfd_umol"
  | "reservoir_ph"
  | "reservoir_ec_ms_cm";

export interface AiDoctorMetricSnapshot {
  metric: AiDoctorMetricKey;
  /** Latest valid value, or null when not available. */
  latest_value: number | null;
  /** Source label of the latest reading, or null when not available. */
  latest_source: AiDoctorSensorSource | null;
  /** ISO timestamp of the latest reading, or null when not available. */
  latest_captured_at: string | null;
  /** True when the latest reading is older than the freshness window. */
  is_stale: boolean;
  /** True when the latest reading is flagged as invalid by its source tag. */
  is_invalid: boolean;
  /**
   * True for non-fatal degradation (e.g. only csv/demo available, or
   * latest reading is stale but a recent value still exists).
   */
  is_degraded: boolean;
  /** Number of readings considered in the last 7 days (any source). */
  sample_count_7d: number;
}

export interface AiDoctorSourceBreakdown {
  source: AiDoctorSensorSource;
  reading_count_7d: number;
}

export interface AiDoctorContextPayload {
  grow_id: string | null;
  tent_id: string | null;
  plant_id: string | null;
  plant_name: string | null;
  strain: string | null;
  stage: string | null;
  medium: string | null;
  pot_size: string | null;
  /** Recent diary/log entries within the last 14 days, newest first. */
  recent_logs: readonly AiDoctorRecentLogSummary[];
  /** Photo count within the last 14 days. */
  recent_photos_count: number;
  /** Watering events within the last 14 days. */
  recent_watering_events: number;
  /** Feeding events within the last 14 days. */
  recent_feeding_events: number;
  /** Per-metric latest snapshot derived from last-7-day readings. */
  sensor_summary: readonly AiDoctorMetricSnapshot[];
  /** Reading counts grouped by source tag, sorted by enum order. */
  source_breakdown: readonly AiDoctorSourceBreakdown[];
  /** Human-readable missing-context notes. Deterministic order. */
  missing_context: readonly string[];
  /** Overall trust signal for the AI Doctor. */
  context_trust_level: AiDoctorContextTrustLevel;
}

// ---------------------------------------------------------------------------
// Diagnosis result
// ---------------------------------------------------------------------------

export type AiDoctorRiskLevel = "low" | "medium" | "high";
export type AiDoctorConfidenceLevel = "low" | "medium" | "high";

export interface AiDoctorActionQueueSuggestion {
  /** Short, review-first, approval-required action description. */
  title: string;
  /** Plain-language rationale tied to evidence. */
  rationale: string;
  /** Always true — Action Queue items remain grower-approved. */
  approval_required: true;
  /** Risk tier of the suggestion. */
  risk_level: AiDoctorRiskLevel;
}

export interface AiDoctorDiagnosisResult {
  summary: string;
  likely_issue: string;
  confidence: AiDoctorConfidenceLevel;
  evidence: readonly string[];
  missing_information: readonly string[];
  possible_causes: readonly string[];
  immediate_action: string;
  what_not_to_do: readonly string[];
  follow_up_24h: string;
  recovery_plan_3_day: string;
  risk_level: AiDoctorRiskLevel;
  action_queue_suggestion: AiDoctorActionQueueSuggestion | null;
}

// ---------------------------------------------------------------------------
// Compiler input rows
// ---------------------------------------------------------------------------

export interface CompileAiDoctorContextRow_Plant {
  id: string | null;
  name?: string | null;
  strain?: string | null;
  stage?: string | null;
  medium?: string | null;
  pot_size?: string | null;
  tent_id?: string | null;
  grow_id?: string | null;
}

export interface CompileAiDoctorContextRow_Log {
  id?: string | null;
  occurred_at: string;
  event_type: string;
  source?: string | null;
  note?: string | null;
}

export interface CompileAiDoctorContextRow_Photo {
  id?: string | null;
  captured_at: string;
}

export interface CompileAiDoctorContextRow_SensorReading {
  id?: string | null;
  metric: AiDoctorMetricKey | string;
  value: number | null;
  captured_at: string;
  source: AiDoctorSensorSource | string;
}

export interface CompileAiDoctorContextPayloadFromRowsInput {
  plant?: CompileAiDoctorContextRow_Plant | null;
  grow?: { id: string | null } | null;
  tent?: { id: string | null } | null;
  logs?: readonly CompileAiDoctorContextRow_Log[] | null;
  photos?: readonly CompileAiDoctorContextRow_Photo[] | null;
  sensorReadings?: readonly CompileAiDoctorContextRow_SensorReading[] | null;
  /** Optional alerts — reserved for future use, not consumed yet. */
  alerts?: readonly unknown[] | null;
  /** Injectable clock for deterministic tests. */
  now?: Date;
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LOG_WINDOW_DAYS = 14;
const SENSOR_WINDOW_DAYS = 7;
/** Reading older than this (vs. `now`) is treated as stale-by-time. */
const SENSOR_FRESH_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

function parseTime(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function isWithin(daysWindow: number, capturedMs: number, nowMs: number): boolean {
  return capturedMs >= nowMs - daysWindow * MS_PER_DAY && capturedMs <= nowMs;
}

function normalizeSource(raw: string | null | undefined): AiDoctorSensorSource | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (
    lower === "live" ||
    lower === "manual" ||
    lower === "csv" ||
    lower === "demo" ||
    lower === "stale" ||
    lower === "invalid"
  ) {
    return lower;
  }
  return null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// Context compiler
// ---------------------------------------------------------------------------

const METRIC_KEYS: readonly AiDoctorMetricKey[] = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
  "soil_ec_ms_cm",
  "ppfd_umol",
  "reservoir_ph",
  "reservoir_ec_ms_cm",
] as const;

/**
 * Pure, deterministic context compiler. Caller supplies already-fetched
 * RLS-safe rows. Returns a compact `AiDoctorContextPayload`.
 *
 * Renamed from the spec's `compileAiDoctorContextFromRows` to avoid
 * colliding with the legacy export of the same name in `aiDoctorEngine.ts`.
 */
export function compileAiDoctorContextPayloadFromRows(
  input: CompileAiDoctorContextPayloadFromRowsInput,
): AiDoctorContextPayload {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();

  const plant = input.plant ?? null;

  // ---- Logs (last 14 days, newest first, stable tiebreaker) -------------
  const recent_logs: AiDoctorRecentLogSummary[] = [];
  let recent_watering_events = 0;
  let recent_feeding_events = 0;
  for (const log of input.logs ?? []) {
    if (!log || typeof log.occurred_at !== "string") continue;
    const t = parseTime(log.occurred_at);
    if (t === null || !isWithin(LOG_WINDOW_DAYS, t, nowMs)) continue;
    recent_logs.push({
      occurred_at: log.occurred_at,
      event_type: log.event_type,
      source: log.source ?? "unknown",
      note: log.note ?? null,
    });
    const type = (log.event_type ?? "").toLowerCase();
    if (type === "watering") recent_watering_events += 1;
    if (type === "feeding") recent_feeding_events += 1;
  }
  recent_logs.sort((a, b) => {
    const ta = parseTime(a.occurred_at) ?? 0;
    const tb = parseTime(b.occurred_at) ?? 0;
    if (tb !== ta) return tb - ta;
    return a.event_type.localeCompare(b.event_type);
  });

  // ---- Photos (last 14 days) --------------------------------------------
  let recent_photos_count = 0;
  for (const photo of input.photos ?? []) {
    if (!photo || typeof photo.captured_at !== "string") continue;
    const t = parseTime(photo.captured_at);
    if (t === null || !isWithin(LOG_WINDOW_DAYS, t, nowMs)) continue;
    recent_photos_count += 1;
  }

  // ---- Sensor readings (last 7 days) ------------------------------------
  type Normalized = {
    metric: AiDoctorMetricKey;
    value: number | null;
    captured_at: string;
    capturedMs: number;
    source: AiDoctorSensorSource;
  };
  const normalized: Normalized[] = [];
  for (const r of input.sensorReadings ?? []) {
    if (!r || typeof r.captured_at !== "string") continue;
    const t = parseTime(r.captured_at);
    if (t === null || !isWithin(SENSOR_WINDOW_DAYS, t, nowMs)) continue;
    const metric = (METRIC_KEYS as readonly string[]).includes(r.metric as string)
      ? (r.metric as AiDoctorMetricKey)
      : null;
    if (!metric) continue;
    const source = normalizeSource(r.source as string);
    if (!source) continue;
    normalized.push({
      metric,
      value: typeof r.value === "number" && Number.isFinite(r.value) ? r.value : null,
      captured_at: r.captured_at,
      capturedMs: t,
      source,
    });
  }
  // Stable sort: newest first, tiebreak by source enum order then captured_at.
  const sourceOrder: Record<AiDoctorSensorSource, number> = {
    live: 0, manual: 1, csv: 2, demo: 3, stale: 4, invalid: 5,
  };
  normalized.sort((a, b) => {
    if (b.capturedMs !== a.capturedMs) return b.capturedMs - a.capturedMs;
    if (sourceOrder[a.source] !== sourceOrder[b.source]) {
      return sourceOrder[a.source] - sourceOrder[b.source];
    }
    return a.captured_at.localeCompare(b.captured_at);
  });

  // Per-metric snapshot
  const sensor_summary: AiDoctorMetricSnapshot[] = METRIC_KEYS.map((metric) => {
    const forMetric = normalized.filter((n) => n.metric === metric);
    if (forMetric.length === 0) {
      return {
        metric,
        latest_value: null,
        latest_source: null,
        latest_captured_at: null,
        is_stale: false,
        is_invalid: false,
        is_degraded: false,
        sample_count_7d: 0,
      };
    }
    const latest = forMetric[0]!;
    const isInvalid = latest.source === "invalid";
    const ageMs = nowMs - latest.capturedMs;
    const isStale =
      latest.source === "stale" || ageMs > SENSOR_FRESH_MAX_AGE_MS;
    const isDegraded =
      !TRUSTWORTHY_SOURCES.has(latest.source) || isStale || isInvalid;
    return {
      metric,
      latest_value: isInvalid ? null : latest.value,
      latest_source: latest.source,
      latest_captured_at: latest.captured_at,
      is_stale: isStale,
      is_invalid: isInvalid,
      is_degraded: isDegraded,
      sample_count_7d: forMetric.length,
    };
  });

  // Source breakdown (deterministic enum order)
  const counts = new Map<AiDoctorSensorSource, number>();
  for (const n of normalized) {
    counts.set(n.source, (counts.get(n.source) ?? 0) + 1);
  }
  const source_breakdown: AiDoctorSourceBreakdown[] = AI_DOCTOR_SENSOR_SOURCES
    .map((source) => ({ source, reading_count_7d: counts.get(source) ?? 0 }))
    .filter((b) => b.reading_count_7d > 0);

  // ---- Missing context (deterministic order) ----------------------------
  const missing_context: string[] = [];
  if (!plant || !plant.id) missing_context.push("plant identity");
  if (!nonEmptyString(plant?.strain)) missing_context.push("strain");
  if (!nonEmptyString(plant?.stage)) missing_context.push("growth stage");
  if (!nonEmptyString(plant?.medium)) missing_context.push("growing medium");
  if (!nonEmptyString(plant?.pot_size)) missing_context.push("pot size");
  if (recent_logs.length === 0) missing_context.push("recent diary entries (14d)");
  if (recent_photos_count === 0) missing_context.push("recent photo (14d)");
  const hasTrustworthyReading = sensor_summary.some(
    (m) => m.latest_source !== null && !m.is_invalid && !m.is_stale &&
      TRUSTWORTHY_SOURCES.has(m.latest_source),
  );
  if (!hasTrustworthyReading) {
    missing_context.push("recent trustworthy sensor reading (7d)");
  }

  // ---- Trust level ------------------------------------------------------
  const hasPlantContext = !!plant && !!plant.id &&
    !!nonEmptyString(plant.stage);
  const hasRecentLogs = recent_logs.length > 0;
  const hasRecentPhoto = recent_photos_count > 0;
  let context_trust_level: AiDoctorContextTrustLevel;
  if (hasPlantContext && hasRecentLogs && hasRecentPhoto && hasTrustworthyReading) {
    context_trust_level = "high";
  } else if (
    hasPlantContext &&
    (hasRecentLogs || hasRecentPhoto || hasTrustworthyReading)
  ) {
    context_trust_level = "medium";
  } else {
    context_trust_level = "low";
  }

  return {
    grow_id: input.grow?.id ?? plant?.grow_id ?? null,
    tent_id: input.tent?.id ?? plant?.tent_id ?? null,
    plant_id: plant?.id ?? null,
    plant_name: nonEmptyString(plant?.name),
    strain: nonEmptyString(plant?.strain),
    stage: nonEmptyString(plant?.stage),
    medium: nonEmptyString(plant?.medium),
    pot_size: nonEmptyString(plant?.pot_size),
    recent_logs,
    recent_photos_count,
    recent_watering_events,
    recent_feeding_events,
    sensor_summary,
    source_breakdown,
    missing_context,
    context_trust_level,
  };
}

// ---------------------------------------------------------------------------
// Stubbed executor
// ---------------------------------------------------------------------------

export interface ExecuteAiDoctorEngineOptions {
  /** Optional vision observation if a photo was inspected upstream. */
  vision?: AiDoctorVisionObservation | null;
  /** Engine version label, surfaced in summary. */
  version?: string;
}

export interface ExecuteAiDoctorEngineInput {
  context: AiDoctorContextPayload;
}

/**
 * Cautious, stubbed AI Doctor execution.
 *
 * Does NOT call any external model. Returns a structured placeholder
 * diagnosis derived from the compiled context. Confidence and risk
 * always reflect what the context can actually support.
 */
export async function executeAiDoctorEngine(
  input: ExecuteAiDoctorEngineInput,
  options?: ExecuteAiDoctorEngineOptions,
): Promise<AiDoctorDiagnosisResult> {
  const ctx = input.context;

  const evidence: string[] = [];
  if (ctx.plant_id) {
    evidence.push(
      `Plant ${ctx.plant_name ?? ctx.plant_id}` +
        (ctx.stage ? `, stage=${ctx.stage}` : "") +
        (ctx.strain ? `, strain=${ctx.strain}` : ""),
    );
  }
  if (ctx.recent_logs.length > 0) {
    evidence.push(`${ctx.recent_logs.length} diary entries in last 14 days`);
  }
  if (ctx.recent_photos_count > 0) {
    evidence.push(`${ctx.recent_photos_count} photo(s) in last 14 days`);
  }
  for (const b of ctx.source_breakdown) {
    evidence.push(
      `Sensor source ${b.source}: ${b.reading_count_7d} reading(s) in last 7 days`,
    );
  }
  const degradedMetrics = ctx.sensor_summary.filter((m) => m.is_degraded);
  for (const m of degradedMetrics) {
    if (m.is_invalid) {
      evidence.push(`Metric ${m.metric}: latest reading flagged INVALID — not used as healthy.`);
    } else if (m.is_stale) {
      evidence.push(`Metric ${m.metric}: latest reading is stale — not treated as current.`);
    }
  }
  if (options?.vision) {
    evidence.push(
      `Vision pass: quality=${options.vision.image_quality_score.toFixed(2)}`,
    );
  }

  const missing_information: string[] = [...ctx.missing_context];
  if (!options?.vision) missing_information.push("fresh photo vision pass");

  const possible_causes: string[] = [];
  if (degradedMetrics.length > 0) {
    possible_causes.push(
      "Sensor pipeline issue (stale/invalid readings) — current state cannot rely on these.",
    );
  }
  if (ctx.recent_watering_events === 0 && ctx.recent_feeding_events === 0) {
    possible_causes.push(
      "No recent watering/feeding logged — actual root-zone state is unknown.",
    );
  }
  if (possible_causes.length === 0) {
    possible_causes.push(
      "Insufficient evidence to enumerate likely causes; observe and re-check.",
    );
  }

  const confidence: AiDoctorConfidenceLevel =
    ctx.context_trust_level === "high"
      ? "high"
      : ctx.context_trust_level === "medium"
        ? "medium"
        : "low";

  const isAutoflower = (ctx.strain ?? "").toLowerCase().includes("auto");
  const what_not_to_do: string[] = [
    "Do not make aggressive nutrient changes based on this output.",
    "Do not execute any device or equipment command automatically.",
  ];
  if (isAutoflower && confidence !== "high") {
    what_not_to_do.push(
      "Autoflower with weak context: avoid heavy defoliation, transplant, or high-stress recovery tactics.",
    );
  }

  const summary =
    confidence === "low"
      ? "AI Doctor Phase 1: insufficient trustworthy context for a real diagnosis — more information is needed."
      : "AI Doctor Phase 1: cautious, observation-only summary based on supplied context.";

  const likely_issue =
    confidence === "low"
      ? ""
      : degradedMetrics.length > 0
        ? "Sensor data quality issue is the most visible signal; plant-level cause unclear without more evidence."
        : "No clear single issue identified from available evidence.";

  // Risk level: stale/invalid telemetry escalates to medium; otherwise low.
  const risk_level: AiDoctorRiskLevel = degradedMetrics.some(
    (m) => m.is_invalid || m.is_stale,
  )
    ? "medium"
    : "low";

  // Action Queue suggestion — strict guard: only medium/high risk AND enough
  // context; never an executable command; always approval-required.
  let action_queue_suggestion: AiDoctorActionQueueSuggestion | null = null;
  if (
    (risk_level === "medium" || risk_level === "high") &&
    confidence !== "low"
  ) {
    action_queue_suggestion = {
      title: "Review sensor freshness and capture a fresh manual snapshot",
      rationale:
        "Recent telemetry is stale or invalid. Confirm the bridge/sensor is healthy and log one fresh manual snapshot before changing inputs.",
      approval_required: true,
      risk_level,
    };
  }

  const versionTag = options?.version ? ` [${options.version}]` : "";

  return {
    summary: summary + versionTag,
    likely_issue,
    confidence,
    evidence,
    missing_information,
    possible_causes,
    immediate_action:
      "Observe and re-check. Do not change inputs based on this output.",
    what_not_to_do,
    follow_up_24h:
      "Re-confirm sensor freshness and source labels; log one fresh manual snapshot if no live readings are present.",
    recovery_plan_3_day:
      "Maintain stable conditions, log daily diary entries, and capture a fresh photo and manual snapshot each day so the next pass has trustworthy context.",
    risk_level,
    action_queue_suggestion,
  };
}
