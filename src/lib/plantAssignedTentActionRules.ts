/**
 * Pure helpers for the Plant Detail "Assigned Tent Action Queue" panel.
 *
 * Read-only. No React. No Supabase. No I/O.
 *
 * Filters persisted action_queue rows (already RLS-scoped) down to
 * pending-approval items that belong to a given tent, sorted newest-first
 * with deterministic tie-breaking, and capped to a small display limit.
 *
 * Recommendations / device commands are never invented here — only fields
 * already stored on the row render.
 */

export type AssignedTentActionStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled"
  | "simulated"
  | string;

export type AssignedTentActionRisk =
  | "low"
  | "medium"
  | "high"
  | "critical"
  | string;

export interface AssignedTentActionInputRow {
  id: string;
  grow_id: string | null;
  tent_id: string | null;
  plant_id?: string | null;
  status: AssignedTentActionStatus | null;
  source: string | null;
  action_type?: string | null;
  target_metric?: string | null;
  suggested_change?: string | null;
  reason?: string | null;
  risk_level?: AssignedTentActionRisk | null;
  created_at?: string | null;
}

export interface PlantAssignedTentActionRow {
  id: string;
  growId: string;
  tentId: string | null;
  status: "pending_approval";
  source: string | null;
  actionType: string | null;
  targetMetric: string | null;
  suggestedChange: string | null;
  reason: string | null;
  riskLevel: AssignedTentActionRisk | null;
  createdAt: string | null;
  /** Parsed alert id from `[alert:<id>]` back-pointer in `reason`, if any. */
  alertBackPointerId: string | null;
}

export const ASSIGNED_TENT_ACTIONS_DEFAULT_LIMIT = 5;

const ALERT_BACK_POINTER_RE = /\[alert:([a-zA-Z0-9_-]+)\]/;

export function extractAlertBackPointerId(
  reason: string | null | undefined,
): string | null {
  if (!reason) return null;
  const m = ALERT_BACK_POINTER_RE.exec(reason);
  return m ? m[1] : null;
}

export interface BuildAssignedTentActionsOptions {
  tentId: string | null | undefined;
  growId?: string | null | undefined;
  limit?: number;
}

function toRow(r: AssignedTentActionInputRow): PlantAssignedTentActionRow {
  return {
    id: r.id,
    growId: r.grow_id as string,
    tentId: r.tent_id ?? null,
    status: "pending_approval",
    source: r.source ?? null,
    actionType: r.action_type ?? null,
    targetMetric: r.target_metric ?? null,
    suggestedChange: r.suggested_change ?? null,
    reason: r.reason ?? null,
    riskLevel: r.risk_level ?? null,
    createdAt: r.created_at ?? null,
    alertBackPointerId: extractAlertBackPointerId(r.reason),
  };
}

/**
 * Filter to action_queue rows for the plant's assigned tent, pending-approval
 * only, sorted newest-first by `created_at`, then deterministic id.
 *
 * When a growId is supplied, rows from other grows are excluded as a
 * defensive cross-grow guard (RLS already scopes by user).
 */
export function buildAssignedTentActions(
  rows: readonly AssignedTentActionInputRow[] | null | undefined,
  opts: BuildAssignedTentActionsOptions,
): PlantAssignedTentActionRow[] {
  const tentId = opts.tentId ?? null;
  if (!tentId) return [];
  if (!rows || rows.length === 0) return [];
  const growId = opts.growId ?? null;
  const limit = Math.max(1, opts.limit ?? ASSIGNED_TENT_ACTIONS_DEFAULT_LIMIT);

  const scoped = rows.filter((r) => {
    if (!r) return false;
    if (!r.id || !r.grow_id) return false;
    if (r.status !== "pending_approval") return false;
    if (r.tent_id !== tentId) return false;
    if (growId && r.grow_id !== growId) return false;
    return true;
  });

  const mapped = scoped.map(toRow);
  mapped.sort((a, b) => {
    const at = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
    if (bt !== at) return bt - at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return mapped.slice(0, limit);
}
