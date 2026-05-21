/**
 * Pure helpers for the read-only Lead Activity Timeline.
 *
 * UI-only / read-derived. No I/O, no Supabase calls, no side effects, no
 * persistence. Derives a timeline strictly from existing LeadRow fields.
 */
import type { LeadRow, LeadStatus } from "@/hooks/useLeadsList";
import { isMeaningfulString as isMeaningful } from "@/lib/leadFieldUtils";

export type LeadActivityEventType =
  | "lead_created"
  | "source_captured"
  | "lead_type_captured"
  | "notes_present"
  | "contacted"
  | "follow_up_scheduled"
  | "closed"
  | "status_current";

export interface LeadActivityEvent {
  /** Stable id, deterministic per (lead.id, type). */
  id: string;
  type: LeadActivityEventType;
  label: string;
  detail?: string;
  /** ISO timestamp if a valid date is available, otherwise null. */
  at: string | null;
  /** Sort weight used as a deterministic tie-breaker (lower = older). */
  order: number;
}

function safeIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}


function statusLabel(status: LeadStatus): string {
  switch (status) {
    case "new":
      return "New";
    case "reviewed":
      return "Reviewed";
    case "contacted":
      return "Contacted";
    case "follow_up":
      return "Follow-up";
    case "closed":
      return "Closed";
    case "spam":
      return "Spam";
    default:
      return String(status);
  }
}

/**
 * Build the read-only activity timeline for a single lead, derived
 * exclusively from fields already present on LeadRow.
 *
 * Ordering: newest-first by `at`, with deterministic tie-breakers:
 *   1. events with a valid `at` come before undated events
 *   2. higher `order` weight wins (newer logical step)
 *   3. fallback to `type` ascending for full determinism
 */
export function buildLeadActivityTimeline(
  lead: LeadRow,
): LeadActivityEvent[] {
  const events: LeadActivityEvent[] = [];

  const createdAt = safeIso(lead.created_at);
  events.push({
    id: `${lead.id}:lead_created`,
    type: "lead_created",
    label: "Lead created",
    at: createdAt,
    order: 0,
  });

  if (isMeaningful(lead.source)) {
    events.push({
      id: `${lead.id}:source_captured`,
      type: "source_captured",
      label: "Source captured",
      detail: lead.source,
      at: createdAt,
      order: 1,
    });
  }

  if (isMeaningful(lead.lead_type)) {
    events.push({
      id: `${lead.id}:lead_type_captured`,
      type: "lead_type_captured",
      label: "Lead type captured",
      detail: lead.lead_type,
      at: createdAt,
      order: 2,
    });
  }

  if (isMeaningful(lead.operator_notes)) {
    events.push({
      id: `${lead.id}:notes_present`,
      type: "notes_present",
      label: "Operator notes present",
      at: safeIso(lead.updated_at) ?? createdAt,
      order: 3,
    });
  }

  const contactedAt = safeIso(lead.contacted_at);
  if (contactedAt) {
    events.push({
      id: `${lead.id}:contacted`,
      type: "contacted",
      label: "Marked contacted",
      at: contactedAt,
      order: 4,
    });
  }

  const followUpAt = safeIso(lead.follow_up_at);
  if (followUpAt) {
    events.push({
      id: `${lead.id}:follow_up_scheduled`,
      type: "follow_up_scheduled",
      label: "Follow-up scheduled",
      detail: followUpAt,
      at: followUpAt,
      order: 5,
    });
  }

  if (lead.status === "closed") {
    events.push({
      id: `${lead.id}:closed`,
      type: "closed",
      label: "Lead closed",
      at: safeIso(lead.updated_at) ?? contactedAt ?? createdAt,
      order: 6,
    });
  }

  events.push({
    id: `${lead.id}:status_current`,
    type: "status_current",
    label: "Current status",
    detail: statusLabel(lead.status),
    at: safeIso(lead.updated_at) ?? createdAt,
    order: 7,
  });

  return sortActivityEvents(events);
}

/**
 * Deterministic newest-first sort with stable tie-breakers.
 * Exported so callers/tests can verify ordering on synthetic inputs.
 */
export function sortActivityEvents(
  events: LeadActivityEvent[],
): LeadActivityEvent[] {
  return [...events].sort((a, b) => {
    const aT = a.at ? new Date(a.at).getTime() : null;
    const bT = b.at ? new Date(b.at).getTime() : null;
    if (aT !== null && bT === null) return -1;
    if (aT === null && bT !== null) return 1;
    if (aT !== null && bT !== null && aT !== bT) return bT - aT;
    if (a.order !== b.order) return b.order - a.order;
    return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
  });
}
