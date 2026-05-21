import type { LeadRow } from "@/hooks/useLeadsList";

export interface LeadSubmissionField {
  label: string;
  value: string;
}

export interface LeadDetailViewModel {
  title: string;
  subtitle: string;
  receivedLabel: string;
  contactedLabel: string | null;
  followUpLabel: string | null;
  submission: LeadSubmissionField[];
  followUpInputValue: string;
}

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString() : null;

function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 16);
}

/**
 * Derives the read-only fields displayed in the lead detail drawer.
 * Pure helper so React only renders derived strings.
 */
export function buildLeadDetailViewModel(l: LeadRow): LeadDetailViewModel {
  const submission: LeadSubmissionField[] = [
    { label: "Name", value: l.name ?? "—" },
    { label: "Email", value: l.email },
    { label: "Company", value: l.company ?? "—" },
    { label: "Role", value: l.role ?? "—" },
    { label: "Lead type", value: l.lead_type },
    { label: "Source", value: l.source },
    { label: "Message", value: l.message ?? "—" },
  ];
  return {
    title: l.name?.trim() || l.email,
    subtitle: l.company ?? l.email,
    receivedLabel: fmt(l.created_at) ?? "—",
    contactedLabel: fmt(l.contacted_at),
    followUpLabel: fmt(l.follow_up_at),
    submission,
    followUpInputValue: toLocalInputValue(l.follow_up_at),
  };
}
