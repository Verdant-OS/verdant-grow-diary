/**
 * plantLastActivityRules — the "Last activity" line on Plant Detail.
 *
 * QA 2026-09-24 (BUG-005): the line read "Updated 3 months ago" for a plant
 * created and logged today, because it formatted the plant's start date.
 * It now describes the newest diary entry for the plant, and says so
 * honestly when that read is loading, failed, or empty.
 *
 * Pure: `now` is injected.
 */
import { formatDistance } from "date-fns";
import { QUICK_LOG_HARVEST_CURE_LABELS } from "@/constants/quickLogEventTypes";
import { EVENT_TYPE_MAP } from "@/lib/diary";
import { normalizeDiaryEntries } from "@/lib/diaryEntryRules";
import { buildRecentQuickLogActivity } from "@/lib/quickLogHistoryRules";

/** A diary row: only the times are read directly; the rest goes to the normalizer. */
type ActivityRow = { entry_at?: string | null; created_at?: string | null; [key: string]: unknown };

export interface PlantLastActivityInput {
  status: "loading" | "error" | "ready";
  rows: ReadonlyArray<ActivityRow> | null | undefined;
  now: Date;
}

/** What the newest diary entry was, for the "Last activity" line. */
export interface PlantLastActivitySummary {
  /** Diary event type, e.g. "watering"; "note" when the row has none. */
  eventType: string;
  /** First line of the entry's note (readings block removed), or "". */
  text: string;
}

export const PLANT_LAST_ACTIVITY_TEXT_MAX = 140;

export const PLANT_LAST_ACTIVITY_LOADING = "Checking recent activity…";
export const PLANT_LAST_ACTIVITY_UNAVAILABLE = "Recent activity unavailable.";
export const PLANT_LAST_ACTIVITY_NONE = "No activity logged yet.";

function entryTime(row: { entry_at?: string | null; created_at?: string | null }): number | null {
  for (const value of [row.entry_at, row.created_at]) {
    if (typeof value === "string") {
      const ms = Date.parse(value);
      if (Number.isFinite(ms)) return ms;
    }
  }
  return null;
}

function createdTime(row: ActivityRow): number {
  const ms = typeof row.created_at === "string" ? Date.parse(row.created_at) : Number.NaN;
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

function rowId(row: ActivityRow): string {
  return typeof row.id === "string" ? row.id : "";
}

/**
 * True when `a` is the newer activity: entry time, then created_at, then id
 * (Codex review on #1683). Companion rows from one Quick Log action can share
 * an entry time, and the read orders by entry_at only, so the order rows
 * arrive in must never decide which one is shown.
 */
function isNewerActivity(a: { row: ActivityRow; ms: number }, b: { row: ActivityRow; ms: number }) {
  if (a.ms !== b.ms) return a.ms > b.ms;
  const createdA = createdTime(a.row);
  const createdB = createdTime(b.row);
  if (createdA !== createdB) return createdA > createdB;
  return rowId(a.row) > rowId(b.row);
}

/** The newest row by entry time, with a deterministic tie-break, or null. */
function newestActivity<T extends ActivityRow>(
  rows: ReadonlyArray<T>,
): { row: T; ms: number } | null {
  let newest: { row: T; ms: number } | null = null;
  for (const row of rows) {
    const ms = entryTime(row);
    if (ms === null) continue;
    const candidate = { row, ms };
    if (newest === null || isNewerActivity(candidate, newest)) newest = candidate;
  }
  return newest;
}

export function resolvePlantLastActivityLabel(input: PlantLastActivityInput): string {
  if (input.status === "loading") return PLANT_LAST_ACTIVITY_LOADING;
  if (input.status === "error" || !Array.isArray(input.rows))
    return PLANT_LAST_ACTIVITY_UNAVAILABLE;
  const latest = newestActivity(input.rows)?.ms ?? null;
  if (latest === null) return PLANT_LAST_ACTIVITY_NONE;
  const nowMs = input.now.getTime();
  // A clock-skewed future entry is still the latest activity, never "in 2 minutes".
  const at = new Date(Math.min(latest, nowMs));
  return `Updated ${formatDistance(at, input.now, { addSuffix: true })}`;
}

/**
 * The activity the "Last activity" time describes: the same newest diary row
 * the label is computed from (Codex review on #1683). The plant's profile note
 * (`plants.last_note`) is a separate grower field that Quick Log never
 * updates, so it must not be shown as this activity. Null when the read is
 * not ready, is empty, or the row cannot be read as a diary entry.
 */
export function resolvePlantLastActivitySummary(
  input: PlantLastActivityInput,
): PlantLastActivitySummary | null {
  if (input.status !== "ready" || !Array.isArray(input.rows)) return null;
  const newest = newestActivity(input.rows);
  if (!newest) return null;
  const [entry] = buildRecentQuickLogActivity(
    normalizeDiaryEntries({ rawEntries: [newest.row], now: input.now.getTime() }),
    1,
  );
  if (!entry) return null;
  const firstLine =
    entry.noteBody
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  const text =
    firstLine.length > PLANT_LAST_ACTIVITY_TEXT_MAX
      ? `${firstLine.slice(0, PLANT_LAST_ACTIVITY_TEXT_MAX - 1).trimEnd()}…`
      : firstLine;
  return { eventType: entry.eventType, text };
}

/** Types the diary type table lacks, with the names Quick Log gives them. */
const LAST_ACTIVITY_EXTRA_TYPE_LABELS: Readonly<Record<string, string>> = {
  note: "Note",
  cure_check: QUICK_LOG_HARVEST_CURE_LABELS.cure_check,
};

function ownLabel(table: Readonly<Record<string, { label: string } | string>>, key: string) {
  if (!Object.prototype.hasOwnProperty.call(table, key)) return null;
  const entry = table[key];
  return typeof entry === "string" ? entry : entry.label;
}

/**
 * The name shown for the last activity's type (Codex review on #1683). The
 * diary type table has no "note" (a row without a type) or "cure_check" (a
 * Quick Log type), and its lookup falls back to "Observation" for both. Any
 * other type it lacks reads "Activity", never a type the row is not.
 */
export function plantLastActivityTypeLabel(eventType: string): string {
  return (
    ownLabel(LAST_ACTIVITY_EXTRA_TYPE_LABELS, eventType) ??
    ownLabel(EVENT_TYPE_MAP, eventType) ??
    "Activity"
  );
}
