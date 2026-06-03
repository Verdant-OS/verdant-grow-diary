/**
 * VERDANT-13: Deterministic V0 Loop harness.
 *
 * Pure, side-effect-free composition of:
 *   normalized sensor snapshot
 *     → AI Doctor context
 *     → alert / recommendation
 *     → approval-required Action Queue draft
 *     → traceability record
 *
 * Hard constraints (mirror the Verdant master prompt + Sentinel Codex):
 *   - No I/O. No Supabase. No React. No hooks.
 *   - No automation. No direct device actuation. No unattended control.
 *   - No elevated service credentials.
 *   - No fake live data. Demo/stale/invalid never reported as healthy.
 *   - All Action Queue drafts are approval-required and contain advisory
 *     text only — never executable device commands.
 *   - Same input → same output (sorted alerts, deterministic strings,
 *     injectable `now`).
 *   - Autoflower-sensitive guidance stays conservative (review-first).
 *   - Insufficient context yields a "more data needed" watch state instead
 *     of forcing a recommendation.
 *
 * This file is the test harness foundation only. Wiring into the UI/route
 * layer happens in a later slice and must remain presenter-only.
 */

import {
  type NormalizedSensorReading,
  type ReadingSource,
} from "./sensorReadingNormalizationRules";
import {
  mapSensorReadingToAiDoctorContext,
  type AiDoctorSensorContext,
} from "./aiDoctorSensorContextRules";
import {
  buildActionQueueDraftFromAlert,
  type ActionQueueDraft,
  type AlertLike,
  type AlertSeverity,
} from "./alertToActionQueueRules";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface V0GrowRef {
  id: string;
}
export interface V0TentRef {
  id: string;
}
export interface V0PlantRef {
  id: string;
  /** Used for autoflower-sensitive conservative guidance. */
  isAutoflower?: boolean;
  /** Stage label (informational only — no taxonomy coupling here). */
  stage?: string | null;
}

export interface V0Targets {
  temperature_c?: { min: number; max: number } | null;
  humidity_pct?: { min: number; max: number } | null;
  vpd_kpa?: { min: number; max: number } | null;
}

/** Deadband applied on either side of target min/max before alerting. */
export interface V0Deadband {
  temperature_c?: number;
  humidity_pct?: number;
  vpd_kpa?: number;
}

export interface V0DiaryContext {
  /** How many diary/log entries exist in the recent window. */
  recentEntryCount: number;
}

export interface V0AiDoctorFixture {
  /** Short, presenter-safe summary text. */
  summary: string;
  /** 0..1 confidence reported by upstream AI. */
  confidence: number;
  /** Optional reference ID for traceability linking. */
  outputRef?: string | null;
  /** Optional suggested action text (advisory only — never device commands). */
  suggestedActionText?: string | null;
}

export interface V0LoopInput {
  grow: V0GrowRef;
  tent: V0TentRef;
  plant?: V0PlantRef | null;
  reading: NormalizedSensorReading;
  targets?: V0Targets | null;
  deadband?: V0Deadband | null;
  diaryContext?: V0DiaryContext | null;
  aiDoctor?: V0AiDoctorFixture | null;
  /** ISO-8601 reference time for deterministic generation. */
  now: string;
}

export type V0LoopState =
  | "healthy"
  | "watch"
  | "degraded"
  | "untrusted"
  | "insufficient_data";

export interface V0LoopAlert {
  id: string;
  severity: AlertSeverity;
  /** Canonical metric key (matches AlertLike.metric) */
  metric: string;
  reason: string;
  title: string;
}

export interface V0LoopTraceability {
  growId: string;
  tentId: string;
  plantId: string | null;
  sensorCapturedAt: string;
  sourceCategory: ReadingSource;
  aiOutputRef: string | null;
  generatedAt: string;
}

export interface V0LoopResult {
  state: V0LoopState;
  sensorContext: AiDoctorSensorContext;
  aiDoctorSummary: string;
  alerts: V0LoopAlert[];
  actionDraft: ActionQueueDraft | null;
  notes: string[];
  traceability: V0LoopTraceability;
}

// ---------------------------------------------------------------------------
// Threshold / alert generation
// ---------------------------------------------------------------------------

/** Severity ordering used for sort + worst-of selection (lower index = worse). */
const SEVERITY_ORDER: readonly AlertSeverity[] = [
  "critical",
  "warning",
  "watch",
  "info",
];
const SEVERITY_RANK: Record<AlertSeverity, number> = {
  critical: 0,
  warning: 1,
  watch: 2,
  info: 3,
};

interface MetricSpec {
  key: "temperature_c" | "humidity_pct" | "vpd_kpa";
  alertMetric: string;
  label: string;
}

const METRIC_SPECS: readonly MetricSpec[] = [
  { key: "temperature_c", alertMetric: "temperature_c", label: "Temperature" },
  { key: "humidity_pct", alertMetric: "humidity_pct", label: "Humidity" },
  { key: "vpd_kpa", alertMetric: "vpd_kpa", label: "VPD" },
];

function deadbandFor(
  key: MetricSpec["key"],
  deadband: V0Deadband | null | undefined,
): number {
  if (!deadband) return 0;
  const v = deadband[key];
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

function classifyAgainstBand(
  value: number,
  band: { min: number; max: number },
  db: number,
): { kind: "ok" | "near" | "out"; direction: "low" | "high" | "none" } {
  // Out of band beyond deadband → out
  if (value < band.min - db) return { kind: "out", direction: "low" };
  if (value > band.max + db) return { kind: "out", direction: "high" };
  // Within band entirely → ok
  if (value >= band.min && value <= band.max) {
    return { kind: "ok", direction: "none" };
  }
  // In the deadband shoulder → near
  return {
    kind: "near",
    direction: value < band.min ? "low" : "high",
  };
}

function buildThresholdAlerts(input: V0LoopInput): V0LoopAlert[] {
  const targets = input.targets;
  if (!targets) return [];
  const alerts: V0LoopAlert[] = [];

  for (const spec of METRIC_SPECS) {
    const band = targets[spec.key];
    if (!band) continue;
    const value = input.reading[spec.key];
    if (value === null || !Number.isFinite(value)) continue;

    const db = deadbandFor(spec.key, input.deadband);
    const c = classifyAgainstBand(value, band, db);
    if (c.kind === "ok") continue;

    const directionWord = c.direction === "low" ? "low" : "high";
    const severity: AlertSeverity = c.kind === "out" ? "warning" : "watch";
    alerts.push({
      // Deterministic id — no random/uuid
      id: `threshold:${spec.alertMetric}:${directionWord}`,
      severity,
      metric: spec.alertMetric,
      title: `${spec.label} ${directionWord}`,
      reason: `${spec.label} ${directionWord} for target band (${band.min}–${band.max}).`,
    });
  }

  return alerts;
}

function sortAlerts(alerts: V0LoopAlert[]): V0LoopAlert[] {
  return [...alerts].sort((a, b) => {
    const sr = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sr !== 0) return sr;
    if (a.metric !== b.metric) return a.metric < b.metric ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// State derivation
// ---------------------------------------------------------------------------

function deriveState(
  context: AiDoctorSensorContext,
  alerts: V0LoopAlert[],
  hasPlant: boolean,
  diaryContext: V0DiaryContext | null | undefined,
): V0LoopState {
  // Safety-first: invalid telemetry → untrusted (never healthy)
  if (context.isInvalid || context.confidenceImpact === "untrusted") {
    return "untrusted";
  }
  // Stale → degraded watch
  if (context.isStale) return "degraded";

  // Insufficient context for a meaningful loop: no plant context AND no diary
  // signal AND no usable metrics → insufficient_data ("more data needed").
  const noDiary = !diaryContext || diaryContext.recentEntryCount <= 0;
  if (!hasPlant && noDiary && context.usableMetrics.length === 0) {
    return "insufficient_data";
  }

  const worst = alerts.reduce<AlertSeverity | null>((acc, a) => {
    if (acc === null) return a.severity;
    return SEVERITY_RANK[a.severity] < SEVERITY_RANK[acc] ? a.severity : acc;
  }, null);
  if (worst === "critical" || worst === "warning") return "degraded";
  if (worst === "watch") return "watch";
  return "healthy";
}

// ---------------------------------------------------------------------------
// AI Doctor summary
// ---------------------------------------------------------------------------

/** Minimum confidence required before any AI-derived action is considered. */
export const AI_DOCTOR_MIN_ACTION_CONFIDENCE = 0.6;

function buildAiDoctorSummary(
  state: V0LoopState,
  context: AiDoctorSensorContext,
  fixture: V0AiDoctorFixture | null | undefined,
  plant: V0PlantRef | null | undefined,
): string {
  // Always lead with the cautious sensor-context line.
  const base = context.contextSummary;
  if (state === "untrusted") {
    return `${base} AI assessment withheld: telemetry untrusted.`;
  }
  if (state === "insufficient_data") {
    return `${base} More data needed before any recommendation.`;
  }
  if (!fixture) {
    return `${base} No AI Doctor output supplied; review manually.`;
  }
  const conf = clampConfidence(fixture.confidence);
  const confPct = Math.round(conf * 100);
  const autoNote =
    plant?.isAutoflower === true
      ? " Autoflower: keep guidance conservative and avoid high-stress changes."
      : "";
  return `${base} AI Doctor: ${fixture.summary} (confidence ${confPct}%).${autoNote}`;
}

function clampConfidence(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

// ---------------------------------------------------------------------------
// Action Queue draft
// ---------------------------------------------------------------------------

/**
 * Words that are never allowed inside an Action Queue draft's suggested
 * change text. This is a defensive check; the upstream rules already
 * produce advisory-only text. Used by the static safety tests too.
 */
export const FORBIDDEN_ACTION_VERBS: readonly string[] = [
  "turn on",
  "turn off",
  "switch on",
  "switch off",
  "power on",
  "power off",
  "execute",
  "auto-dose",
  "autodose",
  "auto dose",
  "start pump",
  "stop pump",
  "open valve",
  "close valve",
  "set fan speed",
];

function containsForbiddenCommand(text: string): boolean {
  const t = text.toLowerCase();
  return FORBIDDEN_ACTION_VERBS.some((v) => t.includes(v));
}

function pickPrimaryAlert(alerts: V0LoopAlert[]): V0LoopAlert | null {
  // Already sorted: worst severity first, then by metric/id.
  for (const sev of SEVERITY_ORDER) {
    const hit = alerts.find((a) => a.severity === sev);
    if (hit) return hit;
  }
  return null;
}

function buildActionDraft(
  input: V0LoopInput,
  state: V0LoopState,
  alerts: V0LoopAlert[],
  context: AiDoctorSensorContext,
): { draft: ActionQueueDraft | null; note: string | null } {
  if (state === "untrusted") {
    return { draft: null, note: "No action draft: telemetry untrusted." };
  }
  if (state === "insufficient_data") {
    return { draft: null, note: "No action draft: more data needed." };
  }
  if (context.isStale) {
    return { draft: null, note: "No action draft: sensor reading stale." };
  }

  const primary = pickPrimaryAlert(alerts);
  if (!primary) return { draft: null, note: null };

  // Low-confidence AI must not produce an action.
  const conf = input.aiDoctor ? clampConfidence(input.aiDoctor.confidence) : 1;
  if (input.aiDoctor && conf < AI_DOCTOR_MIN_ACTION_CONFIDENCE) {
    return {
      draft: null,
      note: `No action draft: AI confidence ${Math.round(conf * 100)}% below threshold.`,
    };
  }

  const alertLike: AlertLike = {
    id: primary.id,
    grow_id: input.grow.id,
    tent_id: input.tent.id,
    plant_id: input.plant?.id ?? null,
    status: "open",
    severity: primary.severity,
    metric: primary.metric,
    reason: primary.reason,
    title: primary.title,
    source: "v0_loop_harness",
  };

  const result = buildActionQueueDraftFromAlert(alertLike);
  if (!result.ok) {
    const r = (result as { ok: false; reason: string }).reason;
    return { draft: null, note: `No action draft: ${r}.` };
  }

  // Defense-in-depth: never allow executable command text to slip through.
  if (containsForbiddenCommand(result.draft.suggested_change)) {
    return {
      draft: null,
      note: "No action draft: forbidden command text in suggestion.",
    };
  }

  return { draft: result.draft, note: null };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run the deterministic V0 loop over a single normalized sensor snapshot.
 *
 * Pure: given identical input, returns identical output (including alert
 * ordering, summary text, and traceability).
 */
export function runV0Loop(input: V0LoopInput): V0LoopResult {
  const sensorContext = mapSensorReadingToAiDoctorContext(input.reading);

  const rawAlerts = buildThresholdAlerts(input);
  const alerts = sortAlerts(rawAlerts);

  const state = deriveState(
    sensorContext,
    alerts,
    !!input.plant,
    input.diaryContext,
  );

  const aiDoctorSummary = buildAiDoctorSummary(
    state,
    sensorContext,
    input.aiDoctor,
    input.plant,
  );

  const { draft, note } = buildActionDraft(input, state, alerts, sensorContext);

  const notes: string[] = [];
  // Carry forward safety notes from sensor context (deterministic order).
  notes.push(...sensorContext.safetyNotes);
  if (note) notes.push(note);
  if (input.plant?.isAutoflower) {
    notes.push(
      "Autoflower plant: recommendations stay conservative; avoid high-stress training and aggressive nutrient changes.",
    );
  }

  const traceability: V0LoopTraceability = {
    growId: input.grow.id,
    tentId: input.tent.id,
    plantId: input.plant?.id ?? null,
    sensorCapturedAt: input.reading.captured_at,
    sourceCategory: sensorContext.sourceState,
    aiOutputRef: input.aiDoctor?.outputRef ?? null,
    generatedAt: input.now,
  };

  return {
    state,
    sensorContext,
    aiDoctorSummary,
    alerts,
    actionDraft: draft,
    notes,
    traceability,
  };
}
