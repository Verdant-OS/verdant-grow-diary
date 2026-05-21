/**
 * Pure helpers for the operator Leads follow-up queue.
 *
 * UI-only / read-derived. No I/O, no Supabase calls, no side effects.
 * Operates on LeadRow shape from useLeadsList.
 */
import type { LeadRow, LeadStatus } from "@/hooks/useLeadsList";

export type LeadQuickFilter =
  | "all"
  | "needs_action"
  | "overdue"
  | "due_today"
  | "upcoming"
  | "new"
  | "follow_up"
  | "closed"
  | "spam";

export type FollowUpBadge =
  | "overdue"
  | "due_today"
  | "upcoming"
  | "no_follow_up";

const DAY_MS = 24 * 60 * 60 * 1000;

function toTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * "Needs action" =
 *   status = new
 *   OR status = reviewed with no contacted_at
 *   OR status = follow_up with follow_up_at <= now
 * Closed/spam never need action.
 */
export function isNeedsAction(lead: LeadRow, now: number = Date.now()): boolean {
  if (lead.status === "closed" || lead.status === "spam") return false;
  if (lead.status === "new") return true;
  if (lead.status === "reviewed" && !lead.contacted_at) return true;
  if (lead.status === "follow_up") {
    const t = toTime(lead.follow_up_at);
    if (t === null) return false;
    return t <= now;
  }
  return false;
}

export function isOverdue(lead: LeadRow, now: number = Date.now()): boolean {
  if (lead.status !== "follow_up") return false;
  const t = toTime(lead.follow_up_at);
  if (t === null) return false;
  return t < startOfDay(now);
}

export function isDueToday(lead: LeadRow, now: number = Date.now()): boolean {
  if (lead.status !== "follow_up") return false;
  const t = toTime(lead.follow_up_at);
  if (t === null) return false;
  const sod = startOfDay(now);
  return t >= sod && t < sod + DAY_MS;
}

export function isUpcoming(lead: LeadRow, now: number = Date.now()): boolean {
  if (lead.status !== "follow_up") return false;
  const t = toTime(lead.follow_up_at);
  if (t === null) return false;
  return t >= startOfDay(now) + DAY_MS;
}

export function followUpBadge(
  lead: LeadRow,
  now: number = Date.now(),
): FollowUpBadge | null {
  if (lead.status !== "follow_up") return null;
  if (!lead.follow_up_at) return "no_follow_up";
  if (isOverdue(lead, now)) return "overdue";
  if (isDueToday(lead, now)) return "due_today";
  if (isUpcoming(lead, now)) return "upcoming";
  return null;
}

export interface LeadSummary {
  new_leads: number;
  needs_action: number;
  overdue: number;
  due_today: number;
  upcoming: number;
  closed: number;
}

export function summarizeLeads(
  leads: LeadRow[],
  now: number = Date.now(),
): LeadSummary {
  const s: LeadSummary = {
    new_leads: 0,
    needs_action: 0,
    overdue: 0,
    due_today: 0,
    upcoming: 0,
    closed: 0,
  };
  for (const l of leads) {
    if (l.status === "new") s.new_leads += 1;
    if (l.status === "closed") s.closed += 1;
    if (isNeedsAction(l, now)) s.needs_action += 1;
    if (isOverdue(l, now)) s.overdue += 1;
    if (isDueToday(l, now)) s.due_today += 1;
    if (isUpcoming(l, now)) s.upcoming += 1;
  }
  return s;
}

const STATUS_FILTER_MAP: Partial<Record<LeadQuickFilter, LeadStatus>> = {
  new: "new",
  follow_up: "follow_up",
  closed: "closed",
  spam: "spam",
};

/**
 * Apply a quick filter and produce a deterministically sorted view.
 *
 * - "all" preserves newest-first (by created_at desc).
 * - Follow-up-focused filters (needs_action, overdue, due_today, upcoming,
 *   follow_up) sort by follow_up_at ASC with overdue first; leads missing
 *   follow_up_at sort to the end. Ties break by created_at ASC then id.
 */
export function filterAndSortLeads(
  leads: LeadRow[],
  filter: LeadQuickFilter,
  now: number = Date.now(),
): LeadRow[] {
  let out: LeadRow[];
  switch (filter) {
    case "all":
      out = leads.slice();
      break;
    case "needs_action":
      out = leads.filter((l) => isNeedsAction(l, now));
      break;
    case "overdue":
      out = leads.filter((l) => isOverdue(l, now));
      break;
    case "due_today":
      out = leads.filter((l) => isDueToday(l, now));
      break;
    case "upcoming":
      out = leads.filter((l) => isUpcoming(l, now));
      break;
    default: {
      const s = STATUS_FILTER_MAP[filter];
      out = s ? leads.filter((l) => l.status === s) : leads.slice();
    }
  }

  const isFollowUpFocused =
    filter === "needs_action" ||
    filter === "overdue" ||
    filter === "due_today" ||
    filter === "upcoming" ||
    filter === "follow_up";

  if (!isFollowUpFocused) {
    // newest-first by created_at desc; tiebreak by id for determinism
    out.sort((a, b) => {
      const ta = toTime(a.created_at) ?? 0;
      const tb = toTime(b.created_at) ?? 0;
      if (tb !== ta) return tb - ta;
      return a.id.localeCompare(b.id);
    });
    return out;
  }

  out.sort((a, b) => {
    const ta = toTime(a.follow_up_at);
    const tb = toTime(b.follow_up_at);
    // Missing follow_up_at sorts to the end.
    if (ta === null && tb === null) {
      const ca = toTime(a.created_at) ?? 0;
      const cb = toTime(b.created_at) ?? 0;
      if (ca !== cb) return ca - cb;
      return a.id.localeCompare(b.id);
    }
    if (ta === null) return 1;
    if (tb === null) return -1;
    if (ta !== tb) return ta - tb; // overdue (smaller timestamp) first
    const ca = toTime(a.created_at) ?? 0;
    const cb = toTime(b.created_at) ?? 0;
    if (ca !== cb) return ca - cb;
    return a.id.localeCompare(b.id);
  });
  return out;
}

export const QUICK_FILTERS: ReadonlyArray<{
  id: LeadQuickFilter;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "needs_action", label: "Needs Action" },
  { id: "overdue", label: "Overdue" },
  { id: "due_today", label: "Due Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "new", label: "New" },
  { id: "follow_up", label: "Follow-Up" },
  { id: "closed", label: "Closed" },
  { id: "spam", label: "Spam" },
];
