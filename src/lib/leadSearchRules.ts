/**
 * Pure helpers for searching and sorting the operator Leads inbox.
 *
 * UI-only / read-derived. No I/O, no Supabase, no side effects.
 */
import type { LeadRow } from "@/hooks/useLeadsList";

export type LeadSortOption =
  | "default"
  | "newest"
  | "oldest"
  | "follow_up_soonest"
  | "status"
  | "az";

export const SORT_OPTIONS: ReadonlyArray<{ id: LeadSortOption; label: string }> = [
  { id: "default", label: "Default" },
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "follow_up_soonest", label: "Follow-up soonest" },
  { id: "status", label: "Status" },
  { id: "az", label: "Company/Name A–Z" },
];

const SEARCH_FIELDS: ReadonlyArray<keyof LeadRow> = [
  "name",
  "email",
  "company",
  "role",
  "lead_type",
  "source",
  "message",
  "operator_notes",
];

/**
 * Case-insensitive, whitespace-trimmed substring search across the
 * operator-visible text fields. Empty/whitespace-only query returns all leads.
 */
export function searchLeads(leads: LeadRow[], query: string): LeadRow[] {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return leads.slice();
  return leads.filter((l) =>
    SEARCH_FIELDS.some((f) => {
      const v = l[f];
      return typeof v === "string" && v.toLowerCase().includes(q);
    }),
  );
}

function toTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

// Stable, predictable status ordering: action-needed first, terminal last.
const STATUS_ORDER: Record<string, number> = {
  new: 0,
  reviewed: 1,
  follow_up: 2,
  contacted: 3,
  closed: 4,
  spam: 5,
};

function azKey(l: LeadRow): string {
  return (l.company ?? l.name ?? l.email ?? "").toLowerCase();
}

/**
 * Deterministic sort. All comparators tie-break on id for stability.
 *
 * - newest: created_at DESC
 * - oldest: created_at ASC
 * - follow_up_soonest: follow_up_at ASC; missing dates sort to the end
 * - status: STATUS_ORDER then created_at DESC
 * - az: company/name/email A→Z
 */
export function sortLeads(leads: LeadRow[], option: LeadSortOption): LeadRow[] {
  const out = leads.slice();
  switch (option) {
    case "newest":
      out.sort((a, b) => {
        const ta = toTime(a.created_at) ?? 0;
        const tb = toTime(b.created_at) ?? 0;
        if (tb !== ta) return tb - ta;
        return a.id.localeCompare(b.id);
      });
      return out;
    case "oldest":
      out.sort((a, b) => {
        const ta = toTime(a.created_at) ?? 0;
        const tb = toTime(b.created_at) ?? 0;
        if (ta !== tb) return ta - tb;
        return a.id.localeCompare(b.id);
      });
      return out;
    case "follow_up_soonest":
      out.sort((a, b) => {
        const ta = toTime(a.follow_up_at);
        const tb = toTime(b.follow_up_at);
        if (ta === null && tb === null) return a.id.localeCompare(b.id);
        if (ta === null) return 1;
        if (tb === null) return -1;
        if (ta !== tb) return ta - tb;
        return a.id.localeCompare(b.id);
      });
      return out;
    case "status":
      out.sort((a, b) => {
        const sa = STATUS_ORDER[a.status] ?? 99;
        const sb = STATUS_ORDER[b.status] ?? 99;
        if (sa !== sb) return sa - sb;
        const ta = toTime(a.created_at) ?? 0;
        const tb = toTime(b.created_at) ?? 0;
        if (tb !== ta) return tb - ta;
        return a.id.localeCompare(b.id);
      });
      return out;
    case "az":
      out.sort((a, b) => {
        const ka = azKey(a);
        const kb = azKey(b);
        const cmp = ka.localeCompare(kb);
        if (cmp !== 0) return cmp;
        return a.id.localeCompare(b.id);
      });
      return out;
    case "default":
    default:
      return out;
  }
}
