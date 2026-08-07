/**
 * Pure helpers for the Plant/Tent "Assigned Tent Alerts" surfaces.
 *
 * Read-only. No React. No Supabase. No I/O.
 *
 * Filters persisted alert rows (already RLS-scoped) for a tent, splits open
 * vs closed history, sorts deterministically, and caps display. Missing
 * fields stay null — never invented. Recommendations are never fabricated.
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
  /** Set when status is resolved; null for dismissed/open paths. */
  resolvedAt: string | null;
  tentId: string | null;
  growId: string;
}

export const ASSIGNED_TENT_ALERTS_DEFAULT_LIMIT = 5;
export const ASSIGNED_TENT_ALERT_HISTORY_DEFAULT_LIMIT = 8;

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

function isOpen(status: AlertStatusRow): boolean {
  return status === "open" || status === "acknowledged";
}

function isClosedHistory(status: AlertStatusRow): boolean {
  return status === "resolved" || status === "dismissed";
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
    resolvedAt: a.resolved_at ?? null,
    tentId: a.tent_id ?? null,
    growId: a.grow_id,
  };
}

function scopeToTent(
  rows: readonly AlertRow[] | null | undefined,
  tentId: string,
  growId: string | null,
): AlertRow[] {
  if (!rows || rows.length === 0) return [];
  return rows.filter((a) => {
    if (!a) return false;
    if (a.tent_id !== tentId) return false;
    if (growId && a.grow_id !== growId) return false;
    return true;
  });
}

function sortOpen(a: PlantAssignedTentAlertRow, b: PlantAssignedTentAlertRow): number {
  if (a.severityRank !== b.severityRank) return a.severityRank - b.severityRank;
  const at = a.lastSeenAt ? Date.parse(a.lastSeenAt) : 0;
  const bt = b.lastSeenAt ? Date.parse(b.lastSeenAt) : 0;
  if (bt !== at) return bt - at;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Newest closed first (resolved_at, else last_seen, else first_seen). */
function sortHistory(a: PlantAssignedTentAlertRow, b: PlantAssignedTentAlertRow): number {
  const at = Date.parse(a.resolvedAt || a.lastSeenAt || a.firstSeenAt || "") || 0;
  const bt = Date.parse(b.resolvedAt || b.lastSeenAt || b.firstSeenAt || "") || 0;
  if (bt !== at) return bt - at;
  if (a.severityRank !== b.severityRank) return a.severityRank - b.severityRank;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export interface BuildAssignedTentAlertsOptions {
  tentId: string | null | undefined;
  growId?: string | null | undefined;
  limit?: number;
}

/**
 * Open/acknowledged alerts for this tent, severity-first.
 * Closed rows in the same payload are discarded here (use history builder).
 */
export function buildAssignedTentAlerts(
  rows: readonly AlertRow[] | null | undefined,
  opts: BuildAssignedTentAlertsOptions,
): PlantAssignedTentAlertRow[] {
  const tentId = opts.tentId ?? null;
  if (!tentId) return [];
  const growId = opts.growId ?? null;
  const limit = Math.max(1, opts.limit ?? ASSIGNED_TENT_ALERTS_DEFAULT_LIMIT);
  const mapped = scopeToTent(rows, tentId, growId)
    .filter((a) => isOpen(a.status))
    .map(toRow);
  mapped.sort(sortOpen);
  return mapped.slice(0, limit);
}

/**
 * Resolved/dismissed tent alerts — "what went wrong, and how it closed."
 * Does not invent fix narratives: only persisted title/reason/status/timestamps.
 */
export function buildAssignedTentAlertHistory(
  rows: readonly AlertRow[] | null | undefined,
  opts: BuildAssignedTentAlertsOptions,
): PlantAssignedTentAlertRow[] {
  const tentId = opts.tentId ?? null;
  if (!tentId) return [];
  const growId = opts.growId ?? null;
  const limit = Math.max(1, opts.limit ?? ASSIGNED_TENT_ALERT_HISTORY_DEFAULT_LIMIT);
  const mapped = scopeToTent(rows, tentId, growId)
    .filter((a) => isClosedHistory(a.status))
    .map(toRow);
  mapped.sort(sortHistory);
  return mapped.slice(0, limit);
}

/** Grower-facing closure label — never claims a device or auto-fix. */
export function tentAlertHistoryClosureLabel(status: AlertStatusRow): string {
  if (status === "resolved") return "Resolved";
  if (status === "dismissed") return "Dismissed";
  return "Closed";
}
