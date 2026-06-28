/**
 * endOfRunGrowReportViewModel — deterministic End-of-Run Grow Report preview.
 *
 * Product framing: "Free helps you log the grow. Pro helps you preserve,
 * analyze, and learn from the grow." This builds the read-only Pro-hook
 * preview from existing loaded grow/tent/plant/timeline/sensor/alert/action
 * data. It never infers from missing data and never fabricates outcomes.
 *
 * Strict safety envelope:
 *  - Pure, typed, null-safe. No React, no Supabase, no I/O, no fetch.
 *  - No AI/model calls, no automation, no device control.
 *  - No command/setpoint/controller/actuator/device fields.
 *  - Deterministic for any given input (no Date.now, no Math.random).
 *  - Cautious language only: counts and provenance, never causal or
 *    certainty claims, never "healthy/successful" unless data proves it
 *    (it never does here — we report facts, not verdicts).
 *
 * Sensor source taxonomy mirrors the canonical eight provenance labels
 * (live | manual | csv | demo | stale | invalid | imported | unknown).
 * Only live/manual/csv are trusted; the rest are disclosed honestly and
 * are never described as live.
 */

import {
  classifyTimelineEntry,
  type TimelineFilterCategory,
} from "@/lib/timelineEntryClassification";

// ─────────────────────────────────────────────────────────────────────────────
// Input row shapes (loose, null-safe — callers pass existing row arrays)
// ─────────────────────────────────────────────────────────────────────────────

export interface GrowReportGrowLike {
  id: string;
  name: string;
  stage?: string | null;
  started_at?: string | null;
  is_archived?: boolean | null;
  grow_type?: string | null;
}

export interface GrowReportTentLike {
  id: string;
  name?: string | null;
  grow_id?: string | null;
}

export interface GrowReportPlantLike {
  id: string;
  name: string;
  strain?: string | null;
  stage?: string | null;
  grow_id?: string | null;
  tent_id?: string | null;
  started_at?: string | null;
}

/** A grow_events row (timeline event). */
export interface GrowReportEventLike {
  id: string;
  event_type?: string | null;
  source?: string | null;
  occurred_at?: string | null;
  plant_id?: string | null;
  tent_id?: string | null;
  is_deleted?: boolean | null;
}

/** A sensor_readings row (sensor snapshot). */
export interface GrowReportSensorReadingLike {
  id?: string | null;
  source?: string | null;
  /** Optional quality flag; "stale"/"invalid" override the source bucket. */
  quality?: string | null;
  ts?: string | null;
  captured_at?: string | null;
  tent_id?: string | null;
}

/** An alerts row. */
export interface GrowReportAlertLike {
  id: string;
  status?: string | null;
  severity?: string | null;
  metric?: string | null;
  plant_id?: string | null;
  resolved_at?: string | null;
}

/** An action_queue row. */
export interface GrowReportActionLike {
  id: string;
  status?: string | null;
  plant_id?: string | null;
}

/** An ai_doctor_sessions row. */
export interface GrowReportAiDoctorLike {
  id: string;
  plant_id?: string | null;
}

export interface GrowReportInput {
  grow: GrowReportGrowLike;
  tents?: GrowReportTentLike[] | null;
  plants?: GrowReportPlantLike[] | null;
  events?: GrowReportEventLike[] | null;
  sensorReadings?: GrowReportSensorReadingLike[] | null;
  alerts?: GrowReportAlertLike[] | null;
  actions?: GrowReportActionLike[] | null;
  aiDoctorSessions?: GrowReportAiDoctorLike[] | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sensor source taxonomy (self-contained; mirrors the eight provenance labels)
// ─────────────────────────────────────────────────────────────────────────────

export const GROW_REPORT_SENSOR_SOURCES = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
  "imported",
  "unknown",
] as const;

export type GrowReportSensorSource = (typeof GROW_REPORT_SENSOR_SOURCES)[number];

const TRUSTED_SENSOR_SOURCES = new Set<GrowReportSensorSource>(["live", "manual", "csv"]);

const KNOWN_SENSOR_SOURCES = new Set<string>(GROW_REPORT_SENSOR_SOURCES);

const SENSOR_SOURCE_LABELS: Record<GrowReportSensorSource, string> = {
  live: "Live",
  manual: "Manual",
  csv: "CSV",
  demo: "Demo",
  stale: "Stale",
  invalid: "Invalid",
  imported: "Imported",
  unknown: "Unknown source",
};

export function growReportSensorSourceLabel(src: GrowReportSensorSource): string {
  return SENSOR_SOURCE_LABELS[src];
}

export function isTrustedGrowReportSensorSource(src: GrowReportSensorSource): boolean {
  return TRUSTED_SENSOR_SOURCES.has(src);
}

/**
 * Classify a sensor snapshot into one of the eight provenance buckets.
 * A "stale"/"invalid" quality flag overrides the source so degraded
 * telemetry is disclosed honestly. Unrecognized sources become "unknown".
 */
export function normalizeGrowReportSensorSource(
  source: string | null | undefined,
  quality?: string | null | undefined,
): GrowReportSensorSource {
  const q = typeof quality === "string" ? quality.trim().toLowerCase() : "";
  if (q === "invalid") return "invalid";
  if (q === "stale") return "stale";
  if (typeof source !== "string") return "unknown";
  const v = source.trim().toLowerCase();
  if (!v) return "unknown";
  if (KNOWN_SENSOR_SOURCES.has(v)) return v as GrowReportSensorSource;
  return "unknown";
}

// ─────────────────────────────────────────────────────────────────────────────
// View-model shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface GrowReportCount {
  key: string;
  label: string;
  count: number;
}

export interface GrowReportHeader {
  growId: string;
  growName: string;
  startedAt: string | null;
  /** Latest logged timestamp across timeline + sensor data, if any. */
  endedAt: string | null;
  hasDateRange: boolean;
  tentCount: number;
  plantCount: number;
  statusBadges: string[];
  dataSourceNote: string;
}

export interface GrowReportPlantSummary {
  id: string;
  name: string;
  strainLabel: string;
  stageLabel: string;
  firstLoggedAt: string | null;
  latestLoggedAt: string | null;
  timelineEventCount: number;
  photoCount: number;
  wateringCount: number;
  feedingCount: number;
  alertCount: number;
  aiDoctorCount: number;
  mostDocumentedArea: string;
  missingContext: string[];
}

export interface GrowReportSensorSourceCount {
  source: GrowReportSensorSource;
  label: string;
  count: number;
  trusted: boolean;
}

export interface GrowReportSensorTruthSummary {
  hasData: boolean;
  totalSnapshots: number;
  bySource: GrowReportSensorSourceCount[];
  mostRecentAt: string | null;
  hasLiveData: boolean;
  hasDegraded: boolean;
  degradedWarning: string | null;
  /** True when snapshots exist but none are live. */
  onlyNonLiveData: boolean;
  note: string;
}

export interface GrowReportSeverityCount {
  severity: string;
  count: number;
}

export interface GrowReportAlertSummary {
  hasData: boolean;
  total: number;
  open: number;
  resolved: number;
  bySeverity: GrowReportSeverityCount[];
  topMetrics: GrowReportCount[];
  note: string;
}

export interface GrowReportActionQueueSummary {
  hasData: boolean;
  total: number;
  suggested: number;
  pendingApproval: number;
  approved: number;
  rejected: number;
  completed: number;
  safetyNote: string;
}

export type GrowReportLessonCategory = "repeat" | "improve";

export interface GrowReportLesson {
  id: string;
  category: GrowReportLessonCategory;
  priority: number;
  title: string;
  detail: string;
  evidence: string;
}

export interface GrowReportProTeaser {
  headline: string;
  description: string;
  exportLabel: string;
  exportAvailable: false;
}

export interface GrowReportViewModel {
  isEmpty: boolean;
  header: GrowReportHeader;
  runSummary: {
    hasAnyData: boolean;
    categories: GrowReportCount[];
  };
  plants: GrowReportPlantSummary[];
  sensorTruth: GrowReportSensorTruthSummary;
  alerts: GrowReportAlertSummary;
  actionQueue: GrowReportActionQueueSummary;
  lessons: GrowReportLesson[];
  proTeaser: GrowReportProTeaser;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants (copy)
// ─────────────────────────────────────────────────────────────────────────────

export const REPORT_DATA_SOURCE_NOTE =
  "This preview uses existing Verdant logs and labeled sensor snapshots. It does not infer from missing data." as const;

export const REPORT_NO_LOGGED_DATA_COPY = "No logged data yet" as const;

export const ACTION_QUEUE_SAFETY_NOTE =
  "Verdant suggestions remain grower-approved. This report does not include device commands." as const;

export const SENSOR_TRUTH_EMPTY_COPY = "No sensor snapshots logged for this grow yet." as const;

export const ALERTS_EMPTY_COPY = "No alerts logged for this grow." as const;

export const REPORT_STATUS_BADGES: readonly string[] = [
  "Preview",
  "Read-only",
  "Based on available logged data",
];

const PRO_TEASER: GrowReportProTeaser = {
  headline: "Pro report export coming soon",
  description:
    "Future Pro: printable report, CSV export, deeper trend analysis, and run-to-run comparison.",
  exportLabel: "Export (coming soon)",
  exportAvailable: false,
};

const BUCKET_LABELS: Record<TimelineFilterCategory, string> = {
  photos: "Photos",
  watering: "Watering",
  feeding: "Feeding",
  symptoms: "Symptoms",
  training: "Training",
  measurement: "Measurements",
  transplant: "Transplant",
  harvest: "Harvest",
  reminder: "Reminders",
  notes: "Notes",
};

/** Deterministic tie-break order for "most documented area". */
const BUCKET_PRIORITY: TimelineFilterCategory[] = [
  "watering",
  "feeding",
  "training",
  "symptoms",
  "photos",
  "measurement",
  "transplant",
  "harvest",
  "reminder",
  "notes",
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function toArray<T>(v: readonly T[] | null | undefined): T[] {
  return Array.isArray(v) ? v.slice() : [];
}

function nonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function parseMillis(v: string | null | undefined): number | null {
  const s = nonEmptyString(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** Latest (max) of a set of ISO timestamps; returns the original string. */
function latestTimestamp(values: Array<string | null | undefined>): string | null {
  let bestStr: string | null = null;
  let bestMs = -Infinity;
  for (const v of values) {
    const ms = parseMillis(v);
    if (ms !== null && ms > bestMs) {
      bestMs = ms;
      bestStr = nonEmptyString(v);
    }
  }
  return bestStr;
}

/** Earliest (min) of a set of ISO timestamps; returns the original string. */
function earliestTimestamp(values: Array<string | null | undefined>): string | null {
  let bestStr: string | null = null;
  let bestMs = Infinity;
  for (const v of values) {
    const ms = parseMillis(v);
    if (ms !== null && ms < bestMs) {
      bestMs = ms;
      bestStr = nonEmptyString(v);
    }
  }
  return bestStr;
}

function liveEvents(events: GrowReportEventLike[]): GrowReportEventLike[] {
  return events.filter((e) => e && e.is_deleted !== true);
}

function bucketOf(event: GrowReportEventLike): TimelineFilterCategory {
  return classifyTimelineEntry({ eventType: event.event_type ?? null });
}

function isObservation(event: GrowReportEventLike): boolean {
  return nonEmptyString(event.event_type)?.toLowerCase() === "observation";
}

function countBuckets(events: GrowReportEventLike[]): Record<TimelineFilterCategory, number> {
  const counts: Record<TimelineFilterCategory, number> = {
    photos: 0,
    watering: 0,
    feeding: 0,
    symptoms: 0,
    training: 0,
    measurement: 0,
    transplant: 0,
    harvest: 0,
    reminder: 0,
    notes: 0,
  };
  for (const e of events) counts[bucketOf(e)] += 1;
  return counts;
}

function mostDocumentedArea(counts: Record<TimelineFilterCategory, number>): string {
  let best: TimelineFilterCategory | null = null;
  let bestCount = 0;
  for (const bucket of BUCKET_PRIORITY) {
    if (counts[bucket] > bestCount) {
      best = bucket;
      bestCount = counts[bucket];
    }
  }
  return best ? BUCKET_LABELS[best] : REPORT_NO_LOGGED_DATA_COPY;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section builders
// ─────────────────────────────────────────────────────────────────────────────

function buildHeader(
  input: GrowReportInput,
  events: GrowReportEventLike[],
  sensorReadings: GrowReportSensorReadingLike[],
  plants: GrowReportPlantLike[],
  tents: GrowReportTentLike[],
): GrowReportHeader {
  const startedAt = nonEmptyString(input.grow.started_at);
  const endedAt = latestTimestamp([
    ...events.map((e) => e.occurred_at),
    ...sensorReadings.map((s) => s.ts ?? s.captured_at),
  ]);

  // Tent count: prefer explicit tents; else distinct tent_ids on plants/events.
  let tentCount: number;
  if (tents.length > 0) {
    tentCount = new Set(tents.map((t) => t.id).filter(Boolean)).size;
  } else {
    const ids = new Set<string>();
    for (const p of plants) {
      const id = nonEmptyString(p.tent_id);
      if (id) ids.add(id);
    }
    for (const e of events) {
      const id = nonEmptyString(e.tent_id);
      if (id) ids.add(id);
    }
    tentCount = ids.size;
  }

  return {
    growId: input.grow.id,
    growName: input.grow.name,
    startedAt,
    endedAt,
    hasDateRange: startedAt !== null && endedAt !== null,
    tentCount,
    plantCount: plants.length,
    statusBadges: REPORT_STATUS_BADGES.slice(),
    dataSourceNote: REPORT_DATA_SOURCE_NOTE,
  };
}

function buildRunSummary(
  events: GrowReportEventLike[],
  sensorReadings: GrowReportSensorReadingLike[],
  alerts: GrowReportAlertLike[],
  actions: GrowReportActionLike[],
  aiDoctor: GrowReportAiDoctorLike[],
): GrowReportViewModel["runSummary"] {
  const buckets = countBuckets(events);
  const observationCount = events.filter(isObservation).length;
  // Observations classify into the "notes" bucket; surface them under the
  // dedicated symptom/observation category instead of double-counting.
  const notesOnly = Math.max(0, buckets.notes - observationCount);
  const categories: GrowReportCount[] = [
    { key: "timeline_events", label: "Timeline events", count: events.length },
    { key: "notes", label: "Notes", count: notesOnly },
    { key: "photos", label: "Photos", count: buckets.photos },
    { key: "watering", label: "Watering logs", count: buckets.watering },
    { key: "feeding", label: "Feeding logs", count: buckets.feeding },
    { key: "training", label: "Training events", count: buckets.training },
    {
      key: "symptoms_observations",
      label: "Symptom / observation entries",
      count: buckets.symptoms + observationCount,
    },
    {
      key: "sensor_snapshots",
      label: "Sensor snapshots",
      count: sensorReadings.length,
    },
    { key: "alerts", label: "Alerts", count: alerts.length },
    { key: "action_items", label: "Action Queue items", count: actions.length },
    { key: "ai_doctor", label: "AI Doctor entries", count: aiDoctor.length },
  ];
  const hasAnyData = categories.some((c) => c.count > 0);
  return { hasAnyData, categories };
}

function buildPlantSummaries(
  plants: GrowReportPlantLike[],
  events: GrowReportEventLike[],
  alerts: GrowReportAlertLike[],
  aiDoctor: GrowReportAiDoctorLike[],
  tentsWithSnapshots: Set<string>,
): GrowReportPlantSummary[] {
  const summaries = plants.map((plant) => {
    const plantEvents = events.filter((e) => e.plant_id === plant.id);
    const buckets = countBuckets(plantEvents);
    const alertCount = alerts.filter((a) => a.plant_id === plant.id).length;
    const aiDoctorCount = aiDoctor.filter((s) => s.plant_id === plant.id).length;
    const strain = nonEmptyString(plant.strain);
    const stage = nonEmptyString(plant.stage);
    const tentId = nonEmptyString(plant.tent_id);
    const hasSnapshots = tentId !== null && tentsWithSnapshots.has(tentId);

    const missingContext: string[] = [];
    if (buckets.photos === 0) missingContext.push("No photos");
    if (!hasSnapshots) missingContext.push("No sensor snapshots");
    if (buckets.watering === 0) missingContext.push("No watering logs");
    if (buckets.feeding === 0) missingContext.push("No feeding logs");
    if (alertCount === 0) missingContext.push("No alerts reviewed");
    if (!stage) missingContext.push("Unknown stage");
    if (!strain) missingContext.push("Unknown strain");

    return {
      id: plant.id,
      name: plant.name,
      strainLabel: strain ?? "Unknown strain",
      stageLabel: stage ?? "Unknown stage",
      firstLoggedAt: earliestTimestamp(plantEvents.map((e) => e.occurred_at)),
      latestLoggedAt: latestTimestamp(plantEvents.map((e) => e.occurred_at)),
      timelineEventCount: plantEvents.length,
      photoCount: buckets.photos,
      wateringCount: buckets.watering,
      feedingCount: buckets.feeding,
      alertCount,
      aiDoctorCount,
      mostDocumentedArea: mostDocumentedArea(buckets),
      missingContext,
    };
  });

  summaries.sort((a, b) => {
    const an = a.name.toLowerCase();
    const bn = b.name.toLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return summaries;
}

function buildSensorTruth(
  sensorReadings: GrowReportSensorReadingLike[],
): GrowReportSensorTruthSummary {
  const tally = new Map<GrowReportSensorSource, number>();
  for (const src of GROW_REPORT_SENSOR_SOURCES) tally.set(src, 0);
  for (const r of sensorReadings) {
    const src = normalizeGrowReportSensorSource(r.source, r.quality);
    tally.set(src, (tally.get(src) ?? 0) + 1);
  }
  const bySource: GrowReportSensorSourceCount[] = GROW_REPORT_SENSOR_SOURCES.map((source) => ({
    source,
    label: SENSOR_SOURCE_LABELS[source],
    count: tally.get(source) ?? 0,
    trusted: TRUSTED_SENSOR_SOURCES.has(source),
  }));

  const totalSnapshots = sensorReadings.length;
  const hasData = totalSnapshots > 0;
  const liveCount = tally.get("live") ?? 0;
  const degradedCount =
    (tally.get("demo") ?? 0) +
    (tally.get("stale") ?? 0) +
    (tally.get("invalid") ?? 0) +
    (tally.get("imported") ?? 0) +
    (tally.get("unknown") ?? 0);
  const hasDegraded = degradedCount > 0;
  const hasLiveData = liveCount > 0;
  const onlyNonLiveData = hasData && !hasLiveData;

  const mostRecentAt = latestTimestamp(sensorReadings.map((r) => r.ts ?? r.captured_at));

  let degradedWarning: string | null = null;
  if (hasDegraded) {
    degradedWarning =
      "Some snapshots are demo, imported, stale, invalid, or from an unrecognized source. These are not live readings.";
  }

  let note: string;
  if (!hasData) {
    note = SENSOR_TRUTH_EMPTY_COPY;
  } else if (onlyNonLiveData) {
    note =
      "No live sensor data in this run. Snapshots come only from manual, demo, imported, or other non-live sources.";
  } else {
    note = "Live and labeled sensor snapshots are summarized by source below.";
  }

  return {
    hasData,
    totalSnapshots,
    bySource,
    mostRecentAt,
    hasLiveData,
    hasDegraded,
    degradedWarning,
    onlyNonLiveData,
    note,
  };
}

function buildAlertSummary(alerts: GrowReportAlertLike[]): GrowReportAlertSummary {
  const total = alerts.length;
  const isResolved = (a: GrowReportAlertLike): boolean => {
    const status = nonEmptyString(a.status)?.toLowerCase() ?? "";
    if (status === "resolved" || status === "closed") return true;
    return nonEmptyString(a.resolved_at) !== null;
  };
  const resolved = alerts.filter(isResolved).length;
  const open = total - resolved;

  const severityTally = new Map<string, number>();
  for (const a of alerts) {
    const sev = nonEmptyString(a.severity)?.toLowerCase();
    if (!sev) continue;
    severityTally.set(sev, (severityTally.get(sev) ?? 0) + 1);
  }
  const bySeverity: GrowReportSeverityCount[] = Array.from(severityTally.entries())
    .map(([severity, count]) => ({ severity, count }))
    .sort((a, b) => b.count - a.count || (a.severity < b.severity ? -1 : 1));

  const metricTally = new Map<string, number>();
  for (const a of alerts) {
    const metric = nonEmptyString(a.metric);
    if (!metric) continue;
    metricTally.set(metric, (metricTally.get(metric) ?? 0) + 1);
  }
  const topMetrics: GrowReportCount[] = Array.from(metricTally.entries())
    .map(([metric, count]) => ({ key: metric, label: metric, count }))
    .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1))
    .slice(0, 5);

  return {
    hasData: total > 0,
    total,
    open,
    resolved,
    bySeverity,
    topMetrics,
    note:
      total === 0
        ? ALERTS_EMPTY_COPY
        : `${total} alert${total === 1 ? "" : "s"} logged for this grow.`,
  };
}

function buildActionQueueSummary(actions: GrowReportActionLike[]): GrowReportActionQueueSummary {
  const total = actions.length;
  const countStatus = (status: string): number =>
    actions.filter((a) => nonEmptyString(a.status)?.toLowerCase() === status).length;
  return {
    hasData: total > 0,
    total,
    suggested: total,
    pendingApproval: countStatus("pending_approval"),
    approved: countStatus("approved"),
    rejected: countStatus("rejected"),
    completed: countStatus("completed"),
    safetyNote: ACTION_QUEUE_SAFETY_NOTE,
  };
}

function buildLessons(args: {
  runSummary: GrowReportViewModel["runSummary"];
  sensorTruth: GrowReportSensorTruthSummary;
  alerts: GrowReportAlertSummary;
  actionQueue: GrowReportActionQueueSummary;
  totalEvents: number;
}): GrowReportLesson[] {
  const { runSummary, sensorTruth, alerts, actionQueue, totalEvents } = args;
  const byKey = (key: string): number =>
    runSummary.categories.find((c) => c.key === key)?.count ?? 0;
  const photoCount = byKey("photos");
  const wateringCount = byKey("watering");
  const symptomCount = byKey("symptoms_observations");

  const lessons: GrowReportLesson[] = [];
  const PHOTO_THRESHOLD = 4;

  // Repeat lessons (positive reinforcement, evidence-backed).
  if (photoCount >= PHOTO_THRESHOLD) {
    lessons.push({
      id: "repeat-photo-logging",
      category: "repeat",
      priority: 1,
      title: "Repeat: keep logging photos regularly",
      detail: "Consistent photo logging gives the next run a visual record to compare against.",
      evidence: `${photoCount} photos logged this run.`,
    });
  }
  if (alerts.hasData && actionQueue.hasData) {
    lessons.push({
      id: "repeat-alert-review",
      category: "repeat",
      priority: 2,
      title: "Repeat: review alerts before acting",
      detail:
        "Alerts and Action Queue items both exist, so issues were surfaced and routed for grower review.",
      evidence: `${alerts.total} alert${alerts.total === 1 ? "" : "s"} and ${actionQueue.total} Action Queue item${actionQueue.total === 1 ? "" : "s"}.`,
    });
  }

  // Improve lessons (gaps, with the missing-data reason stated).
  if (totalEvents > 0 && !sensorTruth.hasData) {
    lessons.push({
      id: "improve-add-sensor-snapshots",
      category: "improve",
      priority: 1,
      title: "Improve: add sensor snapshots during major plant events",
      detail:
        "Timeline events exist but no sensor snapshots were logged, so environment context is missing.",
      evidence: `${totalEvents} timeline events and 0 sensor snapshots.`,
    });
  }
  if (symptomCount > 0 && wateringCount === 0) {
    lessons.push({
      id: "improve-add-watering-context",
      category: "improve",
      priority: 2,
      title: "Improve: add watering context next to symptoms",
      detail:
        "Symptom or observation entries exist but no watering logs were recorded to compare against.",
      evidence: `${symptomCount} symptom/observation entries and 0 watering logs.`,
    });
  }
  if (alerts.open > 0 && actionQueue.total === 0) {
    lessons.push({
      id: "improve-connect-alerts-to-followup",
      category: "improve",
      priority: 3,
      title: "Improve: connect alerts to follow-up notes",
      detail: "Open alerts exist with no Action Queue follow-up recorded yet.",
      evidence: `${alerts.open} open alert${alerts.open === 1 ? "" : "s"} and 0 Action Queue items.`,
    });
  }

  lessons.sort((a, b) => {
    if (a.category !== b.category) return a.category === "repeat" ? -1 : 1;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return lessons;
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level builder
// ─────────────────────────────────────────────────────────────────────────────

export function buildEndOfRunGrowReportViewModel(input: GrowReportInput): GrowReportViewModel {
  const tents = toArray(input.tents);
  const plants = toArray(input.plants);
  const events = liveEvents(toArray(input.events));
  const sensorReadings = toArray(input.sensorReadings);
  const alerts = toArray(input.alerts);
  const actions = toArray(input.actions);
  const aiDoctor = toArray(input.aiDoctorSessions);

  const tentsWithSnapshots = new Set<string>();
  for (const r of sensorReadings) {
    const id = nonEmptyString(r.tent_id);
    if (id) tentsWithSnapshots.add(id);
  }

  const header = buildHeader(input, events, sensorReadings, plants, tents);
  const runSummary = buildRunSummary(events, sensorReadings, alerts, actions, aiDoctor);
  const plantSummaries = buildPlantSummaries(plants, events, alerts, aiDoctor, tentsWithSnapshots);
  const sensorTruth = buildSensorTruth(sensorReadings);
  const alertSummary = buildAlertSummary(alerts);
  const actionQueue = buildActionQueueSummary(actions);
  const lessons = buildLessons({
    runSummary,
    sensorTruth,
    alerts: alertSummary,
    actionQueue,
    totalEvents: events.length,
  });

  const isEmpty =
    !runSummary.hasAnyData &&
    plants.length === 0 &&
    !sensorTruth.hasData &&
    !alertSummary.hasData &&
    !actionQueue.hasData;

  return {
    isEmpty,
    header,
    runSummary,
    plants: plantSummaries,
    sensorTruth,
    alerts: alertSummary,
    actionQueue,
    lessons,
    proTeaser: PRO_TEASER,
  };
}
