/**
 * Permalink and read-state rules for the timeline entry detail view.
 * Pure: no React, no clock, no network.
 */
import { isTimelineSensorDerivedDiaryId } from "@/lib/timelineManualSensorMeasurementRules";

export const TIMELINE_ENTRY_DETAIL_PARAM = "entry";

export const TIMELINE_ENTRY_NOT_FOUND_TITLE = "Entry not found";
export const TIMELINE_ENTRY_NOT_FOUND_BODY =
  "This entry is missing or you do not have access to it.";

export const TIMELINE_ENTRY_DETAIL_LOADING_TITLE = "Loading entry";
export const TIMELINE_ENTRY_DETAIL_LOADING_BODY = "Loading this entry.";

export const TIMELINE_ENTRY_DETAIL_UNAVAILABLE_TITLE = "Entry not available";
export const TIMELINE_ENTRY_DETAIL_UNAVAILABLE_BODY = "This entry could not be loaded.";

/** One id token. Colons cover manual sensor receipts. No spaces or query markup. */
const ENTRY_DETAIL_ID = /^[A-Za-z0-9:._+-]{1,240}$/;

export interface TimelineEntryDetailRecord {
  id: string;
  note: string;
  photo_url: string | null;
  stage: string | null;
  details: Record<string, unknown>;
  entry_at: string;
  plant_id: string | null;
  tent_id: string | null;
  grow_id?: string | null;
}

export type TimelineEntryDetailFetchState = "idle" | "loading" | "ready" | "missing" | "error";

export type TimelineEntryDetailView<T extends { id: string }> =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "unavailable" }
  | { kind: "ready"; entry: T };

export function parseTimelineEntryDetailId(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!ENTRY_DETAIL_ID.test(trimmed)) return null;
  return trimmed;
}

export function timelineEntryDetailSearch(
  current: URLSearchParams,
  entryId: string | null,
): URLSearchParams {
  const next = new URLSearchParams(current);
  const parsed = parseTimelineEntryDetailId(entryId);
  if (parsed) next.set(TIMELINE_ENTRY_DETAIL_PARAM, parsed);
  else next.delete(TIMELINE_ENTRY_DETAIL_PARAM);
  return next;
}

export function timelineEntryDetailHref(entryId: string): string | null {
  const parsed = parseTimelineEntryDetailId(entryId);
  if (!parsed) return null;
  const params = new URLSearchParams();
  params.set(TIMELINE_ENTRY_DETAIL_PARAM, parsed);
  return `/timeline?${params.toString()}`;
}

/** Only an already-displayable http(s) URL is safe to put in an image. */
export function timelineEntryDetailPhotoSrc(photoUrl: string | null | undefined): string | null {
  if (typeof photoUrl !== "string") return null;
  const trimmed = photoUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

export function timelineEntryDetailStatusCopy(kind: "loading" | "not_found" | "unavailable"): {
  title: string;
  body: string;
} {
  switch (kind) {
    case "loading":
      return {
        title: TIMELINE_ENTRY_DETAIL_LOADING_TITLE,
        body: TIMELINE_ENTRY_DETAIL_LOADING_BODY,
      };
    case "not_found":
      return { title: TIMELINE_ENTRY_NOT_FOUND_TITLE, body: TIMELINE_ENTRY_NOT_FOUND_BODY };
    case "unavailable":
      return {
        title: TIMELINE_ENTRY_DETAIL_UNAVAILABLE_TITLE,
        body: TIMELINE_ENTRY_DETAIL_UNAVAILABLE_BODY,
      };
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

export function timelineEntryDetailGrowId(
  entry: object,
  activeGrowId: string | null,
): string | null {
  const value = "grow_id" in entry ? entry.grow_id : null;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return activeGrowId;
}

export function normalizeTimelineEntryDetailRow(
  raw: unknown,
  requestedId: string,
): TimelineEntryDetailRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.id !== requestedId) return null;
  if (typeof row.entry_at !== "string" || row.entry_at.trim().length === 0) return null;
  const details =
    row.details && typeof row.details === "object" && !Array.isArray(row.details)
      ? (row.details as Record<string, unknown>)
      : {};
  return {
    id: requestedId,
    note: typeof row.note === "string" ? row.note : "",
    photo_url: typeof row.photo_url === "string" ? row.photo_url : null,
    stage: typeof row.stage === "string" ? row.stage : null,
    details,
    entry_at: row.entry_at,
    plant_id: typeof row.plant_id === "string" ? row.plant_id : null,
    tent_id: typeof row.tent_id === "string" ? row.tent_id : null,
    grow_id: typeof row.grow_id === "string" ? row.grow_id : null,
  };
}

export function resolveTimelineEntryDetailView<
  T extends { id: string },
  F extends { id: string },
>(input: {
  requestedId: string | null;
  visibleEntries: readonly T[];
  fetchedEntry: F | null;
  fetchState: TimelineEntryDetailFetchState;
  sensorListSettled: boolean;
}): TimelineEntryDetailView<T | F> {
  if (!input.requestedId) return { kind: "closed" };
  const visible = input.visibleEntries.find((row) => row.id === input.requestedId) ?? null;
  if (visible) return { kind: "ready", entry: visible };
  if (input.fetchedEntry && input.fetchedEntry.id === input.requestedId) {
    return { kind: "ready", entry: input.fetchedEntry };
  }
  if (isTimelineSensorDerivedDiaryId(input.requestedId)) {
    return input.sensorListSettled ? { kind: "not_found" } : { kind: "loading" };
  }
  switch (input.fetchState) {
    case "idle":
    case "loading":
      return { kind: "loading" };
    case "error":
      return { kind: "unavailable" };
    case "missing":
    case "ready":
      return { kind: "not_found" };
    default: {
      const unreachable: never = input.fetchState;
      return unreachable;
    }
  }
}
