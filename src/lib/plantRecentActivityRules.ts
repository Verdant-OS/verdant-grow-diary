/**
 * Pure helpers for the Plant Detail "Recent Plant Activity" panel.
 *
 * No I/O, no React. Deterministic mapping from normalized diary entries
 * (already scoped to a single plant by the caller) into a render-ready
 * view-model. Missing values stay null/false — never invented.
 *
 * Read-only. Not used for alerts, actions, AI Doctor, or device control.
 */
import {
  normalizeDiaryEntries,
  type NormalizedDiaryEntry,
} from "@/lib/diaryEntryRules";
import { isStale } from "@/lib/sensorSnapshot";
import { splitHardwareReadingsFromNote } from "@/lib/quickLogHardwareReadingsDisplayRules";

export interface PlantRecentActivityRow {
  id: string;
  eventType: string;
  occurredAt: string | null;
  occurredAtLabel: string;
  notePreview: string;
  plantId: string | null;
  tentId: string | null;
  hasPhoto: boolean;
  hasSnapshot: boolean;
  /** Snapshot timestamp if stored on the diary entry. Never invented. */
  snapshotAt: string | null;
  /** Only true when snapshot stored AND its timestamp parses AND is stale. */
  snapshotStale: boolean;
  /** Source label only when explicitly stored on the entry. */
  snapshotSourceLabel: string | null;
  warnings: string[];
}

const NOTE_PREVIEW_MAX = 140;
const DEFAULT_LIMIT = 10;

function previewNote(note: string): string {
  const trimmed = (note ?? "").trim();
  if (trimmed.length <= NOTE_PREVIEW_MAX) return trimmed;
  return trimmed.slice(0, NOTE_PREVIEW_MAX - 1).trimEnd() + "…";
}

function toRow(
  entry: NormalizedDiaryEntry,
  now: number,
): PlantRecentActivityRow {
  const snap = entry.details.sensorSnapshot;
  const snapshotAt = snap?.at ?? null;
  const hasSnapshot = !!snap;
  return {
    id: entry.id,
    eventType: entry.eventType,
    occurredAt: entry.createdAt,
    occurredAtLabel: entry.createdAtLabel,
    notePreview: previewNote(entry.note),
    plantId: entry.plantId,
    tentId: entry.tentId,
    hasPhoto: !!entry.photoUrl,
    hasSnapshot,
    snapshotAt,
    snapshotStale: hasSnapshot && snapshotAt ? isStale(snapshotAt, now) : false,
    // QuickLog does not currently persist a source label on the snapshot.
    // We never invent one — leave null unless future writers store it.
    snapshotSourceLabel: null,
    warnings: entry.warnings,
  };
}

function compareNewestFirst(
  a: PlantRecentActivityRow,
  b: PlantRecentActivityRow,
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

export interface BuildPlantRecentActivityOptions {
  plantId: string | null | undefined;
  limit?: number;
  now?: number;
}

export function buildPlantRecentActivity(
  rawRows: readonly unknown[] | null | undefined,
  opts: BuildPlantRecentActivityOptions,
): PlantRecentActivityRow[] {
  const plantId = opts.plantId ?? null;
  if (!plantId) return [];
  if (!rawRows || rawRows.length === 0) return [];
  const now = opts.now ?? Date.now();
  const limit = Math.max(1, opts.limit ?? DEFAULT_LIMIT);
  const normalized = normalizeDiaryEntries({ rawEntries: rawRows, now });
  const scoped = normalized.filter((e) => e.plantId === plantId);
  const rows = scoped.map((e) => toRow(e, now));
  rows.sort(compareNewestFirst);
  return rows.slice(0, limit);
}
