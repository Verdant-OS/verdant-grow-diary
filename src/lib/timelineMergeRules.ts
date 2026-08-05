/**
 * timelineMergeRules — pure helper that merges `diary_entries` and
 * `grow_events` into a single deterministic timeline source list.
 *
 * Pure, deterministic, no React, no Supabase, no I/O.
 *
 * Used by Timeline-style readers so legacy diary entries and Quick Log
 * v2 manual saves (which land in `grow_events`) render in a single
 * stable, newest-first stream without duplicates.
 *
 * Sort precedence (most important first):
 *   1. occurred timestamp descending (newest first)
 *   2. on exact timestamp ties → `grow_events` before `diary_entries`
 *      (Quick Log v2 is the live entry path)
 *   3. source_id lexical (ascending) fallback so output is stable
 *
 * Dedup rules:
 *   - Exact duplicate by `(source_table, source_id)` collapses to one entry.
 *   - Optional logical dedup: if both tables represent the same logical
 *     event (same `dedupKey`, e.g. a shared `grow_event_id` on a diary
 *     mirror row), only the `grow_events` row is kept.
 *
 * Missing fields:
 *   - Rows without an occurred timestamp are kept and sorted to the end.
 *   - Optional fields (note, photo, plant/tent/grow id, source, stage)
 *     are passed through as `null` when missing.
 */

import { dedupeMergedManualGrowActivityRows } from "@/lib/connectedOneTentActivationRules";

// ---------------------------------------------------------------------------
// Input row shapes (loose by design — accept upstream variations)
// ---------------------------------------------------------------------------

export interface DiaryEntryRowInput {
  id: string;
  entry_at?: string | null;
  occurred_at?: string | null;
  grow_id?: string | null;
  tent_id?: string | null;
  plant_id?: string | null;
  stage?: string | null;
  note?: string | null;
  photo_url?: string | null;
  details?: Record<string, unknown> | null;
  /** Optional logical link to a grow_events row (dedup key). */
  grow_event_id?: string | null;
  /** Current writer alias for the same logical link. */
  linked_grow_event_id?: string | null;
}

export interface GrowEventRowInput {
  id: string;
  occurred_at?: string | null;
  entry_at?: string | null;
  grow_id?: string | null;
  tent_id?: string | null;
  plant_id?: string | null;
  event_type?: string | null;
  note?: string | null;
  source?: string | null;
  is_deleted?: boolean | null;
}

export interface MergeTimelineSourcesInput {
  diaryEntries: ReadonlyArray<DiaryEntryRowInput>;
  growEvents: ReadonlyArray<GrowEventRowInput>;
}

// ---------------------------------------------------------------------------
// Output row shape — one unified entry
// ---------------------------------------------------------------------------

export type TimelineSourceTable = "diary_entries" | "grow_events";

export interface MergedTimelineEntry {
  /** Unique key safe for React lists: `${source_table}:${source_id}`. */
  key: string;
  source_table: TimelineSourceTable;
  source_id: string;
  /** ISO string of the occurred/entry time, or null if missing/invalid. */
  occurred_at: string | null;
  /** Epoch ms sort key, or null when occurred_at is missing/invalid. */
  occurred_epoch_ms: number | null;
  grow_id: string | null;
  tent_id: string | null;
  plant_id: string | null;
  stage: string | null;
  event_type: string | null;
  note: string | null;
  photo_url: string | null;
  /** "live" | "manual" | "csv" | "demo" | "stale" | "invalid" | null. */
  source: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SOURCE_PRIORITY: Record<TimelineSourceTable, number> = {
  // Higher = sorted earlier on tie.
  grow_events: 1,
  diary_entries: 0,
};

function safeEpoch(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function pickOccurredAt(
  primary: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  if (typeof primary === "string" && primary.length > 0) return primary;
  if (typeof fallback === "string" && fallback.length > 0) return fallback;
  return null;
}

function normalizeDiaryRow(row: DiaryEntryRowInput): MergedTimelineEntry {
  const occurred_at = pickOccurredAt(row.entry_at, row.occurred_at);
  const details = row.details ?? null;
  const eventTypeFromDetails =
    details && typeof details === "object"
      ? ((details["event_type"] as string | undefined) ?? null)
      : null;
  const sourceFromDetails =
    details && typeof details === "object"
      ? ((details["source"] as string | undefined) ?? null)
      : null;
  return {
    key: `diary_entries:${row.id}`,
    source_table: "diary_entries",
    source_id: row.id,
    occurred_at,
    occurred_epoch_ms: safeEpoch(occurred_at),
    grow_id: row.grow_id ?? null,
    tent_id: row.tent_id ?? null,
    plant_id: row.plant_id ?? null,
    stage: row.stage ?? null,
    event_type: eventTypeFromDetails,
    note: row.note ?? null,
    photo_url: row.photo_url ?? null,
    source: sourceFromDetails,
  };
}

function normalizeGrowEventRow(row: GrowEventRowInput): MergedTimelineEntry {
  const occurred_at = pickOccurredAt(row.occurred_at, row.entry_at);
  return {
    key: `grow_events:${row.id}`,
    source_table: "grow_events",
    source_id: row.id,
    occurred_at,
    occurred_epoch_ms: safeEpoch(occurred_at),
    grow_id: row.grow_id ?? null,
    tent_id: row.tent_id ?? null,
    plant_id: row.plant_id ?? null,
    stage: null,
    event_type: row.event_type ?? null,
    note: row.note ?? null,
    photo_url: null,
    source: row.source ?? null,
  };
}

function pickLogicalGrowEventLink(row: DiaryEntryRowInput): string | null {
  const details = row.details ?? null;
  const candidates = [
    row.linked_grow_event_id,
    row.grow_event_id,
    details?.linked_grow_event_id,
    details?.grow_event_id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return null;
}

function compareMergedEntries(a: MergedTimelineEntry, b: MergedTimelineEntry): number {
  // 1) occurred timestamp descending; missing timestamps go last
  const aT = a.occurred_epoch_ms;
  const bT = b.occurred_epoch_ms;
  if (aT === null && bT === null) {
    // continue to tie-breakers below
  } else if (aT === null) {
    return 1;
  } else if (bT === null) {
    return -1;
  } else if (aT !== bT) {
    return bT - aT;
  }
  // 2) source priority — grow_events first on ties
  const ap = SOURCE_PRIORITY[a.source_table];
  const bp = SOURCE_PRIORITY[b.source_table];
  if (ap !== bp) return bp - ap;
  // 3) source_id lexical ascending
  if (a.source_id < b.source_id) return -1;
  if (a.source_id > b.source_id) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Quick Log save fan-out collapse
// ---------------------------------------------------------------------------
//
// One confirmed Quick Log save can persist up to three rows: a manual
// watering/observation `grow_events` spine row, a same-instant sibling
// `environment` grow_event when sensor values are present, and a
// `diary_entries` companion when structured details exist. Readers that feed
// all three into `mergeTimelineSources` render one save as two or three
// activities (live audit #9/#10). This helper applies the shared manual-save
// dedupe (`dedupeMergedManualGrowActivityRows`) to the raw source arrays
// while keeping rows that are outside that contract (non-manual grow events,
// rows without a parsable timestamp) flowing through untouched.
//
// Dropped companions are returned keyed by their surviving spine row so the
// caller can re-attach companion-only details (sensor snapshots,
// environment_check envelopes, plant_name) to the spine and keep rendering
// them exactly once.

export interface CollapseQuickLogSaveFanOutResult<
  D extends DiaryEntryRowInput,
  G extends GrowEventRowInput,
> {
  diaryEntries: D[];
  growEvents: G[];
  /** Companion diary rows removed by the collapse, keyed by surviving spine id. */
  droppedCompanionsBySpineId: Map<string, D[]>;
}

function fanOutEpochMs(primary: unknown, fallback: unknown): number | null {
  for (const value of [primary, fallback]) {
    if (typeof value !== "string" || value.trim().length === 0) continue;
    const epoch = Date.parse(value);
    if (Number.isFinite(epoch)) return epoch;
  }
  return null;
}

function fanOutPairKey(plantId: unknown, epochMs: number): string {
  const plant = typeof plantId === "string" && plantId.trim().length > 0 ? plantId.trim() : "";
  return `${plant}|${epochMs}`;
}

export function collapseQuickLogSaveFanOut<
  D extends DiaryEntryRowInput,
  G extends GrowEventRowInput,
>(input: {
  diaryEntries: ReadonlyArray<D>;
  growEvents: ReadonlyArray<G>;
}): CollapseQuickLogSaveFanOutResult<D, G> {
  const survivors = dedupeMergedManualGrowActivityRows({
    diaryEntries: input.diaryEntries,
    growEvents: input.growEvents,
  });
  const survivorSpineIds = new Set(
    survivors.growEvents.map((row) => row.id).filter((id): id is string => typeof id === "string"),
  );
  const survivorDiaryIds = new Set(
    survivors.diaryEntries
      .map((row) => row.id)
      .filter((id): id is string => typeof id === "string"),
  );

  // Surviving spine rows by (plant, instant) pair — the attachment target for
  // unlinked companions written by quicklog_save_manual. First-in-input wins
  // so attachment stays deterministic.
  const spineIdByPairKey = new Map<string, string>();
  const growEvents: G[] = [];
  for (const row of input.growEvents) {
    if (!row || typeof row.id !== "string" || row.id.trim().length === 0) {
      continue;
    }
    const epochMs = fanOutEpochMs(row.occurred_at, row.entry_at);
    const inManualContract = row.source === "manual" && row.is_deleted !== true && epochMs !== null;
    if (inManualContract && !survivorSpineIds.has(row.id)) {
      // The only manual, timestamped, non-deleted rows the shared dedupe
      // removes are same-instant environment siblings of a watering /
      // observation spine (and exact id duplicates). One sensor-carrying
      // save must count once.
      continue;
    }
    if (inManualContract && epochMs !== null) {
      const key = fanOutPairKey(row.plant_id, epochMs);
      if (!spineIdByPairKey.has(key)) spineIdByPairKey.set(key, row.id);
    }
    growEvents.push(row);
  }

  const diaryEntries: D[] = [];
  const droppedCompanionsBySpineId = new Map<string, D[]>();
  const attachCompanion = (spineId: string | null, row: D) => {
    if (!spineId || !survivorSpineIds.has(spineId)) return;
    const bucket = droppedCompanionsBySpineId.get(spineId);
    if (bucket) bucket.push(row);
    else droppedCompanionsBySpineId.set(spineId, [row]);
  };
  for (const row of input.diaryEntries) {
    if (!row || typeof row.id !== "string" || row.id.trim().length === 0) {
      diaryEntries.push(row);
      continue;
    }
    if (survivorDiaryIds.has(row.id)) {
      diaryEntries.push(row);
      continue;
    }
    const logicalLink = pickLogicalGrowEventLink(row);
    const epochMs = fanOutEpochMs(row.entry_at, row.occurred_at);
    if (logicalLink) {
      // A linked companion always belongs to its grow_events parent — even a
      // deleted or out-of-window parent must not resurrect as a second row.
      attachCompanion(logicalLink, row);
      continue;
    }
    if (epochMs === null) {
      // Untimestamped rows fall outside the pair contract; the merge sorts
      // them last rather than hiding them.
      diaryEntries.push(row);
      continue;
    }
    // Unlinked companion sharing the exact (plant, instant) pair with a
    // manual spine row — conservatively the same logical save.
    attachCompanion(spineIdByPairKey.get(fanOutPairKey(row.plant_id, epochMs)) ?? null, row);
  }

  return { diaryEntries, growEvents, droppedCompanionsBySpineId };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function mergeTimelineSources(input: MergeTimelineSourcesInput): MergedTimelineEntry[] {
  const normalized: MergedTimelineEntry[] = [];

  // grow_events first so logical dedup below prefers them
  const seenExact = new Set<string>();
  const claimedGrowEventIds = new Set<string>();

  for (const row of input.growEvents ?? []) {
    if (!row || typeof row.id !== "string" || row.id.length === 0) continue;
    if (row.is_deleted === true) continue;
    const entry = normalizeGrowEventRow(row);
    if (seenExact.has(entry.key)) continue;
    seenExact.add(entry.key);
    claimedGrowEventIds.add(entry.source_id);
    normalized.push(entry);
  }

  for (const row of input.diaryEntries ?? []) {
    if (!row || typeof row.id !== "string" || row.id.length === 0) continue;
    const entry = normalizeDiaryRow(row);
    if (seenExact.has(entry.key)) continue;
    // Logical dedup: drop the diary mirror row when a matching
    // grow_events row is already present.
    const logicalLink = pickLogicalGrowEventLink(row);
    if (logicalLink && claimedGrowEventIds.has(logicalLink)) continue;
    seenExact.add(entry.key);
    normalized.push(entry);
  }

  normalized.sort(compareMergedEntries);
  return normalized;
}
