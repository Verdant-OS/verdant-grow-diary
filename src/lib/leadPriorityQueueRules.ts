/**
 * Pure logic for the read-only Lead Priority Queue.
 *
 * UI-only / read-derived. No I/O, no Supabase calls, no side effects.
 * Reuses recommendNextAction from leadNextActionRules to avoid duplicating
 * recommendation logic.
 */
import type { LeadRow } from "@/hooks/useLeadsList";
import {
  recommendNextAction,
  priorityRank,
  type LeadNextActionPriority,
  type LeadNextActionType,
} from "@/lib/leadNextActionRules";
import { parseLeadTime } from "@/lib/leadFieldUtils";

export interface LeadPriorityQueueItem {
  leadId: string;
  /** Trimmed lead name, falling back to email, then to "Unknown lead". */
  label: string;
  actionType: LeadNextActionType;
  actionLabel: string;
  priority: LeadNextActionPriority;
  reason: string;
  /** Higher = more urgent. Deterministic for the same input. */
  rankScore: number;
  warnings: string[];
}

function priorityWeight(p: LeadNextActionPriority): number {
  // Inverse of priorityRank: higher number = more urgent.
  switch (p) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    case "none":
      return 0;
    default:
      return -1;
  }
}

function safeLabel(lead: LeadRow): string {
  const name = lead.name?.trim();
  if (name) return name;
  const email = typeof lead.email === "string" ? lead.email.trim() : "";
  if (email) return email;
  return "Unknown lead";
}

function safeCreatedTime(iso: string | null | undefined): number {
  const t = parseLeadTime(iso);
  return t === null ? Number.POSITIVE_INFINITY : t;
}

/**
 * Build a single queue item for a lead.
 */
export function buildPriorityQueueItem(
  lead: LeadRow,
  now: number = Date.now(),
): LeadPriorityQueueItem {
  const rec = recommendNextAction(lead, now);
  const warnings = rec.warning
    ? rec.warning.split(";").map((w) => w.trim()).filter(Boolean)
    : [];
  const rankScore =
    priorityWeight(rec.priority) * 1000 - rec.sortWeight;
  return {
    leadId: lead.id,
    label: safeLabel(lead),
    actionType: rec.type,
    actionLabel: rec.label,
    priority: rec.priority,
    reason: rec.reason,
    rankScore,
    warnings,
  };
}

/**
 * Build the full priority queue from a list of leads.
 *
 * Deterministic ordering:
 *   1. priority weight descending  (high > medium > low > none)
 *   2. next-action sortWeight descending
 *   3. rankScore descending
 *   4. createdAt ascending (older first); invalid/missing dates last
 *   5. lead id lexical ascending
 *
 * Empty input → empty queue.
 */
export function buildPriorityQueue(
  leads: readonly LeadRow[],
  now: number = Date.now(),
): LeadPriorityQueueItem[] {
  if (!leads || leads.length === 0) return [];
  const enriched = leads.map((l) => {
    const item = buildPriorityQueueItem(l, now);
    const rec = recommendNextAction(l, now);
    return {
      item,
      sortWeight: rec.sortWeight,
      createdAt: safeCreatedTime(l.created_at),
    };
  });

  enriched.sort((a, b) => {
    const pa = priorityWeight(a.item.priority);
    const pb = priorityWeight(b.item.priority);
    if (pa !== pb) return pb - pa;
    if (a.sortWeight !== b.sortWeight) return b.sortWeight - a.sortWeight;
    if (a.item.rankScore !== b.item.rankScore)
      return b.item.rankScore - a.item.rankScore;
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.item.leadId < b.item.leadId
      ? -1
      : a.item.leadId > b.item.leadId
        ? 1
        : 0;
  });

  return enriched.map((e) => e.item);
}

/** Re-export so callers can rank externally without importing both modules. */
export { priorityRank };
