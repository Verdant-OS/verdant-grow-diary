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
    return {
      id: entry.id,
      eventType: entry.eventType,
      title: deriveTitle(entry),
      occurredAt: entry.createdAt,
      occurredAtLabel: entry.createdAtLabel,
      plantDay,
      stageDay,
      source: deriveSource(entry),
      stagePreset,
      plantId: entry.plantId,
      tentId: entry.tentId,
    };
  });

  items.sort(compareAscending);
  return items.slice(0, limit);
}
