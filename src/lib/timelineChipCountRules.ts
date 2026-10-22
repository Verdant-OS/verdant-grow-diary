/**
 * Timeline chip counts — diary event chips, sensor receipts on Measurements,
 * photos from the original reference.
 *
 * Synthetic sensor receipts stay in the visible list when Measurements is
 * active (or when no diary rows exist). They are not diary rows, so they do
 * not move All, Photos, Notes, Follow-ups, Action responses, or the stage
 * chips. Measurements is the exception: it counts diary measurement rows and
 * those receipts together, and lists both.
 * A storage photo counts as soon as the saved reference is known, including
 * while its signed URL is still outstanding.
 *
 * Pure: no React, no Supabase, no clock.
 */
import { parseDiaryPhotoDisplayReferenceFromRow } from "@/lib/diaryPhotoDisplayRules";
import { isTimelineSensorDerivedDiaryId } from "@/lib/timelineManualSensorMeasurementRules";

export const EMPTY_TIMELINE_DIARY_PHOTO_IDS: ReadonlySet<string> = new Set();

export interface TimelinePhotoIdentityRow {
  id: string;
  photo_url?: unknown;
  details?: unknown;
}

/** Diary rows that event and stage chips may count. Receipts are excluded. */
export function timelineDiaryRowsForChipCounts<T extends { id: string }>(rows: readonly T[]): T[] {
  return rows.filter((row) => !isTimelineSensorDerivedDiaryId(row.id));
}

/**
 * Rows the stage chips (All stages and each stage) count. Under Measurements
 * the list includes synthetic sensor receipts, so the stage chips count them
 * too; under every other event chip they count diary rows only.
 */
export function timelineStageChipRows<T extends { id: string }>(
  eventFilter: string,
  diaryRows: readonly T[],
  listRows: readonly T[],
): readonly T[] {
  return eventFilter === "measurement" ? listRows : diaryRows;
}

/**
 * Measurements chip: diary measurement rows, plus each visible synthetic
 * sensor receipt. Other chips do not use this total.
 */
export function timelineMeasurementChipCount(
  diaryMeasurementCount: number,
  rows: readonly { id?: string | null }[] | null | undefined,
): number {
  const diaryCount =
    typeof diaryMeasurementCount === "number" && Number.isFinite(diaryMeasurementCount)
      ? Math.max(0, Math.trunc(diaryMeasurementCount))
      : 0;
  if (!rows) return diaryCount;
  let receipts = 0;
  for (const row of rows) {
    if (isTimelineSensorDerivedDiaryId(row?.id)) receipts += 1;
  }
  return diaryCount + receipts;
}

/** Which persisted field a Timeline row's displayed photo was projected from. */
export type TimelineDiaryPhotoReferenceSource = "top" | "details" | null;

function isDisplayablePhotoKind(kind: string): boolean {
  return kind === "external" || kind === "storage";
}

/** Where a loaded row's displayable photo reference lives (top-level wins). */
export function resolveTimelineDiaryPhotoReferenceSource(
  row: { photo_url?: unknown; details?: unknown },
  viewerUserId: string | null,
): TimelineDiaryPhotoReferenceSource {
  const top = parseDiaryPhotoDisplayReferenceFromRow(
    { photo_url: row.photo_url, details: null },
    { viewerUserId },
  );
  if (isDisplayablePhotoKind(top.kind)) return "top";
  const any = parseDiaryPhotoDisplayReferenceFromRow(
    { photo_url: row.photo_url, details: row.details },
    { viewerUserId },
  );
  return isDisplayablePhotoKind(any.kind) ? "details" : null;
}

export interface TimelineDiaryPhotoEditRow {
  id: string;
  /** Projected display URL (external, signed, or null while unsigned). */
  photo_url: string | null;
  details?: unknown;
  photoReferenceSource?: TimelineDiaryPhotoReferenceSource;
}

export interface TimelineDiaryPhotoEditResult {
  photo_url: string | null;
  photoReferenceSource: TimelineDiaryPhotoReferenceSource;
  photoIds: ReadonlySet<string>;
  /** A new private storage path the caller must sign; null when none. */
  signStoragePath: string | null;
}

/**
 * Apply an EntryEditDialog save (which rewrites `details` only) to a row's
 * projected photo and to the Photos membership set. The decision uses the
 * persisted reference source recorded at load, never the projected URL: a
 * top-level reference is untouched by a details edit, while a details
 * fallback is re-derived from the edited details, so removing it clears the
 * projected URL and drops the row from Photos.
 */
export function applyTimelineDiaryPhotoEdit(
  current: ReadonlySet<string>,
  before: TimelineDiaryPhotoEditRow,
  nextDetails: unknown,
  viewerUserId: string | null,
): TimelineDiaryPhotoEditResult {
  const source = before.photoReferenceSource ?? null;
  if (source === "top") {
    return {
      photo_url: before.photo_url,
      photoReferenceSource: "top",
      photoIds: current,
      signStoragePath: null,
    };
  }
  const withId = (add: boolean): ReadonlySet<string> => {
    if (current.has(before.id) === add) return current;
    const next = new Set(current);
    if (add) next.add(before.id);
    else next.delete(before.id);
    return next;
  };
  const ref = parseDiaryPhotoDisplayReferenceFromRow(
    { photo_url: null, details: nextDetails },
    { viewerUserId },
  );
  if (ref.kind === "external") {
    return {
      photo_url: ref.url,
      photoReferenceSource: "details",
      photoIds: withId(true),
      signStoragePath: null,
    };
  }
  if (ref.kind === "storage") {
    const prior =
      source === "details"
        ? parseDiaryPhotoDisplayReferenceFromRow(
            { photo_url: null, details: before.details },
            { viewerUserId },
          )
        : null;
    const samePath = prior?.kind === "storage" && prior.path === ref.path;
    return {
      photo_url: samePath ? before.photo_url : null,
      photoReferenceSource: "details",
      photoIds: withId(true),
      signStoragePath: samePath ? null : ref.path,
    };
  }
  return {
    photo_url: null,
    photoReferenceSource: null,
    photoIds: withId(false),
    signStoragePath: null,
  };
}

/**
 * Ids whose saved photo reference is displayable. Call this on the rows
 * returned by the diary read, before storage paths are cleared for signing.
 */
export function collectTimelineDiaryPhotoIds(
  rows: readonly TimelinePhotoIdentityRow[],
  viewerUserId: string | null,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || row.id.length === 0) continue;
    if (isTimelineSensorDerivedDiaryId(row.id)) continue;
    const reference = parseDiaryPhotoDisplayReferenceFromRow(
      { photo_url: row.photo_url, details: row.details },
      { viewerUserId },
    );
    if (reference.kind === "external" || reference.kind === "storage") ids.add(row.id);
  }
  return ids;
}

/** Union page ids without mutating the previous set. */
export function unionTimelineDiaryPhotoIds(
  current: ReadonlySet<string>,
  incoming: ReadonlySet<string>,
): ReadonlySet<string> {
  if (incoming.size === 0) return current;
  const next = new Set(current);
  let added = false;
  for (const id of incoming) {
    if (next.has(id)) continue;
    next.add(id);
    added = true;
  }
  return added ? next : current;
}

/** Deduplicate alert_events so at most one 'created' event is shown per alert_id. */
export function dedupeAlertEventsForTimeline<
  T extends { id: string; alert_id: string; event_type: string; created_at: string },
>(events: readonly T[] | null | undefined): T[] {
  if (!Array.isArray(events) || events.length === 0) return [];
  // Newest first; ties (and unparseable times, sorted oldest) break by id so
  // the surviving 'created' row never depends on database response order.
  const time = (value: string) => {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
  };
  const sorted = [...events].sort((a, b) => {
    const ta = time(a.created_at);
    const tb = time(b.created_at);
    if (ta !== tb) return tb > ta ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
  // Keep the earliest 'created' event per alert_id so historical duplicate
  // 'created' rows never render 2x–3x on the Timeline.
  const earliestCreatedIdByAlert = new Map<string, string>();
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const ev = sorted[i];
    if (ev.event_type === "created" && ev.alert_id && !earliestCreatedIdByAlert.has(ev.alert_id)) {
      earliestCreatedIdByAlert.set(ev.alert_id, ev.id);
    }
  }
  return sorted.filter((ev) => {
    if (ev.event_type !== "created") return true;
    return earliestCreatedIdByAlert.get(ev.alert_id) === ev.id;
  });
}

/** A photo chip member: a live display URL, or an original reference still unsigned. */
export function timelineEntryCountsAsPhoto(
  entry: { id: string; photo_url?: string | null },
  diaryPhotoIds: ReadonlySet<string>,
): boolean {
  if (entry.photo_url) return true;
  return diaryPhotoIds.has(entry.id);
}

/** True when a diary entry carries grower-written note text (not just whitespace). */
export function timelineEntryHasNoteText(note: unknown): boolean {
  return typeof note === "string" && note.trim().length > 0;
}

/** Whether a diary row belongs in the Timeline Notes chip (Pollen #1). */
export function timelineEntryQualifiesForNotesChip(entry: { id: string; note?: unknown }): boolean {
  return !isTimelineSensorDerivedDiaryId(entry.id) && timelineEntryHasNoteText(entry.note);
}
