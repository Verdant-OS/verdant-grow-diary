import type { QuickLogTimelineEntry } from "@/lib/quickLogTimelineGroupingViewModel";

export const QUICK_LOG_GROUPED_TIMELINE_FILTERS = [
  "all",
  "water",
  "note",
  "environment",
  "ai-doctor-evidence",
] as const;

export type QuickLogGroupedTimelineFilter = (typeof QUICK_LOG_GROUPED_TIMELINE_FILTERS)[number];

export const QUICK_LOG_GROUPED_TIMELINE_FILTER_LABELS: Record<
  QuickLogGroupedTimelineFilter,
  string
> = {
  all: "All",
  water: "Water",
  note: "Note",
  environment: "Environment",
  "ai-doctor-evidence": "AI Doctor evidence",
};

export function isQuickLogGroupedTimelineFilter(v: unknown): v is QuickLogGroupedTimelineFilter {
  return (
    typeof v === "string" &&
    (QUICK_LOG_GROUPED_TIMELINE_FILTERS as ReadonlyArray<string>).includes(v)
  );
}

export function entryHasAiDoctorPhase1Evidence(entry: QuickLogTimelineEntry): boolean {
  if (entry.kind === "environment") return false;
  return !!entry.action.aiDoctorPhase1Evidence;
}

export function entryMatchesQuickLogGroupedTimelineFilter(
  entry: QuickLogTimelineEntry,
  filter: QuickLogGroupedTimelineFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "ai-doctor-evidence") {
    return entryHasAiDoctorPhase1Evidence(entry);
  }
  if (filter === "water") {
    if (entry.kind === "grouped") return entry.action.kind === "water";
    if (entry.kind === "action") return entry.action.kind === "water";
    return false;
  }
  if (filter === "note") {
    if (entry.kind === "grouped") return entry.action.kind === "note";
    if (entry.kind === "action") return entry.action.kind === "note";
    return false;
  }
  if (entry.kind === "environment") return true;
  if (entry.kind === "grouped") return true;
  return false;
}

export function filterQuickLogGroupedTimelineEntries(
  entries: ReadonlyArray<QuickLogTimelineEntry>,
  filter: QuickLogGroupedTimelineFilter,
): QuickLogTimelineEntry[] {
  return entries.filter((e) => entryMatchesQuickLogGroupedTimelineFilter(e, filter));
}

export const QUICK_LOG_GROUPED_TIMELINE_EMPTY_OVERALL_TEXT = "No QuickLog entries yet.";
export const QUICK_LOG_GROUPED_TIMELINE_EMPTY_FILTERED_TEXT =
  "No QuickLog entries match this filter.";
export const QUICK_LOG_GROUPED_TIMELINE_AI_EVIDENCE_EMPTY_TITLE_TEXT =
  "No AI Doctor Phase 1 evidence yet.";
export const QUICK_LOG_GROUPED_TIMELINE_AI_EVIDENCE_EMPTY_HINT_TEXT =
  "Saved Phase 1 evidence will appear here after you review AI Doctor context and save it as evidence.";
export const QUICK_LOG_GROUPED_TIMELINE_AI_EVIDENCE_RESULTS_BUTTON_LABEL = "Open AI Doctor Results";
export const QUICK_LOG_GROUPED_TIMELINE_CREATE_BUTTON_LABEL = "Create Quick Log";

export const QUICK_LOG_GROUPED_TIMELINE_EMPTY_TITLE_TEXT = "No timeline entries yet.";
export const QUICK_LOG_GROUPED_TIMELINE_EMPTY_HINT_TEXT =
  "Add a Quick Log to start this plant's history.";

export const QUICK_LOG_MANUAL_SOURCE_LABEL = "Manual";
export const QUICK_LOG_DEMO_SOURCE_LABEL = "Demo data";
export const QUICK_LOG_SAMPLE_SOURCE_LABEL = "Sample timeline entry";

export const QUICK_LOG_ACTION_LABELS = {
  water: "Watering",
  note: "Note",
} as const;

export function quickLogActionLabel(kind: "water" | "note"): string {
  return QUICK_LOG_ACTION_LABELS[kind];
}

const QUICK_LOG_LOCAL_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const QUICK_LOG_LOCAL_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface QuickLogLocalClockParts {
  year: number;
  monthIndex: number;
  day: number;
  hour24: number;
  minute: number;
}

/**
 * Wall-clock parts in the runtime timezone. Stored instants stay UTC ISO;
 * this reads the viewer's local calendar only. The numeric Date API
 * re-reads `process.env.TZ`, so tests can pin America/Chicago.
 */
export function quickLogLocalClockParts(
  iso: string | null | undefined,
): QuickLogLocalClockParts | null {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return {
    year: date.getFullYear(),
    monthIndex: date.getMonth(),
    day: date.getDate(),
    hour24: date.getHours(),
    minute: date.getMinutes(),
  };
}

/** Local calendar day `YYYY-MM-DD`, or null when the instant cannot be read. */
export function quickLogLocalDayKey(iso: string | null | undefined): string | null {
  const parts = quickLogLocalClockParts(iso);
  if (!parts) return null;
  const month = String(parts.monthIndex + 1).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

/**
 * Viewer-local clock for a stored UTC instant.
 * Example in America/Chicago: `2026-10-09T02:30:00.000Z` → `Oct 8, 2026, 9:30 PM`.
 * Empty input stays empty. An unparseable string is returned unchanged.
 */
export function formatQuickLogOccurredAt(iso: string | null | undefined): string {
  if (typeof iso !== "string" || iso.length === 0) return "";
  const parts = quickLogLocalClockParts(iso);
  if (!parts) return iso;
  const month = QUICK_LOG_LOCAL_MONTHS[parts.monthIndex] ?? "";
  let hour12 = parts.hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  const minute = String(parts.minute).padStart(2, "0");
  const meridiem = parts.hour24 >= 12 ? "PM" : "AM";
  return `${month} ${parts.day}, ${parts.year}, ${hour12}:${minute} ${meridiem}`;
}

export interface QuickLogLocalDayGroup<T> {
  /** `YYYY-MM-DD` in the viewer timezone, or `""` when the instant is unreadable. */
  dayKey: string;
  /** `Today`, `Yesterday`, or a local calendar label such as `Thu, Oct 8`. */
  label: string;
  items: T[];
}

export function formatQuickLogLocalDayLabel(dayKey: string, now: Date): string {
  if (!dayKey) return "Unknown date";
  const todayKey = quickLogLocalDayKey(now.toISOString());
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayKey = quickLogLocalDayKey(yesterday.toISOString());
  if (dayKey === todayKey) return "Today";
  if (dayKey === yesterdayKey) return "Yesterday";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return dayKey;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const local = new Date(year, monthIndex, day);
  if (local.getFullYear() !== year || local.getMonth() !== monthIndex || local.getDate() !== day) {
    return dayKey;
  }
  const weekday = QUICK_LOG_LOCAL_WEEKDAYS[local.getDay()] ?? "";
  const month = QUICK_LOG_LOCAL_MONTHS[monthIndex] ?? "";
  return `${weekday}, ${month} ${day}`;
}

/**
 * Put each demo row in the local-day run that matches its instant.
 * Real rows keep their relative order. Demo rows follow the real rows of
 * that day, in the order the demos were given. A day that has only demo
 * rows is inserted by descending local day key. An unreadable instant
 * stays after the dated rows.
 */
export function orderQuickLogTimelineDemosIntoLocalDays<T>(
  items: readonly T[],
  occurredAtOf: (item: T) => string | null | undefined,
  isDemo: (item: T) => boolean,
): T[] {
  const reals: T[] = [];
  const demos: T[] = [];
  for (const item of items) {
    if (isDemo(item)) demos.push(item);
    else reals.push(item);
  }
  if (demos.length === 0) return reals.slice();

  const buckets: { dayKey: string; items: T[] }[] = [];
  for (const item of reals) {
    const dayKey = quickLogLocalDayKey(occurredAtOf(item)) ?? "";
    const last = buckets[buckets.length - 1];
    if (last && last.dayKey === dayKey) last.items.push(item);
    else buckets.push({ dayKey, items: [item] });
  }

  const firstIndexByDay = new Map<string, number>();
  const reindex = () => {
    firstIndexByDay.clear();
    buckets.forEach((bucket, index) => {
      if (!firstIndexByDay.has(bucket.dayKey)) firstIndexByDay.set(bucket.dayKey, index);
    });
  };
  reindex();

  for (const demo of demos) {
    const dayKey = quickLogLocalDayKey(occurredAtOf(demo)) ?? "";
    const existing = firstIndexByDay.get(dayKey);
    if (existing !== undefined) {
      buckets[existing]?.items.push(demo);
      continue;
    }
    const index = indexForNewLocalDay(buckets, dayKey);
    buckets.splice(index, 0, { dayKey, items: [demo] });
    reindex();
  }

  return buckets.flatMap((bucket) => bucket.items);
}

function indexForNewLocalDay(buckets: readonly { dayKey: string }[], dayKey: string): number {
  if (dayKey.length === 0) return buckets.length;
  for (let i = 0; i < buckets.length; i++) {
    const key = buckets[i]?.dayKey ?? "";
    if (key.length === 0 || dayKey > key) return i;
  }
  return buckets.length;
}

/**
 * Bucket already-ordered timeline rows by the viewer's local calendar day.
 * Order inside a day, and the order days are first encountered, are preserved.
 */
export function groupByQuickLogLocalDay<T>(
  items: readonly T[],
  occurredAtOf: (item: T) => string | null | undefined,
  options?: { now?: Date },
): QuickLogLocalDayGroup<T>[] {
  const now = options?.now ?? new Date();
  const groups: QuickLogLocalDayGroup<T>[] = [];
  for (const item of items) {
    const dayKey = quickLogLocalDayKey(occurredAtOf(item)) ?? "";
    const last = groups[groups.length - 1];
    if (last && last.dayKey === dayKey) {
      last.items.push(item);
      continue;
    }
    groups.push({
      dayKey,
      label: formatQuickLogLocalDayLabel(dayKey, now),
      items: [item],
    });
  }
  return groups;
}

export function quickLogSourceAccessibleLabel(sourceLabel: string): string {
  return `Source: ${sourceLabel}`;
}

export function quickLogOccurredAtAccessibleLabel(formattedOccurredAt: string): string {
  return `Occurred at ${formattedOccurredAt}`;
}
