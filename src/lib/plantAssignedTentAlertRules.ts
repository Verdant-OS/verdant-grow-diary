/**
 * Pure helpers for the Plant Detail "Assigned Tent Alerts" panel.
 *
 * Read-only. No React. No Supabase. No I/O.
 *
 * Filters persisted alert rows (already RLS-scoped) down to still-active
 * alerts (see ASSIGNED_TENT_ALERT_STATUSES) that belong to a given tent,
 * sorts by severity (highest first) with deterministic
 * tie-breaking, and caps to a small display limit. Missing fields stay null —
 * never invented. Recommendations are never fabricated here.
 */

import type { AlertRow, AlertSeverityRow, AlertStatusRow } from "@/lib/alerts";

export interface PlantAssignedTentAlertRow {
  id: string;
  severity: AlertSeverityRow;
  severityLabel: string;
  severityRank: number;
  status: AlertStatusRow;
  metric: string | null;
  title: string;
  reason: string;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  tentId: string | null;
  growId: string;
}

export const ASSIGNED_TENT_ALERTS_DEFAULT_LIMIT = 5;

const SEVERITY_RANK: Record<AlertSeverityRow, number> = {
  critical: 0,
  warning: 1,
  watch: 2,
  info: 3,
};

const SEVERITY_LABEL: Record<AlertSeverityRow, string> = {
  critical: "Critical",
  warning: "Warning",
  watch: "Watch",
  info: "Info",
};

/**
 * Alert statuses this panel treats as still needing the grower's attention.
 *
 * `acknowledged` is deliberately included: acknowledging an alert records that
 * the grower has seen it, not that the underlying condition is fixed. It stays
 * visible until it is genuinely resolved or dismissed.
 *
 * Exported so the data layer can keep its query wide enough to match. This
 * list and the query that feeds it must not drift apart — naming the statuses
 * in two places independently is what made the `acknowledged` branch below
 * unreachable in the running app.
 */
export const ASSIGNED_TENT_ALERT_STATUSES: readonly AlertStatusRow[] = ["open", "acknowledged"];

function isActive(status: AlertStatusRow): boolean {
  return ASSIGNED_TENT_ALERT_STATUSES.includes(status);
}

function toRow(a: AlertRow): PlantAssignedTentAlertRow {
  return {
    id: a.id,
    severity: a.severity,
    severityLabel: SEVERITY_LABEL[a.severity] ?? "Info",
    severityRank: SEVERITY_RANK[a.severity] ?? 99,
    status: a.status,
    metric: a.metric ?? null,
    title: a.title,
    reason: a.reason,
    firstSeenAt: a.first_seen_at ?? null,
    lastSeenAt: a.last_seen_at ?? null,
    tentId: a.tent_id ?? null,
    growId: a.grow_id,
  };
}

export interface BuildAssignedTentAlertsOptions {
  tentId: string | null | undefined;
  growId?: string | null | undefined;
  limit?: number;
}

/**
 * Filter to alerts for this tent, open/acknowledged only, sorted by severity
 * (critical → info) then newest last_seen_at, then deterministic id.
 *
 * When a growId is supplied, alerts from other grows are excluded as a
 * defensive cross-grow guard (RLS already scopes by user).
 */
export function buildAssignedTentAlerts(
  rows: readonly AlertRow[] | null | undefined,
  opts: BuildAssignedTentAlertsOptions,
): PlantAssignedTentAlertRow[] {
  const tentId = opts.tentId ?? null;
  if (!tentId) return [];
  if (!rows || rows.length === 0) return [];
  const growId = opts.growId ?? null;
  const limit = Math.max(1, opts.limit ?? ASSIGNED_TENT_ALERTS_DEFAULT_LIMIT);

  const scoped = rows.filter((a) => {
    if (!a) return false;
    if (a.tent_id !== tentId) return false;
    if (growId && a.grow_id !== growId) return false;
    return isActive(a.status);
  });

  const mapped = scoped.map(toRow);
  mapped.sort((a, b) => {
    if (a.severityRank !== b.severityRank) return a.severityRank - b.severityRank;
    const at = a.lastSeenAt ? Date.parse(a.lastSeenAt) : 0;
    const bt = b.lastSeenAt ? Date.parse(b.lastSeenAt) : 0;
    if (bt !== at) return bt - at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return mapped.slice(0, limit);
}
