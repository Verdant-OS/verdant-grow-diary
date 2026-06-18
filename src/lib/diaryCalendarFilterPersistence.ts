/**
 * diaryCalendarFilterPersistence — pure, client-only helpers that
 * remember the user's selected Diary Calendar filter across navigation.
 *
 * Hard constraints:
 *   - No Supabase, no fetch, no React, no write helpers.
 *   - localStorage only. Never throws (storage may be disabled / SSR).
 *   - Validates stored values against the known DiaryCalendarFilter
 *     union; any other value falls back to null so callers can use
 *     their default.
 *   - No user preference table is created. This is local UX memory.
 */
import type { DiaryCalendarFilter } from "@/lib/diaryCalendarViewModel";

export const DIARY_CALENDAR_FILTER_STORAGE_KEY =
  "verdant.diaryCalendar.filter.v1";

const ALLOWED: ReadonlySet<DiaryCalendarFilter> = new Set<DiaryCalendarFilter>([
  "all",
  "watering",
  "feeding",
  "diagnosis",
  "environment",
]);

export function isDiaryCalendarFilter(value: unknown): value is DiaryCalendarFilter {
  return typeof value === "string" && (ALLOWED as ReadonlySet<string>).has(value);
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.localStorage;
    if (!s) return null;
    return s;
  } catch {
    return null;
  }
}

export function readPersistedDiaryCalendarFilter(): DiaryCalendarFilter | null {
  const s = safeStorage();
  if (!s) return null;
  try {
    const raw = s.getItem(DIARY_CALENDAR_FILTER_STORAGE_KEY);
    if (raw == null) return null;
    return isDiaryCalendarFilter(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writePersistedDiaryCalendarFilter(
  value: DiaryCalendarFilter,
): void {
  if (!isDiaryCalendarFilter(value)) return;
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(DIARY_CALENDAR_FILTER_STORAGE_KEY, value);
  } catch {
    // ignore — quota / disabled storage is non-fatal
  }
}

export function clearPersistedDiaryCalendarFilter(): void {
  const s = safeStorage();
  if (!s) return;
  try {
    s.removeItem(DIARY_CALENDAR_FILTER_STORAGE_KEY);
  } catch {
    // ignore
  }
}
