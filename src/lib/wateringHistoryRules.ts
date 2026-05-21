/**
 * Pure rules for deriving a read-only watering history view-model from
 * normalized diary entries.
 *
 * This module performs NO database access, NO RPC calls, and NO writes.
 * It is the only place allowed to read normalized diary detail fields for
 * the Watering History panel — the presenter component MUST consume the
 * output of this module and MUST NOT reach into raw `details` JSON.
 */
import type {
  NormalizedDiaryEntry,
} from "./diaryEntryRules";

export interface WateringHistoryRow {
  id: string;
  /** ISO string when valid, otherwise null. Never an epoch-0 fabrication. */
  occurredAt: string | null;
  occurredAtLabel: string;
  plantId: string | null;
  tentId: string | null;
  volumeMl: number | null;
  ph: number | null;
  ec: number | null;
  tds: number | null;
  runoffMl: number | null;
  runoffPh: number | null;
  runoffEc: number | null;
  runoffTds: number | null;
  notePreview: string;
  /** Combined warnings from the normalizer + any range checks below. */
  warnings: string[];
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

/**
 * Pull `runoff_ml` from the normalized `extras` bag if present. We do not
 * read raw diary `details` here — `extras` is the sanitized passthrough
 * produced by `normalizeDiaryEntry`.
 */
function pickRunoffMl(entry: NormalizedDiaryEntry): number | null {
  const extras = entry.details.extras;
  if (!extras) return null;
  return (
    pickNumber(extras.runoff_ml) ??
    pickNumber(extras.runoffMl) ??
    null
  );
}

function previewNote(note: string): string {
  const trimmed = (note ?? "").trim();
  if (trimmed.length <= NOTE_PREVIEW_MAX) return trimmed;
  return trimmed.slice(0, NOTE_PREVIEW_MAX - 1).trimEnd() + "…";
}

function rangeWarnings(row: {
  volumeMl: number | null;
  ph: number | null;
  ec: number | null;
  runoffMl: number | null;
  runoffPh: number | null;
  runoffEc: number | null;
}): string[] {
  const w: string[] = [];
  if (row.volumeMl !== null && row.volumeMl <= 0) {
    w.push("volume_ml must be > 0");
  }
  if (row.ph !== null && (row.ph < 0 || row.ph > 14)) {
    w.push("ph out of range");
  }
  if (row.ec !== null && row.ec < 0) {
    w.push("ec_ms_cm < 0");
  }
  if (row.runoffMl !== null && row.runoffMl < 0) {
    w.push("runoff_ml < 0");
  }
  if (row.runoffPh !== null && (row.runoffPh < 0 || row.runoffPh > 14)) {
    w.push("runoff_ph out of range");
  }
  if (row.runoffEc !== null && row.runoffEc < 0) {
    w.push("runoff_ec < 0");
  }
  return w;
}

function isWateringEntry(entry: NormalizedDiaryEntry): boolean {
  if (entry.eventType === "watering") return true;
  // Some legacy entries lack an event_type but carry a watering amount.
  if (entry.details.wateringAmountMl !== undefined) return true;
  return false;
}

function toRow(entry: NormalizedDiaryEntry): WateringHistoryRow {
  const volumeMl =
    entry.details.wateringAmountMl !== undefined
      ? entry.details.wateringAmountMl
      : null;
  const ph = entry.details.ph ?? null;
  const ec = entry.details.ec ?? null;
  const tds = entry.details.tds ?? null;
  const runoffMl = pickRunoffMl(entry);
  const runoffPh = entry.details.runoffPh ?? null;
  const runoffEc = entry.details.runoffEc ?? null;
  const runoffTds = entry.details.runoffTds ?? null;

  const extra = rangeWarnings({
    volumeMl,
    ph,
    ec,
    runoffMl,
    runoffPh,
    runoffEc,
  });

  // Dedupe while preserving first-seen order.
  const seen = new Set<string>();
  const warnings: string[] = [];
  for (const w of [...entry.warnings, ...extra]) {
    if (!seen.has(w)) {
      seen.add(w);
      warnings.push(w);
    }
  }

  return {
    id: entry.id,
    occurredAt: entry.createdAt,
    occurredAtLabel: entry.createdAtLabel,
    plantId: entry.plantId,
    tentId: entry.tentId,
    volumeMl,
    ph,
    ec,
    tds,
    runoffMl,
    runoffPh,
    runoffEc,
    runoffTds,
    notePreview: previewNote(entry.note),
    warnings,
  };
}

/**
 * Deterministic newest-first ordering:
 *   1. Entries with a valid `occurredAt` come first, sorted by timestamp desc.
 *   2. Entries without a valid timestamp come last, sorted by id asc for
 *      stable output regardless of input order.
 */
function compareNewestFirst(
  a: WateringHistoryRow,
  b: WateringHistoryRow,
): number {
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

export function buildWateringHistory(
  entries: readonly NormalizedDiaryEntry[],
): WateringHistoryRow[] {
  if (!entries || entries.length === 0) return [];
  const rows = entries.filter(isWateringEntry).map(toRow);
  rows.sort(compareNewestFirst);
  return rows;
}
