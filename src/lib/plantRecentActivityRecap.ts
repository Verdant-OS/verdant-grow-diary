/**
 * plantRecentActivityRecap — pure view-model for the Plant Detail
 * "Recent activity" mini-recap.
 *
 * Deterministic. No React, no I/O, no fetch, no privileged keys, no
 * writes. Consumes already-normalized `PlantRecentActivityRow`s and the
 * shared `classifyTimelineEntry` helper to project a compact, presentation
 * -safe view. Internal ids, storage paths, tokens, raw payloads, and
 * provenance markers are NEVER exposed — only category labels, short
 * summaries, and timestamp labels.
 */
import {
  classifyTimelineEntry,
  type TimelineFilterCategory,
} from "@/lib/timelineEntryClassification";
import type { PlantRecentActivityRow } from "@/lib/plantRecentActivityRules";

export const PLANT_RECENT_ACTIVITY_RECAP_DEFAULT_LIMIT = 3 as const;
export const PLANT_RECENT_ACTIVITY_RECAP_MAX_LIMIT = 5 as const;

export interface PlantRecentActivityRecapItem {
  /** Opaque React key. Not surfaced visibly. */
  key: string;
  /** Bucket name from `classifyTimelineEntry`. */
  category: TimelineFilterCategory;
  /** Human-friendly category label (e.g. "Watering"). */
  categoryLabel: string;
  /** Short summary line — never exposes raw payload fields. */
  summary: string;
  /** Pre-formatted timestamp label with deterministic fallback. */
  timestampLabel: string;
}

export interface PlantRecentActivityRecapInput {
  rows: readonly PlantRecentActivityRow[] | null | undefined;
  limit?: number;
}

const SUMMARY_MAX = 80;
const TIMESTAMP_FALLBACK = "Unknown time";

const CATEGORY_LABELS: Record<TimelineFilterCategory, string> = {
  photos: "Photo",
  watering: "Watering",
  feeding: "Feeding",
  symptoms: "Symptoms",
  training: "Training",
  measurement: "Measurement",
  transplant: "Transplant",
  harvest: "Harvest",
  reminder: "Reminder",
  notes: "Note",
};

function clampLimit(n: number | undefined): number {
  const v =
    typeof n === "number" && Number.isFinite(n)
      ? Math.floor(n)
      : PLANT_RECENT_ACTIVITY_RECAP_DEFAULT_LIMIT;
  if (v < 1) return 1;
  if (v > PLANT_RECENT_ACTIVITY_RECAP_MAX_LIMIT) {
    return PLANT_RECENT_ACTIVITY_RECAP_MAX_LIMIT;
  }
  return v;
}

function previewSummary(note: string, hasPhoto: boolean, hasSnapshot: boolean): string {
  const trimmed = (note ?? "").trim();
  if (trimmed.length > 0) {
    if (trimmed.length <= SUMMARY_MAX) return trimmed;
    return trimmed.slice(0, SUMMARY_MAX - 1).trimEnd() + "…";
  }
  if (hasPhoto && hasSnapshot) return "Photo + sensor snapshot logged.";
  if (hasPhoto) return "Photo logged.";
  if (hasSnapshot) return "Sensor snapshot logged.";
  return "No details recorded.";
}

function formatTimestamp(iso: string | null, fallbackLabel: string): string {
  const fallback = (fallbackLabel ?? "").trim() || TIMESTAMP_FALLBACK;
  if (!iso) return fallback;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return fallback;
  try {
    return new Date(t).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return fallback;
  }
}

/**
 * Project plant recent-activity rows into a compact recap view.
 * Rows are already newest-first sorted by `buildPlantRecentActivity`.
 */
export function buildPlantRecentActivityRecap(
  input: PlantRecentActivityRecapInput,
): PlantRecentActivityRecapItem[] {
  const rows = input.rows ?? [];
  if (rows.length === 0) return [];
  const limit = clampLimit(input.limit);
  const out: PlantRecentActivityRecapItem[] = [];
  for (const r of rows) {
    const source = r.hasPhoto ? "photo" : null;
    const category = classifyTimelineEntry({
      eventType: r.eventType,
      source,
    });
    out.push({
      key: out.length.toString(),
      category,
      categoryLabel: CATEGORY_LABELS[category],
      summary: previewSummary(r.notePreview, r.hasPhoto, r.hasSnapshot),
      timestampLabel: formatTimestamp(r.occurredAt, r.occurredAtLabel),
    });
    if (out.length >= limit) break;
  }
  return out;
}
