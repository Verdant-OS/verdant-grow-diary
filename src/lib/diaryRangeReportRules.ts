/**
 * diaryRangeReportRules — pure view-model builder for the date-range
 * diary report (Print / Save PDF).
 *
 * Summarizes, for one grow and an inclusive ISO date range: watering,
 * feeding, training, environment evidence (source-labeled), photos, and
 * harvest outcomes.
 *
 * Hard constraints:
 *  - Pure: no I/O, no Supabase, no React, no DOM, no clock reads — `now`
 *    is injected.
 *  - Numbers are summarized only from values the grower logged. Nothing
 *    is invented: missing amounts stay null, never zero.
 *  - Sensor provenance uses the canonical six-label vocabulary via
 *    `normalizeReportSensorSource`; unknown sources are never presented
 *    as live.
 *  - Event classification is delegated to `classifyTimelineEntry` (plus
 *    the explicit Quick Log "environment" token) — no local tables.
 *  - No grow/plant/tent ids in any display string.
 *  - Range comparison is by UTC day (ISO date slice), matching the
 *    Timeline date filter. Rows without a parseable timestamp are
 *    excluded and counted honestly in `excludedNoTimestamp`.
 */

import { classifyTimelineEntry } from "@/lib/timelineEntryClassification";
import { normalizeDiaryEntries } from "@/lib/diaryEntryRules";
import { normalizeReportSensorSource, redactSecrets } from "@/lib/postGrowReportRules";
import { SENSOR_SOURCE_SHORT_LABEL } from "@/constants/sensorSourceLabels";
import type { TimelineSensorSourceKind } from "@/lib/timelineSensorSourceBadgeRules";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface DiaryRangeDiaryRow {
  id: string;
  note?: string | null;
  photo_url?: string | null;
  entry_at?: string | null;
  details?: Record<string, unknown> | null;
}

export interface DiaryRangeGrowEventRow {
  id: string;
  event_type?: string | null;
  occurred_at?: string | null;
  note?: string | null;
  details?: Record<string, unknown> | null;
}

export interface DiaryRangeHarvestRow {
  harvested_at?: string | null;
  yield_grams?: number | null;
}

export interface DiaryRangeSensorReadingRow {
  metric?: string | null;
  value?: number | null;
  ts?: string | null;
  source?: string | null;
}

export interface BuildDiaryRangeReportInput {
  grow: { name?: unknown; stage?: unknown } | null;
  diaryEntries: ReadonlyArray<DiaryRangeDiaryRow>;
  growEvents: ReadonlyArray<DiaryRangeGrowEventRow>;
  harvests: ReadonlyArray<DiaryRangeHarvestRow>;
  sensorReadings: ReadonlyArray<DiaryRangeSensorReadingRow>;
  startDate: string;
  endDate: string;
  now: Date;
}

export interface DiaryRangeEntryPreview {
  dateLabel: string;
  detailLabel: string | null;
}

export interface DiaryRangeMetricAggregate {
  key: "temperature_c" | "humidity_pct" | "vpd_kpa";
  label: string;
  unit: string;
  count: number;
  avg: number | null;
  min: number | null;
  max: number | null;
}

export interface DiaryRangeSourceRollup {
  kind: TimelineSensorSourceKind;
  label: string;
  count: number;
}

export interface DiaryRangeReportViewModel {
  header: {
    growName: string;
    rangeLabel: string;
    generatedOn: string;
    totalInRange: number;
    excludedNoTimestamp: number;
  };
  watering: {
    count: number;
    totalMl: number | null;
    entries: DiaryRangeEntryPreview[];
    moreCount: number;
  };
  feeding: {
    count: number;
    phRange: { min: number; max: number } | null;
    ecRange: { min: number; max: number } | null;
    nutrients: string[];
    entries: DiaryRangeEntryPreview[];
    moreCount: number;
  };
  training: {
    count: number;
    byType: Array<{ token: string; count: number }>;
    entries: DiaryRangeEntryPreview[];
    moreCount: number;
  };
  environment: {
    metrics: DiaryRangeMetricAggregate[];
    sources: DiaryRangeSourceRollup[];
    readingCount: number;
  };
  photos: {
    items: Array<{ id: string; url: string; dateLabel: string; alt: string }>;
    totalCount: number;
    moreCount: number;
  };
  harvest: {
    entries: Array<{
      dateLabel: string;
      wetGrams: number | null;
      dryGrams: number | null;
    }>;
    totalWetGrams: number | null;
    totalDryGrams: number | null;
  };
}

export const DIARY_RANGE_PHOTO_CAP = 24;
export const DIARY_RANGE_PREVIEW_CAP = 10;

export const DIARY_RANGE_WATERING_EMPTY_COPY = "No waterings logged in this range.";
export const DIARY_RANGE_FEEDING_EMPTY_COPY = "No feedings logged in this range.";
export const DIARY_RANGE_TRAINING_EMPTY_COPY = "No training logged in this range.";
export const DIARY_RANGE_ENVIRONMENT_EMPTY_COPY =
  "No environment evidence logged in this range.";
export const DIARY_RANGE_PHOTOS_EMPTY_COPY = "No photos logged in this range.";
export const DIARY_RANGE_HARVEST_EMPTY_COPY =
  "No harvest outcomes logged in this range.";
export const DIARY_RANGE_SOURCE_HONESTY_COPY =
  "Sensor readings keep their original source labels: live, manual, CSV, demo, stale, or invalid.";
export const DIARY_RANGE_SAFETY_COPY =
  "Verdant suggestions remain grower-approved. This report does not include device commands.";

function utcDay(iso: string | null | undefined): string | null {
  if (typeof iso !== "string" || iso.length < 10) return null;
  const day = iso.slice(0, 10);
  return ISO_DATE_RE.test(day) ? day : null;
}

function inRange(day: string | null, start: string, end: string): boolean {
  return day !== null && day >= start && day <= end;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

/** Resolve a row's report category. Delegates to the canonical classifier. */
function categoryOf(eventType: string | null | undefined):
  | "watering"
  | "feeding"
  | "training"
  | "environment"
  | "harvest"
  | "other" {
  const type =
    typeof eventType === "string" ? eventType.toLowerCase().trim() : "";
  if (type === "environment" || type === "environment_check") return "environment";
  const bucket = classifyTimelineEntry({ eventType: type });
  if (bucket === "watering" || bucket === "feeding" || bucket === "training" || bucket === "harvest") {
    return bucket;
  }
  if (bucket === "measurement") return "environment";
  return "other";
}

function toGrams(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Grams from Quick Log harvest details: prefer the canonical
 * `*_weight_grams`; otherwise trust the plain field only when the unit is
 * grams (or absent, which persisted as grams). Non-gram entries without a
 * canonical value are skipped — never converted by guesswork.
 */
function harvestDetailGrams(
  details: Record<string, unknown> | null | undefined,
  side: "wet" | "dry",
): number | null {
  const h = details && typeof details["harvest"] === "object" ? (details["harvest"] as Record<string, unknown>) : null;
  if (!h) return null;
  const canonical = toGrams(h[`${side}_weight_grams`]);
  if (canonical !== null) return canonical;
  const unit = typeof h["weightUnit"] === "string" ? h["weightUnit"] : "g";
  if (unit !== "g") return null;
  return toGrams(h[`${side}Weight`]);
}

export function buildDiaryRangeReport(
  input: BuildDiaryRangeReportInput,
): DiaryRangeReportViewModel {
  const { startDate, endDate } = input;

  const rawGrowName =
    input.grow && typeof input.grow.name === "string" && input.grow.name.trim() !== ""
      ? input.grow.name.trim()
      : "Grow";

  // ---- range partition (diary + grow events) --------------------------
  let excludedNoTimestamp = 0;

  const diaryInRange = (input.diaryEntries ?? []).filter((r) => {
    const day = utcDay(r.entry_at);
    if (day === null) {
      excludedNoTimestamp += 1;
      return false;
    }
    return inRange(day, startDate, endDate);
  });

  const eventsInRange = (input.growEvents ?? []).filter((r) => {
    const day = utcDay(r.occurred_at);
    if (day === null) {
      excludedNoTimestamp += 1;
      return false;
    }
    return inRange(day, startDate, endDate);
  });

  // Normalized diary rows give us grower-logged amounts (ml, pH, EC,
  // nutrients) without hand-parsing loose details.
  const normalized = normalizeDiaryEntries({
    rawEntries: diaryInRange.map((r) => ({
      id: r.id,
      note: r.note ?? null,
      photo_url: r.photo_url ?? null,
      entry_at: r.entry_at ?? null,
      details: r.details ?? null,
    })),
  });
  const normalizedById = new Map(normalized.map((n) => [n.id, n] as const));

  interface CareItem {
    id: string;
    day: string;
    eventType: string | null;
    detailLabel: string | null;
    fromDiary: boolean;
  }

  const byCategory = new Map<string, CareItem[]>();
  const push = (cat: string, item: CareItem) => {
    const list = byCategory.get(cat) ?? [];
    list.push(item);
    byCategory.set(cat, list);
  };

  for (const r of diaryInRange) {
    const et =
      r.details && typeof r.details["event_type"] === "string"
        ? (r.details["event_type"] as string)
        : null;
    push(categoryOf(et), {
      id: r.id,
      day: utcDay(r.entry_at) as string,
      eventType: et,
      detailLabel: null,
      fromDiary: true,
    });
  }
  for (const r of eventsInRange) {
    push(categoryOf(r.event_type), {
      id: r.id,
      day: utcDay(r.occurred_at) as string,
      eventType: r.event_type ?? null,
      detailLabel: null,
      fromDiary: false,
    });
  }
  for (const list of byCategory.values()) {
    list.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  }

  const preview = (items: CareItem[]): DiaryRangeEntryPreview[] =>
    items.slice(0, DIARY_RANGE_PREVIEW_CAP).map((i) => ({
      dateLabel: i.day,
      detailLabel: i.detailLabel,
    }));

  // ---- watering -------------------------------------------------------
  const wateringItems = byCategory.get("watering") ?? [];
  let totalMl: number | null = null;
  for (const item of wateringItems) {
    if (!item.fromDiary) continue;
    const ml = normalizedById.get(item.id)?.details?.wateringAmountMl;
    if (typeof ml === "number" && Number.isFinite(ml) && ml > 0) {
      totalMl = (totalMl ?? 0) + ml;
      item.detailLabel = `${Math.round(ml)} ml`;
    }
  }

  // ---- feeding --------------------------------------------------------
  const feedingItems = byCategory.get("feeding") ?? [];
  let phMin: number | null = null;
  let phMax: number | null = null;
  let ecMin: number | null = null;
  let ecMax: number | null = null;
  const nutrientSet = new Set<string>();
  for (const item of feedingItems) {
    if (!item.fromDiary) continue;
    const d = normalizedById.get(item.id)?.details;
    if (!d) continue;
    if (typeof d.ph === "number") {
      phMin = phMin === null ? d.ph : Math.min(phMin, d.ph);
      phMax = phMax === null ? d.ph : Math.max(phMax, d.ph);
      item.detailLabel = `pH ${d.ph}`;
    }
    if (typeof d.ec === "number") {
      ecMin = ecMin === null ? d.ec : Math.min(ecMin, d.ec);
      ecMax = ecMax === null ? d.ec : Math.max(ecMax, d.ec);
    }
    for (const n of d.nutrients ?? []) {
      if (n?.name && nutrientSet.size < DIARY_RANGE_PREVIEW_CAP) {
        nutrientSet.add(redactSecrets(n.name));
      }
    }
  }

  // ---- training -------------------------------------------------------
  const trainingItems = byCategory.get("training") ?? [];
  const trainingTypeCounts = new Map<string, number>();
  for (const item of trainingItems) {
    // Defoliation persists as event_type "training" + details.subtype.
    let token =
      typeof item.eventType === "string" && item.eventType.trim() !== ""
        ? item.eventType.toLowerCase().trim()
        : "training";
    if (item.fromDiary && token === "training") {
      const details = diaryInRange.find((r) => r.id === item.id)?.details;
      const subtype = details && typeof details["subtype"] === "string" ? (details["subtype"] as string) : null;
      if (subtype) token = subtype.toLowerCase().trim();
    }
    trainingTypeCounts.set(token, (trainingTypeCounts.get(token) ?? 0) + 1);
    item.detailLabel = token;
  }

  // ---- environment ----------------------------------------------------
  const readingsInRange = (input.sensorReadings ?? []).filter((r) =>
    inRange(utcDay(r.ts), startDate, endDate),
  );
  const metricDefs: Array<{
    key: DiaryRangeMetricAggregate["key"];
    label: string;
    unit: string;
    display: (v: number) => number;
  }> = [
    { key: "temperature_c", label: "Temperature", unit: "°F", display: (v) => cToF(v) },
    { key: "humidity_pct", label: "Humidity", unit: "% RH", display: (v) => v },
    { key: "vpd_kpa", label: "VPD", unit: "kPa", display: (v) => v },
  ];
  const metrics: DiaryRangeMetricAggregate[] = metricDefs.map((def) => {
    const values = readingsInRange
      .filter((r) => r.metric === def.key && typeof r.value === "number" && Number.isFinite(r.value))
      .map((r) => def.display(r.value as number));
    if (values.length === 0) {
      return { key: def.key, label: def.label, unit: def.unit, count: 0, avg: null, min: null, max: null };
    }
    const sum = values.reduce((a, b) => a + b, 0);
    return {
      key: def.key,
      label: def.label,
      unit: def.unit,
      count: values.length,
      avg: round1(sum / values.length),
      min: round1(Math.min(...values)),
      max: round1(Math.max(...values)),
    };
  });
  const sourceCounts = new Map<TimelineSensorSourceKind, number>();
  for (const r of readingsInRange) {
    const kind = normalizeReportSensorSource(r.source);
    sourceCounts.set(kind, (sourceCounts.get(kind) ?? 0) + 1);
  }
  const sources: DiaryRangeSourceRollup[] = Array.from(sourceCounts.entries())
    .map(([kind, count]) => ({
      kind,
      label: SENSOR_SOURCE_SHORT_LABEL[kind],
      count,
    }))
    .sort((a, b) => b.count - a.count);

  // ---- photos ---------------------------------------------------------
  const photoRows = diaryInRange.filter(
    (r) => typeof r.photo_url === "string" && r.photo_url !== "",
  );
  const photoItems = photoRows.slice(0, DIARY_RANGE_PHOTO_CAP).map((r) => {
    const day = utcDay(r.entry_at) as string;
    return {
      id: r.id,
      url: r.photo_url as string,
      dateLabel: day,
      alt: `Diary photo from ${day}`,
    };
  });

  // ---- harvest --------------------------------------------------------
  const harvestEntries: DiaryRangeReportViewModel["harvest"]["entries"] = [];
  let totalWet: number | null = null;
  let totalDry: number | null = null;
  for (const h of input.harvests ?? []) {
    const day = utcDay(h.harvested_at);
    if (!inRange(day, startDate, endDate)) continue;
    const wet = null;
    const dry = toGrams(h.yield_grams);
    harvestEntries.push({ dateLabel: day as string, wetGrams: wet, dryGrams: dry });
    if (dry !== null) totalDry = (totalDry ?? 0) + dry;
  }
  for (const e of eventsInRange) {
    if (categoryOf(e.event_type) !== "harvest") continue;
    const wet = harvestDetailGrams(e.details ?? null, "wet");
    const dry = harvestDetailGrams(e.details ?? null, "dry");
    harvestEntries.push({
      dateLabel: utcDay(e.occurred_at) as string,
      wetGrams: wet,
      dryGrams: dry,
    });
    if (wet !== null) totalWet = (totalWet ?? 0) + wet;
    if (dry !== null) totalDry = (totalDry ?? 0) + dry;
  }
  for (const r of diaryInRange) {
    const et =
      r.details && typeof r.details["event_type"] === "string"
        ? (r.details["event_type"] as string)
        : null;
    if (categoryOf(et) !== "harvest") continue;
    const wet = harvestDetailGrams(r.details ?? null, "wet");
    const dry = harvestDetailGrams(r.details ?? null, "dry");
    harvestEntries.push({
      dateLabel: utcDay(r.entry_at) as string,
      wetGrams: wet,
      dryGrams: dry,
    });
    if (wet !== null) totalWet = (totalWet ?? 0) + wet;
    if (dry !== null) totalDry = (totalDry ?? 0) + dry;
  }
  harvestEntries.sort((a, b) =>
    a.dateLabel < b.dateLabel ? -1 : a.dateLabel > b.dateLabel ? 1 : 0,
  );

  const totalInRange = diaryInRange.length + eventsInRange.length;

  return {
    header: {
      growName: redactSecrets(rawGrowName),
      rangeLabel: `${startDate} to ${endDate}`,
      generatedOn: input.now.toISOString().slice(0, 10),
      totalInRange,
      excludedNoTimestamp,
    },
    watering: {
      count: wateringItems.length,
      totalMl: totalMl === null ? null : Math.round(totalMl),
      entries: preview(wateringItems),
      moreCount: Math.max(0, wateringItems.length - DIARY_RANGE_PREVIEW_CAP),
    },
    feeding: {
      count: feedingItems.length,
      phRange: phMin === null || phMax === null ? null : { min: phMin, max: phMax },
      ecRange: ecMin === null || ecMax === null ? null : { min: ecMin, max: ecMax },
      nutrients: Array.from(nutrientSet),
      entries: preview(feedingItems),
      moreCount: Math.max(0, feedingItems.length - DIARY_RANGE_PREVIEW_CAP),
    },
    training: {
      count: trainingItems.length,
      byType: Array.from(trainingTypeCounts.entries())
        .map(([token, count]) => ({ token, count }))
        .sort((a, b) => b.count - a.count),
      entries: preview(trainingItems),
      moreCount: Math.max(0, trainingItems.length - DIARY_RANGE_PREVIEW_CAP),
    },
    environment: {
      metrics,
      sources,
      readingCount: readingsInRange.length,
    },
    photos: {
      items: photoItems,
      totalCount: photoRows.length,
      moreCount: Math.max(0, photoRows.length - DIARY_RANGE_PHOTO_CAP),
    },
    harvest: {
      entries: harvestEntries,
      totalWetGrams: totalWet,
      totalDryGrams: totalDry,
    },
  };
}
