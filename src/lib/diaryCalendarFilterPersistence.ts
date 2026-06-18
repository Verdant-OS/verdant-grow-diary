/**
 * diaryCalendarFilterPersistence — pure, client-only helpers that
 * remember the user's selected Diary Calendar filter across navigation.
 *
 * Hard constraints:
 *   - No Supabase, no fetch, no React, no write helpers.
 *   - localStorage only. Never throws (storage may be disabled / SSR).
 *   - Validates stored values against the known DiaryCalendarFilter
 *     union; any invalid / corrupt / unknown-version payload falls back
 *     to null so callers can use their default ("all").
 *   - No user preference table is created. This is local UX memory.
 *
 * Storage format (current):
 *   key:   "verdant.diaryCalendar.filter.v1"
 *   value: JSON envelope `{ version: 1, value: <DiaryCalendarFilter> }`
 *
 * Backward compatibility:
 *   Older builds wrote the raw filter string directly into the same key
 *   (e.g. "environment"). On read we still accept that legacy shape and
 *   transparently migrate it to the envelope on the next write.
 */
import type { DiaryCalendarFilter } from "@/lib/diaryCalendarViewModel";

export const DIARY_CALENDAR_FILTER_STORAGE_KEY =
  "verdant.diaryCalendar.filter.v1";

export const DIARY_CALENDAR_FILTER_PERSIST_VERSION = 1 as const;

interface DiaryCalendarFilterEnvelope {
  version: typeof DIARY_CALENDAR_FILTER_PERSIST_VERSION;
  value: DiaryCalendarFilter;
}

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

function parseEnvelope(raw: string): DiaryCalendarFilter | null {
  // 1) Legacy raw-string shape: just the filter token.
  if (isDiaryCalendarFilter(raw)) return raw;
  // 2) Versioned JSON envelope.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as { version?: unknown; value?: unknown };
  if (obj.version !== DIARY_CALENDAR_FILTER_PERSIST_VERSION) return null;
  return isDiaryCalendarFilter(obj.value) ? obj.value : null;
}

export function readPersistedDiaryCalendarFilter(): DiaryCalendarFilter | null {
  const s = safeStorage();
  if (!s) return null;
  let raw: string | null = null;
  try {
    raw = s.getItem(DIARY_CALENDAR_FILTER_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw == null) return null;
  const value = parseEnvelope(raw);
  if (value == null) {
    // Corrupt / unknown version / invalid value — clear so we don't keep
    // re-parsing garbage on every mount.
    try {
      s.removeItem(DIARY_CALENDAR_FILTER_STORAGE_KEY);
    } catch {
      // ignore
    }
    return null;
  }
  return value;
}

export function writePersistedDiaryCalendarFilter(
  value: DiaryCalendarFilter,
): void {
  if (!isDiaryCalendarFilter(value)) return;
  const s = safeStorage();
  if (!s) return;
  const envelope: DiaryCalendarFilterEnvelope = {
    version: DIARY_CALENDAR_FILTER_PERSIST_VERSION,
    value,
  };
  try {
    s.setItem(DIARY_CALENDAR_FILTER_STORAGE_KEY, JSON.stringify(envelope));
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
