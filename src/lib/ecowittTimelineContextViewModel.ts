/**
 * ecowittTimelineContextViewModel — pure helper that links persisted EcoWitt
 * `sensor_readings` rows to the nearest diary entry inside a configurable
 * time window.
 *
 * Hard constraints (stop-ship if violated):
 *  - Pure / deterministic. No I/O, no React, no auth, no timers.
 *  - Read-only. Never writes alerts / action_queue / device control.
 *  - Tent-scoped: a reading from another tent must NEVER attach to a diary
 *    entry. Grow-scoped: a reading from another grow_id (when known) must
 *    NEVER attach.
 *  - When `plantId` is supplied and the diary entry is tied to that plant,
 *    a same-plant reading is preferred over an unscoped reading.
 *  - Never fabricates a reading. If nothing falls inside the window, the
 *    entry gets `snapshot: null` and the UI renders no chip.
 *  - Derived VPD label lives in `ECOWITT_DERIVED_VPD_LABEL` — never call
 *    EcoWitt-derived VPD anything other than "Derived VPD". The "live"
 *    canonical source only survives the freshness check; stale rows are
 *    demoted by the snapshot view-model.
 */
import {
  buildEcowittSnapshotViewModel,
  type EcowittCandidate,
  type EcowittSnapshotViewModel,
} from "@/lib/ecowittReadingViewModel";
import type { EcowittSensorReadingRow } from "@/lib/ecowittLatestSnapshotFilter";

export interface DiaryEntryLike {
  id: string;
  grow_id?: string | null;
  tent_id?: string | null;
  plant_id?: string | null;
  /** Preferred timestamp; falls back to `created_at`. */
  occurred_at?: string | null;
  created_at?: string | null;
}

export interface EcowittTimelineContextInput {
  diaryEntries: readonly DiaryEntryLike[] | null | undefined;
  sensorReadings: readonly EcowittSensorReadingRow[] | null | undefined;
  growId: string | null | undefined;
  tentId: string | null | undefined;
  plantId?: string | null;
  /** Window in minutes; default 45 (≈ ±EcoWitt 30-min freshness + slack). */
  windowMinutes?: number;
  /** Deterministic wall-clock used inside the snapshot view-model. */
  now?: Date;
}

export interface EcowittTimelineContextEntry {
  diaryEntryId: string;
  /** Snapshot view-model for the nearest matching EcoWitt reading. */
  snapshot: EcowittSnapshotViewModel | null;
  /** Difference, in minutes, between the diary entry and the matched
   *  reading's captured_at. Null when nothing matched. */
  matchAgeMinutes: number | null;
}

const DEFAULT_WINDOW_MIN = 45;

function entryTimestamp(e: DiaryEntryLike): number | null {
  const raw = e.occurred_at ?? e.created_at ?? null;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

function rowTimestamp(r: EcowittSensorReadingRow): number | null {
  const raw =
    (typeof r.captured_at === "string" && r.captured_at) ||
    (typeof r.ts === "string" && r.ts) ||
    null;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

/**
 * For each diary entry, find the nearest EcoWitt sensor_reading row within
 * `windowMinutes`, scoped to the same grow/tent (and preferring matching
 * plant_id when relevant), and return a presenter-ready snapshot.
 */
export function buildEcowittTimelineContext(
  input: EcowittTimelineContextInput,
): EcowittTimelineContextEntry[] {
  const {
    diaryEntries,
    sensorReadings,
    growId,
    tentId,
    plantId = null,
    windowMinutes = DEFAULT_WINDOW_MIN,
    now,
  } = input;

  const entries = Array.isArray(diaryEntries) ? diaryEntries : [];
  const rows = Array.isArray(sensorReadings) ? sensorReadings : [];
  if (entries.length === 0 || !tentId) return [];

  const windowMs = Math.max(1, windowMinutes) * 60_000;

  // Pre-filter rows to the selected tent (and grow, when both sides know it).
  const scopedRows = rows.filter((r) => {
    if ((r.tent_id ?? null) !== tentId) return false;
    return true;
  });

  const out: EcowittTimelineContextEntry[] = [];
  for (const entry of entries) {
    // Never cross grow boundaries: if both sides declare a grow_id and they
    // disagree, the entry cannot be enriched here.
    if (
      growId &&
      entry.grow_id != null &&
      entry.grow_id !== growId
    ) {
      out.push({
        diaryEntryId: entry.id,
        snapshot: null,
        matchAgeMinutes: null,
      });
      continue;
    }
    // Never cross tent boundaries on the diary side either.
    if (entry.tent_id != null && entry.tent_id !== tentId) {
      out.push({
        diaryEntryId: entry.id,
        snapshot: null,
        matchAgeMinutes: null,
      });
      continue;
    }

    const eMs = entryTimestamp(entry);
    if (eMs == null) {
      out.push({
        diaryEntryId: entry.id,
        snapshot: null,
        matchAgeMinutes: null,
      });
      continue;
    }

    let best: { row: EcowittSensorReadingRow; deltaMs: number } | null = null;
    // Prefer plant-matching rows when caller scopes by plantId.
    const preferPlantId = plantId ?? entry.plant_id ?? null;
    let bestIsPlantMatch = false;

    for (const row of scopedRows) {
      const rMs = rowTimestamp(row);
      if (rMs == null) continue;
      const delta = Math.abs(rMs - eMs);
      if (delta > windowMs) continue;
      const isPlantMatch =
        preferPlantId != null &&
        (row.plant_id ?? null) === preferPlantId;

      if (best == null) {
        best = { row, deltaMs: delta };
        bestIsPlantMatch = isPlantMatch;
        continue;
      }
      // Plant-match always beats non-plant-match.
      if (isPlantMatch && !bestIsPlantMatch) {
        best = { row, deltaMs: delta };
        bestIsPlantMatch = true;
        continue;
      }
      if (!isPlantMatch && bestIsPlantMatch) continue;
      if (delta < best.deltaMs) {
        best = { row, deltaMs: delta };
      }
    }

    if (!best) {
      out.push({
        diaryEntryId: entry.id,
        snapshot: null,
        matchAgeMinutes: null,
      });
      continue;
    }

    const raw = best.row.raw_payload;
    if (!raw || typeof raw !== "object") {
      out.push({
        diaryEntryId: entry.id,
        snapshot: null,
        matchAgeMinutes: null,
      });
      continue;
    }

    const src = (best.row.source ?? "").trim().toLowerCase();
    const candidateSource =
      src === "manual" ? "manual" : src === "demo" ? "demo" : "live";

    const candidate: EcowittCandidate = {
      payload: raw,
      source: candidateSource,
      receivedAt:
        (typeof best.row.captured_at === "string" && best.row.captured_at) ||
        (typeof best.row.ts === "string" && best.row.ts) ||
        undefined,
    };

    const vm = buildEcowittSnapshotViewModel([candidate], { now });
    out.push({
      diaryEntryId: entry.id,
      snapshot: vm.hasReading ? vm : null,
      matchAgeMinutes: Math.round(best.deltaMs / 60_000),
    });
  }

  return out;
}

export const ECOWITT_TIMELINE_DEFAULT_WINDOW_MINUTES = DEFAULT_WINDOW_MIN;
