/**
 * Pure helpers for operator lead analytics.
 *
 * Read-derived only. No I/O, no Supabase, no side effects.
 * Operates on LeadRow shape from useLeadsList.
 */
import type { LeadRow } from "@/hooks/useLeadsList";
import { isNeedsAction } from "@/lib/leadFollowupRules";

export const UNKNOWN = "Unknown";

export interface GroupStats {
  key: string;
  total: number;
  new: number;
  contacted: number;
  follow_up: number;
  closed: number;
  spam: number;
  needs_action: number;
  contacted_rate: number;
  closed_rate: number;
  spam_rate: number;
}

function emptyStats(key: string): GroupStats {
  return {
    key,
    total: 0,
    new: 0,
    contacted: 0,
    follow_up: 0,
    closed: 0,
    spam: 0,
    needs_action: 0,
    contacted_rate: 0,
    closed_rate: 0,
    spam_rate: 0,
  };
}

/**
 * Safe rate helper. Returns 0 when total is 0 (divide-by-zero guard).
 * Output is a fraction in [0, 1].
 */
export function rate(numerator: number, total: number): number {
  if (!total || total <= 0) return 0;
  const r = numerator / total;
  if (!Number.isFinite(r)) return 0;
  return r;
}

function bucketKey(value: string | null | undefined): string {
  if (value === null || value === undefined) return UNKNOWN;
  const trimmed = String(value).trim();
  return trimmed.length === 0 ? UNKNOWN : trimmed;
}

function groupBy(
  leads: LeadRow[],
  pick: (l: LeadRow) => string | null | undefined,
  now: number,
): GroupStats[] {
  const map = new Map<string, GroupStats>();
  for (const l of leads) {
    const k = bucketKey(pick(l));
    let s = map.get(k);
    if (!s) {
      s = emptyStats(k);
      map.set(k, s);
    }
    s.total += 1;
    switch (l.status) {
      case "new":
        s.new += 1;
        break;
      case "contacted":
        s.contacted += 1;
        break;
      case "follow_up":
        s.follow_up += 1;
        break;
      case "closed":
        s.closed += 1;
        break;
      case "spam":
        s.spam += 1;
        break;
    }
    if (isNeedsAction(l, now)) s.needs_action += 1;
  }
  for (const s of map.values()) {
    // contacted rate counts anything that progressed past triage:
    // contacted + follow_up + closed (per spec).
    s.contacted_rate = rate(s.contacted + s.follow_up + s.closed, s.total);
    s.closed_rate = rate(s.closed, s.total);
    s.spam_rate = rate(s.spam, s.total);
  }
  return sortStats(Array.from(map.values()));
}

/**
 * Deterministic ordering: total DESC, then closed DESC, then key A→Z.
 */
export function sortStats(rows: GroupStats[]): GroupStats[] {
  return rows.slice().sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.closed !== a.closed) return b.closed - a.closed;
    return a.key.localeCompare(b.key);
  });
}

export function groupBySource(
  leads: LeadRow[],
  now: number = Date.now(),
): GroupStats[] {
  return groupBy(leads, (l) => l.source, now);
}

export function groupByLeadType(
  leads: LeadRow[],
  now: number = Date.now(),
): GroupStats[] {
  return groupBy(leads, (l) => l.lead_type, now);
}

export interface LeadAnalyticsSummary {
  top_source: string | null;
  best_closing_source: string | null;
  highest_spam_source: string | null;
  most_common_lead_type: string | null;
}

/**
 * Best-closing source = highest closed_rate among sources with >0 closed.
 * Highest-spam source = highest spam_rate among sources with >0 spam.
 * Ties broken by deterministic sortStats ordering.
 */
export function summarizeAnalytics(
  leads: LeadRow[],
  now: number = Date.now(),
): LeadAnalyticsSummary {
  const sources = groupBySource(leads, now);
  const types = groupByLeadType(leads, now);

  const top_source = sources[0]?.key ?? null;
  const most_common_lead_type = types[0]?.key ?? null;

  const closingCandidates = sources.filter((s) => s.closed > 0);
  closingCandidates.sort((a, b) => {
    if (b.closed_rate !== a.closed_rate) return b.closed_rate - a.closed_rate;
    if (b.closed !== a.closed) return b.closed - a.closed;
    return a.key.localeCompare(b.key);
  });
  const best_closing_source = closingCandidates[0]?.key ?? null;

  const spamCandidates = sources.filter((s) => s.spam > 0);
  spamCandidates.sort((a, b) => {
    if (b.spam_rate !== a.spam_rate) return b.spam_rate - a.spam_rate;
    if (b.spam !== a.spam) return b.spam - a.spam;
    return a.key.localeCompare(b.key);
  });
  const highest_spam_source = spamCandidates[0]?.key ?? null;

  return {
    top_source,
    best_closing_source,
    highest_spam_source,
    most_common_lead_type,
  };
}

export function formatRate(r: number): string {
  if (!Number.isFinite(r) || r <= 0) return "0%";
  return `${Math.round(r * 100)}%`;
}
