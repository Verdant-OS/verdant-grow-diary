/**
 * Pure rules for deriving a read-only feeding history view-model from
 * normalized diary entries.
 *
 * NO database access. NO RPC. NO writes. This module is the only place
 * allowed to read normalized diary detail fields for the Feeding History
 * panel — the presenter MUST consume this module's output and MUST NOT
 * reach into raw `details` JSON.
 */
import type { NormalizedDiaryEntry } from "./diaryEntryRules";
import {
  isQuickLogPlaceholderNote,
  resolveFeedingNutrientLineName,
} from "./plantFeedingDisplayRules";
import {
  normalizeRootZoneSource,
  rootZoneSourceLabel,
  type RootZoneSource,
} from "./rootZoneObservationRules";

export interface FeedingNutrient {
  name: string;
  amount: number | null;
  unit: string | null;
}

export interface FeedingHistoryRow {
  id: string;
  /** Exact global Timeline anchor for structured grow_events rows only. */
  timelineAnchorId: string | null;
  /** ISO string when valid, otherwise null. Never an epoch-0 fabrication. */
  occurredAt: string | null;
  occurredAtLabel: string;
  plantId: string | null;
  tentId: string | null;
  volumeMl: number | null;
  ph: number | null;
  ec: number | null;
  /** Measured output/drain EC when it was logged separately. */
  outputEc: number | null;
  tds: number | null;
  runoffMl: number | null;
  runoffPh: number | null;
  runoffEc: number | null;
  runoffTds: number | null;
  /** Reservoir / water temperature in Celsius from saved feeding extras. */
  waterTempC: number | null;
  nutrients: FeedingNutrient[];
  /** Optional recipe label pulled from the sanitized `extras` bag. */
  recipe: string | null;
  notePreview: string;
  warnings: string[];
  source: RootZoneSource;
  sourceLabel: string;
}

const NOTE_PREVIEW_MAX = 140;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function pickNumber(v: unknown): number | null {
  if (isFiniteNumber(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function pickFeedingEnvelope(entry: NormalizedDiaryEntry): Record<string, unknown> | null {
  return asRecord(entry.details.extras?.feeding);
}

function pickRecipe(entry: NormalizedDiaryEntry): string | null {
  const extras = entry.details.extras;
  if (!extras) return null;
  return (
    resolveFeedingNutrientLineName(extras) ??
    pickString(extras.recipe) ??
    pickString(extras.recipe_name) ??
    pickString(extras.recipeName) ??
    pickString(extras.feed_recipe) ??
    pickString(extras.feedRecipe) ??
    null
  );
}

function previewNote(note: string): string {
  const trimmed = (note ?? "").trim();
  if (isQuickLogPlaceholderNote(trimmed)) return "";
  if (trimmed.length <= NOTE_PREVIEW_MAX) return trimmed;
  return trimmed.slice(0, NOTE_PREVIEW_MAX - 1).trimEnd() + "…";
}

function rangeWarnings(row: {
  volumeMl: number | null;
  ph: number | null;
  ec: number | null;
  outputEc: number | null;
  runoffPh: number | null;
  runoffEc: number | null;
  waterTempC: number | null;
}): string[] {
  const w: string[] = [];
  if (row.volumeMl !== null && row.volumeMl <= 0) {
    w.push("volume_ml must be > 0");
  }
  if (row.ph !== null && (row.ph < 0 || row.ph > 14)) {
    w.push("ph out of range");
  }
  if (row.ec !== null && (row.ec < 0 || row.ec > 10)) {
    w.push("ec_ms_cm out of range");
  }
  if (row.outputEc !== null && (row.outputEc < 0 || row.outputEc > 10)) {
    w.push("ec_out out of range");
  }
  if (row.runoffPh !== null && (row.runoffPh < 0 || row.runoffPh > 14)) {
    w.push("runoff_ph out of range");
  }
  if (row.runoffEc !== null && (row.runoffEc < 0 || row.runoffEc > 10)) {
    w.push("runoff_ec out of range");
  }
  if (row.waterTempC !== null && (row.waterTempC < -10 || row.waterTempC > 60)) {
    w.push("water_temp_c out of range");
  }
  return w;
}

function isFeedingEntry(entry: NormalizedDiaryEntry): boolean {
  if (entry.eventType === "feeding") return true;
  if (entry.eventType === "feed") return true;
  // Legacy: untyped entry that carries nutrients is treated as feeding.
  if (
    entry.eventType !== "watering" &&
    entry.details.nutrients &&
    entry.details.nutrients.length > 0
  ) {
    return true;
  }
  return false;
}

function pickRunoffMl(entry: NormalizedDiaryEntry): number | null {
  const extras = entry.details.extras;
  const feed = pickFeedingEnvelope(entry);
  if (!extras && !feed) return null;
  return (
    pickNumber(extras?.runoff_ml) ??
    pickNumber(extras?.runoffMl) ??
    pickNumber(feed?.runoff_ml) ??
    pickNumber(feed?.runoffMl) ??
    null
  );
}

function pickOutputEc(entry: NormalizedDiaryEntry): number | null {
  const extras = entry.details.extras;
  const feed = pickFeedingEnvelope(entry);
  if (!extras && !feed) return null;
  return (
    pickNumber(extras?.ec_out) ??
    pickNumber(extras?.ecOut) ??
    pickNumber(feed?.ec_out) ??
    pickNumber(feed?.ecOut) ??
    null
  );
}

function pickWaterTempC(entry: NormalizedDiaryEntry): number | null {
  const extras = entry.details.extras;
  const feed = pickFeedingEnvelope(entry);
  if (!extras && !feed) return null;
  return (
    pickNumber(extras?.water_temp_c) ??
    pickNumber(extras?.waterTempC) ??
    pickNumber(extras?.waterTempCelsius) ??
    pickNumber(feed?.water_temp_c) ??
    pickNumber(feed?.waterTempC) ??
    null
  );
}

function pickSource(entry: NormalizedDiaryEntry): RootZoneSource {
  return normalizeRootZoneSource(entry.details.extras?.source);
}

function toNutrients(entry: NormalizedDiaryEntry): FeedingNutrient[] {
  const feed = pickFeedingEnvelope(entry);
  const rawProducts = Array.isArray(feed?.products)
    ? feed.products
    : Array.isArray(feed?.nutrients)
      ? feed.nutrients
      : null;
  const src =
    entry.details.nutrients && entry.details.nutrients.length > 0
      ? entry.details.nutrients
      : rawProducts;
  if (!src || src.length === 0) return [];
  const out: FeedingNutrient[] = [];
  for (const item of src) {
    const n = asRecord(item);
    if (!n) continue;
    const name = pickString(n.name);
    if (!name) continue;
    out.push({
      name,
      amount: typeof n.amount === "number" && Number.isFinite(n.amount) ? n.amount : null,
      unit: pickString(n.unit ?? null),
    });
  }
  return out;
}

function toRow(entry: NormalizedDiaryEntry): FeedingHistoryRow {
  const feed = pickFeedingEnvelope(entry);
  const volumeMl =
    entry.details.wateringAmountMl !== undefined
      ? entry.details.wateringAmountMl
      : (pickNumber(feed?.volume_ml) ?? pickNumber(feed?.volumeMl) ?? null);
  const ph = entry.details.ph ?? pickNumber(feed?.ph) ?? null;
  const ec = entry.details.ec ?? pickNumber(feed?.ec_in) ?? pickNumber(feed?.ec_ms_cm) ?? null;
  const tds = entry.details.tds ?? null;
  const runoffPh =
    entry.details.runoffPh ?? pickNumber(feed?.runoff_ph) ?? pickNumber(feed?.runoffPh) ?? null;
  const runoffEc =
    entry.details.runoffEc ?? pickNumber(feed?.runoff_ec) ?? pickNumber(feed?.runoffEc) ?? null;
  const runoffTds = entry.details.runoffTds ?? null;
  const runoffMl = pickRunoffMl(entry);
  const outputEc = pickOutputEc(entry);
  const waterTempC = pickWaterTempC(entry);

  const extra = rangeWarnings({
    volumeMl,
    ph,
    ec,
    outputEc,
    runoffPh,
    runoffEc,
    waterTempC,
  });
  if (runoffMl !== null && runoffMl < 0) extra.push("runoff_ml < 0");
  if (entry.details.extras?.root_zone_status === "unavailable") {
    extra.push("Structured measurements unavailable");
  } else if (entry.details.extras?.root_zone_status === "partial") {
    extra.push("Some structured measurements were omitted as invalid");
  }

  const seen = new Set<string>();
  const warnings: string[] = [];
  for (const w of [...entry.warnings, ...extra]) {
    if (!seen.has(w)) {
      seen.add(w);
      warnings.push(w);
    }
  }

  const source = pickSource(entry);
  return {
    id: entry.id,
    timelineAnchorId:
      entry.details.extras?.root_zone_status === "available" ||
      entry.details.extras?.root_zone_status === "partial"
        ? `timeline-entry-${entry.id}`
        : null,
    occurredAt: entry.createdAt,
    occurredAtLabel: entry.createdAtLabel,
    plantId: entry.plantId,
    tentId: entry.tentId,
    volumeMl,
    ph,
    ec,
    outputEc,
    tds,
    runoffMl,
    runoffPh,
    runoffEc,
    runoffTds,
    waterTempC,
    nutrients: toNutrients(entry),
    recipe: pickRecipe(entry),
    notePreview: previewNote(entry.note),
    warnings,
    source,
    sourceLabel: rootZoneSourceLabel(source),
  };
}

/**
 * Deterministic newest-first ordering:
 *   1. Entries with a valid `occurredAt` first, sorted by timestamp desc.
 *   2. Entries without a valid timestamp last, sorted by id asc.
 */
function compareNewestFirst(a: FeedingHistoryRow, b: FeedingHistoryRow): number {
  const aHas = a.occurredAt !== null;
  const bHas = b.occurredAt !== null;
  if (aHas && bHas) {
    const da = Date.parse(a.occurredAt as string);
    const db = Date.parse(b.occurredAt as string);
    if (db !== da) return db - da;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }
  if (aHas) return -1;
  if (bHas) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildFeedingHistory(entries: readonly NormalizedDiaryEntry[]): FeedingHistoryRow[] {
  if (!entries || entries.length === 0) return [];
  const rows = entries.filter(isFeedingEntry).map(toRow);
  rows.sort(compareNewestFirst);
  return rows;
}
