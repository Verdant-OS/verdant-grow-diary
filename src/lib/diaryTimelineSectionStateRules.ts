/**
 * diaryTimelineSectionStateRules — pure UI-state helpers for the Plant
 * Relative Timeline "Category view". Handles default expansion, merging
 * saved state, and a compact summary line.
 *
 * Hard contract:
 *  - Pure, deterministic, null-safe.
 *  - No I/O, no React, no side effects.
 *  - Only stores section IDs + booleans. Never accepts or stores entry
 *    IDs, plant/tent/user IDs, raw payloads, sensor values, or note text.
 *  - Malformed input never throws — returns default-safe shapes.
 */
import {
  DIARY_TIMELINE_SECTION_ORDER,
  type DiaryTimelineSection,
  type DiaryTimelineSectionId,
} from "@/lib/diaryTimelineSectionRules";

/** Map of section id → expanded boolean. Always keyed only by known ids. */
export type DiaryTimelineSectionExpandedState = Readonly<
  Record<DiaryTimelineSectionId, boolean>
>;

const KNOWN_SECTION_IDS: ReadonlySet<DiaryTimelineSectionId> = new Set(
  DIARY_TIMELINE_SECTION_ORDER,
);

function isKnownSectionId(id: unknown): id is DiaryTimelineSectionId {
  return typeof id === "string" && KNOWN_SECTION_IDS.has(id as DiaryTimelineSectionId);
}

/**
 * Default expansion: sections with entries start expanded, empty sections
 * start collapsed but remain reachable in the UI.
 */
export function buildDefaultDiaryTimelineSectionState<T>(
  sections: readonly DiaryTimelineSection<T>[] | null | undefined,
): DiaryTimelineSectionExpandedState {
  const out = {} as Record<DiaryTimelineSectionId, boolean>;
  for (const id of DIARY_TIMELINE_SECTION_ORDER) out[id] = false;
  if (Array.isArray(sections)) {
    for (const s of sections) {
      if (!isKnownSectionId(s?.id)) continue;
      out[s.id] = (s.count ?? 0) > 0;
    }
  }
  return out;
}

/**
 * Merge a saved partial state onto the default. Unknown saved keys are
 * ignored. Non-boolean saved values are ignored. Missing keys fall back
 * to the default for that section.
 */
export function mergeSavedDiaryTimelineSectionState<T>(
  sections: readonly DiaryTimelineSection<T>[] | null | undefined,
  saved: unknown,
): DiaryTimelineSectionExpandedState {
  const defaults = buildDefaultDiaryTimelineSectionState(sections);
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
    return defaults;
  }
  const merged = { ...defaults } as Record<DiaryTimelineSectionId, boolean>;
  for (const [key, value] of Object.entries(saved as Record<string, unknown>)) {
    if (!isKnownSectionId(key)) continue;
    if (typeof value !== "boolean") continue;
    merged[key] = value;
  }
  return merged;
}

/**
 * Serialize state for localStorage. Only known section IDs + booleans
 * are kept. Returns a compact JSON string. Throws never — caller decides
 * what to do with the result.
 */
export function serializeDiaryTimelineSectionState(
  state: DiaryTimelineSectionExpandedState | null | undefined,
): string {
  const safe = {} as Record<DiaryTimelineSectionId, boolean>;
  if (state && typeof state === "object") {
    for (const id of DIARY_TIMELINE_SECTION_ORDER) {
      const v = (state as Record<string, unknown>)[id];
      if (typeof v === "boolean") safe[id] = v;
    }
  }
  return JSON.stringify(safe);
}

/**
 * Parse a raw localStorage string. Malformed JSON, arrays, primitives,
 * or null return `null`. Caller should fall back to defaults.
 */
export function parseDiaryTimelineSectionState(
  raw: string | null | undefined,
): Partial<DiaryTimelineSectionExpandedState> | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const out: Partial<Record<DiaryTimelineSectionId, boolean>> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isKnownSectionId(key)) continue;
    if (typeof value !== "boolean") continue;
    out[key] = value;
  }
  return out;
}

export interface DiaryTimelineSectionSummary {
  totalEntries: number;
  nonEmptySections: number;
  otherCount: number;
  /** Pre-formatted parts the presenter joins; copy is plain text only. */
  parts: string[];
}

/**
 * Compact summary of the current categorized sections. "Other diary
 * entries" count is only included when non-zero per spec.
 */
export function buildDiaryTimelineSectionSummary<T>(
  sections: readonly DiaryTimelineSection<T>[] | null | undefined,
): DiaryTimelineSectionSummary {
  let totalEntries = 0;
  let nonEmptySections = 0;
  let otherCount = 0;
  if (Array.isArray(sections)) {
    for (const s of sections) {
      const count = typeof s?.count === "number" ? s.count : 0;
      totalEntries += count;
      if (count > 0) nonEmptySections += 1;
      if (s?.id === "other") otherCount = count;
    }
  }
  const parts: string[] = [
    `${totalEntries} ${totalEntries === 1 ? "entry" : "entries"}`,
    `${nonEmptySections} ${nonEmptySections === 1 ? "section" : "sections"} with entries`,
  ];
  if (otherCount > 0) {
    parts.push(
      `${otherCount} in Other diary entries`,
    );
  }
  return { totalEntries, nonEmptySections, otherCount, parts };
}

/** localStorage key for the Plant Relative Timeline category view. */
export const PLANT_RELATIVE_TIMELINE_SECTION_STATE_STORAGE_KEY =
  "verdant:plant-relative-timeline:category-sections:v1";
