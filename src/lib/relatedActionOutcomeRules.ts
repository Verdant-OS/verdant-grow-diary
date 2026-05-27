/**
 * relatedActionOutcomeRules — pure helpers for surfacing grower-recorded
 * action outcomes on AlertDetail's Related Action Queue Items section.
 *
 * SAFETY / SCOPE:
 *  - Pure, deterministic, no I/O, no React, no DB.
 *  - Display/labeling only. Never mutates alerts or action_queue.
 *  - Never creates diary entries, follow-ups, or outcomes.
 *  - Never infers outcome via AI / sensor / status.
 *  - Grower-recorded outcome is the sole source of truth.
 *  - No device control or automation surface.
 */
import {
  ACTION_OUTCOME_EVENT_TYPE,
  ACTION_OUTCOME_KIND,
  OUTCOME_STATUSES,
  type OutcomeStatus,
} from "@/lib/actionOutcomeRules";

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const OUTCOME_STATUS_LABEL: Record<OutcomeStatus, string> = {
  improved: "Improved",
  unchanged: "Unchanged",
  worsened: "Worsened",
  more_data_needed: "More data needed",
};

export const UNKNOWN_OUTCOME_LABEL = "Unknown outcome";

function isOutcomeStatus(v: unknown): v is OutcomeStatus {
  return typeof v === "string" && (OUTCOME_STATUSES as readonly string[]).includes(v);
}

export function normalizeOutcomeStatusLabel(status: unknown): string {
  return isOutcomeStatus(status) ? OUTCOME_STATUS_LABEL[status] : UNKNOWN_OUTCOME_LABEL;
}

// ---------------------------------------------------------------------------
// Row shape (raw diary_entries with embedded details)
// ---------------------------------------------------------------------------

export interface RawOutcomeDiaryRow {
  id?: string | null;
  entry_at?: string | null;
  created_at?: string | null;
  details?: {
    event_type?: unknown;
    action_queue_id?: unknown;
    outcome_kind?: unknown;
    outcome_status?: unknown;
    source_alert_id?: unknown;
    followup_entry_id?: unknown;
    recorded_at?: unknown;
  } | null;
  note?: string | null;
}

export interface PickedOutcome {
  diary_entry_id: string | null;
  action_queue_id: string;
  source_alert_id: string | null;
  followup_entry_id: string | null;
  outcome_status: OutcomeStatus | "unknown";
  label: string;
  recorded_at: string | null;
  note: string | null;
}

function nonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function parseTimestamp(v: unknown): number | null {
  const s = nonEmptyString(v);
  if (!s) return null;
  const n = Date.parse(s);
  return Number.isFinite(n) ? n : null;
}

function rowSortKey(row: RawOutcomeDiaryRow): number {
  return (
    parseTimestamp(row.details?.recorded_at) ??
    parseTimestamp(row.entry_at) ??
    parseTimestamp(row.created_at) ??
    -Infinity
  );
}

function isMatchingOutcomeRow(
  row: RawOutcomeDiaryRow | null | undefined,
  actionId: string,
): boolean {
  if (!row || !row.details) return false;
  return (
    row.details.event_type === ACTION_OUTCOME_EVENT_TYPE &&
    row.details.outcome_kind === ACTION_OUTCOME_KIND &&
    typeof row.details.action_queue_id === "string" &&
    row.details.action_queue_id === actionId
  );
}

export function pickLatestOutcomeForAction(
  rows: readonly RawOutcomeDiaryRow[] | null | undefined,
  actionId: string | null | undefined,
): PickedOutcome | null {
  const id = nonEmptyString(actionId);
  if (!id || !rows || rows.length === 0) return null;

  const matched = rows.filter((r) => isMatchingOutcomeRow(r, id));
  if (matched.length === 0) return null;

  matched.sort((a, b) => rowSortKey(b) - rowSortKey(a));
  const top = matched[0];
  const d = top.details ?? {};
  const rawStatus = d.outcome_status;
  const status: OutcomeStatus | "unknown" = isOutcomeStatus(rawStatus) ? rawStatus : "unknown";
  const label = isOutcomeStatus(rawStatus)
    ? OUTCOME_STATUS_LABEL[rawStatus]
    : UNKNOWN_OUTCOME_LABEL;

  return {
    diary_entry_id: nonEmptyString(top.id),
    action_queue_id: id,
    source_alert_id: nonEmptyString(d.source_alert_id),
    followup_entry_id: nonEmptyString(d.followup_entry_id),
    outcome_status: status,
    label,
    recorded_at:
      nonEmptyString(d.recorded_at) ?? nonEmptyString(top.entry_at) ?? nonEmptyString(top.created_at),
    note: nonEmptyString(top.note),
  };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface RelatedActionLike {
  id: string;
  status?: string | null;
}

export interface RelatedActionOutcomeSummary {
  totalActions: number;
  completedActions: number;
  recordedOutcomes: number;
  improved: number;
  unchanged: number;
  worsened: number;
  more_data_needed: number;
  unknown: number;
}

export function summarizeRelatedActionOutcomes(
  actions: readonly RelatedActionLike[] | null | undefined,
  outcomes: readonly RawOutcomeDiaryRow[] | null | undefined,
): RelatedActionOutcomeSummary {
  const list = actions ?? [];
  const summary: RelatedActionOutcomeSummary = {
    totalActions: list.length,
    completedActions: 0,
    recordedOutcomes: 0,
    improved: 0,
    unchanged: 0,
    worsened: 0,
    more_data_needed: 0,
    unknown: 0,
  };
  for (const a of list) {
    if (a.status === "completed") summary.completedActions += 1;
    const picked = pickLatestOutcomeForAction(outcomes ?? [], a.id);
    if (!picked) continue;
    summary.recordedOutcomes += 1;
    switch (picked.outcome_status) {
      case "improved":
        summary.improved += 1;
        break;
      case "unchanged":
        summary.unchanged += 1;
        break;
      case "worsened":
        summary.worsened += 1;
        break;
      case "more_data_needed":
        summary.more_data_needed += 1;
        break;
      default:
        summary.unknown += 1;
    }
  }
  return summary;
}
