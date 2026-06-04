/**
 * timelineDayGroupingViewModel — pure view-model that groups timeline
 * entries by local calendar day with human-readable headers.
 *
 * Hard constraints:
 *  - Pure: no I/O, no React, no side effects.
 *  - Clock is injectable for deterministic tests.
 *  - Never invents stage data; only surfaces what already exists.
 *  - Preserves upstream sort order inside each day.
 */
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";

export interface TimelineDayGroup {
  /** Stable day key in YYYY-MM-DD format (UTC date extracted from local midnight). */
  dayKey: string;
  /** Human label: "Today", "Yesterday", or formatted date. */
  label: string;
  /** Number of events in this day group. */
  count: number;
  /** Items belonging to this day, in upstream order. */
  items: TimelineMemoryItem[];
}

export interface BuildTimelineDayGroupsOptions {
  /** Injectable clock for deterministic tests. Defaults to Date.now(). */
  now?: Date | number | (() => Date | number);
  /** Locale for date formatting. Defaults to undefined (runtime default). */
  locale?: string;
}

function resolveNow(now: BuildTimelineDayGroupsOptions["now"]): number {
  if (now === undefined) return Date.now();
  if (typeof now === "function") {
    const r = now();
    return r instanceof Date ? r.getTime() : Number(r);
  }
  return now instanceof Date ? now.getTime() : Number(now);
}

function toLocalDateKey(ts: string | Date): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isToday(key: string, nowMs: number): boolean {
  return key === toLocalDateKey(new Date(nowMs));
}

function isYesterday(key: string, nowMs: number): boolean {
  const d = new Date(nowMs);
  d.setDate(d.getDate() - 1);
  return key === toLocalDateKey(d);
}

function formatDateLabel(key: string, locale: string | undefined): string {
  if (!key) return "Unknown date";
  const [y, m, day] = key.split("-").map(Number);
  const d = new Date(y, m - 1, day);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(d);
  } catch {
    return key;
  }
}

/**
 * Group a sorted list of timeline items by local calendar day.
 *
 * Items must already be sorted (occurredAt descending). Order inside
 * each day is preserved exactly.
 *
 * Returns groups in descending chronological order (newest day first).
 */
export function buildTimelineDayGroups(
  items: ReadonlyArray<TimelineMemoryItem>,
  options: BuildTimelineDayGroupsOptions = {},
): TimelineDayGroup[] {
  const nowMs = resolveNow(options.now);

  // First pass: build ordered map of dayKey -> items
  const groups = new Map<string, TimelineMemoryItem[]>();
  const orderedKeys: string[] = [];

  for (const item of items) {
    const key = toLocalDateKey(item.occurredAt);
    if (!key) continue; // drop undated items silently
    if (!groups.has(key)) {
      groups.set(key, []);
      orderedKeys.push(key);
    }
    groups.get(key)!.push(item);
  }

  return orderedKeys.map((key) => {
    const dayItems = groups.get(key)!;
    let label: string;
    if (isToday(key, nowMs)) {
      label = "Today";
    } else if (isYesterday(key, nowMs)) {
      label = "Yesterday";
    } else {
      label = formatDateLabel(key, options.locale);
    }
    return {
      dayKey: key,
      label,
      count: dayItems.length,
      items: dayItems,
    };
  });
}
