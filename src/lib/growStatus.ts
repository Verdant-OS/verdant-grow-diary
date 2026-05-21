/**
 * Pure helpers for GrowDetail status + recent activity.
 *
 * No I/O, no Supabase calls, no React. Read-only derivations only.
 * Not an AI diagnosis — purely a deterministic summary of existing data.
 */

export type CountValue = number | "unavailable";

export type StatusLevel = "good" | "watch" | "needs_review" | "unavailable";

export type RiskRank = "low" | "medium" | "high" | "critical" | "none" | "unknown";

export interface GrowStatus {
  level: StatusLevel;
  reason: string;
  pending: CountValue;
  highestRisk: RiskRank;
  lastDiaryAt: string | null;
}

export interface RecentItem {
  id: string;
  kind: "diary" | "action_event" | "alert_event";
  ts: string;
  title: string;
  detail?: string | null;
  href?: string;
}

export const UNAVAILABLE_STATUS: GrowStatus = {
  level: "unavailable",
  reason: "Status unavailable",
  pending: "unavailable",
  highestRisk: "unknown",
  lastDiaryAt: null,
};

/** Formats a count value, degrading "unavailable" → human-readable label. */
export function formatCount(c: CountValue): string {
  return c === "unavailable" ? "Unavailable" : String(c);
}

/** Highest risk_level across pending action_queue rows; "unknown" on failure. */
export function rankRisk(
  rows: Array<{ risk_level: string | null }> | null | undefined,
): RiskRank {
  if (!rows) return "unknown";
  const order = { critical: 4, high: 3, medium: 2, low: 1 } as const;
  let top = 0;
  for (const r of rows) {
    const v = order[(r.risk_level ?? "low") as keyof typeof order] ?? 0;
    if (v > top) top = v;
  }
  return top === 4
    ? "critical"
    : top === 3
      ? "high"
      : top === 2
        ? "medium"
        : top === 1
          ? "low"
          : "none";
}

export interface DeriveStatusInput {
  pending: CountValue;
  highestRisk: RiskRank;
  lastDiaryAt: string | null;
  now?: number;
}

/**
 * Pure status derivation. NOT an AI diagnosis.
 *  - high/critical pending risk → needs_review
 *  - any pending → watch
 *  - no pending + no/stale (>7d) diary → watch
 *  - no pending + recent diary → good
 *  - counts + risk both unavailable → unavailable
 */
export function deriveStatus({
  pending,
  highestRisk,
  lastDiaryAt,
  now = Date.now(),
}: DeriveStatusInput): { level: StatusLevel; reason: string } {
  const countsUnavailable = pending === "unavailable";
  const ageDays = lastDiaryAt
    ? (now - new Date(lastDiaryAt).getTime()) / 86400000
    : null;

  let level: StatusLevel;
  let reason: string;
  if (countsUnavailable && highestRisk === "unknown") {
    level = "unavailable";
    reason = "Status unavailable";
  } else if (highestRisk === "critical" || highestRisk === "high") {
    level = "needs_review";
    reason = `Pending action at ${highestRisk} risk needs review`;
  } else if (typeof pending === "number" && pending > 0) {
    level = "watch";
    reason = `${pending} pending action${pending === 1 ? "" : "s"} awaiting approval`;
  } else if (ageDays === null) {
    level = "watch";
    reason = "No diary entries yet";
  } else if (ageDays > 7) {
    level = "watch";
    reason = `Last diary entry ${Math.floor(ageDays)} days ago`;
  } else {
    level = "good";
    reason = "No pending actions, recent diary activity";
  }
  return { level, reason };
}

/**
 * Sort recent items newest-first by ts, with deterministic tie-breakers:
 *   1. ts descending (newest first)
 *   2. kind alphabetical (action_event < alert_event < diary)
 *   3. id ascending
 *
 * Stable: returns a new array; does not mutate input.
 */
export function mergeRecent(items: RecentItem[]): RecentItem[] {
  return [...items].sort((a, b) => {
    const dt = new Date(b.ts).getTime() - new Date(a.ts).getTime();
    if (dt !== 0) return dt;
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
