/**
 * actionOutcomeLearningRules — pure helpers for the v1 Action Outcome
 * Learning Report. Aggregates grower-recorded action_outcome diary rows
 * into outcome totals + per-metric groupings + recent examples.
 *
 * SAFETY / SCOPE:
 *  - Pure, deterministic. No I/O, React, or DB.
 *  - Display/labeling only. Never mutates alerts, action_queue, diary.
 *  - Never infers outcome from AI / sensor / status — grower-recorded only.
 *  - Never claims an action "caused", "fixed", "healed", or "resolved" an
 *    issue. The report is observational.
 *  - Never ranks groups as "best" / "worst".
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
// Thresholds + labels
// ---------------------------------------------------------------------------

/** Minimum grouped sample size required before a per-group narrative line
 *  may be emitted. Below this we surface a "more data needed" hint. */
export const LEARNING_GROUP_SAMPLE_THRESHOLD = 3;

/** Default grouping label when an outcome row has no `details.metric`. */
export const UNSPECIFIED_METRIC_LABEL = "Unspecified action type";

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

export interface RawOutcomeReportRow {
  id?: string | null;
  entry_at?: string | null;
  created_at?: string | null;
  note?: string | null;
  details?: {
    event_type?: unknown;
    outcome_kind?: unknown;
    outcome_status?: unknown;
    metric?: unknown;
    suggested_change?: unknown;
    action_queue_id?: unknown;
    source_alert_id?: unknown;
    recorded_at?: unknown;
  } | null;
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export interface OutcomeTotals {
  total: number;
  improved: number;
  unchanged: number;
  worsened: number;
  more_data_needed: number;
  unknown: number;
}

export const EMPTY_OUTCOME_TOTALS: OutcomeTotals = {
  total: 0,
  improved: 0,
  unchanged: 0,
  worsened: 0,
  more_data_needed: 0,
  unknown: 0,
};

export interface OutcomeGroup {
  metric: string;
  label: string;
  totals: OutcomeTotals;
  needs_more_data: boolean;
}

export interface OutcomeExample {
  diary_entry_id: string | null;
  action_queue_id: string | null;
  source_alert_id: string | null;
  outcome_status: OutcomeStatus | "unknown";
  outcome_label: string;
  metric: string | null;
  suggested_change: string | null;
  note_summary: string | null;
  recorded_at: string | null;
}

export interface ActionOutcomeLearningReport {
  totals: OutcomeTotals;
  groups: OutcomeGroup[];
  examples: OutcomeExample[];
  /** True when overall total is below the group sample threshold. */
  needs_more_data: boolean;
}

export const EMPTY_LEARNING_REPORT: ActionOutcomeLearningReport = {
  totals: EMPTY_OUTCOME_TOTALS,
  groups: [],
  examples: [],
  needs_more_data: true,
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
  return (
    typeof v === "string" &&
    (OUTCOME_STATUSES as readonly string[]).includes(v)
  );
}

function parseTs(v: unknown): number | null {
  const s = nonEmptyString(v);
  if (!s) return null;
  const n = Date.parse(s);
  return Number.isFinite(n) ? n : null;
}

function rowSortKey(row: RawOutcomeReportRow): number {
  return (
    parseTs(row.details?.recorded_at) ??
    parseTs(row.entry_at) ??
    parseTs(row.created_at) ??
    -Infinity
  );
}

function isActionOutcomeRow(row: RawOutcomeReportRow | null | undefined): boolean {
  if (!row || !row.details) return false;
  return (
    row.details.event_type === ACTION_OUTCOME_EVENT_TYPE &&
    row.details.outcome_kind === ACTION_OUTCOME_KIND
  );
}

function summarize(rows: readonly RawOutcomeReportRow[]): OutcomeTotals {
  const t: OutcomeTotals = { ...EMPTY_OUTCOME_TOTALS };
  for (const r of rows) {
    t.total += 1;
    const s = r.details?.outcome_status;
    if (isOutcomeStatus(s)) t[s] += 1;
    else t.unknown += 1;
  }
  return t;
}

function summarizeNote(note: string | null, maxLen = 140): string | null {
  if (!note) return null;
  const trimmed = note.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Build report
// ---------------------------------------------------------------------------

export interface BuildLearningReportOptions {
  exampleLimit?: number;
  groupSampleThreshold?: number;
}

export function buildActionOutcomeLearningReport(
  rows: readonly RawOutcomeReportRow[] | null | undefined,
  options: BuildLearningReportOptions = {},
): ActionOutcomeLearningReport {
  const exampleLimit =
    Number.isFinite(options.exampleLimit) && (options.exampleLimit as number) > 0
      ? Math.floor(options.exampleLimit as number)
      : 5;
  const groupThreshold =
    Number.isFinite(options.groupSampleThreshold) &&
    (options.groupSampleThreshold as number) > 0
      ? Math.floor(options.groupSampleThreshold as number)
      : LEARNING_GROUP_SAMPLE_THRESHOLD;

  if (!rows || rows.length === 0) return EMPTY_LEARNING_REPORT;

  const matched = rows.filter(isActionOutcomeRow);
  if (matched.length === 0) return EMPTY_LEARNING_REPORT;

  // Totals.
  const totals = summarize(matched);

  // Groups by metric (falling back to UNSPECIFIED_METRIC_LABEL).
  const groupBuckets = new Map<string, RawOutcomeReportRow[]>();
  for (const r of matched) {
    const metric = nonEmptyString(r.details?.metric) ?? UNSPECIFIED_METRIC_LABEL;
    const bucket = groupBuckets.get(metric);
    if (bucket) bucket.push(r);
    else groupBuckets.set(metric, [r]);
  }
  const groups: OutcomeGroup[] = Array.from(groupBuckets.entries())
    .map(([metric, bucket]) => {
      const t = summarize(bucket);
      return {
        metric,
        label: metric,
        totals: t,
        needs_more_data: t.total < groupThreshold,
      };
    })
    .sort((a, b) => {
      if (b.totals.total !== a.totals.total) {
        return b.totals.total - a.totals.total;
      }
      return a.label.localeCompare(b.label);
    });

  // Examples (most recent first).
  const examples: OutcomeExample[] = [...matched]
    .sort((a, b) => rowSortKey(b) - rowSortKey(a))
    .slice(0, exampleLimit)
    .map((r) => {
      const d = r.details ?? {};
      const rawStatus = d.outcome_status;
      const status: OutcomeStatus | "unknown" = isOutcomeStatus(rawStatus)
        ? rawStatus
        : "unknown";
      const label = isOutcomeStatus(rawStatus)
        ? OUTCOME_STATUS_LABEL[rawStatus]
        : UNKNOWN_OUTCOME_LABEL;
      return {
        diary_entry_id: nonEmptyString(r.id),
        action_queue_id: nonEmptyString(d.action_queue_id),
        source_alert_id: nonEmptyString(d.source_alert_id),
        outcome_status: status,
        outcome_label: label,
        metric: nonEmptyString(d.metric),
        suggested_change: nonEmptyString(d.suggested_change),
        note_summary: summarizeNote(nonEmptyString(r.note)),
        recorded_at:
          nonEmptyString(d.recorded_at) ??
          nonEmptyString(r.entry_at) ??
          nonEmptyString(r.created_at),
      };
    });

  return {
    totals,
    groups,
    examples,
    needs_more_data: totals.total < groupThreshold,
  };
}
