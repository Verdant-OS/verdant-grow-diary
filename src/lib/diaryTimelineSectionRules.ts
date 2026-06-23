/**
 * diaryTimelineSectionRules — pure, read-only classifier and section
 * builder for the Plant Relative Timeline "Category view".
 *
 * Wraps the existing single-source classifier in
 * `timelineEntryClassification.ts` and projects each entry into one of
 * seven presentation buckets used by the categorized section view:
 *
 *   watering | feeding | training | photos | diagnoses |
 *   harvest  | other
 *
 * Hard contract:
 *  - Pure, deterministic, null-safe. No I/O, no React, no side effects.
 *  - No writes, no automation, no AI calls, no device control.
 *  - Every input entry is assigned to exactly one section.
 *  - Unknown / missing event types fall through to "other" — never
 *    guessed into a named category from vague note text.
 *  - Chronological order within each section is preserved (most recent
 *    first, matching the upstream projection's ordering convention).
 */
import {
  classifyTimelineEntry,
  type TimelineFilterCategory,
} from "@/lib/timelineEntryClassification";

export type DiaryTimelineSectionId =
  | "watering"
  | "feeding"
  | "training"
  | "photos"
  | "diagnoses"
  | "harvest"
  | "other";

/** Fixed presentation order used by every category-view consumer. */
export const DIARY_TIMELINE_SECTION_ORDER: readonly DiaryTimelineSectionId[] = [
  "watering",
  "feeding",
  "training",
  "photos",
  "diagnoses",
  "harvest",
  "other",
] as const;

export const DIARY_TIMELINE_SECTION_LABELS: Readonly<
  Record<DiaryTimelineSectionId, string>
> = {
  watering: "Watering",
  feeding: "Feeding",
  training: "Training",
  photos: "Photos",
  diagnoses: "Diagnoses",
  harvest: "Harvest results",
  other: "Other diary entries",
};

export const DIARY_TIMELINE_SECTION_EMPTY_COPY: Readonly<
  Record<DiaryTimelineSectionId, string>
> = {
  watering: "No watering entries in the current timeline view.",
  feeding: "No feeding entries in the current timeline view.",
  training: "No training entries in the current timeline view.",
  photos: "No photo entries in the current timeline view.",
  diagnoses: "No diagnosis entries in the current timeline view.",
  harvest: "No harvest result entries in the current timeline view.",
  other: "No uncategorized diary entries in the current timeline view.",
};

/**
 * Map the existing 10-bucket filter classifier onto the 7-bucket
 * section model. Anything not explicitly named lands in "other".
 *
 *   photos      → photos
 *   watering    → watering
 *   feeding     → feeding
 *   training    → training
 *   symptoms    → diagnoses
 *   harvest     → harvest
 *   measurement → other  (sensor snapshots are not "healthy/actionable")
 *   transplant  → other
 *   reminder    → other
 *   notes       → other
 */
function mapFilterCategoryToSection(
  category: TimelineFilterCategory,
): DiaryTimelineSectionId {
  switch (category) {
    case "photos":
      return "photos";
    case "watering":
      return "watering";
    case "feeding":
      return "feeding";
    case "training":
      return "training";
    case "symptoms":
      return "diagnoses";
    case "harvest":
      return "harvest";
    case "measurement":
    case "transplant":
    case "reminder":
    case "notes":
    default:
      return "other";
  }
}

export interface ClassifyDiaryTimelineEntryInput {
  eventType?: string | null;
  source?: "note" | "photo" | "sensor" | null;
}

export function classifyDiaryTimelineEntry(
  input: ClassifyDiaryTimelineEntryInput | null | undefined,
): DiaryTimelineSectionId {
  if (!input) return "other";
  return mapFilterCategoryToSection(
    classifyTimelineEntry({
      eventType: input.eventType ?? null,
      source: input.source ?? null,
    }),
  );
}

export interface DiaryTimelineSection<T> {
  id: DiaryTimelineSectionId;
  label: string;
  emptyCopy: string;
  count: number;
  items: T[];
}

/**
 * Build all seven sections in the fixed presentation order. Every input
 * item is placed into exactly one section. Input order is preserved
 * (callers should pre-sort by `occurredAt` — the upstream projection
 * already does this).
 *
 * Empty input still returns all seven sections with `count: 0` so the
 * presenter can render empty copy and keep section headers reachable.
 */
export function buildDiaryTimelineSections<
  T extends ClassifyDiaryTimelineEntryInput,
>(items: readonly T[] | null | undefined): DiaryTimelineSection<T>[] {
  const buckets: Record<DiaryTimelineSectionId, T[]> = {
    watering: [],
    feeding: [],
    training: [],
    photos: [],
    diagnoses: [],
    harvest: [],
    other: [],
  };
  if (Array.isArray(items)) {
    for (const item of items) {
      const id = classifyDiaryTimelineEntry(item);
      buckets[id].push(item);
    }
  }
  return DIARY_TIMELINE_SECTION_ORDER.map((id) => ({
    id,
    label: DIARY_TIMELINE_SECTION_LABELS[id],
    emptyCopy: DIARY_TIMELINE_SECTION_EMPTY_COPY[id],
    count: buckets[id].length,
    items: buckets[id],
  }));
}
