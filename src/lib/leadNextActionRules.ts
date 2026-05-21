/**
 * Pure logic for the read-only Lead Next Action Advisor.
 *
 * UI-only / read-derived. No I/O, no Supabase calls, no side effects.
 * Recommends a single next action for a lead based strictly on existing
 * LeadRow fields. Unknown/ambiguous data is never treated as healthy.
 */
import type { LeadRow, LeadStatus } from "@/hooks/useLeadsList";

export type LeadNextActionType =
  | "needs_first_contact"
  | "follow_up"
  | "ready_to_close"
  | "closed_no_action"
  | "lost_no_action"
  | "review_manually";

export type LeadNextActionPriority = "high" | "medium" | "low" | "none";

export interface LeadNextAction {
  type: LeadNextActionType;
  label: string;
  priority: LeadNextActionPriority;
  reason: string;
  /** Non-null when the recommendation rests on missing/ambiguous data. */
  warning: string | null;
  /** Lower weight = higher rank. Stable across calls for the same input. */
  sortWeight: number;
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set<LeadStatus>([
  "new",
  "reviewed",
  "contacted",
  "follow_up",
  "closed",
  "spam",
]);

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function isMeaningful(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Recommend the single next action for a lead.
 *
 * Deterministic: same input always yields the same output (no Date.now()
 * unless `now` is supplied; tests pass a fixed `now`).
 */
export function recommendNextAction(
  lead: LeadRow,
  now: number = Date.now(),
): LeadNextAction {
  const warnings: string[] = [];

  const statusRaw = (lead.status ?? "") as string;
  const statusKnown = KNOWN_STATUSES.has(statusRaw);
  if (!statusKnown) {
    warnings.push("Unknown or missing status");
  }
  if (!isMeaningful(lead.source)) {
    warnings.push("Missing source");
  }
  if (!isMeaningful(lead.lead_type)) {
    warnings.push("Missing lead type");
  }

  const createdAt = parseTime(lead.created_at);
  if (createdAt === null) {
    warnings.push("Missing or invalid created_at");
  }

  // Terminal states first — never recommend further action.
  if (statusKnown && lead.status === "closed") {
    return {
      type: "closed_no_action",
      label: "Closed - No Action",
      priority: "none",
      reason: "Lead is already closed.",
      warning: warnings.length ? warnings.join("; ") : null,
      sortWeight: 90,
    };
  }
  if (statusKnown && lead.status === "spam") {
    return {
      type: "lost_no_action",
      label: "Lost - No Action",
      priority: "none",
      reason: "Lead is marked spam and requires no further action.",
      warning: warnings.length ? warnings.join("; ") : null,
      sortWeight: 95,
    };
  }

  // Unknown status: never assume healthy.
  if (!statusKnown) {
    return {
      type: "review_manually",
      label: "Review Manually",
      priority: "medium",
      reason: "Lead status is unknown or missing.",
      warning: warnings.join("; "),
      sortWeight: 50,
    };
  }

  const contactedAt = parseTime(lead.contacted_at);
  const followUpAt = parseTime(lead.follow_up_at);

  // Follow-up scheduled: due/overdue is high priority, future is medium.
  if (lead.status === "follow_up" || followUpAt !== null) {
    if (followUpAt === null) {
      return {
        type: "review_manually",
        label: "Review Manually",
        priority: "medium",
        reason:
          "Lead is in follow-up state but no follow_up_at is scheduled.",
        warning: [...warnings, "Missing follow_up_at"].join("; "),
        sortWeight: 40,
      };
    }
    const overdue = followUpAt <= now;
    return {
      type: "follow_up",
      label: "Follow Up",
      priority: overdue ? "high" : "medium",
      reason: overdue
        ? "Scheduled follow-up is due or overdue."
        : "Follow-up is scheduled for the future.",
      warning: warnings.length ? warnings.join("; ") : null,
      sortWeight: overdue ? 10 : 30,
    };
  }

  // Contacted and engaged but not yet closed/follow_up → push to close.
  if (lead.status === "contacted" && contactedAt !== null) {
    const ageDays = (now - contactedAt) / DAY_MS;
    const stale = ageDays >= 2;
    return {
      type: "ready_to_close",
      label: "Ready to Close",
      priority: stale ? "high" : "medium",
      reason: stale
        ? "Lead was contacted but has not progressed; decide to close or schedule follow-up."
        : "Lead was recently contacted; confirm outcome and close or schedule follow-up.",
      warning: warnings.length ? warnings.join("; ") : null,
      sortWeight: stale ? 15 : 35,
    };
  }

  // New / reviewed / contacted-without-timestamp → first contact required.
  if (
    lead.status === "new" ||
    lead.status === "reviewed" ||
    (lead.status === "contacted" && contactedAt === null)
  ) {
    const ageDays =
      createdAt === null ? null : (now - createdAt) / DAY_MS;
    const aged = ageDays !== null && ageDays >= 1;
    const priority: LeadNextActionPriority = aged ? "high" : "medium";
    const extraWarn =
      lead.status === "contacted" && contactedAt === null
        ? ["Status is contacted but contacted_at is missing"]
        : [];
    const combined = [...warnings, ...extraWarn];
    return {
      type: "needs_first_contact",
      label: "Needs First Contact",
      priority,
      reason: aged
        ? "Lead has not been contacted and is more than a day old."
        : "Lead has not been contacted yet.",
      warning: combined.length ? combined.join("; ") : null,
      sortWeight: aged ? 5 : 20,
    };
  }

  // Fallback safety net — never silently treat as healthy.
  return {
    type: "review_manually",
    label: "Review Manually",
    priority: "medium",
    reason: "Lead does not match any known recommendation rule.",
    warning: [...warnings, "Unhandled state"].join("; "),
    sortWeight: 60,
  };
}

/**
 * Priority ordering helper for future list ranking.
 * Lower number = more urgent.
 */
export function priorityRank(p: LeadNextActionPriority): number {
  switch (p) {
    case "high":
      return 0;
    case "medium":
      return 1;
    case "low":
      return 2;
    case "none":
      return 3;
    default:
      return 99;
  }
}
