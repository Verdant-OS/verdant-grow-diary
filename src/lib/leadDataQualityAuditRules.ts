/**
 * Pure logic for the read-only Lead Data Quality Audit.
 *
 * UI-only / read-derived. No I/O, no Supabase calls, no persistence.
 * Findings carry affected lead IDs ONLY — never raw lead fields
 * (no names, emails, notes, phones, messages).
 */
import type { LeadRow } from "@/hooks/useLeadsList";

export type LeadDataQualitySeverity = "info" | "watch" | "warning";

export interface LeadDataQualityFinding {
  id: string;
  severity: LeadDataQualitySeverity;
  title: string;
  count: number;
  /** 0-100 with one decimal. */
  percentage: number;
  /** Lead IDs only — never raw lead data. */
  affectedLeadIds: string[];
  recommendation: string;
  /** Higher = more urgent within the same severity. */
  sortWeight: number;
}

const KNOWN_STATUSES = new Set([
  "new",
  "reviewed",
  "contacted",
  "follow_up",
  "closed",
  "spam",
]);

const SEVERITY_WEIGHT: Record<LeadDataQualitySeverity, number> = {
  warning: 3,
  watch: 2,
  info: 1,
};

const STALE_DAYS = 30;

function isMeaningful(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function safePct(num: number, den: number): number {
  if (!den || den <= 0) return 0;
  return Math.round((num / den) * 1000) / 10;
}

function isValidIsoDate(v: string | null | undefined): boolean {
  if (typeof v !== "string" || !v) return false;
  const t = Date.parse(v);
  return Number.isFinite(t);
}

function safeId(l: LeadRow): string {
  return typeof l.id === "string" && l.id ? l.id : "";
}

/**
 * Build deterministic data-quality findings for a (filtered) lead set.
 *
 * Ordering:
 *   1. severity weight desc
 *   2. count desc
 *   3. sortWeight desc
 *   4. id lexical asc
 */
export function auditLeadDataQuality(
  leads: readonly LeadRow[],
  now: number = Date.now(),
): LeadDataQualityFinding[] {
  const list = Array.isArray(leads) ? leads : [];
  const total = list.length;

  if (total === 0) {
    return [
      {
        id: "no_leads",
        severity: "info",
        title: "No leads in current view",
        count: 0,
        percentage: 0,
        affectedLeadIds: [],
        recommendation:
          "Clear filters or broaden the search to audit lead data.",
        sortWeight: 10,
      },
    ];
  }

  const findings: LeadDataQualityFinding[] = [];

  const missingSource: string[] = [];
  const missingType: string[] = [];
  const invalidStatus: string[] = [];
  const invalidCreated: string[] = [];
  const missingName: string[] = [];
  const missingNotes: string[] = [];
  const stale: string[] = [];

  // duplicate detection: email lowercase, then (name+company) lowercase
  const emailGroups = new Map<string, string[]>();
  const nameCompanyGroups = new Map<string, string[]>();

  for (const l of list) {
    const id = safeId(l);
    if (!isMeaningful(l.source)) missingSource.push(id);
    if (!isMeaningful(l.lead_type)) missingType.push(id);
    if (typeof l.status !== "string" || !KNOWN_STATUSES.has(l.status)) {
      invalidStatus.push(id);
    }
    if (!isValidIsoDate(l.created_at)) invalidCreated.push(id);
    if (!isMeaningful(l.name)) missingName.push(id);
    if (!isMeaningful(l.operator_notes)) missingNotes.push(id);

    // stale: created_at valid, not closed/spam, and older than threshold
    if (isValidIsoDate(l.created_at)) {
      const ageDays = (now - Date.parse(l.created_at)) / 86_400_000;
      const stalled =
        l.status !== "closed" &&
        l.status !== "spam" &&
        ageDays > STALE_DAYS;
      if (stalled) stale.push(id);
    }

    const emailKey = isMeaningful(l.email)
      ? l.email.trim().toLowerCase()
      : "";
    if (emailKey) {
      const arr = emailGroups.get(emailKey) ?? [];
      arr.push(id);
      emailGroups.set(emailKey, arr);
    }
    if (isMeaningful(l.name) && isMeaningful(l.company)) {
      const key = `${l.name!.trim().toLowerCase()}|${l.company!.trim().toLowerCase()}`;
      const arr = nameCompanyGroups.get(key) ?? [];
      arr.push(id);
      nameCompanyGroups.set(key, arr);
    }
  }

  const duplicateIds = new Set<string>();
  for (const arr of emailGroups.values()) {
    if (arr.length > 1) for (const id of arr) duplicateIds.add(id);
  }
  for (const arr of nameCompanyGroups.values()) {
    if (arr.length > 1) for (const id of arr) duplicateIds.add(id);
  }
  const duplicates = [...duplicateIds].sort();

  pushFinding(findings, {
    id: "missing_source",
    severity: "warning",
    title: "Leads with missing or unknown source",
    ids: missingSource,
    total,
    recommendation:
      "Capture source on intake forms to improve channel reporting.",
    sortWeight: 80,
  });
  pushFinding(findings, {
    id: "missing_lead_type",
    severity: "warning",
    title: "Leads with missing or unknown lead type",
    ids: missingType,
    total,
    recommendation: "Set a lead type at capture or during review.",
    sortWeight: 78,
  });
  pushFinding(findings, {
    id: "invalid_status",
    severity: "warning",
    title: "Leads with missing or invalid status",
    ids: invalidStatus,
    total,
    recommendation: "Resolve ambiguous leads to a known status.",
    sortWeight: 90,
  });
  pushFinding(findings, {
    id: "invalid_created_at",
    severity: "warning",
    title: "Leads with missing or invalid created_at",
    ids: invalidCreated,
    total,
    recommendation:
      "Check ingestion — created_at should always be a valid timestamp.",
    sortWeight: 85,
  });
  pushFinding(findings, {
    id: "missing_name",
    severity: "watch",
    title: "Leads using display-name fallback",
    ids: missingName,
    total,
    recommendation:
      "Capture a name at intake; otherwise the UI falls back to email or 'Unknown lead'.",
    sortWeight: 60,
  });
  pushFinding(findings, {
    id: "missing_notes",
    severity: "info",
    title: "Leads without operator notes",
    ids: missingNotes,
    total,
    recommendation: "Add a short note after first contact for context.",
    sortWeight: 20,
  });
  pushFinding(findings, {
    id: "duplicate_looking",
    severity: "watch",
    title: "Possible duplicate leads",
    ids: duplicates,
    total,
    recommendation:
      "Review leads that share an email or name+company and merge / mark spam if appropriate.",
    sortWeight: 70,
  });
  pushFinding(findings, {
    id: "stale_leads",
    severity: "watch",
    title: "Stale leads with no resolution",
    ids: stale,
    total,
    recommendation:
      "Decide whether to close, escalate, or re-engage leads older than 30 days.",
    sortWeight: 65,
  });

  if (findings.length === 0) {
    findings.push({
      id: "healthy",
      severity: "info",
      title: "Lead data looks clean",
      count: total,
      percentage: 100,
      affectedLeadIds: [],
      recommendation: "No data-quality issues detected in the current view.",
      sortWeight: 5,
    });
  }

  return sortFindings(findings);
}

function pushFinding(
  out: LeadDataQualityFinding[],
  spec: {
    id: string;
    severity: LeadDataQualitySeverity;
    title: string;
    ids: string[];
    total: number;
    recommendation: string;
    sortWeight: number;
  },
): void {
  if (spec.ids.length === 0) return;
  out.push({
    id: spec.id,
    severity: spec.severity,
    title: spec.title,
    count: spec.ids.length,
    percentage: safePct(spec.ids.length, spec.total),
    affectedLeadIds: [...spec.ids].sort(),
    recommendation: spec.recommendation,
    sortWeight: spec.sortWeight,
  });
}

export function sortFindings(
  findings: LeadDataQualityFinding[],
): LeadDataQualityFinding[] {
  return [...findings].sort((a, b) => {
    const sa = SEVERITY_WEIGHT[a.severity];
    const sb = SEVERITY_WEIGHT[b.severity];
    if (sa !== sb) return sb - sa;
    if (a.count !== b.count) return b.count - a.count;
    if (a.sortWeight !== b.sortWeight) return b.sortWeight - a.sortWeight;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
