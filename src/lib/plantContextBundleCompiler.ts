/**
 * plantContextBundleCompiler — the deterministic Plant Context Compiler
 * for Verdant Skill Runtime v1 (Build 3).
 *
 * Assembles ONE compact, time-aligned context bundle from rows the
 * caller already fetched. Pure: no I/O, no Supabase, no React, no model
 * calls, no writes, no `Date.now()` — `nowMs` is always injected.
 * Same rows + same nowMs → byte-identical output.
 *
 * WHY A NEW NAME (read before adding anything here):
 *   `compilePlantContextFromRows` is ALREADY exported twice with
 *   incompatible return shapes — from `@/lib/aiDoctorContextCompiler`
 *   (Phase 1) and `@/lib/aiDoctorEngine` (legacy) — and
 *   `aiDoctorEnginePhase1Foundation` renamed its own compiler
 *   specifically to escape that collision. A third definition would
 *   fork the contract again. This module therefore uses a distinct
 *   entry point and, rather than inventing a fourth bundle shape,
 *   EMBEDS the canonical `PlantContextBundle` from
 *   `@/lib/verdantSkillSchemas` (Build 1) as its identity core and adds
 *   skill-facing sections around it.
 *
 * COMPOSITION, NOT A SECOND RULE SYSTEM:
 *  - Row shapes are reused from `@/lib/aiDoctorContextCompiler`
 *    (`PlantRowLike` / `GrowEventRowLike` / `SensorReadingRowLike`) —
 *    the de facto row contract callers already speak.
 *  - Timeline ordering + double-write dedup come from
 *    `mergeTimelineSources` (`@/lib/timelineMergeRules`), the only rule
 *    that merges diary_entries and grow_events. No new comparator.
 *  - ALL sensor summarization routes through the Build 2 Sensor Truth
 *    Gate (`@/lib/sensorTruthGateRules`). The legacy `averages_7d` path
 *    never sees unit normalization, suspicious-value nulling, or
 *    cross-sensor conflict detection, so it is deliberately not reused.
 *  - The "immediate change" window reuses the exported, test-pinned
 *    `AI_DOCTOR_SNAPSHOT_FRESH_HOURS` (48h) rather than introducing the
 *    72h the build sketch suggested: the sketch's defaults apply only
 *    where the repo has no established value, and this one is
 *    established.
 *  - Text/collection caps come from `SKILL_CONTRACT_LIMITS` (Build 1).
 *
 * Windows are centralized in `PLANT_CONTEXT_WINDOWS` and injectable.
 * The 14d/7d values match the three private copies that already exist
 * in the legacy compilers; this is the first EXPORTED definition, so
 * later work can migrate those onto it instead of forking a fourth.
 *
 * Honesty rules:
 *  - Missing context is REPORTED, never inferred. Grower actions are
 *    never invented; absent fields become `missingInformation` entries.
 *  - Invalid/stale/demo readings are summarized as warnings and
 *    excluded from healthy evidence — never averaged in.
 *  - Conflicting readings stay visible as conflicts; they are never
 *    flattened into one confident number.
 *  - Raw payloads never enter the model-facing bundle.
 */

import {
  AI_DOCTOR_SNAPSHOT_FRESH_HOURS,
  AI_DOCTOR_RECENT_EVENT_WINDOW_DAYS,
} from "@/constants/aiDoctorContextReadiness";
import type {
  GrowEventRowLike,
  PlantRowLike,
  SensorReadingRowLike,
} from "@/lib/aiDoctorContextCompiler";
import {
  mergeTimelineSources,
  type DiaryEntryRowInput,
  type GrowEventRowInput,
  type MergedTimelineEntry,
} from "@/lib/timelineMergeRules";
import { SENSOR_FRESH_WINDOW_MINUTES } from "@/lib/latestSensorSnapshotRules";
import {
  ROOT_ZONE_METRICS,
  evaluateSensorSeries,
  summarizeSensorProvenance,
  type SensorConflict,
  type SensorGateMetric,
  type SensorReadingCandidate,
  type SensorTruthEvaluation,
  type SensorTruthWarning,
} from "@/lib/sensorTruthGateRules";
import {
  SKILL_CONTRACT_LIMITS,
  parsePlantContextBundle,
  type PlantContextBundle,
  type SkillContractParse,
  type SkillSensorSourceLabel,
} from "@/lib/verdantSkillSchemas";

// ---------------------------------------------------------------------------
// Centralized windows
// ---------------------------------------------------------------------------

/**
 * Context windows, in one place. `actionDays` / `sensorDays` match the
 * values the legacy compilers already use privately; `immediateHours`
 * reuses the exported AI-context freshness tier.
 */
export const PLANT_CONTEXT_WINDOWS = Object.freeze({
  actionDays: 14,
  sensorDays: 7,
  immediateHours: AI_DOCTOR_SNAPSHOT_FRESH_HOURS,
  /** Observation recency tier already exported for readiness checks. */
  observationDays: AI_DOCTOR_RECENT_EVENT_WINDOW_DAYS,
});

export type PlantContextWindows = {
  actionDays: number;
  sensorDays: number;
  immediateHours: number;
  observationDays: number;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Per-section caps. Keeps the bundle compact and token-conscious. */
export const PLANT_CONTEXT_CAPS = Object.freeze({
  recentActions: 20,
  observations: 20,
  timeline: 24,
  photos: 12,
  conflicts: 8,
  previousRecommendations: 5,
  unresolvedFollowUps: 8,
  noteChars: 160,
});

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * Sensor row plus the two persisted fields `SensorReadingRowLike` does
 * not model but the truth gate uses: device identity (separates
 * temporal samples from genuine cross-sensor disagreement) and stored
 * per-reading confidence.
 */
export interface SensorReadingRowForContext extends SensorReadingRowLike {
  device_id?: string | null;
  confidence?: number | null;
  /**
   * Legacy always-present timestamp column. `captured_at` is nullable on
   * persisted rows, so the existing adapters read `captured_at ?? ts`;
   * this compiler does the same rather than discarding fresh telemetry
   * as missing_timestamp.
   */
  ts?: string | null;
  /**
   * Row-level plant ownership. Most persisted rows are TENT-scoped and
   * leave this null; the compiler must not assert that such a reading
   * belongs to the plant being compiled.
   */
  plant_id?: string | null;
  /**
   * Row-level tent ownership. A reading from another tent is not this
   * tent's evidence and is dropped rather than re-homed.
   */
  tent_id?: string | null;
}

/**
 * Persisted plant stages (`seedling|veg|flower|flush|harvest|cure`) do
 * not all exist in the canonical skill vocabulary. Map the known
 * aliases; anything unrecognized becomes null and is REPORTED as a gap
 * rather than failing the whole compilation.
 *
 *  - `flush` is the final phase of flowering → `late_flower`
 *  - `cure` → `curing` (Build 1 already accepts this alias)
 */
const PERSISTED_STAGE_ALIASES: Record<string, string> = {
  flush: "late_flower",
  cure: "curing",
};

const CANONICAL_STAGES: ReadonlySet<string> = new Set([
  "seedling",
  "veg",
  "flower",
  "late_flower",
  "harvest",
  "drying",
  "curing",
  "unknown",
]);

function normalizeStage(raw: string | null): string | null {
  if (raw === null) return null;
  const lower = raw.trim().toLowerCase();
  if (lower === "") return null;
  const aliased = Object.prototype.hasOwnProperty.call(PERSISTED_STAGE_ALIASES, lower)
    ? PERSISTED_STAGE_ALIASES[lower]
    : lower;
  return CANONICAL_STAGES.has(aliased) ? aliased : null;
}

export interface PhotoRowLike {
  id?: string | null;
  captured_at?: string | null;
  /** 0..1 quality score when the pipeline produced one. */
  quality_score?: number | null;
  /** Free label such as "canopy" / "leaf". Never freeform user text. */
  angle?: string | null;
}

export interface PreviousRecommendationRowLike {
  id?: string | null;
  created_at?: string | null;
  summary?: string | null;
  risk_level?: string | null;
}

export interface FollowUpRowLike {
  id?: string | null;
  due_at?: string | null;
  question?: string | null;
  status?: string | null;
}

export interface CompilePlantContextBundleInput {
  plant: PlantRowLike | null;
  grow?: { id?: string | null; stage?: string | null } | null;
  tent?: { id?: string | null } | null;
  diaryEntries?: readonly DiaryEntryRowInput[];
  growEvents?: readonly (GrowEventRowInput & GrowEventRowLike)[];
  sensorReadings?: readonly SensorReadingRowForContext[];
  photos?: readonly PhotoRowLike[];
  previousRecommendations?: readonly PreviousRecommendationRowLike[];
  followUps?: readonly FollowUpRowLike[];
  /** Caller-supplied targets. Never inferred from notes or strain. */
  targets?: PlantContextBundle["targets"];
  /** Extra identity the plant row does not carry. */
  identity?: {
    isAutoflower?: boolean | null;
    ageDays?: number | null;
    /** Irrigation architecture, when the caller knows it. */
    irrigationArchitecture?: string | null;
    plantType?: string | null;
  };
}

export interface CompilePlantContextBundleOptions {
  /** Injected clock (epoch ms). Required — the compiler never reads one. */
  nowMs: number;
  /** Stable version tag for this context build. */
  contextVersion: string;
  windows?: Partial<PlantContextWindows>;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface RecentActionSummary {
  occurredAt: string;
  eventType: string;
  source: string | null;
  note: string | null;
  /** True when inside the immediate-change window. */
  immediate: boolean;
}

export interface ObservationSummary {
  occurredAt: string;
  stage: string | null;
  note: string | null;
}

export interface CompactTimelineItem {
  occurredAt: string;
  kind: string;
  detail: string | null;
}

export interface PhotoSummary {
  count: number;
  latestCapturedAt: string | null;
  /** Photos carrying a usable quality score, and the best score seen. */
  withQualityScore: number;
  bestQualityScore: number | null;
  angles: string[];
}

export interface SensorWindowSummary {
  /**
   * Per-metric summary. `latestValue`/`mean` come from STRICTLY usable
   * readings only — degraded (suspicious-but-kept) readings are counted
   * separately so they can be surfaced without being treated as sound
   * evidence.
   */
  metrics: Array<{
    metric: SensorGateMetric;
    latestValue: number | null;
    unit: string | null;
    /** Provenance of `latestValue`, so consumers can judge it. */
    latestSource: SkillSensorSourceLabel | null;
    latestCapturedAt: string | null;
    /** Gate-adjusted confidence of `latestValue`. */
    latestConfidence: number | null;
    /** True when contemporaneous devices disagreed beyond tolerance. */
    conflicted: boolean;
    usableCount: number;
    degradedCount: number;
    excludedCount: number;
    mean: number | null;
  }>;
  sourceCounts: Array<{ source: SkillSensorSourceLabel; count: number }>;
  includedCount: number;
  excludedCount: number;
  warnings: SensorTruthWarning[];
  conflicts: SensorConflict[];
  /**
   * Newest fully-usable evaluation in the window, used to stamp the
   * canonical bundle's snapshot. Null when nothing is usable — the
   * bundle then carries no snapshot rather than a hopeful one.
   */
  latestUsable: {
    capturedAt: string | null;
    source: SkillSensorSourceLabel;
    confidence: number;
  } | null;
}

export interface PlantContextCompilation {
  /** The canonical Build 1 bundle — the identity core, validated. */
  bundle: PlantContextBundle;
  contextVersion: string;
  windows: PlantContextWindows;
  /**
   * Identity the canonical bundle does not model. Carried explicitly so
   * a caller that KNOWS the architecture actually delivers it — clearing
   * the gap flag without emitting the value would be worse than
   * reporting it missing.
   */
  plantType: string | null;
  irrigationArchitecture: string | null;
  recentActions: RecentActionSummary[];
  observations: ObservationSummary[];
  compactTimeline: CompactTimelineItem[];
  photoSummary: PhotoSummary;
  sensorSummary: SensorWindowSummary;
  notableDeviations: string[];
  conflictingEvidence: string[];
  missingInformation: string[];
  sourceWarnings: string[];
  previousRecommendations: Array<{
    occurredAt: string;
    summary: string;
    riskLevel: string | null;
  }>;
  unresolvedFollowUps: Array<{
    dueAt: string | null;
    question: string;
    status: string;
  }>;
  /** 0..1. Share of the expected context slots that are actually present. */
  completenessScore: number;
}

export type PlantContextCompileResult =
  | { ok: true; compilation: PlantContextCompilation }
  | { ok: false; issues: string[] };

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function safeString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function cleanText(v: unknown, max: number = PLANT_CONTEXT_CAPS.noteChars): string | null {
  const s = safeString(v);
  if (s === null) return null;
  const trimmed = s.trim().replace(/\s+/g, " ");
  if (trimmed === "") return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

const ISO_EXPLICIT_TZ_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Timezone-less timestamps are rejected, matching the Sensor Truth
 * Gate: `Date.parse` would read them in the process's local zone and
 * make the compilation depend on where it runs.
 */
function parseTimestampMs(v: unknown): number | null {
  const s = safeString(v);
  if (s === null) return null;
  const trimmed = s.trim();
  if (trimmed === "" || !ISO_EXPLICIT_TZ_RE.test(trimmed)) return null;
  const t = Date.parse(trimmed);
  return Number.isNaN(t) ? null : t;
}

function canonicalIso(v: unknown): string | null {
  const t = parseTimestampMs(v);
  return t === null ? null : new Date(t).toISOString();
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function resolveWindows(overrides: Partial<PlantContextWindows> | undefined): PlantContextWindows {
  return {
    actionDays: overrides?.actionDays ?? PLANT_CONTEXT_WINDOWS.actionDays,
    sensorDays: overrides?.sensorDays ?? PLANT_CONTEXT_WINDOWS.sensorDays,
    immediateHours: overrides?.immediateHours ?? PLANT_CONTEXT_WINDOWS.immediateHours,
    observationDays: overrides?.observationDays ?? PLANT_CONTEXT_WINDOWS.observationDays,
  };
}

// ---------------------------------------------------------------------------
// buildCompactTimeline
// ---------------------------------------------------------------------------

/**
 * Merge diary + grow-event rows into one ordered, deduped timeline via
 * the canonical `mergeTimelineSources`, then project a compact,
 * token-conscious view. Rows without a usable timestamp are dropped
 * from the compact view (they cannot be time-aligned) — they still
 * surface through `identifyContextGaps`.
 */
export function buildCompactTimeline(
  input: {
    diaryEntries?: readonly DiaryEntryRowInput[];
    growEvents?: readonly GrowEventRowInput[];
  },
  options: { nowMs: number; windowDays: number; limit?: number },
): CompactTimelineItem[] {
  const merged: MergedTimelineEntry[] = mergeTimelineSources({
    diaryEntries: [...(input.diaryEntries ?? [])],
    growEvents: [...(input.growEvents ?? [])],
  });
  const cutoff = options.nowMs - options.windowDays * DAY_MS;
  const limit = options.limit ?? PLANT_CONTEXT_CAPS.timeline;
  const out: CompactTimelineItem[] = [];
  for (const entry of merged) {
    const occurredAt = canonicalIso(entry.occurred_at);
    if (occurredAt === null) continue;
    const ms = Date.parse(occurredAt);
    if (ms < cutoff || ms > options.nowMs) continue;
    out.push({
      occurredAt,
      kind: cleanText(entry.event_type, 48) ?? "entry",
      detail: cleanText(entry.note),
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// summarizeRecentActions
// ---------------------------------------------------------------------------

/**
 * Summarize grower actions inside the action window. Only recorded
 * events count — an absent action is never inferred as "not done".
 */
export function summarizeRecentActions(
  growEvents: readonly (GrowEventRowLike & {
    id?: string | null;
    is_deleted?: boolean | null;
  })[],
  options: { nowMs: number; windowDays: number; immediateHours: number },
): RecentActionSummary[] {
  const cutoff = options.nowMs - options.windowDays * DAY_MS;
  const immediateCutoff = options.nowMs - options.immediateHours * HOUR_MS;
  const rows: Array<{ ms: number; id: string; item: RecentActionSummary }> = [];
  for (const row of growEvents) {
    // Soft-deleted events are not grower history. `mergeTimelineSources`
    // already drops them for the timeline; do the same here so a
    // retracted action cannot be summarized as something that happened.
    if (row?.is_deleted === true) continue;
    const occurredAt = canonicalIso(row?.occurred_at);
    if (occurredAt === null) continue;
    const ms = Date.parse(occurredAt);
    if (ms < cutoff || ms > options.nowMs) continue;
    const eventType = cleanText(row?.event_type, 48);
    if (eventType === null) continue;
    rows.push({
      ms,
      id: typeof row?.id === "string" ? row.id : "",
      item: {
        occurredAt,
        eventType,
        source: cleanText(row?.source, 32),
        note: cleanText(row?.note),
        immediate: ms >= immediateCutoff,
      },
    });
  }
  // Fully deterministic ordering: newest first, then event type, source,
  // note, and finally row identity. Database order is not guaranteed for
  // ties, and with more than `recentActions` tied rows an unstable sort
  // would change WHICH actions survive the cap.
  rows.sort((a, b) => {
    if (b.ms !== a.ms) return b.ms - a.ms;
    const typeCmp = a.item.eventType.localeCompare(b.item.eventType);
    if (typeCmp !== 0) return typeCmp;
    const sourceCmp = (a.item.source ?? "").localeCompare(b.item.source ?? "");
    if (sourceCmp !== 0) return sourceCmp;
    const noteCmp = (a.item.note ?? "").localeCompare(b.item.note ?? "");
    if (noteCmp !== 0) return noteCmp;
    return a.id.localeCompare(b.id);
  });
  return rows.slice(0, PLANT_CONTEXT_CAPS.recentActions).map((r) => r.item);
}

// ---------------------------------------------------------------------------
// summarizeSensorWindow
// ---------------------------------------------------------------------------

/**
 * Read a stored numeric confidence. Persisted rows carry it either as a
 * column or inside `raw_payload.confidence`; ONLY that one numeric
 * field is read — no other payload content is touched or forwarded.
 */
function readStoredConfidence(row: SensorReadingRowForContext): number | null {
  const direct = row?.confidence;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  const payload = row?.raw_payload;
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    const nested = (payload as Record<string, unknown>).confidence;
    if (typeof nested === "number" && Number.isFinite(nested)) return nested;
  }
  return null;
}

/**
 * Deterministic "is `next` the better latest reading than `prev`?".
 * Capture time leads; equal timestamps are common for multi-metric
 * snapshots, so ties break on source, then device, then value — never
 * on caller row order, which the compiler does not control.
 */
function isPreferredReading(next: SensorTruthEvaluation, prev: SensorTruthEvaluation): boolean {
  const timeCmp = (next.capturedAt ?? "").localeCompare(prev.capturedAt ?? "");
  if (timeCmp !== 0) return timeCmp > 0;
  const sourceCmp = next.source.localeCompare(prev.source);
  if (sourceCmp !== 0) return sourceCmp < 0;
  const deviceCmp = (next.deviceId ?? "").localeCompare(prev.deviceId ?? "");
  if (deviceCmp !== 0) return deviceCmp < 0;
  return (next.normalizedValue ?? 0) < (prev.normalizedValue ?? 0);
}

/**
 * Plant scope comes from the ROW, never from the plant being compiled.
 * Most persisted rows are tent-scoped and leave `plant_id` null; those
 * stay tent-scoped so a root-zone reading is never asserted to belong to
 * a plant whose ownership was never established. A row naming another
 * plant keeps that plant, so the gate groups it away from ours.
 */
function resolveRowPlantId(row: SensorReadingRowForContext): string | null {
  return typeof row?.plant_id === "string" && row.plant_id !== "" ? row.plant_id : null;
}

function toSensorCandidate(
  row: SensorReadingRowForContext,
  tentId: string,
): SensorReadingCandidate {
  const rawValue = row?.value;
  const numeric =
    typeof rawValue === "number"
      ? rawValue
      : typeof rawValue === "string" && rawValue.trim() !== ""
        ? Number(rawValue)
        : null;
  return {
    source: row?.source ?? null,
    quality: row?.quality ?? null,
    capturedAt: row?.captured_at ?? row?.ts ?? null,
    tentId,
    plantId: resolveRowPlantId(row),
    deviceId: typeof row?.device_id === "string" ? row.device_id : null,
    metric: typeof row?.metric === "string" ? row.metric : "",
    value: numeric !== null && Number.isFinite(numeric) ? numeric : null,
    unit: row?.unit ?? null,
    confidence: readStoredConfidence(row),
    // raw_payload contents never enter the bundle; only the gate's
    // opaque-reference validation would carry an identifier.
  };
}

/**
 * Summarize the sensor window through the Build 2 truth gate. Averages
 * are computed over USABLE readings only; excluded readings are counted
 * and their warnings surfaced, never silently folded in.
 */
export function summarizeSensorWindow(
  sensorReadings: readonly SensorReadingRowForContext[],
  options: {
    nowMs: number;
    windowDays: number;
    tentId: string;
    /**
     * The plant being compiled. Used ONLY to scope root-zone metrics:
     * a soil/EC/pH reading counts as this plant's evidence only when the
     * row names this plant. Tent-scoped and other-plant root readings
     * still appear in the provenance counts, but never as this plant's
     * value.
     */
    plantId?: string | null;
  },
): SensorWindowSummary {
  const cutoff = options.nowMs - options.windowDays * DAY_MS;
  const candidates: SensorReadingCandidate[] = [];
  for (const row of sensorReadings) {
    // A reading owned by another tent is not this tent's evidence. Drop
    // it rather than re-homing it onto the compiled tent.
    const rowTentId = typeof row?.tent_id === "string" ? row.tent_id : null;
    if (rowTentId !== null && rowTentId !== options.tentId) continue;
    const ms = parseTimestampMs(row?.captured_at ?? row?.ts);
    // Unparseable timestamps still go through the gate so they are
    // counted and warned about rather than vanishing.
    if (ms !== null && (ms < cutoff || ms > options.nowMs)) continue;
    candidates.push(toSensorCandidate(row, options.tentId));
  }

  // Means come from the gate's EXPLICIT aggregation path, which groups
  // latest-per-device first. Averaging evaluations directly here would
  // silently weight a ten-sample device ten times a one-sample device.
  const series = evaluateSensorSeries(candidates, {
    nowMs: options.nowMs,
    aggregation: { rule: "mean" },
  });
  const provenance = summarizeSensorProvenance(series.evaluations);

  /**
   * THE single plant-scope rule for this summary. Root-zone metrics are
   * plant-scoped evidence: only a reading naming the compiled plant can
   * become this plant's value, mean, or conflict. Atmospheric metrics
   * stay tent-scoped. Everything filtered out remains counted in the
   * provenance summary, so nothing disappears silently.
   *
   * Every derived view below (per-metric, means, conflicts, snapshot)
   * MUST go through this predicate — scoping one consumer at a time is
   * how another plant's telemetry leaks back in.
   */
  const compiledPlantId = options.plantId ?? null;
  const inPlantScope = (metric: SensorGateMetric | null, plantId: string | null): boolean => {
    if (metric === null) return false;
    if (!ROOT_ZONE_METRICS.has(metric)) return true;
    return plantId === compiledPlantId;
  };

  // In-scope evaluations only. Everything else stays in the provenance
  // counts below but can never become this plant's value.
  const scopedEvaluations = series.evaluations.filter((e) => inPlantScope(e.metric, e.plantId));

  /**
   * CURRENT samples, selected exactly once and reused by every view.
   * Mirrors the gate's own rule: take each device's newest sample per
   * metric FIRST, then drop it if that newest sample is not usable — a
   * device whose latest reading is invalid/stale contributes nothing
   * rather than resurrecting older healthy evidence.
   */
  const newestPerDevice = new Map<string, SensorTruthEvaluation>();
  scopedEvaluations.forEach((e, i) => {
    const metric = e.metric as SensorGateMetric;
    // Plant scope belongs in the key ONLY for root-zone metrics. An
    // atmospheric device is tent-scoped, so including plantId would
    // split one device's successive samples into separate "devices"
    // whenever the rows carry different plant ids — turning ordinary
    // temporal change into a false conflict.
    const scopeKey = ROOT_ZONE_METRICS.has(metric) ? (e.plantId ?? "") : "";
    const deviceKey = `${metric}|${scopeKey}|${e.deviceId !== null ? `d:${e.deviceId}` : `anon:${i}`}`;
    const prev = newestPerDevice.get(deviceKey);
    if (prev === undefined || isPreferredReading(e, prev)) {
      newestPerDevice.set(deviceKey, e);
    }
  });
  const currentEvaluations = [...newestPerDevice.values()].filter(
    (e) => e.usability === "usable" && e.normalizedValue !== null,
  );

  const byMetric = new Map<SensorGateMetric, SensorTruthEvaluation[]>();
  for (const e of scopedEvaluations) {
    const metric = e.metric as SensorGateMetric;
    const list = byMetric.get(metric) ?? [];
    list.push(e);
    byMetric.set(metric, list);
  }

  const scopedConflicts = series.conflicts.filter((c) => inPlantScope(c.metric, c.plantId));
  const scopedAggregates = series.aggregates.filter((a) => inPlantScope(a.metric, a.plantId));
  const conflictedMetrics = new Set<SensorGateMetric>(scopedConflicts.map((c) => c.metric));

  const metrics: SensorWindowSummary["metrics"] = [];
  for (const metric of [...byMetric.keys()].sort()) {
    const list = byMetric.get(metric) as SensorTruthEvaluation[];
    // STRICTLY usable only. Degraded readings (suspicious-but-kept, e.g.
    // humidity stuck at 100) are counted and warned, never treated as
    // sound values or averaged in.
    // Only CURRENT samples count as this metric's usable evidence.
    const usable = currentEvaluations.filter((e) => e.metric === metric);
    const degradedCount = list.filter((e) => e.usability === "degraded").length;
    let latest: SensorTruthEvaluation | null = null;
    for (const e of usable) {
      if (latest === null || isPreferredReading(e, latest)) latest = e;
    }
    // Mean comes from the gate's explicit aggregation, not a local
    // average. Multiple groups (e.g. per-plant root-zone) are averaged
    // across their group means so no group's sample count dominates.
    const groupMeans = scopedAggregates.filter((a) => a.metric === metric).map((a) => a.value);
    const mean =
      groupMeans.length > 0
        ? round3(groupMeans.reduce((acc, v) => acc + v, 0) / groupMeans.length)
        : null;
    metrics.push({
      metric,
      latestValue: latest?.normalizedValue ?? null,
      unit: latest?.normalizedUnit ?? null,
      latestSource: latest?.source ?? null,
      latestCapturedAt: latest?.capturedAt ?? null,
      latestConfidence: latest?.adjustedConfidence ?? null,
      conflicted: conflictedMetrics.has(metric),
      usableCount: usable.length,
      degradedCount,
      excludedCount: Math.max(0, list.length - usable.length - degradedCount),
      mean,
    });
  }

  // The anchor comes from CURRENT, in-scope, unconflicted samples only.
  let latestUsableEval: SensorTruthEvaluation | null = null;
  for (const e of currentEvaluations) {
    if (e.capturedAt === null) continue;
    if (e.metric !== null && conflictedMetrics.has(e.metric)) continue;
    if (latestUsableEval === null || isPreferredReading(e, latestUsableEval)) {
      latestUsableEval = e;
    }
  }

  return {
    metrics,
    sourceCounts: provenance.sourceCounts,
    // includedCount reflects readings that are actually THIS plant's
    // evidence. Counting out-of-scope telemetry here would clear the
    // sensor gap and inflate completeness for context the plant does
    // not have.
    includedCount: currentEvaluations.length,
    excludedCount: series.evaluations.length - currentEvaluations.length,
    warnings: provenance.warnings,
    conflicts: scopedConflicts.slice(0, PLANT_CONTEXT_CAPS.conflicts),
    latestUsable:
      latestUsableEval === null
        ? null
        : {
            capturedAt: latestUsableEval.capturedAt,
            source: latestUsableEval.source,
            confidence: latestUsableEval.adjustedConfidence,
          },
  };
}

// ---------------------------------------------------------------------------
// identifyContextGaps
// ---------------------------------------------------------------------------

/** Context slots the runtime expects. Presence drives completeness. */
const CONTEXT_SLOTS = [
  "stage",
  "strain",
  "plant_type",
  "medium",
  "pot_size",
  "irrigation_architecture",
  "targets",
  "recent_actions",
  "sensor_readings",
  "photos",
] as const;

/**
 * Report what is MISSING. Nothing here infers a value — an absent slot
 * becomes a stated gap so downstream skills can request data instead of
 * assuming.
 */
export function identifyContextGaps(present: Record<string, boolean>): {
  missingInformation: string[];
  completenessScore: number;
} {
  const missing: string[] = [];
  let have = 0;
  for (const slot of CONTEXT_SLOTS) {
    if (present[slot] === true) {
      have += 1;
    } else {
      missing.push(slot);
    }
  }
  return {
    missingInformation: missing,
    completenessScore: round3(have / CONTEXT_SLOTS.length),
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Compile one plant-context bundle. Returns the canonical Build 1
 * `PlantContextBundle` (schema-validated) plus the skill-facing
 * sections around it. Deterministic for a given (rows, nowMs).
 */
export function compilePlantContextBundle(
  input: CompilePlantContextBundleInput,
  options: CompilePlantContextBundleOptions,
): PlantContextCompileResult {
  const windows = resolveWindows(options.windows);
  const plant = input.plant;

  const plantId = cleanText(plant?.id, SKILL_CONTRACT_LIMITS.idMax);
  const growId =
    cleanText(plant?.grow_id, SKILL_CONTRACT_LIMITS.idMax) ??
    cleanText(input.grow?.id, SKILL_CONTRACT_LIMITS.idMax);
  const tentId =
    cleanText(plant?.tent_id, SKILL_CONTRACT_LIMITS.idMax) ??
    cleanText(input.tent?.id, SKILL_CONTRACT_LIMITS.idMax);

  if (plantId === null || growId === null) {
    return {
      ok: false,
      issues: [
        plantId === null ? "plant.id: required" : "",
        growId === null ? "grow_id: required" : "",
      ].filter((s) => s !== ""),
    };
  }

  // Grow-level stage is a legitimate fallback for older/partial plant
  // rows — using it is reading available context, not inferring it.
  const stage = normalizeStage(
    cleanText(plant?.stage) ?? cleanText(plant?.growth_stage) ?? cleanText(input.grow?.stage),
  );
  const strain = cleanText(plant?.strain);
  const medium = cleanText(plant?.medium);
  const potSize = cleanText(plant?.pot_size);
  const irrigationArchitecture = cleanText(input.identity?.irrigationArchitecture);
  const plantType = cleanText(input.identity?.plantType);

  const growEvents = input.growEvents ?? [];
  const diaryEntries = input.diaryEntries ?? [];
  const sensorReadings = input.sensorReadings ?? [];
  const photos = input.photos ?? [];

  const recentActions = summarizeRecentActions(growEvents, {
    nowMs: options.nowMs,
    windowDays: windows.actionDays,
    immediateHours: windows.immediateHours,
  });

  const compactTimeline = buildCompactTimeline(
    { diaryEntries, growEvents },
    { nowMs: options.nowMs, windowDays: windows.actionDays },
  );

  const observationCutoff = options.nowMs - windows.observationDays * DAY_MS;
  const observationRows: Array<{ id: string; item: ObservationSummary }> = [];
  for (const row of diaryEntries) {
    const occurredAt = canonicalIso(row?.occurred_at ?? row?.entry_at);
    if (occurredAt === null) continue;
    const ms = Date.parse(occurredAt);
    if (ms < observationCutoff || ms > options.nowMs) continue;
    observationRows.push({
      id: typeof row?.id === "string" ? row.id : "",
      item: {
        occurredAt,
        stage: cleanText(row?.stage, 32),
        note: cleanText(row?.note),
      },
    });
  }
  // Deterministic before truncation: with more tied rows than the cap,
  // an unstable sort changes WHICH observations survive.
  observationRows.sort((a, b) => {
    const timeCmp = b.item.occurredAt.localeCompare(a.item.occurredAt);
    if (timeCmp !== 0) return timeCmp;
    const stageCmp = (a.item.stage ?? "").localeCompare(b.item.stage ?? "");
    if (stageCmp !== 0) return stageCmp;
    const noteCmp = (a.item.note ?? "").localeCompare(b.item.note ?? "");
    if (noteCmp !== 0) return noteCmp;
    return a.id.localeCompare(b.id);
  });
  // The true in-window count, captured BEFORE the cap, so a dense
  // history is not reported as exactly `observations` entries.
  const recentDiaryEntryCount = observationRows.length;
  const observations: ObservationSummary[] = observationRows
    .slice(0, PLANT_CONTEXT_CAPS.observations)
    .map((r) => r.item);

  const sensorSummary = summarizeSensorWindow(sensorReadings, {
    nowMs: options.nowMs,
    windowDays: windows.sensorDays,
    tentId: tentId ?? growId,
    plantId,
  });

  // Photo summary — metadata only, never image contents or URLs.
  // Select the in-window photos FIRST (newest first, deterministically),
  // then derive every metric from that same selection — otherwise the
  // summary can report an impossible shape like {count: 12,
  // withQualityScore: 50}.
  const photoCutoff = options.nowMs - windows.actionDays * DAY_MS;
  const selectedPhotos: Array<{
    capturedAt: string;
    id: string;
    quality: number | null;
    angle: string | null;
  }> = [];
  for (const p of photos) {
    const capturedAt = canonicalIso(p?.captured_at);
    if (capturedAt === null) continue;
    const ms = Date.parse(capturedAt);
    if (ms < photoCutoff || ms > options.nowMs) continue;
    const q = p?.quality_score;
    selectedPhotos.push({
      capturedAt,
      id: typeof p?.id === "string" ? p.id : "",
      quality: typeof q === "number" && Number.isFinite(q) && q >= 0 && q <= 1 ? q : null,
      angle: cleanText(p?.angle, 32),
    });
  }
  // `id` is optional on PhotoRowLike, so it cannot be the only
  // tie-breaker: without quality/angle tiebreaks, caller order would
  // decide which photos survive the cap and change bestQualityScore.
  selectedPhotos.sort((a, b) => {
    const timeCmp = b.capturedAt.localeCompare(a.capturedAt);
    if (timeCmp !== 0) return timeCmp;
    const qualityCmp = (b.quality ?? -1) - (a.quality ?? -1);
    if (qualityCmp !== 0) return qualityCmp;
    const angleCmp = (a.angle ?? "").localeCompare(b.angle ?? "");
    if (angleCmp !== 0) return angleCmp;
    return a.id.localeCompare(b.id);
  });
  const cappedPhotos = selectedPhotos.slice(0, PLANT_CONTEXT_CAPS.photos);
  const angles = new Set<string>();
  let withQualityScore = 0;
  let bestQualityScore: number | null = null;
  for (const p of cappedPhotos) {
    if (p.quality !== null) {
      withQualityScore += 1;
      if (bestQualityScore === null || p.quality > bestQualityScore) {
        bestQualityScore = p.quality;
      }
    }
    if (p.angle !== null) angles.add(p.angle);
  }
  const photoSummary: PhotoSummary = {
    count: cappedPhotos.length,
    latestCapturedAt: cappedPhotos[0]?.capturedAt ?? null,
    withQualityScore,
    bestQualityScore,
    angles: [...angles].sort(),
  };

  // Conflicting evidence stays visible and is never collapsed.
  const conflictingEvidence = sensorSummary.conflicts.map(
    (c) =>
      `${c.metric}: ${c.readingCount} readings disagree by ${c.spread} (tolerance ${c.tolerance})`,
  );

  const sourceWarnings: string[] = [];
  for (const entry of sensorSummary.sourceCounts) {
    if (entry.source !== "live" && entry.source !== "manual") {
      sourceWarnings.push(`${entry.count} ${entry.source} reading(s) in window`);
    }
  }
  if (sensorSummary.excludedCount > 0) {
    sourceWarnings.push(`${sensorSummary.excludedCount} reading(s) excluded from reasoning`);
  }

  // Deviations are reported only against caller-supplied targets — the
  // compiler never invents a target band.
  const notableDeviations: string[] = [];
  const targets = input.targets ?? null;
  if (targets) {
    const check = (
      metric: SensorGateMetric,
      range: { min?: number; max?: number } | null | undefined,
      label: string,
    ): void => {
      if (!range) return;
      const { min, max } = range;
      const m = sensorSummary.metrics.find((x) => x.metric === metric);
      if (!m || m.latestValue === null) return;
      // A conflicted metric has no single honest value, so it cannot
      // support an actionable-looking deviation either.
      if (m.conflicted) return;
      if (typeof min === "number" && m.latestValue < min) {
        notableDeviations.push(`${label} below target (${m.latestValue} < ${min})`);
      } else if (typeof max === "number" && m.latestValue > max) {
        notableDeviations.push(`${label} above target (${m.latestValue} > ${max})`);
      }
    };
    check("temperature_c", targets.temperatureC, "temperature");
    check("humidity_pct", targets.humidityPct, "humidity");
    check("vpd_kpa", targets.vpdKpa, "VPD");
  }

  const previousRecommendations = (input.previousRecommendations ?? [])
    .map((r) => ({
      occurredAt: canonicalIso(r?.created_at),
      summary: cleanText(r?.summary),
      riskLevel: cleanText(r?.risk_level, 32),
      id: typeof r?.id === "string" ? r.id : "",
    }))
    .filter(
      (
        r,
      ): r is {
        occurredAt: string;
        summary: string;
        riskLevel: string | null;
        id: string;
      } => r.occurredAt !== null && r.summary !== null,
    )
    // Deterministic before the cap: ties must not decide which survive.
    .sort((a, b) => {
      const timeCmp = b.occurredAt.localeCompare(a.occurredAt);
      if (timeCmp !== 0) return timeCmp;
      const riskCmp = (a.riskLevel ?? "").localeCompare(b.riskLevel ?? "");
      if (riskCmp !== 0) return riskCmp;
      const summaryCmp = a.summary.localeCompare(b.summary);
      if (summaryCmp !== 0) return summaryCmp;
      return a.id.localeCompare(b.id);
    })
    .slice(0, PLANT_CONTEXT_CAPS.previousRecommendations)
    .map(({ occurredAt, summary, riskLevel }) => ({ occurredAt, summary, riskLevel }));

  const unresolvedFollowUps = (input.followUps ?? [])
    .map((f) => ({
      dueAt: canonicalIso(f?.due_at),
      question: cleanText(f?.question),
      status: cleanText(f?.status, 32) ?? "pending",
      id: typeof f?.id === "string" ? f.id : "",
    }))
    .filter(
      (f): f is { dueAt: string | null; question: string; status: string; id: string } =>
        f.question !== null && f.status !== "recorded" && f.status !== "cancelled",
    )
    // Deterministic before the cap: ties must not decide which survive.
    .sort((a, b) => {
      const dueCmp = (a.dueAt ?? "").localeCompare(b.dueAt ?? "");
      if (dueCmp !== 0) return dueCmp;
      const statusCmp = a.status.localeCompare(b.status);
      if (statusCmp !== 0) return statusCmp;
      const questionCmp = a.question.localeCompare(b.question);
      if (questionCmp !== 0) return questionCmp;
      return a.id.localeCompare(b.id);
    })
    .slice(0, PLANT_CONTEXT_CAPS.unresolvedFollowUps)
    .map(({ dueAt, question, status }) => ({ dueAt, question, status }));

  const gaps = identifyContextGaps({
    stage: stage !== null,
    strain: strain !== null,
    plant_type: plantType !== null,
    medium: medium !== null,
    pot_size: potSize !== null,
    irrigation_architecture: irrigationArchitecture !== null,
    targets: targets !== null,
    recent_actions: recentActions.length > 0,
    sensor_readings: sensorSummary.includedCount > 0,
    photos: photoSummary.count > 0,
  });

  // Latest snapshot for the canonical bundle. A snapshot is ONE moment
  // from ONE source: it is anchored on the newest strictly-usable
  // reading, and a metric is included only when its own newest
  // strictly-usable reading shares that source and falls inside the
  // contemporaneity window. Anything else stays out — the per-metric
  // detail (with its own provenance) lives in `sensorSummary.metrics`,
  // so nothing is lost, but the snapshot never mixes a two-hour-old
  // manual value into a six-minute-old live reading.
  const latestUsable = sensorSummary.latestUsable;
  const anchorCapturedAt = latestUsable?.capturedAt ?? null;
  const anchorMs = anchorCapturedAt === null ? null : Date.parse(anchorCapturedAt);
  // Confidences of every metric that actually enters the snapshot, so
  // the stamped confidence can be the conservative minimum rather than
  // the anchor's alone.
  const includedConfidences: number[] = [];
  const pick = (metric: SensorGateMetric): number | null => {
    if (latestUsable === null || anchorMs === null) return null;
    const m = sensorSummary.metrics.find((x) => x.metric === metric);
    if (!m || m.latestValue === null || m.latestCapturedAt === null) return null;
    // A metric whose contemporaneous devices disagreed has no single
    // honest value — omit it rather than pick one arbitrarily.
    if (m.conflicted) return null;
    if (m.latestSource !== latestUsable.source) return null;
    const ms = Date.parse(m.latestCapturedAt);
    if (Number.isNaN(ms)) return null;
    if (Math.abs(anchorMs - ms) > SENSOR_FRESH_WINDOW_MINUTES * 60 * 1000) return null;
    if (m.latestConfidence !== null) includedConfidences.push(m.latestConfidence);
    return m.latestValue;
  };
  const snapshotValues =
    latestUsable === null || anchorCapturedAt === null
      ? null
      : {
          temperatureC: pick("temperature_c"),
          humidityPct: pick("humidity_pct"),
          vpdKpa: pick("vpd_kpa"),
          co2Ppm: pick("co2_ppm"),
          soilMoisturePct: pick("soil_moisture_pct"),
        };
  // A snapshot with every metric filtered out carries no evidence — it
  // would be a bare "live, ok, just now" header implying health that no
  // value supports. Omit it entirely.
  const snapshotHasValue =
    snapshotValues !== null &&
    Object.values(snapshotValues).some((v) => v !== null && v !== undefined);
  const latestSnapshot =
    latestUsable === null ||
    anchorCapturedAt === null ||
    snapshotValues === null ||
    !snapshotHasValue
      ? null
      : {
          capturedAt: anchorCapturedAt,
          source: latestUsable.source,
          // Truthful: every included value is strictly usable, unconflicted,
          // and from this source at this moment.
          quality: "ok" as const,
          // Conservative: the weakest included metric sets the stamp, so
          // a strong newest reading cannot lend its confidence to an
          // older, weaker one riding in the same snapshot.
          confidence:
            includedConfidences.length > 0
              ? Math.min(...includedConfidences)
              : latestUsable.confidence,
          ...snapshotValues,
        };

  const parsed: SkillContractParse<PlantContextBundle> = parsePlantContextBundle({
    contextVersion: options.contextVersion,
    growId,
    tentId: tentId ?? null,
    plantId,
    stage: stage ?? null,
    strain: strain ?? null,
    isAutoflower: input.identity?.isAutoflower ?? null,
    ageDays: input.identity?.ageDays ?? null,
    medium: medium ?? null,
    potSize: potSize ?? null,
    latestSnapshot,
    recentDiaryEntryCount,
    notes: [],
    targets: targets ?? null,
  });

  if (parsed.ok === false) return { ok: false, issues: parsed.issues };

  return {
    ok: true,
    compilation: {
      bundle: parsed.value,
      contextVersion: options.contextVersion,
      windows,
      plantType,
      irrigationArchitecture,
      recentActions,
      observations,
      compactTimeline,
      photoSummary,
      sensorSummary,
      notableDeviations,
      conflictingEvidence,
      missingInformation: gaps.missingInformation,
      sourceWarnings,
      previousRecommendations,
      unresolvedFollowUps,
      completenessScore: gaps.completenessScore,
    },
  };
}
