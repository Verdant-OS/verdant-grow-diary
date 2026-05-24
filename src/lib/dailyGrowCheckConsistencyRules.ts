/**
 * Pure rules for a read-only Daily Grow Check consistency indicator.
 *
 * Reuses buildDailyGrowCheckHistory so the activity basis is identical
 * to the Daily Grow Check History card. No writes, no persistence,
 * never claims a check is finished, and never infers plant health from
 * check frequency.
 */
import {
  buildDailyGrowCheckHistory,
  type DailyHistoryInput,
  type DailyHistoryRow,
} from "@/lib/dailyGrowCheckHistoryRules";

export const CONSISTENCY_WINDOW_DAYS = 7;

export interface ConsistencyInput
  extends Omit<DailyHistoryInput, "days"> {
  /** Window in days for the "X of last N days" metric. Defaults to 7. */
  windowDays?: number;
}

/**
 * Method used to satisfy today's Daily Grow Check.
 *  - "note":            only a QuickLog plant note exists today
 *  - "sensor-snapshot": only a current-tent manual sensor snapshot exists today
 *  - "both":            both a note AND a current-tent manual snapshot exist today
 *  - "none":            nothing counts toward today's check
 * Never implies plant health, completion, or quality.
 */
export type TodayCheckMethod = "none" | "note" | "sensor-snapshot" | "both";

export interface ConsistencySummary {
  windowDays: number;
  checkedDays: number;
  currentStreak: number;
  missedDays: number;
  todayHasActivity: boolean;
  /** What kinds of activity counted for today. Derived, read-only. */
  todayMethod: TodayCheckMethod;
  hasAnyActivity: boolean;
  /** Includes any tent-level sensor day where multiple plants share the tent. */
  tentLevelDays: number;
  /** Day rows newest-first (today index 0). */
  rows: DailyHistoryRow[];
}

/**
 * Short, grower-friendly method label. Returns null when nothing counts so
 * callers can fall back to existing "Needs check" wording.
 */
export function formatTodayCheckMethodLabel(
  method: TodayCheckMethod,
): string | null {
  switch (method) {
    case "note":
      return "Checked by note";
    case "sensor-snapshot":
      return "Checked by sensor snapshot";
    case "both":
      return "Checked by note + sensor snapshot";
    case "none":
    default:
      return null;
  }
}

const ACTIVE_KINDS = new Set<DailyHistoryRow["kind"]>([
  "manual-only",
  "quicklog-only",
  "both",
  "tent-manual-only",
]);

export function buildDailyGrowCheckConsistency(
  input: ConsistencyInput,
): ConsistencySummary {
  const windowDays = Math.max(
    1,
    Math.min(14, Math.floor(input.windowDays ?? CONSISTENCY_WINDOW_DAYS)),
  );

  const rows = buildDailyGrowCheckHistory({
    now: input.now,
    days: windowDays,
    plantId: input.plantId,
    currentTentId: input.currentTentId,
    plantsInTentCount: input.plantsInTentCount,
    manualReadings: input.manualReadings,
    diaryEntries: input.diaryEntries,
    combineWindowMinutes: input.combineWindowMinutes,
  });

  let checkedDays = 0;
  let tentLevelDays = 0;
  for (const r of rows) {
    if (ACTIVE_KINDS.has(r.kind)) checkedDays += 1;
    if (r.tentLevel) tentLevelDays += 1;
  }

  // Current streak: count consecutive active days from today (index 0)
  // backward. If today has no activity, the current streak is 0.
  let currentStreak = 0;
  for (const r of rows) {
    if (ACTIVE_KINDS.has(r.kind)) currentStreak += 1;
    else break;
  }

  const todayRow = rows[0];
  const todayHasActivity = !!todayRow && ACTIVE_KINDS.has(todayRow.kind);

  let todayMethod: TodayCheckMethod = "none";
  if (todayHasActivity && todayRow) {
    if (todayRow.hasManual && todayRow.hasQuickLog) todayMethod = "both";
    else if (todayRow.hasManual) todayMethod = "sensor-snapshot";
    else if (todayRow.hasQuickLog) todayMethod = "note";
  }

  return {
    windowDays,
    checkedDays,
    currentStreak,
    missedDays: windowDays - checkedDays,
    todayHasActivity,
    todayMethod,
    hasAnyActivity: checkedDays > 0,
    tentLevelDays,
    rows,
  };
}

/**
 * Method classification for a single day in the 7-day breakdown.
 *  - "note":   only a plant QuickLog counted that day
 *  - "sensor": only a current-tent manual sensor snapshot counted
 *  - "both":   both kinds counted
 *  - "missed": nothing counted
 * Never implies plant health, completion, or quality.
 */
export type DailyMethodBreakdownMethod = "note" | "sensor" | "both" | "missed";

export interface DailyMethodBreakdownDay {
  dayKey: string;
  label: string;
  method: DailyMethodBreakdownMethod;
}

export type DailyMethodBreakdownOrder = "oldest-first" | "newest-first";

/**
 * Derive a deterministic 7-day method breakdown from an existing
 * ConsistencySummary. Pure — no fetching, no writes.
 */
export function buildDailyMethodBreakdown(
  summary: Pick<ConsistencySummary, "rows">,
  order: DailyMethodBreakdownOrder = "oldest-first",
): DailyMethodBreakdownDay[] {
  const days: DailyMethodBreakdownDay[] = summary.rows.map((r) => {
    let method: DailyMethodBreakdownMethod;
    if (r.hasManual && r.hasQuickLog) method = "both";
    else if (r.hasManual) method = "sensor";
    else if (r.hasQuickLog) method = "note";
    else method = "missed";
    return { dayKey: r.dayKey, label: r.label, method };
  });
  // rows are newest-first; reverse for oldest-first.
  if (order === "oldest-first") days.reverse();
  return days;
}

export function formatDailyMethodBreakdownLabel(
  method: DailyMethodBreakdownMethod,
): string {
  switch (method) {
    case "note":
      return "Note";
    case "sensor":
      return "Sensor";
    case "both":
      return "Both";
    case "missed":
    default:
      return "Missed";
  }
}

