/**
 * relativeTimelineProjectionRules — pure projection that maps existing
 * diary entries onto the Relative Cultivation Timeline (plant-day and
 * stage-day relative). Read-only. No I/O, no React, no side effects.
 *
 * Strictly read-only:
 *  - Does not create, edit, move, or delete events.
 *  - Does not invent placeholder/dummy events.
 *  - Does not auto-shift stages.
 *  - Does not write to plants, diary_entries, sensor_readings,
 *    Action Queue, alerts, or any device control surface.
 */
import {
  normalizeDiaryEntries,
  type NormalizedDiaryEntry,
} from "@/lib/diaryEntryRules";
import {
  calculatePlantRelativeDay,
  calculateStageRelativeDay,
  getRelativeStagePreset,
  type RelativeStagePreset,
} from "@/lib/relativeStageTimelineRules";

export type RelativeTimelineItemSource = "note" | "photo" | "sensor";

export interface RelativeTimelineItem {
  id: string;
  eventType: string;
  title: string;
  occurredAt: string | null;
  occurredAtLabel: string;
  /** Days since plant start. Null when start or event date is invalid. */
  plantDay: number | null;
  /** Days since current stage start. Null when not available. */
  stageDay: number | null;
  /** Best-guess source kind for badge rendering. */
  source: RelativeTimelineItemSource;
  /** Stage preset for color token + label. Null if no current stage. */
  stagePreset: RelativeStagePreset | null;
  plantId: string | null;
  tentId: string | null;
}

export interface BuildRelativeTimelineInput {
  rawEntries: readonly unknown[] | null | undefined;
  plantId: string | null | undefined;
  plantStartedAt: string | number | Date | null | undefined;
  stageStartedAt?: string | number | Date | null;
  currentStage?: string | null;
  now?: number;
  limit?: number;
}

const DEFAULT_LIMIT = 50;
const TITLE_MAX = 80;

/**
 * Maps legacy/loose plant.stage strings onto relative stage preset keys.
 * Unknown values return null — never invent a stage.
 */
function resolveStagePreset(stage: string | null | undefined): RelativeStagePreset | null {
  if (!stage || typeof stage !== "string") return null;
  const key = stage.toLowerCase().trim();
  const aliasMap: Record<string, string> = {
    seedling: "seedling",
    clone: "clone",
    veg: "vegetation",
    vegetative: "vegetation",
    vegetation: "vegetation",
    flower: "flower",
    flowering: "flower",
    dry: "dry",
    drying: "dry",
    cure: "cure",
    curing: "cure",
  };
  const mapped = aliasMap[key];
  if (!mapped) return null;
  return getRelativeStagePreset(mapped);
}

function deriveSource(entry: NormalizedDiaryEntry): RelativeTimelineItemSource {
  if (entry.photoUrl) return "photo";
  if (entry.details?.sensorSnapshot) return "sensor";
  return "note";
}

function deriveTitle(entry: NormalizedDiaryEntry): string {
  const raw = (entry.note ?? "").trim();
  if (!raw) {
    // Fall back to event type label — never invent prose.
    return entry.eventType ? entry.eventType : "Entry";
  }
  // Take first line, clamp length.
  const firstLine = raw.split(/\r?\n/, 1)[0] ?? raw;
  if (firstLine.length <= TITLE_MAX) return firstLine;
  return firstLine.slice(0, TITLE_MAX - 1).trimEnd() + "…";
}

/**
 * Deterministic ascending sort:
 *  - Items with valid occurredAt first, oldest → newest.
 *  - Items missing a parseable date sort to the end.
 *  - Tie-break: eventType (asc), then id (asc).
 */
function compareAscending(a: RelativeTimelineItem, b: RelativeTimelineItem): number {
  const aHas = a.occurredAt !== null;
  const bHas = b.occurredAt !== null;
  if (aHas && bHas) {
    const da = Date.parse(a.occurredAt as string);
    const db = Date.parse(b.occurredAt as string);
    if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db;
  } else if (aHas !== bHas) {
    return aHas ? -1 : 1;
  }
  if (a.eventType !== b.eventType) {
    return a.eventType < b.eventType ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildRelativeTimelineProjection(
  input: BuildRelativeTimelineInput,
): RelativeTimelineItem[] {
  const plantId = input?.plantId ?? null;
  if (!plantId) return [];
  const raw = input.rawEntries;
  if (!raw || raw.length === 0) return [];

  const now = input.now ?? Date.now();
  const limit = Math.max(1, input.limit ?? DEFAULT_LIMIT);
  const stagePreset = resolveStagePreset(input.currentStage ?? null);

  const normalized = normalizeDiaryEntries({
    rawEntries: raw,
    plantStartedAt: input.plantStartedAt ?? null,
    now,
  });
  const scoped = normalized.filter((e) => e.plantId === plantId);

  const items: RelativeTimelineItem[] = scoped.map((entry) => {
    const plantDay = calculatePlantRelativeDay({
      plantStartedAt: input.plantStartedAt ?? null,
      eventAt: entry.createdAt,
    });
    const stageDay =
      input.stageStartedAt != null
        ? calculateStageRelativeDay({
            stageStartedAt: input.stageStartedAt,
            eventAt: entry.createdAt,
          })
        : null;
    // Prefer the per-entry stage when available; fall back to the plant's
    // current stage. Never invent a stage if neither resolves.
    const itemPreset =
      resolveStagePreset(entry.stage) ?? stagePreset;
    return {
      id: entry.id,
      eventType: entry.eventType,
      title: deriveTitle(entry),
      occurredAt: entry.createdAt,
      occurredAtLabel: entry.createdAtLabel,
      plantDay,
      stageDay,
      source: deriveSource(entry),
      stagePreset: itemPreset,
      plantId: entry.plantId,
      tentId: entry.tentId,
    };
  });

  items.sort(compareAscending);
  return items.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Stage grouping (read-only, deterministic)
// ---------------------------------------------------------------------------

export const UNSTAGED_GROUP_KEY = "unstaged" as const;

export interface RelativeTimelineStageGroup {
  /** Stage preset key, or "unstaged" when no valid stage resolved. */
  key: string;
  label: string;
  /** Stable color token from relativeStageTimelineRules, or null for unstaged. */
  colorToken: string | null;
  /** Deterministic order: stage preset sortOrder, unstaged sorts last. */
  sortOrder: number;
  count: number;
  items: RelativeTimelineItem[];
}

const UNSTAGED_SORT_ORDER = Number.MAX_SAFE_INTEGER;

/**
 * Group an already-projected timeline by stage preset.
 *
 * - Items with a valid stagePreset are grouped under that preset key.
 * - Items with no valid stage land in the "unstaged" group (only created
 *   when at least one item has no stage — never an empty stub group).
 * - Stage preset groups are sorted by preset sortOrder; unstaged sorts last.
 * - Items inside each group preserve the input ordering (callers should
 *   pass a deterministically sorted list).
 */
export function groupRelativeTimelineByStage(
  items: ReadonlyArray<RelativeTimelineItem>,
): RelativeTimelineStageGroup[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const byKey = new Map<string, RelativeTimelineStageGroup>();
  for (const item of items) {
    const preset = item.stagePreset;
    const key = preset?.key ?? UNSTAGED_GROUP_KEY;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        label: preset?.label ?? "Unstaged",
        colorToken: preset?.colorToken ?? null,
        sortOrder: preset?.sortOrder ?? UNSTAGED_SORT_ORDER,
        count: 0,
        items: [],
      };
      byKey.set(key, group);
    }
    group.items.push(item);
    group.count += 1;
  }
  const out = [...byKey.values()];
  out.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Filter chips (read-only UI filter — no writes, no schema)
// ---------------------------------------------------------------------------

export type RelativeTimelineFilterKey =
  | "all"
  | "photos"
  | "watering"
  | "feeding"
  | "symptoms"
  | "training"
  | "notes";

export interface RelativeTimelineFilterDef {
  key: RelativeTimelineFilterKey;
  label: string;
  /** Short copy shown when this filter has no matching items. */
  emptyCopy: string;
}

export const RELATIVE_TIMELINE_FILTERS: readonly RelativeTimelineFilterDef[] = [
  {
    key: "all",
    label: "All",
    emptyCopy:
      "Your plant timeline starts with the first quick log, photo, or sensor snapshot.",
  },
  {
    key: "photos",
    label: "Photos",
    emptyCopy: "No photos in this plant's timeline yet.",
  },
  {
    key: "watering",
    label: "Watering",
    emptyCopy: "No watering events in this plant's timeline yet.",
  },
  {
    key: "feeding",
    label: "Feeding",
    emptyCopy: "No feeding events in this plant's timeline yet.",
  },
  {
    key: "symptoms",
    label: "Symptoms",
    emptyCopy: "No symptom or problem observations in this plant's timeline yet.",
  },
  {
    key: "training",
    label: "Training",
    emptyCopy: "No training events in this plant's timeline yet.",
  },
  {
    key: "notes",
    label: "Notes",
    emptyCopy: "No notes or observations in this plant's timeline yet.",
  },
] as const;

const SYMPTOM_EVENT_TYPES = new Set([
  "symptoms",
  "pest_disease",
  "diagnosis",
]);
const TRAINING_EVENT_TYPES = new Set(["training", "defoliation"]);

/**
 * Classify a projected timeline item to one filter category. Pure and
 * null-safe. Unknown / misc / sensor / null types fall back to "notes".
 */
export function classifyRelativeTimelineFilter(
  item: Pick<RelativeTimelineItem, "eventType" | "source"> | null | undefined,
): Exclude<RelativeTimelineFilterKey, "all"> {
  if (!item) return "notes";
  const type = typeof item.eventType === "string" ? item.eventType.toLowerCase() : "";
  if (item.source === "photo" || type === "photo") return "photos";
  if (type === "watering") return "watering";
  if (type === "feeding") return "feeding";
  if (SYMPTOM_EVENT_TYPES.has(type)) return "symptoms";
  if (TRAINING_EVENT_TYPES.has(type)) return "training";
  return "notes";
}

/**
 * Filter projected timeline items by the selected chip. Preserves input
 * ordering. "all" returns the input as-is. Unknown keys behave like "all"
 * to stay safe.
 */
export function filterRelativeTimelineItems(
  items: ReadonlyArray<RelativeTimelineItem>,
  filterKey: RelativeTimelineFilterKey,
): RelativeTimelineItem[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  if (filterKey === "all" || !filterKey) return [...items];
  const known = RELATIVE_TIMELINE_FILTERS.some((f) => f.key === filterKey);
  if (!known) return [...items];
  return items.filter((i) => classifyRelativeTimelineFilter(i) === filterKey);
}

/**
 * Empty-state copy for a given filter. Falls back to the "all" copy when
 * the key is unknown so the UI always renders safe wording.
 */
export function getRelativeTimelineFilterEmptyState(
  filterKey: RelativeTimelineFilterKey,
): string {
  const def =
    RELATIVE_TIMELINE_FILTERS.find((f) => f.key === filterKey) ??
    RELATIVE_TIMELINE_FILTERS[0];
  return def.emptyCopy;
}


