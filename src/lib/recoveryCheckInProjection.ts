/**
 * Check-in-only projection for the no-recent-log recovery prompt.
 *
 * Tranche B+ slice B3a. The grow-scoped "recent activity" lists merge diary
 * check-ins with Action Queue events (and alert-adjacent rows on Grow
 * Detail). Recovery asks a narrower question — "has the grower checked in on
 * a plant lately?" — so approving an action or receiving an alert must never
 * suppress the prompt.
 *
 * This is a filter, not a rules engine: the 72 h window, the calm copy, and
 * the decision all stay in `noRecentLogRecoveryRules`. A row with a missing
 * or unparseable timestamp is dropped rather than treated as activity —
 * unknown evidence must never read as a measured check-in.
 */
import type { NoRecentLogRecoveryRow } from "./noRecentLogRecoveryRules";

/** The subset of `RecentItem` this projection needs. */
export interface RecoveryCandidateRow {
  kind: "diary" | "action_event" | "alert_event";
  ts?: string | null;
}

export function selectRecoveryCheckInRows(
  items: readonly RecoveryCandidateRow[] | null | undefined,
): NoRecentLogRecoveryRow[] {
  if (!items || items.length === 0) return [];
  const rows: NoRecentLogRecoveryRow[] = [];
  for (const item of items) {
    if (!item || item.kind !== "diary") continue;
    const ts = typeof item.ts === "string" ? item.ts : "";
    if (ts.length === 0) continue;
    if (!Number.isFinite(Date.parse(ts))) continue;
    rows.push({ occurredAt: ts });
  }
  return rows;
}
