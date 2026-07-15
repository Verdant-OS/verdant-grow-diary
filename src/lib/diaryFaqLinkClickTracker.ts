/**
 * diaryFaqLinkClickTracker — local, non-identifying counter for
 * "Related FAQ" link clicks from the diary.
 *
 * Storage rules (privacy):
 *   - localStorage only. No network. No Supabase. No cookies.
 *   - Stored payload is a plain map of { topic -> integer count }.
 *   - No user id, plant id, tent id, entry id, note text, timestamps,
 *     URLs, or session id are ever recorded.
 *   - Malformed or foreign values are ignored and replaced with an
 *     empty map — the tracker never throws in the render path.
 *
 * Consumers should treat this as a best-effort local UX signal, not a
 * source of truth or analytics event stream.
 */

import type { DiaryFaqTopic } from "@/lib/diaryFaqLinkRules";

export const DIARY_FAQ_LINK_CLICKS_STORAGE_KEY =
  "verdant.diaryFaqLinkClicks.v1";

const KNOWN_TOPICS: readonly DiaryFaqTopic[] = [
  "yellowing",
  "environment",
  "watering",
  "nutrients",
  "harvest",
];

export type DiaryFaqLinkClickCounts = Readonly<
  Partial<Record<DiaryFaqTopic, number>>
>;

export interface DiaryFaqLinkClickStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): DiaryFaqLinkClickStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function sanitize(raw: unknown): Record<DiaryFaqTopic, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") {
    return out as Record<DiaryFaqTopic, number>;
  }
  const src = raw as Record<string, unknown>;
  for (const topic of KNOWN_TOPICS) {
    const v = src[topic];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      // Cap at a reasonable ceiling to avoid overflow from tampering.
      out[topic] = Math.min(Math.floor(v), 1_000_000);
    }
  }
  return out as Record<DiaryFaqTopic, number>;
}

/**
 * Read the current click counts. Returns an empty object when storage
 * is unavailable, empty, or corrupted.
 */
export function readDiaryFaqLinkClickCounts(
  storage: DiaryFaqLinkClickStorage | null = defaultStorage(),
): DiaryFaqLinkClickCounts {
  if (!storage) return {};
  try {
    const raw = storage.getItem(DIARY_FAQ_LINK_CLICKS_STORAGE_KEY);
    if (!raw) return {};
    return sanitize(JSON.parse(raw));
  } catch {
    return {};
  }
}

/**
 * Increment the counter for a topic by 1 and persist. Returns the new
 * counts map. Silently no-ops on any storage error.
 */
export function recordDiaryFaqLinkClick(
  topic: DiaryFaqTopic,
  storage: DiaryFaqLinkClickStorage | null = defaultStorage(),
): DiaryFaqLinkClickCounts {
  if (!storage) return {};
  const current = { ...readDiaryFaqLinkClickCounts(storage) } as Record<
    DiaryFaqTopic,
    number
  >;
  current[topic] = Math.min((current[topic] ?? 0) + 1, 1_000_000);
  try {
    storage.setItem(
      DIARY_FAQ_LINK_CLICKS_STORAGE_KEY,
      JSON.stringify(current),
    );
  } catch {
    // Storage may be full or disabled — the click just doesn't get
    // recorded. The user-facing link still navigates.
  }
  return current;
}

/** Remove all recorded click counts. Silent on error. */
export function clearDiaryFaqLinkClickCounts(
  storage: DiaryFaqLinkClickStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(DIARY_FAQ_LINK_CLICKS_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export interface RankedDiaryFaqTopic {
  readonly topic: DiaryFaqTopic;
  readonly count: number;
}

/**
 * Sort topics by count descending, then by fixed topic order for
 * deterministic ties. Zero-count topics are excluded.
 */
export function rankDiaryFaqLinkClicks(
  counts: DiaryFaqLinkClickCounts,
): ReadonlyArray<RankedDiaryFaqTopic> {
  const rows: RankedDiaryFaqTopic[] = [];
  for (const topic of KNOWN_TOPICS) {
    const c = counts[topic] ?? 0;
    if (c > 0) rows.push({ topic, count: c });
  }
  rows.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return KNOWN_TOPICS.indexOf(a.topic) - KNOWN_TOPICS.indexOf(b.topic);
  });
  return rows;
}

export const DIARY_FAQ_TOPIC_LABELS: Readonly<Record<DiaryFaqTopic, string>> = {
  yellowing: "Yellowing leaves",
  environment: "Temperature & humidity",
  watering: "Watering",
  nutrients: "Nutrients & feeding",
  harvest: "Harvest timing",
};
