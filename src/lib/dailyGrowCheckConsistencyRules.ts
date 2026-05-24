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

export interface ConsistencySummary {
  windowDays: number;
  checkedDays: number;
  currentStreak: number;
  missedDays: number;
  todayHasActivity: boolean;
  hasAnyActivity: boolean;
  /** Includes any tent-level sensor day where multiple plants share the tent. */
  tentLevelDays: number;
  /** Day rows newest-first (today index 0). */
  rows: DailyHistoryRow[];
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

  const todayHasActivity = rows.length > 0 && ACTIVE_KINDS.has(rows[0].kind);

  return {
    windowDays,
    checkedDays,
    currentStreak,
    missedDays: windowDays - checkedDays,
    todayHasActivity,
    hasAnyActivity: checkedDays > 0,
    tentLevelDays,
    rows,
  };
}
