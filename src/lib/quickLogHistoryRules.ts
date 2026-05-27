/**
 * quickLogHistoryRules — pure helpers for routing Quick Log entries to
 * the matching Logs page history lane.
 *
 * Pure & deterministic. No React, no Supabase, no I/O. Display-only.
 *
 * Quick Log entries are stored in `diary_entries` with `details.event_type`
 * set by the grower. Hardware (handheld) readings are appended to the
 * entry note as a deterministic text block. These are MANUAL readings —
 * never live sensor data, never an Action Queue write, never an alert.
 */
import { EVENT_TYPES } from "@/lib/diary";
import type { NormalizedDiaryEntry } from "@/lib/diaryEntryRules";
import { splitHardwareReadingsFromNote } from "@/lib/quickLogHardwareReadingsDisplayRules";

export type HistoryLane =
  | "watering"
  | "feeding"
  | "pest_disease"
  | "training"
  | "measurement"
  | "photo"
  | "observation"
  | "activity";

/** Maps every Quick Log event_type value to the lane that surfaces it. */
export const QUICK_LOG_EVENT_LANES: Record<string, HistoryLane> = {
  watering: "watering",
  feeding: "feeding",
  pest_disease: "pest_disease",
  diagnosis: "pest_disease",
  training: "training",
  defoliation: "training",
  measurement: "measurement",
  environment: "measurement",
  photo: "photo",
  observation: "observation",
  // Falls back to the "All recent activity" lane so nothing is hidden.
  transplant: "activity",
  harvest: "activity",
  reminder: "activity",
  action_followup: "activity",
  action_outcome: "activity",
  other: "activity",
};

/** Returns the lane for a given event_type, defaulting to "activity". */
export function laneForEventType(eventType: string | null | undefined): HistoryLane {
  if (!eventType) return "activity";
  return QUICK_LOG_EVENT_LANES[eventType] ?? "activity";
}

/** All known Quick Log event values from src/lib/diary.ts EVENT_TYPES. */
export const QUICK_LOG_EVENT_VALUES: readonly string[] = EVENT_TYPES.map(
  (e) => e.value,
);

// ---------------------------------------------------------------------------
// Manual handheld readings
// ---------------------------------------------------------------------------

export interface ManualHandheldReadings {
  inputPh?: string;
  inputEc?: string;
  runoffPh?: string;
  runoffEc?: string;
  ppfdCanopy?: string;
  lightDistance?: string;
  /** Any other "Label: value" pairs found inside the hardware block. */
  other?: ReadonlyArray<{ label: string; value: string }>;
}

const LABEL_TO_KEY: Record<string, keyof ManualHandheldReadings> = {
  "input ph": "inputPh",
  "input ec/ppm": "inputEc",
  "input ec": "inputEc",
  "runoff ph": "runoffPh",
  "runoff ec/ppm": "runoffEc",
  "runoff ec": "runoffEc",
  "ppfd canopy": "ppfdCanopy",
  "ppfd canopy (µmol)": "ppfdCanopy",
  "light distance": "lightDistance",
};

/**
 * Parse the deterministic "Hardware readings (manual handheld):" block
 * out of a note string. Returns null when no block is present.
 */
export function parseManualHandheldReadings(
  note: string | null | undefined,
): ManualHandheldReadings | null {
  const split = splitHardwareReadingsFromNote(note);
  if (!split.hasHardwareBlock) return null;
  const out: ManualHandheldReadings = {};
  const other: Array<{ label: string; value: string }> = [];
  for (const line of split.hardwareLines) {
    const cleaned = line.replace(/^[-•]\s*/, "");
    const idx = cleaned.indexOf(":");
    if (idx < 0) continue;
    const label = cleaned.slice(0, idx).trim();
    const value = cleaned.slice(idx + 1).trim();
    if (!label || !value) continue;
    const key = LABEL_TO_KEY[label.toLowerCase()];
    if (key && key !== "other") {
      (out as Record<string, string>)[key] = value;
    } else {
      other.push({ label, value });
    }
  }
  if (other.length > 0) out.other = other;
  return out;
}

export function hasManualHandheldReadings(
  note: string | null | undefined,
): boolean {
  return splitHardwareReadingsFromNote(note).hasHardwareBlock;
}

// ---------------------------------------------------------------------------
// History rows
// ---------------------------------------------------------------------------

export interface QuickLogHistoryRow {
  id: string;
  occurredAt: string | null;
  occurredAtLabel: string;
  plantId: string | null;
  tentId: string | null;
  stage: string | null;
  eventType: string;
  noteBody: string;
  manualHandheld: ManualHandheldReadings | null;
  photoUrl: string | null;
  warnings: string[];
}

function toRow(entry: NormalizedDiaryEntry): QuickLogHistoryRow {
  const split = splitHardwareReadingsFromNote(entry.note);
  return {
    id: entry.id,
    occurredAt: entry.createdAt,
    occurredAtLabel: entry.createdAtLabel,
    plantId: entry.plantId,
    tentId: entry.tentId,
    stage: entry.stage,
    eventType: entry.eventType,
    noteBody: split.body,
    manualHandheld: parseManualHandheldReadings(entry.note),
    photoUrl: entry.photoUrl,
    warnings: entry.warnings.slice(),
  };
}

function compareNewestFirst(a: QuickLogHistoryRow, b: QuickLogHistoryRow): number {
  const at = a.occurredAt ? Date.parse(a.occurredAt) : -Infinity;
  const bt = b.occurredAt ? Date.parse(b.occurredAt) : -Infinity;
  if (at !== bt) return bt - at;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function buildLane(
  entries: readonly NormalizedDiaryEntry[],
  predicate: (e: NormalizedDiaryEntry) => boolean,
): QuickLogHistoryRow[] {
  const rows = entries.filter(predicate).map(toRow);
  rows.sort(compareNewestFirst);
  return rows;
}

export function buildPestDiseaseHistory(
  entries: readonly NormalizedDiaryEntry[],
): QuickLogHistoryRow[] {
  return buildLane(entries, (e) => laneForEventType(e.eventType) === "pest_disease");
}

export function buildTrainingHistory(
  entries: readonly NormalizedDiaryEntry[],
): QuickLogHistoryRow[] {
  return buildLane(entries, (e) => laneForEventType(e.eventType) === "training");
}

export function buildObservationHistory(
  entries: readonly NormalizedDiaryEntry[],
): QuickLogHistoryRow[] {
  return buildLane(entries, (e) => laneForEventType(e.eventType) === "observation");
}

/**
 * Measurement lane: any entry that carries manual handheld readings
 * (parsed from the note block) OR an `environment`/`measurement`
 * event_type. Detail-only watering/feeding entries are NOT duplicated
 * here — they have their own lanes.
 */
export function buildMeasurementHistory(
  entries: readonly NormalizedDiaryEntry[],
): QuickLogHistoryRow[] {
  return buildLane(entries, (e) => {
    if (hasManualHandheldReadings(e.note)) return true;
    return laneForEventType(e.eventType) === "measurement";
  });
}

/**
 * The top-of-page "Recent activity" feed — newest Quick Log entries
 * regardless of lane. Used so growers always see what they just saved.
 */
export function buildRecentQuickLogActivity(
  entries: readonly NormalizedDiaryEntry[],
  limit = 10,
): QuickLogHistoryRow[] {
  const rows = entries.map(toRow);
  rows.sort(compareNewestFirst);
  return rows.slice(0, Math.max(0, limit));
}
