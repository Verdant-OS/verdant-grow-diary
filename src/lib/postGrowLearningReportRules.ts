/**
 * postGrowLearningReportRules — deterministic Phase 1 post-grow learning report.
 *
 * Scope:
 *  - Pure, typed, null-safe report view-model builder.
 *  - No AI calls, no device control, no automation, no schema coupling beyond
 *    existing grow/diary/harvest/sensor/action row shapes.
 *  - Cautious language only: correlations are observational, never causal.
 */

import { normalizeReportSensorSource } from "@/lib/postGrowReportRules";
import { withoutDiagnosticSensorRows } from "@/lib/sensorProvenanceFenceRules";
import { resolveSensorObservationTime } from "@/lib/sensorObservationTimeRules";

export const POST_GROW_LESSON_EVENT_TYPE = "post_grow_learning_lesson";

export interface PostGrowGrowLike {
  id: string;
  name: string;
  stage?: string | null;
  is_archived?: boolean | null;
  started_at?: string | null;
}

export interface PostGrowHarvestLike {
  harvested_at?: string | null;
  yield_grams?: number | null;
  medium?: string | null;
  notes?: string | null;
}

export interface PostGrowDiaryLike {
  id: string;
  note: string | null;
  photo_url?: string | null;
  entry_at: string;
  details?: unknown;
}

export interface PostGrowSensorReadingLike {
  id?: string | null;
  metric: string;
  value: number | null;
  ts: string;
  captured_at?: string | null;
  source?: string | null;
  /** Classification-only provenance; never copied into the report view model. */
  raw_payload?: unknown;
}

export interface PostGrowActionLike {
  id: string;
  action_type?: string | null;
  suggested_change?: string | null;
  status?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
}

export interface PostHarvestPoint {
  label: string;
  capturedAt: string;
  weightGrams: number | null;
  rhPct: number | null;
}

export interface SparklinePoint {
  x: number;
  y: number;
}

export interface MetricAggregateView {
  key: "temperature_c" | "humidity_pct" | "vpd_kpa";
  label: string;
  unit: string;
  count: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  stablePct: number | null;
  sparkline: SparklinePoint[];
}

export interface DataCompletenessView {
  score: number;
  label: "Strong" | "Useful" | "Thin";
  present: string[];
  missing: string[];
}

export interface PostGrowLearningReportViewModel {
  eligible: boolean;
  ineligibleReason: string | null;
  header: {
    growId: string;
    growName: string;
    stageLabel: string;
    archived: boolean;
    startedAt: string | null;
    harvestedAt: string | null;
    yieldGrams: number | null;
  };
  executiveSummary: string[];
  dataCompleteness: DataCompletenessView;
  environment: MetricAggregateView[];
  /**
   * Raw `source` labels of every sensor reading that fed this report.
   * Carried so the in-app provenance badges and the PDF source summary
   * render from the same truth. Labels are normalized downstream by
   * `normalizeReportSensorSource` — never trusted verbatim for display.
   */
  sensorReadingSources: Array<{ source: string | null }>;
  postHarvest: {
    yieldGrams: number | null;
    points: PostHarvestPoint[];
    weightLossPct: number | null;
    rhStabilized: boolean | null;
  };
  actionEffectiveness: {
    completedActions: number;
    outcomeNotes: number;
    observations: string[];
  };
  lesson: {
    entryId: string | null;
    text: string;
  };
  photos: Array<{ id: string; url: string; capturedAt: string; alt: string }>;
}

const STAGE_LABEL: Record<string, string> = {
  seedling: "Seedling",
  veg: "Vegetative",
  flower: "Flowering",
  flush: "Flushing",
  harvest: "Harvest",
  drying: "Drying / Curing",
};

const METRIC_META: Record<MetricAggregateView["key"], { label: string; unit: string }> = {
  temperature_c: { label: "Temperature", unit: "°C" },
  humidity_pct: { label: "Humidity", unit: "%" },
  vpd_kpa: { label: "VPD", unit: "kPa" },
};

function finite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readNumberFromDetails(details: unknown, keys: string[]): number | null {
  const obj = readObject(details);
  for (const key of keys) {
    const v = finite(obj[key]);
    if (v !== null) return v;
  }
  return null;
}

function readEventType(details: unknown): string {
  const raw = readObject(details).event_type;
  return typeof raw === "string" ? raw : "";
}

function formatNumber(value: number | null, digits = 1): string {
  return value === null ? "—" : value.toFixed(digits);
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stableMetricValue(metric: MetricAggregateView["key"], value: number): boolean {
  if (metric === "temperature_c") return value >= 18 && value <= 30;
  if (metric === "humidity_pct") return value >= 40 && value <= 70;
  return value >= 0.8 && value <= 1.6;
}

function sparkline(values: number[]): SparklinePoint[] {
  const recent = values.slice(-12);
  if (!recent.length) return [];
  const min = Math.min(...recent);
  const max = Math.max(...recent);
  const range = max - min;
  return recent.map((v, i) => ({
    x: i,
    y: range === 0 ? 0.5 : (v - min) / range,
  }));
}

function buildMetricAggregate(
  metric: MetricAggregateView["key"],
  readings: PostGrowSensorReadingLike[],
): MetricAggregateView {
  const values = readings
    .filter((r) => r.metric === metric)
    .map((reading, inputIndex) => ({
      reading,
      inputIndex,
      observedAt: resolveSensorObservationTime(reading),
    }))
    .sort((a, b) => {
      const aMs = Date.parse(a.observedAt ?? "");
      const bMs = Date.parse(b.observedAt ?? "");
      const aHasTime = Number.isFinite(aMs);
      const bHasTime = Number.isFinite(bMs);
      if (aHasTime && bHasTime && aMs !== bMs) return aMs - bMs;
      if (aHasTime !== bHasTime) return aHasTime ? -1 : 1;

      const timeTie = (a.observedAt ?? "").localeCompare(b.observedAt ?? "");
      if (timeTie !== 0) return timeTie;
      const idTie = (a.reading.id ?? "").localeCompare(b.reading.id ?? "");
      return idTie !== 0 ? idTie : a.inputIndex - b.inputIndex;
    })
    .map(({ reading }) => finite(reading.value))
    .filter((v): v is number => v !== null);
  const stableCount = values.filter((v) => stableMetricValue(metric, v)).length;
  return {
    key: metric,
    label: METRIC_META[metric].label,
    unit: METRIC_META[metric].unit,
    count: values.length,
    avg: average(values),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    stablePct: values.length ? Math.round((stableCount / values.length) * 100) : null,
    sparkline: sparkline(values),
  };
}

function buildPostHarvestPoints(diaries: PostGrowDiaryLike[]): PostHarvestPoint[] {
  return diaries
    .filter((d) => {
      const eventType = readEventType(d.details).toLowerCase();
      return (
        eventType.includes("dry") || eventType.includes("cure") || eventType.includes("harvest")
      );
    })
    .map((d, index) => ({
      label: `Checkpoint ${index + 1}`,
      capturedAt: d.entry_at,
      weightGrams: readNumberFromDetails(d.details, [
        "weight_grams",
        "weight_g",
        "dry_weight_grams",
        "dry_weight_g",
        "wet_weight_grams",
        "wet_weight_g",
      ]),
      rhPct: readNumberFromDetails(d.details, [
        "rh_pct",
        "humidity_pct",
        "jar_rh_pct",
        "room_rh_pct",
      ]),
    }))
    .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
}

function buildDataCompleteness(input: {
  harvests: PostGrowHarvestLike[];
  diaries: PostGrowDiaryLike[];
  sensorReadings: PostGrowSensorReadingLike[];
  postHarvestPoints: PostHarvestPoint[];
  photos: Array<{ url: string }>;
}): DataCompletenessView {
  const checks = [
    { label: "Harvest record", ok: input.harvests.length > 0 },
    { label: "Diary entries", ok: input.diaries.length > 0 },
    { label: "Sensor readings", ok: input.sensorReadings.length > 0 },
    { label: "Dry/cure checkpoints", ok: input.postHarvestPoints.length > 0 },
    { label: "Photos", ok: input.photos.length > 0 },
  ];
  const present = checks.filter((c) => c.ok).map((c) => c.label);
  const missing = checks.filter((c) => !c.ok).map((c) => c.label);
  const score = Math.round((present.length / checks.length) * 100);
  return {
    score,
    label: score >= 80 ? "Strong" : score >= 50 ? "Useful" : "Thin",
    present,
    missing,
  };
}

function findLatestLesson(diaries: PostGrowDiaryLike[]): { entryId: string | null; text: string } {
  const matches = diaries
    .filter((d) => readEventType(d.details) === POST_GROW_LESSON_EVENT_TYPE)
    .sort((a, b) => Date.parse(b.entry_at) - Date.parse(a.entry_at));
  return matches[0]
    ? { entryId: matches[0].id, text: matches[0].note ?? "" }
    : { entryId: null, text: "" };
}

function buildExecutiveSummary(input: {
  grow: PostGrowGrowLike;
  harvest: PostGrowHarvestLike | null;
  completeness: DataCompletenessView;
  environment: MetricAggregateView[];
  points: PostHarvestPoint[];
}): string[] {
  const vpd = input.environment.find((m) => m.key === "vpd_kpa");
  const lines = [
    `${input.grow.name} has a ${input.completeness.label.toLowerCase()} post-grow record (${input.completeness.score}% complete).`,
  ];
  if (input.harvest?.yield_grams != null) {
    lines.push(`Final recorded yield: ${formatNumber(input.harvest.yield_grams, 1)} g.`);
  }
  if (vpd?.avg != null) {
    lines.push(
      `Average recorded VPD: ${formatNumber(vpd.avg, 2)} kPa across ${vpd.count} readings.`,
    );
  }
  if (input.points.length > 0) {
    lines.push(
      `${input.points.length} dry/cure checkpoint${input.points.length === 1 ? "" : "s"} found.`,
    );
  }
  lines.push("Use this report as plant memory, not as proof that one action caused the result.");
  return lines;
}

export function buildPostGrowLearningReportViewModel(input: {
  grow: PostGrowGrowLike;
  harvests?: PostGrowHarvestLike[] | null;
  diaryEntries?: PostGrowDiaryLike[] | null;
  sensorReadings?: PostGrowSensorReadingLike[] | null;
  actions?: PostGrowActionLike[] | null;
}): PostGrowLearningReportViewModel {
  const harvests = input.harvests ?? [];
  const diaries = input.diaryEntries ?? [];
  const sensorReadings = withoutDiagnosticSensorRows(input.sensorReadings ?? []);
  // Preserve source-labeled context for the provenance badges, while keeping
  // non-evidence values out of averages, ranges, stability, and sparklines.
  const aggregateSensorReadings = sensorReadings.filter((reading) => {
    const source = normalizeReportSensorSource(reading.source);
    return source === "live" || source === "manual" || source === "csv";
  });
  const actions = input.actions ?? [];
  const latestHarvest =
    [...harvests].sort(
      (a, b) => Date.parse(b.harvested_at ?? "") - Date.parse(a.harvested_at ?? ""),
    )[0] ?? null;
  const stage = input.grow.stage ?? "unknown";
  const archived = input.grow.is_archived === true;
  const eligible = archived || stage === "harvest" || stage === "drying";
  const points = buildPostHarvestPoints(diaries);
  const photos = diaries
    .filter((d) => typeof d.photo_url === "string" && d.photo_url.length > 0)
    .slice(0, 12)
    .map((d, i) => ({
      id: d.id,
      url: d.photo_url as string,
      capturedAt: d.entry_at,
      alt: `Post-grow photo ${i + 1} from ${input.grow.name}`,
    }));
  const environment = (["temperature_c", "humidity_pct", "vpd_kpa"] as const).map((m) =>
    buildMetricAggregate(m, aggregateSensorReadings),
  );
  const completeness = buildDataCompleteness({
    harvests,
    diaries,
    sensorReadings: aggregateSensorReadings,
    postHarvestPoints: points,
    photos,
  });
  const weighted = points.filter((p) => p.weightGrams !== null);
  const firstWeight = weighted[0]?.weightGrams ?? null;
  const lastWeight = weighted[weighted.length - 1]?.weightGrams ?? null;
  const weightLossPct =
    firstWeight && lastWeight !== null && firstWeight > 0
      ? ((firstWeight - lastWeight) / firstWeight) * 100
      : null;
  const rhValues = points.map((p) => p.rhPct).filter((v): v is number => v !== null);
  const lastRh = rhValues.slice(-3);
  const rhStabilized = lastRh.length >= 3 ? Math.max(...lastRh) - Math.min(...lastRh) <= 3 : null;
  const completedActions = actions.filter((a) => a.status === "completed");
  const outcomeNotes = diaries.filter((d) => readEventType(d.details) === "action_outcome").length;
  const observations = [
    `${completedActions.length} completed action${completedActions.length === 1 ? "" : "s"} available for review.`,
    `${outcomeNotes} recorded action outcome note${outcomeNotes === 1 ? "" : "s"}.`,
    outcomeNotes > 0
      ? "Outcome notes exist; compare timing before repeating tactics."
      : "Add outcome notes next run to make action effectiveness less guessy.",
  ];

  return {
    eligible,
    ineligibleReason: eligible
      ? null
      : "Post-grow reports are available only for archived, harvest, or drying-stage grows.",
    header: {
      growId: input.grow.id,
      growName: input.grow.name,
      stageLabel: STAGE_LABEL[stage] ?? stage,
      archived,
      startedAt: input.grow.started_at ?? null,
      harvestedAt: latestHarvest?.harvested_at ?? null,
      yieldGrams: latestHarvest?.yield_grams ?? null,
    },
    executiveSummary: buildExecutiveSummary({
      grow: input.grow,
      harvest: latestHarvest,
      completeness,
      environment,
      points,
    }),
    dataCompleteness: completeness,
    environment,
    sensorReadingSources: sensorReadings.map((r) => ({ source: r.source ?? null })),
    postHarvest: {
      yieldGrams: latestHarvest?.yield_grams ?? null,
      points,
      weightLossPct,
      rhStabilized,
    },
    actionEffectiveness: { completedActions: completedActions.length, outcomeNotes, observations },
    lesson: findLatestLesson(diaries),
    photos,
  };
}

export function buildPostGrowLessonActionQueueDraft(input: {
  growId: string;
  lessonText: string;
}): {
  grow_id: string;
  action_type: "advisory";
  target_metric: string;
  target_device: null;
  suggested_change: string;
  reason: string;
  risk_level: "low";
  source: "manual";
  status: "pending_approval";
} {
  const lesson = input.lessonText.trim().slice(0, 220);
  return {
    grow_id: input.growId,
    action_type: "advisory",
    target_metric: "post_grow_lesson",
    target_device: null,
    suggested_change: lesson
      ? `Review this lesson before planning the next grow: ${lesson}`
      : "Review post-grow lessons before planning the next grow.",
    reason:
      "Created from the Post-Grow Learning Report. Grower approval required before any action is taken.",
    risk_level: "low",
    source: "manual",
    status: "pending_approval",
  };
}

export function buildPostGrowReportSummaryText(vm: PostGrowLearningReportViewModel): string {
  return [
    `Post-Grow Learning Report — ${vm.header.growName}`,
    `Completeness: ${vm.dataCompleteness.label} (${vm.dataCompleteness.score}%)`,
    ...vm.executiveSummary,
    `Lesson: ${vm.lesson.text || "No lesson recorded yet."}`,
  ].join("\n");
}

export function buildPostGrowReportImageSvg(vm: PostGrowLearningReportViewModel): string {
  const title = escapeXml(vm.header.growName);
  const lines = vm.executiveSummary.slice(0, 4).map(escapeXml);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Post-grow learning report summary"><rect width="1200" height="630" fill="#07110d"/><rect x="48" y="48" width="1104" height="534" rx="28" fill="#102018" stroke="#48d597" stroke-opacity="0.45"/><text x="86" y="118" fill="#48d597" font-family="Arial" font-size="28" font-weight="700">Verdant Post-Grow Learning Report</text><text x="86" y="170" fill="#f3fff8" font-family="Arial" font-size="42" font-weight="700">${title}</text><text x="86" y="228" fill="#c9d8ce" font-family="Arial" font-size="24">Completeness: ${vm.dataCompleteness.label} (${vm.dataCompleteness.score}%)</text>${lines.map((line, i) => `<text x="86" y="${294 + i * 44}" fill="#e6f4eb" font-family="Arial" font-size="24">${line}</text>`).join("")}<text x="86" y="540" fill="#8fb39f" font-family="Arial" font-size="20">Plant memory. Sensor truth. Better decisions.</text></svg>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
