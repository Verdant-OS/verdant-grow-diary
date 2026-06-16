/**
 * AI Doctor context compiler.
 *
 * Contains two layers, both pure / deterministic:
 *
 *  1. `compileAiDoctorContext` — assembles AI Doctor context sources,
 *     keeping Environment Check evidence (local EcoWitt validation)
 *     SEPARATE from live sensor context.
 *
 *  2. `compilePlantContextFromRows` (Phase 1 engine) — turns RLS-safe
 *     rows (already fetched by the caller) into a compact
 *     `PlantContextPayload` for the AI Doctor pipeline.
 *
 * Hard constraints (both layers):
 *  - No I/O. No Supabase calls. No React.
 *  - No automation, no Action Queue writes, no alerts.
 *  - Source labels are preserved verbatim. We NEVER merge
 *    csv/manual/demo into the `live` bucket.
 *  - Readings tagged `stale` or `invalid` are surfaced as their own
 *    buckets and never feed the "healthy" view of the plant.
 *  - Only the last 14 days of grow events and the last 7 days of sensor
 *    readings are included by the Phase 1 row compiler.
 */

import {
  buildAiDoctorEnvironmentCheckContext,
  selectBestEnvironmentCheckEvent,
  type AiDoctorEnvironmentCheckResult,
  type BestEnvironmentCheckSelection,
  type EnvironmentCheckEventInput,
} from "./aiDoctorEnvironmentCheckRules";
import type { AiDoctorSensorContext } from "./aiDoctorSensorContextRules";
import {
  buildAiDoctorCsvHistoryContext,
  type AiDoctorCsvHistoryContext,
} from "./aiDoctorCsvHistoryContextRules";
import {
  buildEarlyStageAiDoctorContext,
  type EarlyStageAiDoctorContext,
} from "./earlyStageAiDoctorContextRules";


/** Section label rendered for imported CSV/XLSX sensor history. */
export const AI_DOCTOR_IMPORTED_SENSOR_HISTORY_SECTION_LABEL =
  "Imported sensor history";

export interface ImportedSensorHistorySection extends AiDoctorCsvHistoryContext {
  sectionLabel: typeof AI_DOCTOR_IMPORTED_SENSOR_HISTORY_SECTION_LABEL;
  /** Cautionary guidance the AI Doctor consumer renders verbatim. */
  guidance: readonly string[];
}

// ---------------------------------------------------------------------------
// Layer 1 — environment-check aware context compiler (existing behavior).
// ---------------------------------------------------------------------------

export interface CompileAiDoctorContextInput {
  /** Live sensor context from NEX-6 mapping (if any). */
  sensorContext?: AiDoctorSensorContext | null;
  /** Recent diary/grow_events candidates (already fetched by caller). */
  environmentCheckEvents?: readonly EnvironmentCheckEventInput[] | null;
}

export interface CompiledAiDoctorContext {
  /** Live sensor evidence (unchanged from existing behavior). */
  sensor: AiDoctorSensorContext | null;
  /** Local/test Environment Check evidence, kept SEPARATE from live. */
  environmentCheck: AiDoctorEnvironmentCheckResult;
  /** Selection metadata for the chosen Environment Check, if any. */
  environmentCheckSelection: BestEnvironmentCheckSelection;
  /** Combined safety notes (sensor + environment-check). Deterministic. */
  combinedSafetyNotes: string[];
  /** True only when caller has at least one usable evidence source. */
  hasAnyEvidence: boolean;
}

export function compileAiDoctorContext(
  input: CompileAiDoctorContextInput,
): CompiledAiDoctorContext {
  const sensor = input.sensorContext ?? null;
  const selection = selectBestEnvironmentCheckEvent(
    input.environmentCheckEvents ?? [],
  );
  const environmentCheck = buildAiDoctorEnvironmentCheckContext(
    selection.selected,
  );

  const combined: string[] = [];
  const push = (n: string) => {
    if (!combined.includes(n)) combined.push(n);
  };
  if (sensor) for (const n of sensor.safetyNotes) push(n);
  if (environmentCheck.kind === "present")
    for (const n of environmentCheck.safetyNotes) push(n);
  if (selection.isFallback && environmentCheck.kind === "present") {
    push(
      "Selected Environment Check is a weak fallback — no accepted required metric. Treat as untrusted.",
    );
  }

  const hasAnyEvidence =
    (sensor !== null && sensor.usableMetrics.length > 0) ||
    environmentCheck.kind === "present";

  return {
    sensor,
    environmentCheck,
    environmentCheckSelection: selection,
    combinedSafetyNotes: combined,
    hasAnyEvidence,
  };
}

// ---------------------------------------------------------------------------
// Layer 2 — Phase 1 row-based plant context compiler.
// ---------------------------------------------------------------------------



export type SensorSourceTag =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid";

export const SENSOR_SOURCE_ORDER: readonly SensorSourceTag[] = Object.freeze([
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
]);

export interface RecentGrowEvent {
  occurred_at: string;
  event_type: string;
  source_tag: string;
  note: string | null;
}

export interface RecentSensorReading {
  captured_at: string;
  metric: string;
  value: number;
  unit: string | null;
  source_tag: SensorSourceTag;
}

export interface SensorRollingAverages {
  temperature_c: number | null;
  humidity_pct: number | null;
  vpd_kpa: number | null;
  co2_ppm: number | null;
}

export interface SensorSourceGroup {
  source: SensorSourceTag;
  sample_count: number;
  averages: SensorRollingAverages;
  readings: readonly RecentSensorReading[];
}

export interface PlantContextPayload {
  grow_id: string | null;
  tent_id: string | null;
  plant_id: string | null;
  plant_name: string | null;
  strain: string | null;
  stage: string | null;
  recent_grow_events: readonly RecentGrowEvent[];
  recentSensorReadings: readonly RecentSensorReading[];
  sensor_groups: readonly SensorSourceGroup[];
  averages_7d: SensorRollingAverages;
  notable_deviations: readonly string[];
  source_tags: readonly SensorSourceTag[];
  /**
   * Safe, read-only summary of imported CSV/XLSX sensor history.
   * Present only when at least one CSV row contributed. Never used as
   * a substitute for current/live telemetry.
   */
  imported_sensor_history: ImportedSensorHistorySection | null;
  /**
   * True only when at least one trustworthy live reading exists in the
   * compiled context. CSV history NEVER flips this flag to true.
   */
  hasLiveSensorReadings: boolean;
  /**
   * True when no current/live sensor evidence exists. Stays true even
   * when CSV history is present, so AI Doctor still surfaces the
   * missing-live-readings caveat.
   */
  missingLiveSensorReadings: boolean;
  /**
   * Optional, additive early-stage (germination/seedling) memory compiled
   * from saved Quick Log / diary `details.early_stage` envelopes. Null
   * when no early-stage memory exists. Safe-by-construction: never
   * carries raw payloads, tokens, privileged backend keys, or unknown
   * enum strings.
   */
  early_stage_memory: EarlyStageAiDoctorContext | null;
}


// ---------------------------------------------------------------------------
// Row shapes (intentionally permissive — caller supplies whatever they have).
// ---------------------------------------------------------------------------

export interface PlantRowLike {
  id?: string | null;
  grow_id?: string | null;
  tent_id?: string | null;
  name?: string | null;
  strain?: string | null;
  stage?: string | null;
  growth_stage?: string | null;
}

export interface GrowEventRowLike {
  occurred_at?: string | null;
  event_type?: string | null;
  source?: string | null;
  note?: string | null;
  /** Free-form details JSON — may carry an `early_stage` envelope. */
  details?: unknown;
}


export interface SensorReadingRowLike {
  metric?: string | null;
  value?: number | string | null;
  unit?: string | null;
  captured_at?: string | null;
  source?: string | null;
  quality?: string | null;
  state?: string | null;
  raw_payload?: unknown;
}

export interface CompilePlantContextFromRowsInput {
  plant: PlantRowLike | null;
  growEvents: readonly GrowEventRowLike[];
  sensorReadings: readonly SensorReadingRowLike[];
  now?: Date;
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function classifySource(row: SensorReadingRowLike): SensorSourceTag {
  // Explicit state/quality flags win — invalid/stale must never read as live.
  const stateLike = (row.state ?? row.quality ?? "").toString().toLowerCase();
  if (stateLike === "invalid") return "invalid";
  if (stateLike === "stale") return "stale";
  if (stateLike === "demo") return "demo";
  if (stateLike === "manual") return "manual";
  if (stateLike === "csv") return "csv";
  const source = (row.source ?? "").toString().toLowerCase();
  if (source === "invalid") return "invalid";
  if (source === "stale") return "stale";
  if (source === "demo" || source === "demo_fixture") return "demo";
  if (source === "manual" || source === "manual_snapshot") return "manual";
  if (source === "csv" || source === "csv_import" || source === "import")
    return "csv";
  return "live";
}

function toFiniteNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function avg(nums: readonly number[]): number | null {
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  // 3-decimal rounding for deterministic equality.
  return Math.round((sum / nums.length) * 1000) / 1000;
}

/**
 * Pure compiler. Deterministic for any given inputs + `now`.
 */
export function compilePlantContextFromRows(
  input: CompilePlantContextFromRowsInput,
): PlantContextPayload {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const plant = input.plant ?? null;

  // ----- recent grow events (last 14 days) -----
  const recent_grow_events: RecentGrowEvent[] = [];
  for (const ev of input.growEvents ?? []) {
    if (!ev?.occurred_at) continue;
    const t = Date.parse(ev.occurred_at);
    if (!Number.isFinite(t)) continue;
    if (nowMs - t > FOURTEEN_DAYS_MS) continue;
    if (t - nowMs > 0) continue; // ignore future-dated rows
    recent_grow_events.push({
      occurred_at: ev.occurred_at,
      event_type: String(ev.event_type ?? "unknown"),
      source_tag: String(ev.source ?? "unknown"),
      note: ev.note ?? null,
    });
  }
  recent_grow_events.sort((a, b) =>
    a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : 0,
  );

  // ----- recent sensor readings (last 7 days), classified by source -----
  const recentSensorReadings: RecentSensorReading[] = [];
  for (const r of input.sensorReadings ?? []) {
    if (!r?.captured_at) continue;
    const ts = Date.parse(r.captured_at);
    if (!Number.isFinite(ts)) continue;
    if (nowMs - ts > SEVEN_DAYS_MS) continue;
    if (ts - nowMs > 0) continue;
    const value = toFiniteNumber(r.value);
    if (value === null) continue;
    if (!r.metric) continue;
    recentSensorReadings.push({
      captured_at: r.captured_at,
      metric: String(r.metric),
      value,
      unit: r.unit ?? null,
      source_tag: classifySource(r),
    });
  }
  recentSensorReadings.sort((a, b) =>
    a.captured_at < b.captured_at
      ? 1
      : a.captured_at > b.captured_at
        ? -1
        : a.metric < b.metric
          ? -1
          : a.metric > b.metric
            ? 1
            : 0,
  );

  // ----- bucket by source, compute per-bucket averages -----
  const groupsMap = new Map<SensorSourceTag, RecentSensorReading[]>();
  for (const r of recentSensorReadings) {
    const list = groupsMap.get(r.source_tag);
    if (list) list.push(r);
    else groupsMap.set(r.source_tag, [r]);
  }

  const sensor_groups: SensorSourceGroup[] = [];
  for (const tag of SENSOR_SOURCE_ORDER) {
    const list = groupsMap.get(tag);
    if (!list || list.length === 0) continue;
    sensor_groups.push({
      source: tag,
      sample_count: list.length,
      averages: bucketAverages(list),
      readings: Object.freeze(list.slice()),
    });
  }

  // ----- 7-day averages: ONLY from trustworthy sources (live + manual).
  // stale/invalid/demo/csv are deliberately excluded from the "current
  // state" averages so bad/unknown telemetry never produces a "healthy"
  // current value. They remain visible in their own buckets above.
  const trustworthy = recentSensorReadings.filter(
    (r) => r.source_tag === "live" || r.source_tag === "manual",
  );
  const averages_7d: SensorRollingAverages = bucketAverages(trustworthy);

  // ----- notable deviations (descriptive only, no recommendations) -----
  const notable_deviations: string[] = [];
  if (averages_7d.temperature_c !== null) {
    if (averages_7d.temperature_c < 18 || averages_7d.temperature_c > 30) {
      notable_deviations.push(
        `7d average temperature ${averages_7d.temperature_c}°C outside 18–30°C band`,
      );
    }
  }
  if (averages_7d.humidity_pct !== null) {
    if (averages_7d.humidity_pct < 30 || averages_7d.humidity_pct > 75) {
      notable_deviations.push(
        `7d average humidity ${averages_7d.humidity_pct}% outside 30–75% band`,
      );
    }
  }
  if (averages_7d.vpd_kpa !== null) {
    if (averages_7d.vpd_kpa < 0.6 || averages_7d.vpd_kpa > 1.6) {
      notable_deviations.push(
        `7d average VPD ${averages_7d.vpd_kpa} kPa outside 0.6–1.6 kPa band`,
      );
    }
  }

  // ----- imported CSV/XLSX sensor history (read-only, never live) -----
  const csvHistory = buildAiDoctorCsvHistoryContext({
    rows: input.sensorReadings ?? [],
  });
  const imported_sensor_history: ImportedSensorHistorySection | null =
    csvHistory.hasCsvHistory
      ? {
          ...csvHistory,
          sectionLabel: AI_DOCTOR_IMPORTED_SENSOR_HISTORY_SECTION_LABEL,
          guidance: Object.freeze([
            csvHistory.notForLiveDiagnosis,
            "Imported history may show trends but is not proof of current conditions.",
          ]),
        }
      : null;

  // Live-sensor presence is computed from the trustworthy "live" bucket
  // only. CSV/manual/demo/stale/invalid never satisfy live-availability.
  const hasLiveSensorReadings = sensor_groups.some(
    (g) => g.source === "live" && g.sample_count > 0,
  );

  // ----- early-stage (germination/seedling) memory, additive & safe -----
  const earlyStage = buildEarlyStageAiDoctorContext({
    diaryRows: input.growEvents ?? [],
    // Compiler knows live sensor presence; pass it explicitly so the
    // helper can surface a missing-sensor caveat only when known false.
    hasRecentSensorSnapshot: hasLiveSensorReadings,
    // No photo signal exists in the compiler context — leave undefined.
  });
  const early_stage_memory: EarlyStageAiDoctorContext | null =
    earlyStage.hasEarlyStageMemory ? earlyStage : null;


  return {
    grow_id: plant?.grow_id ?? null,
    tent_id: plant?.tent_id ?? null,
    plant_id: plant?.id ?? null,
    plant_name: plant?.name ?? null,
    strain: plant?.strain ?? null,
    stage: plant?.stage ?? plant?.growth_stage ?? null,
    recent_grow_events: Object.freeze(recent_grow_events),
    recentSensorReadings: Object.freeze(recentSensorReadings),
    sensor_groups: Object.freeze(sensor_groups),
    averages_7d,
    notable_deviations: Object.freeze(notable_deviations),
    source_tags: Object.freeze(sensor_groups.map((g) => g.source)),
    imported_sensor_history,
    hasLiveSensorReadings,
    missingLiveSensorReadings: !hasLiveSensorReadings,
    early_stage_memory,
  };

}

function bucketAverages(rows: readonly RecentSensorReading[]): SensorRollingAverages {
  const pick = (metric: string) =>
    rows.filter((r) => r.metric === metric).map((r) => r.value);
  return {
    temperature_c: avg(pick("temperature_c")),
    humidity_pct: avg(pick("humidity_pct")),
    vpd_kpa: avg(pick("vpd_kpa")),
    co2_ppm: avg(pick("co2_ppm")),
  };
}
