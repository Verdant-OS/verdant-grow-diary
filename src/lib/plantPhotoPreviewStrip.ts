/**
 * plantPhotoPreviewStrip — pure view-model for the Plant Detail recent
 * photo preview strip.
 *
 * Deterministic. No React, no I/O, no fetch, no privileged keys, no
 * writes. Consumes already-normalized `PhotoHistoryRow`s from the shared
 * `photoHistoryRules` module and projects a compact, presentation-safe
 * view for the Plant Detail strip.
 *
 * Filtering is done by exact `plantId` match. Internal ids, storage
 * paths, tokens, raw payloads, and provenance markers are NEVER exposed
 * by this view-model — only safe http(s) thumbnail URLs, formatted date
 * labels, optional category labels, and alt text.
 */
import type { PhotoHistoryRow } from "./photoHistoryRules";

export const PLANT_PHOTO_STRIP_DEFAULT_LIMIT = 5 as const;
export const PLANT_PHOTO_STRIP_MIN_LIMIT = 3 as const;
export const PLANT_PHOTO_STRIP_MAX_LIMIT = 5 as const;

export interface PlantPhotoStripItem {
  /** Stable opaque key for React. Not surfaced in visible UI. */
  key: string;
  /** Safe http(s) thumbnail URL, or null if missing/invalid. */
  thumbnailUrl: string | null;
  /** Pre-formatted human date label. Empty string if unknown. */
  dateLabel: string;
  /** Optional category/angle label (e.g. "Watering"). Empty if not applicable. */
  categoryLabel: string;
  /** Accessible alt text — never includes IDs or raw payloads. */
  altText: string;
}

export interface PlantPhotoStripInput {
  plantId: string | null | undefined;
  rows: readonly PhotoHistoryRow[] | null | undefined;
  /** Defaults to 5; clamped to [3, 5]. */
  limit?: number;
}

function clampLimit(n: number | undefined): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : PLANT_PHOTO_STRIP_DEFAULT_LIMIT;
  if (v < PLANT_PHOTO_STRIP_MIN_LIMIT) return PLANT_PHOTO_STRIP_MIN_LIMIT;
  if (v > PLANT_PHOTO_STRIP_MAX_LIMIT) return PLANT_PHOTO_STRIP_MAX_LIMIT;
  return v;
}

function formatDateLabel(iso: string | null, fallback: string): string {
  if (!iso) return fallback?.trim() ? fallback.trim() : "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return fallback?.trim() ? fallback.trim() : "";
  try {
    return new Date(t).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return fallback?.trim() ? fallback.trim() : "";
  }
}

const CATEGORY_FROM_EVENT: Record<string, string> = {
  watering: "Watering",
  feeding: "Feeding",
  observation: "Observation",
  training: "Training",
  defoliation: "Defoliation",
  transplant: "Transplant",
  harvest: "Harvest",
  pest: "Pest",
};

function deriveCategoryLabel(eventType: string): string {
  const t = (eventType ?? "").toString().toLowerCase();
  if (!t || t === "photo") return "";
  return CATEGORY_FROM_EVENT[t] ?? "";
}

function deriveAltText(dateLabel: string): string {
  return dateLabel ? `Plant photo from ${dateLabel}` : "Plant photo";
}

/**
 * Project photo-history rows into a compact Plant Detail strip view.
 * Returns at most `limit` entries (newest-first; rows already sorted).
 * Rows with no valid thumbnail URL are skipped so the strip never renders
 * a broken or warning-only tile.
 */
export function buildPlantPhotoStripItems(
  input: PlantPhotoStripInput,
): PlantPhotoStripItem[] {
  const plantId = (input.plantId ?? "").trim();
  if (!plantId) return [];
  const limit = clampLimit(input.limit);
  const rows = input.rows ?? [];
  const out: PlantPhotoStripItem[] = [];
  for (const r of rows) {
    if (r.plantId !== plantId) continue;
    if (!r.photoUrl) continue;
    const dateLabel = formatDateLabel(r.occurredAt, r.occurredAtLabel);
    out.push({
      key: out.length.toString(),
      thumbnailUrl: r.photoUrl,
      dateLabel,
      categoryLabel: deriveCategoryLabel(r.eventType),
      altText: deriveAltText(dateLabel),
    });
    if (out.length >= limit) break;
  }
  return out;
}
