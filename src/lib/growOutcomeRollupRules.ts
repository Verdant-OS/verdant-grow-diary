/**
 * growOutcomeRollupRules — pure helpers for surfacing recent grower-recorded
 * action outcomes on GrowDetail.
 *
 * SAFETY / SCOPE:
 *  - Pure, deterministic. No I/O, React, or DB.
 *  - Display/labeling only. Never mutates alerts, action_queue, or diary.
 *  - Never infers outcome via AI / sensor / status.
 *  - Grower-recorded outcome is the sole source of truth.
 *  - No causation/resolution language is emitted by these helpers.
 */
import {
  ACTION_OUTCOME_EVENT_TYPE,
  ACTION_OUTCOME_KIND,
  OUTCOME_STATUSES,
  type OutcomeStatus,
} from "@/lib/actionOutcomeRules";
import {
  OUTCOME_STATUS_LABEL,
  UNKNOWN_OUTCOME_LABEL,
} from "@/lib/relatedActionOutcomeRules";

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

export interface RawGrowOutcomeRow {
  id?: string | null;
  entry_at?: string | null;
  created_at?: string | null;
  note?: string | null;
  details?: {
    event_type?: unknown;
    outcome_kind?: unknown;
    outcome_status?: unknown;
    recorded_at?: unknown;
    action_queue_id?: unknown;
    source_alert_id?: unknown;
    followup_entry_id?: unknown;
    metric?: unknown;
    suggested_change?: unknown;
  } | null;
}

export interface PickedGrowOutcome {
  diary_entry_id: string | null;
  action_queue_id: string | null;
  source_alert_id: string | null;
  followup_entry_id: string | null;
  outcome_status: OutcomeStatus | "unknown";
  label: string;
  recorded_at: string | null;
  metric: string | null;
  suggested_change: string | null;
  note: string | null;
}

export interface GrowOutcomeSummary {
  total: number;
  improved: number;
  unchanged: number;
  worsened: number;
  more_data_needed: number;
  unknown: number;
}

export const EMPTY_GROW_OUTCOME_SUMMARY: GrowOutcomeSummary = {
  total: 0,
  improved: 0,
  unchanged: 0,
  worsened: 0,
  more_data_needed: 0,
  unknown: 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function isOutcomeStatus(v: unknown): v is OutcomeStatus {
  return typeof v === "string" && (OUTCOME_STATUSES as readonly string[]).includes(v);
}

function parseTs(v: unknown): number | null {
  const s = nonEmptyString(v);
  if (!s) return null;
  const n = Date.parse(s);
  return Number.isFinite(n) ? n : null;
}

function rowSortKey(row: RawGrowOutcomeRow): number {
  return (
    parseTs(row.details?.recorded_at) ??
    parseTs(row.entry_at) ??
    parseTs(row.created_at) ??
    -Infinity
  );
}

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

export function isActionOutcomeRow(row: RawGrowOutcomeRow | null | undefined): boolean {
  if (!row || !row.details) return false;
  return (
    row.details.event_type === ACTION_OUTCOME_EVENT_TYPE &&
    row.details.outcome_kind === ACTION_OUTCOME_KIND
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export function summarizeGrowOutcomes(
  rows: readonly RawGrowOutcomeRow[] | null | undefined,
): GrowOutcomeSummary {
  const summary: GrowOutcomeSummary = { ...EMPTY_GROW_OUTCOME_SUMMARY };
  if (!rows) return summary;
  for (const r of rows) {
    if (!isActionOutcomeRow(r)) continue;
    summary.total += 1;
    const s = r.details?.outcome_status;
    if (isOutcomeStatus(s)) {
      summary[s] += 1;
    } else {
      summary.unknown += 1;
    }
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Recent picker
// ---------------------------------------------------------------------------

export function pickRecentGrowOutcomes(
  rows: readonly RawGrowOutcomeRow[] | null | undefined,
  limit: number = 5,
): PickedGrowOutcome[] {
  if (!rows || rows.length === 0) return [];
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5;
  const matched = rows.filter(isActionOutcomeRow);
  matched.sort((a, b) => rowSortKey(b) - rowSortKey(a));
  return matched.slice(0, cap).map((row) => {
    const d = row.details ?? {};
    const rawStatus = d.outcome_status;
    const status: OutcomeStatus | "unknown" = isOutcomeStatus(rawStatus) ? rawStatus : "unknown";
    const label = isOutcomeStatus(rawStatus)
      ? OUTCOME_STATUS_LABEL[rawStatus]
      : UNKNOWN_OUTCOME_LABEL;
    return {
      diary_entry_id: nonEmptyString(row.id),
      action_queue_id: nonEmptyString(d.action_queue_id),
      source_alert_id: nonEmptyString(d.source_alert_id),
      followup_entry_id: nonEmptyString(d.followup_entry_id),
      outcome_status: status,
      label,
      recorded_at:
        nonEmptyString(d.recorded_at) ??
        nonEmptyString(row.entry_at) ??
        nonEmptyString(row.created_at),
      metric: nonEmptyString(d.metric),
      suggested_change: nonEmptyString(d.suggested_change),
      note: nonEmptyString(row.note),
    };
  });
}
