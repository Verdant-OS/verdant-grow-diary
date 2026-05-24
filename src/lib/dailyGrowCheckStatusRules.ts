/**
 * Pure rules for deriving a conservative "Daily Grow Check" status
 * from existing manual sensor readings and QuickLog diary entries.
 *
 * Read-only. No persistence. No new schema. No writes.
 *
 * We never claim a check is "completed" — we only describe activity
 * that has been observed today.
 */

export type DailyCheckActivityKind =
  | "none"
  | "manual-only"
  | "quicklog-only"
  | "both";

export interface DailyCheckManualInput {
  ts: string | null | undefined;
  created_at?: string | null | undefined;
  id?: string | null | undefined;
  tent_id?: string | null | undefined;
  source?: string | null | undefined;
}

export interface DailyCheckDiaryInput {
  entry_at: string | null | undefined;
  created_at?: string | null | undefined;
  id?: string | null | undefined;
  tent_id?: string | null | undefined;
  plant_id?: string | null | undefined;
}

export interface DailyCheckStatusInput {
  now: Date;
  manualReadings: DailyCheckManualInput[];
  diaryEntries: DailyCheckDiaryInput[];
  /** Window in minutes that links a manual snapshot + QuickLog as one check. */
  combineWindowMinutes?: number;
}

export interface DailyCheckStatus {
  kind: DailyCheckActivityKind;
  /** ISO timestamp of the most recent contributing activity, or null. */
  lastActivityAt: string | null;
  lastManualAt: string | null;
  lastQuickLogAt: string | null;
  /** Tent id derived from the most recent contributing activity. */
  tentId: string | null;
  /** Plant id derived from the most recent contributing diary entry. */
  plantId: string | null;
  /** Short label safe to render in the UI. Never claims "completed". */
  label: string;
  /** True if the activity occurred today (local to `now`). */
  occurredToday: boolean;
}

export const DAILY_CHECK_LABELS = {
  none: "No check activity today",
  manualOnly: "Manual snapshot added",
  quickLogOnly: "Quick Log added",
  both: "Daily check activity detected",
} as const;

function startOfLocalDay(d: Date): number {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  return x.getTime();
}

function parseTs(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/**
 * Sort newest-first using: primary ts desc, then created_at desc, then id desc.
 */
function sortNewestFirst<T extends { _primary: number; _created: number; _id: string }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    if (b._primary !== a._primary) return b._primary - a._primary;
    if (b._created !== a._created) return b._created - a._created;
    if (a._id < b._id) return 1;
    if (a._id > b._id) return -1;
    return 0;
  });
}

export function deriveDailyGrowCheckStatus(
  input: DailyCheckStatusInput,
): DailyCheckStatus {
  const windowMs = Math.max(1, input.combineWindowMinutes ?? 60) * 60_000;
  const dayStart = startOfLocalDay(input.now);

  const manuals = sortNewestFirst(
    (input.manualReadings ?? [])
      .map((r) => {
        const p = parseTs(r.ts);
        return p === null
          ? null
          : {
              _primary: p,
              _created: parseTs(r.created_at) ?? p,
              _id: String(r.id ?? ""),
              tent_id: r.tent_id ?? null,
            };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x._primary >= dayStart),
  );

  const diary = sortNewestFirst(
    (input.diaryEntries ?? [])
      .map((e) => {
        const p = parseTs(e.entry_at);
        return p === null
          ? null
          : {
              _primary: p,
              _created: parseTs(e.created_at) ?? p,
              _id: String(e.id ?? ""),
              tent_id: e.tent_id ?? null,
              plant_id: e.plant_id ?? null,
            };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x._primary >= dayStart),
  );

  const hasManual = manuals.length > 0;
  const hasDiary = diary.length > 0;

  if (!hasManual && !hasDiary) {
    return {
      kind: "none",
      lastActivityAt: null,
      lastManualAt: null,
      lastQuickLogAt: null,
      tentId: null,
      plantId: null,
      label: DAILY_CHECK_LABELS.none,
      occurredToday: false,
    };
  }

  const topManual = manuals[0] ?? null;
  const topDiary = diary[0] ?? null;
  const lastManualAt = topManual ? new Date(topManual._primary).toISOString() : null;
  const lastQuickLogAt = topDiary ? new Date(topDiary._primary).toISOString() : null;

  const close =
    topManual && topDiary && Math.abs(topManual._primary - topDiary._primary) <= windowMs;

  let kind: DailyCheckActivityKind;
  let label: string;
  if (close) {
    kind = "both";
    label = DAILY_CHECK_LABELS.both;
  } else if (hasManual && !hasDiary) {
    kind = "manual-only";
    label = DAILY_CHECK_LABELS.manualOnly;
  } else if (!hasManual && hasDiary) {
    kind = "quicklog-only";
    label = DAILY_CHECK_LABELS.quickLogOnly;
  } else {
    // Both exist but not close together — surface the more recent one conservatively.
    if ((topManual?._primary ?? 0) >= (topDiary?._primary ?? 0)) {
      kind = "manual-only";
      label = DAILY_CHECK_LABELS.manualOnly;
    } else {
      kind = "quicklog-only";
      label = DAILY_CHECK_LABELS.quickLogOnly;
    }
  }

  const newest =
    (topManual?._primary ?? -Infinity) >= (topDiary?._primary ?? -Infinity)
      ? topManual
      : topDiary;

  return {
    kind,
    lastActivityAt: newest ? new Date(newest._primary).toISOString() : null,
    lastManualAt,
    lastQuickLogAt,
    tentId: newest?.tent_id ?? null,
    plantId: topDiary?.plant_id ?? null,
    label,
    occurredToday: true,
  };
}
