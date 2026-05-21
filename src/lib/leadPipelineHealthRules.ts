/**
 * Pure logic for the read-only Lead Pipeline Health Warnings.
 *
 * UI-only / read-derived. No I/O, no Supabase calls, no side effects.
 * Reuses summarizeLeadStatuses and the existing rule modules so we never
 * duplicate classification logic.
 */
import type { LeadRow } from "@/hooks/useLeadsList";
import { summarizeLeadStatuses } from "@/lib/leadStatusSummaryRules";

export type LeadPipelineHealthSeverity = "info" | "watch" | "warning";

export interface LeadPipelineHealthWarning {
  id: string;
  severity: LeadPipelineHealthSeverity;
  title: string;
  message: string;
  /** Numeric metric the warning is based on (count, %, or score). */
  metricValue: number;
  recommendation: string;
  /** Higher = more urgent. Stable across calls for the same input. */
  sortWeight: number;
}

const SEVERITY_WEIGHT: Record<LeadPipelineHealthSeverity, number> = {
  warning: 3,
  watch: 2,
  info: 1,
};

function isMeaningful(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function safePct(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * Build the deterministic pipeline-health warning list for the current
 * (filtered) lead set.
 *
 * Deterministic ordering:
 *   1. severity weight descending  (warning > watch > info)
 *   2. sort weight descending
 *   3. id lexical ascending
 */
export function evaluatePipelineHealth(
  leads: readonly LeadRow[],
  now: number = Date.now(),
): LeadPipelineHealthWarning[] {
  const out: LeadPipelineHealthWarning[] = [];

  if (!leads || leads.length === 0) {
    out.push({
      id: "no_leads",
      severity: "info",
      title: "No leads in current view",
      message:
        "There are no leads matching the active filters / search.",
      metricValue: 0,
      recommendation:
        "Clear filters or broaden the search to see pipeline activity.",
      sortWeight: 10,
    });
    return sortHealthWarnings(out);
  }

  const summary = summarizeLeadStatuses(leads, now);
  const total = summary.total;

  const unknownSourceCount = leads.filter((l) => !isMeaningful(l.source)).length;
  const unknownTypeCount = leads.filter((l) => !isMeaningful(l.lead_type)).length;
  const pctUnknownSource = safePct(unknownSourceCount, total);
  const pctUnknownType = safePct(unknownTypeCount, total);
  const pctNeedsFirstContact = safePct(summary.needsFirstContact, total);
  const pctFollowUp = safePct(summary.followUp, total);
  const pctReview = safePct(summary.reviewManually, total);

  // High first-contact backlog
  if (total >= 4 && pctNeedsFirstContact > 50) {
    out.push({
      id: "high_first_contact",
      severity: "warning",
      title: "Too many leads need first contact",
      message: `${summary.needsFirstContact}/${total} leads (${pctNeedsFirstContact}%) are awaiting first contact.`,
      metricValue: pctNeedsFirstContact,
      recommendation:
        "Reach out to the newest uncontacted leads to clear the backlog.",
      sortWeight: 90 + Math.round(pctNeedsFirstContact),
    });
  }

  // Stuck in follow-up
  if (total >= 4 && pctFollowUp > 40) {
    out.push({
      id: "stuck_follow_up",
      severity: "watch",
      title: "Many leads stuck in follow-up",
      message: `${summary.followUp}/${total} leads (${pctFollowUp}%) are in follow-up.`,
      metricValue: pctFollowUp,
      recommendation:
        "Review follow-up dates and decide which leads to close or escalate.",
      sortWeight: 60 + Math.round(pctFollowUp),
    });
  }

  // Low close percentage
  if (total >= 5 && summary.percentClosed < 10) {
    out.push({
      id: "low_close_rate",
      severity: "watch",
      title: "Low close rate",
      message: `Only ${summary.percentClosed}% of leads in view are closed.`,
      metricValue: summary.percentClosed,
      recommendation:
        "Check whether qualified leads are progressing to a close decision.",
      sortWeight: 50 + Math.round(50 - summary.percentClosed),
    });
  }

  // Too many review-manually leads
  if (total >= 4 && pctReview > 20) {
    out.push({
      id: "too_many_review",
      severity: "warning",
      title: "Many leads need manual review",
      message: `${summary.reviewManually}/${total} leads (${pctReview}%) need manual review.`,
      metricValue: pctReview,
      recommendation:
        "Inspect leads with ambiguous data and resolve their status.",
      sortWeight: 80 + Math.round(pctReview),
    });
  }

  // Unknown source
  if (pctUnknownSource > 30) {
    out.push({
      id: "high_unknown_source",
      severity: "warning",
      title: "High unknown source rate",
      message: `${unknownSourceCount}/${total} leads (${pctUnknownSource}%) have no source recorded.`,
      metricValue: pctUnknownSource,
      recommendation:
        "Capture the source on intake forms to improve channel reporting.",
      sortWeight: 70 + Math.round(pctUnknownSource),
    });
  }

  // Unknown lead type
  if (pctUnknownType > 30) {
    out.push({
      id: "high_unknown_type",
      severity: "warning",
      title: "High unknown lead-type rate",
      message: `${unknownTypeCount}/${total} leads (${pctUnknownType}%) have no lead type recorded.`,
      metricValue: pctUnknownType,
      recommendation:
        "Require a lead type at capture or set it during review.",
      sortWeight: 70 + Math.round(pctUnknownType),
    });
  }

  // Low average quality
  if (total >= 3 && summary.averageQualityScore < 50) {
    out.push({
      id: "low_avg_quality",
      severity: "watch",
      title: "Low average lead quality",
      message: `Average quality score is ${summary.averageQualityScore}/100.`,
      metricValue: summary.averageQualityScore,
      recommendation:
        "Improve intake completeness or revisit qualification criteria.",
      sortWeight: 40 + Math.round(50 - summary.averageQualityScore),
    });
  }

  if (out.length === 0) {
    out.push({
      id: "pipeline_healthy",
      severity: "info",
      title: "Pipeline looks healthy",
      message: `No risk thresholds tripped across ${total} leads in view.`,
      metricValue: total,
      recommendation:
        "Keep monitoring; revisit follow-ups and close decisions regularly.",
      sortWeight: 5,
    });
  }

  return sortHealthWarnings(out);
}

export function sortHealthWarnings(
  warnings: LeadPipelineHealthWarning[],
): LeadPipelineHealthWarning[] {
  return [...warnings].sort((a, b) => {
    const sa = SEVERITY_WEIGHT[a.severity];
    const sb = SEVERITY_WEIGHT[b.severity];
    if (sa !== sb) return sb - sa;
    if (a.sortWeight !== b.sortWeight) return b.sortWeight - a.sortWeight;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
