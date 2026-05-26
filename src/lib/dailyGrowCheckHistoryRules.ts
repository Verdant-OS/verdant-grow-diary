/**
 * Pure rules for deriving a plant's Daily Grow Check history.
 *
 * Read-only. No writes. No new persistence. Never claims a check is finished.
 *
 * History is derived conservatively from existing activity:
 *   - QuickLog diary entries scoped to the plant.
 *   - Manual sensor readings for the plant's *current* tent.
 *
 * Sensor activity is treated as tent-level (and labeled accordingly) when
 * multiple plants share the same tent. Plants without an assigned tent
 * only get diary-derived history.
 */

export type DailyHistoryKind =
  | "none"
  | "manual-only"
  | "quicklog-only"
  | "both"
  | "tent-manual-only";

export interface DailyHistoryManualInput {
  ts: string | null | undefined;
  created_at?: string | null | undefined;
  id?: string | null | undefined;
  tent_id?: string | null | undefined;
  source?: string | null | undefined;
}

export interface DailyHistoryDiaryInput {
  entry_at: string | null | undefined;
  created_at?: string | null | undefined;
  id?: string | null | undefined;
  plant_id?: string | null | undefined;
  tent_id?: string | null | undefined;
}

export interface DailyHistoryInput {
  now: Date;
  days: number;
  plantId: string;
  currentTentId: string | null;
  /** Total number of plants currently assigned to currentTentId, including this one. */
  plantsInTentCount: number;
  manualReadings: DailyHistoryManualInput[];
  diaryEntries: DailyHistoryDiaryInput[];
  /** Window in minutes that links manual+quicklog as one check. */
  combineWindowMinutes?: number;
}

export interface DailyHistoryRow {
  dayKey: string; // YYYY-MM-DD (local)
  label: string; // "Today" | "Yesterday" | "May 21"
  kind: DailyHistoryKind;
  activityLabel: string;
  latestAt: string | null;
  hasManual: boolean;
  hasQuickLog: boolean;
  tentLevel: boolean;
}

export const HISTORY_LABELS = {
  none: "No check activity",
  manualOnly: "Manual snapshot added",
  tentManualOnly: "Tent manual snapshot added",
  quickLogOnly: "Quick Log added",
  both: "Daily check activity detected",
} as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayLabel(dayKey: string, nowKey: string, yesterdayKey: string): string {
  if (dayKey === nowKey) return "Today";
  if (dayKey === yesterdayKey) return "Yesterday";
  // Parse YYYY-MM-DD safely (local).
  const [y, m, d] = dayKey.split("-").map((s) => parseInt(s, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return dayKey;
  return `${MONTHS[m - 1]} ${d}`;
}

function parseTs(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

interface NormalizedActivity {
  ts: number;
  created: number;
  id: string;
}

function sortNewestFirst(items: NormalizedActivity[]): NormalizedActivity[] {
  return [...items].sort((a, b) => {
    if (b.ts !== a.ts) return b.ts - a.ts;
    if (b.created !== a.created) return b.created - a.created;
    if (a.id < b.id) return 1;
    if (a.id > b.id) return -1;
    return 0;
  });
}

export function buildDailyGrowCheckHistory(input: DailyHistoryInput): DailyHistoryRow[] {
  const days = Math.max(1, Math.min(14, Math.floor(input.days)));
  const windowMs = Math.max(1, input.combineWindowMinutes ?? 60) * 60_000;
  const tentLevel = (input.plantsInTentCount ?? 0) > 1;
  const includeManual = !!input.currentTentId;

  // Build the day list (newest first).
  const todayStart = startOfDay(input.now);
  const dayBuckets: { key: string; start: number; end: number }[] = [];
  for (let i = 0; i < days; i++) {
    const start = new Date(todayStart);
    start.setDate(start.getDate() - i);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    dayBuckets.push({
      key: dayKeyOf(start),
      start: start.getTime(),
      end: end.getTime(),
    });
  }
  const nowKey = dayBuckets[0]?.key ?? dayKeyOf(input.now);
  const yKey = dayBuckets[1]?.key ?? "";

  // Normalize inputs once.
  const manuals: NormalizedActivity[] = includeManual
    ? (input.manualReadings ?? [])
        .filter((r) => !input.currentTentId || r.tent_id === input.currentTentId)
        .map((r) => {
          const ts = parseTs(r.ts);
          if (ts === null) return null;
          return {
            ts,
            created: parseTs(r.created_at) ?? ts,
            id: String(r.id ?? ""),
          };
        })
        .filter((x): x is NormalizedActivity => x !== null)
    : [];

  const diary: NormalizedActivity[] = (input.diaryEntries ?? [])
    .filter((e) => e.plant_id === input.plantId)
    .map((e) => {
      const ts = parseTs(e.entry_at);
      if (ts === null) return null;
      return {
        ts,
        created: parseTs(e.created_at) ?? ts,
        id: String(e.id ?? ""),
      };
    })
    .filter((x): x is NormalizedActivity => x !== null);

  const rows: DailyHistoryRow[] = dayBuckets.map((b) => {
    const dayManuals = sortNewestFirst(manuals.filter((m) => m.ts >= b.start && m.ts < b.end));
    const dayDiary = sortNewestFirst(diary.filter((m) => m.ts >= b.start && m.ts < b.end));
    const hasManual = dayManuals.length > 0;
    const hasQuickLog = dayDiary.length > 0;

    let kind: DailyHistoryKind = "none";
    let activityLabel: string = HISTORY_LABELS.none;
    let latestAt: string | null = null;

    if (!hasManual && !hasQuickLog) {
      // nothing — leave defaults
    } else if (hasManual && hasQuickLog) {
      const tm = dayManuals[0].ts;
      const td = dayDiary[0].ts;
      const close = Math.abs(tm - td) <= windowMs;
      if (close) {
        kind = "both";
        activityLabel = HISTORY_LABELS.both;
      } else if (tm >= td) {
        kind = tentLevel ? "tent-manual-only" : "manual-only";
        activityLabel = tentLevel ? HISTORY_LABELS.tentManualOnly : HISTORY_LABELS.manualOnly;
      } else {
        kind = "quicklog-only";
        activityLabel = HISTORY_LABELS.quickLogOnly;
      }
      latestAt = new Date(Math.max(tm, td)).toISOString();
    } else if (hasManual) {
      kind = tentLevel ? "tent-manual-only" : "manual-only";
      activityLabel = tentLevel ? HISTORY_LABELS.tentManualOnly : HISTORY_LABELS.manualOnly;
      latestAt = new Date(dayManuals[0].ts).toISOString();
    } else {
      kind = "quicklog-only";
      activityLabel = HISTORY_LABELS.quickLogOnly;
      latestAt = new Date(dayDiary[0].ts).toISOString();
    }

    return {
      dayKey: b.key,
      label: dayLabel(b.key, nowKey, yKey),
      kind,
      activityLabel,
      latestAt,
      hasManual,
      hasQuickLog,
      tentLevel: tentLevel && hasManual,
    };
  });

  return rows; // already day desc
}

/**
 * Returns true when at least one row in the history window has check
 * activity. Pure — no fetching, no writes.
 */
export function hasDailyCheckActivity(rows: DailyHistoryRow[]): boolean {
  return rows.some((r) => r.kind !== "none");
}
