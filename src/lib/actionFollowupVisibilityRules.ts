/**
 * actionFollowupVisibilityRules — pure helpers for surfacing
 * action_followup diary entries in timeline/operator views and on
 * ActionDetail "view follow-up" links.
 *
 * SAFETY / SCOPE:
 *  - Pure, deterministic. No I/O, React, or DB.
 *  - Display/labeling and filter helpers only.
 *  - Never mutates alerts, action_queue, or diary.
 *  - Never creates follow-up entries (that path lives in actionFollowupRules).
 *  - No AI inference; no causation/resolution language.
 */
import {
  ACTION_FOLLOWUP_DEFAULT_KIND,
  ACTION_FOLLOWUP_EVENT_TYPE,
  type ActionFollowupKind,
} from "@/lib/actionFollowupRules";

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const FOLLOWUP_KIND_LABEL: Record<ActionFollowupKind, string> = {
  "24h_recheck": "24h re-check",
};

export const FOLLOWUP_DEFAULT_LABEL = FOLLOWUP_KIND_LABEL[ACTION_FOLLOWUP_DEFAULT_KIND];
export const FOLLOWUP_BADGE_LABEL = "Follow-up";
export const FOLLOWUP_SAFE_CAPTION = "Recorded after action completion";

function isFollowupKind(v: unknown): v is ActionFollowupKind {
  return typeof v === "string" && v in FOLLOWUP_KIND_LABEL;
}

export function normalizeFollowupKindLabel(kind: unknown): string {
  return isFollowupKind(kind) ? FOLLOWUP_KIND_LABEL[kind] : FOLLOWUP_DEFAULT_LABEL;
}

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

export interface RawFollowupDiaryRow {
  id?: string | null;
  grow_id?: string | null;
  plant_id?: string | null;
  tent_id?: string | null;
  entry_at?: string | null;
  created_at?: string | null;
  note?: string | null;
  details?: {
    event_type?: unknown;
    action_queue_id?: unknown;
    followup_kind?: unknown;
    completed_at?: unknown;
  } | null;
}

export interface PickedFollowup {
  diary_entry_id: string | null;
  action_queue_id: string | null;
  grow_id: string | null;
  plant_id: string | null;
  tent_id: string | null;
  followup_kind: ActionFollowupKind | "unknown";
  label: string;
  recorded_at: string | null;
  note: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function parseTs(v: unknown): number | null {
  const s = nonEmptyString(v);
  if (!s) return null;
  const n = Date.parse(s);
  return Number.isFinite(n) ? n : null;
}

function rowSortKey(row: RawFollowupDiaryRow): number {
  return (
    parseTs(row.entry_at) ??
    parseTs(row.created_at) ??
    parseTs(row.details?.completed_at) ??
    -Infinity
  );
}

// ---------------------------------------------------------------------------
// Predicates / filters
// ---------------------------------------------------------------------------

export function isActionFollowupRow(row: RawFollowupDiaryRow | null | undefined): boolean {
  if (!row || !row.details) return false;
  return row.details.event_type === ACTION_FOLLOWUP_EVENT_TYPE;
}

export function filterFollowupRows(
  rows: readonly RawFollowupDiaryRow[] | null | undefined,
): RawFollowupDiaryRow[] {
  return (rows ?? []).filter(isActionFollowupRow);
}

// ---------------------------------------------------------------------------
// Pickers
// ---------------------------------------------------------------------------

function projectRow(row: RawFollowupDiaryRow): PickedFollowup {
  const d = row.details ?? {};
  const kind = isFollowupKind(d.followup_kind) ? d.followup_kind : "unknown";
  const label = isFollowupKind(d.followup_kind)
    ? FOLLOWUP_KIND_LABEL[d.followup_kind]
    : FOLLOWUP_DEFAULT_LABEL;
  return {
    diary_entry_id: nonEmptyString(row.id),
    action_queue_id: nonEmptyString(d.action_queue_id),
    grow_id: nonEmptyString(row.grow_id),
    plant_id: nonEmptyString(row.plant_id),
    tent_id: nonEmptyString(row.tent_id),
    followup_kind: kind,
    label,
    recorded_at:
      nonEmptyString(row.entry_at) ??
      nonEmptyString(row.created_at) ??
      nonEmptyString(d.completed_at),
    note: nonEmptyString(row.note),
  };
}

export function pickLatestFollowupForAction(
  rows: readonly RawFollowupDiaryRow[] | null | undefined,
  actionId: string | null | undefined,
): PickedFollowup | null {
  const id = nonEmptyString(actionId);
  if (!id || !rows || rows.length === 0) return null;
  const matched = rows.filter(
    (r) => isActionFollowupRow(r) && r.details?.action_queue_id === id,
  );
  if (matched.length === 0) return null;
  matched.sort((a, b) => rowSortKey(b) - rowSortKey(a));
  return projectRow(matched[0]);
}

export function sortFollowupsNewestFirst(
  rows: readonly RawFollowupDiaryRow[] | null | undefined,
): PickedFollowup[] {
  return filterFollowupRows(rows)
    .slice()
    .sort((a, b) => rowSortKey(b) - rowSortKey(a))
    .map(projectRow);
}
