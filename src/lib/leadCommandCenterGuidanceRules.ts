/**
 * Pure logic for the read-only Lead Command Center Guidance.
 *
 * UI-only / read-derived. No I/O, no Supabase calls, no side effects.
 * Reuses summarizeLeadStatuses and evaluatePipelineHealth so we never
 * duplicate classification logic.
 */
import type { LeadRow } from "@/hooks/useLeadsList";
import { summarizeLeadStatuses } from "@/lib/leadStatusSummaryRules";
import { evaluatePipelineHealth } from "@/lib/leadPipelineHealthRules";
import { isMeaningfulString as isMeaningful } from "@/lib/leadFieldUtils";

export type LeadCommandCenterGuidanceState =
  | "empty"
  | "needs_attention"
  | "healthy";

export interface LeadCommandCenterGuidanceItem {
  id: string;
  state: LeadCommandCenterGuidanceState;
  title: string;
  message: string;
  suggestedAction: string;
  reasons: string[];
  warnings: string[];
  /** Higher = more urgent. Deterministic for a given input. */
  sortWeight: number;
}

export interface LeadCommandCenterGuidanceResult {
  state: LeadCommandCenterGuidanceState;
  items: LeadCommandCenterGuidanceItem[];
}

const STATE_WEIGHT: Record<LeadCommandCenterGuidanceState, number> = {
  needs_attention: 3,
  empty: 2,
  healthy: 1,
};


function safePct(num: number, den: number): number {
  if (!den || den <= 0) return 0;
  return Math.round((num / den) * 1000) / 10;
}

/**
 * Build deterministic command-center guidance for the current
 * (filtered) lead set.
 *
 * Deterministic ordering:
 *   1. state weight descending (needs_attention > empty > healthy)
 *   2. sortWeight descending
 *   3. id lexical ascending
 */
export function evaluateCommandCenterGuidance(
  leads: readonly LeadRow[],
  now: number = Date.now(),
  context: { hasActiveFilters?: boolean; totalUnfiltered?: number } = {},
): LeadCommandCenterGuidanceResult {
  const items: LeadCommandCenterGuidanceItem[] = [];
  const list = Array.isArray(leads) ? leads : [];

  if (list.length === 0) {
    const narrow =
      context.hasActiveFilters === true ||
      (typeof context.totalUnfiltered === "number" &&
        context.totalUnfiltered > 0);
    items.push({
      id: "no_leads_in_view",
      state: "empty",
      title: "No leads in current view",
      message: narrow
        ? "Your filters or search returned no leads."
        : "There are no leads to display yet.",
      suggestedAction: narrow
        ? "Clear filters or broaden the search."
        : "Wait for new submissions or import existing leads.",
      reasons: narrow
        ? ["Active filters or search query exclude all leads."]
        : ["No leads exist in the underlying data."],
      warnings: [],
      sortWeight: 100,
    });
    if (narrow) {
      items.push({
        id: "filters_too_narrow",
        state: "empty",
        title: "Filters may be too narrow",
        message:
          "Try removing one or more filters to see more results.",
        suggestedAction: "Reset filters to the default view.",
        reasons: ["Filtered view returned zero leads."],
        warnings: [],
        sortWeight: 90,
      });
    }
    return {
      state: "empty",
      items: sortItems(items),
    };
  }

  const summary = summarizeLeadStatuses(list, now);
  const health = evaluatePipelineHealth(list, now);
  const total = summary.total;

  const unknownSource = list.filter((l) => !isMeaningful(l.source)).length;
  const unknownType = list.filter((l) => !isMeaningful(l.lead_type)).length;
  const pctUnknownSource = safePct(unknownSource, total);
  const pctUnknownType = safePct(unknownType, total);
  const pctFirstContact = safePct(summary.needsFirstContact, total);
  const pctReview = safePct(summary.reviewManually, total);

  if (total >= 3 && pctFirstContact > 50) {
    items.push({
      id: "many_need_first_contact",
      state: "needs_attention",
      title: "Many leads need first contact",
      message: `${summary.needsFirstContact}/${total} leads (${pctFirstContact}%) are awaiting first contact.`,
      suggestedAction: "Open the priority queue and contact the top leads.",
      reasons: [`needsFirstContact=${summary.needsFirstContact}`],
      warnings: [],
      sortWeight: 90 + Math.round(pctFirstContact),
    });
  }

  if (total >= 3 && pctReview > 20) {
    items.push({
      id: "many_need_review",
      state: "needs_attention",
      title: "Many leads need manual review",
      message: `${summary.reviewManually}/${total} leads (${pctReview}%) need manual review.`,
      suggestedAction: "Open the detail drawer for ambiguous leads and resolve their status.",
      reasons: [`reviewManually=${summary.reviewManually}`],
      warnings: [],
      sortWeight: 85 + Math.round(pctReview),
    });
  }

  if (pctUnknownSource > 30) {
    items.push({
      id: "many_unknown_source",
      state: "needs_attention",
      title: "Many leads have unknown source",
      message: `${unknownSource}/${total} leads (${pctUnknownSource}%) have no source recorded.`,
      suggestedAction: "Capture source on intake to improve channel reporting.",
      reasons: [`unknownSource=${unknownSource}`],
      warnings: [],
      sortWeight: 70 + Math.round(pctUnknownSource),
    });
  }

  if (pctUnknownType > 30) {
    items.push({
      id: "many_unknown_type",
      state: "needs_attention",
      title: "Many leads have unknown lead type",
      message: `${unknownType}/${total} leads (${pctUnknownType}%) have no lead type recorded.`,
      suggestedAction: "Set a lead type during review.",
      reasons: [`unknownType=${unknownType}`],
      warnings: [],
      sortWeight: 70 + Math.round(pctUnknownType),
    });
  }

  if (total >= 3 && summary.averageQualityScore < 50) {
    items.push({
      id: "low_avg_quality",
      state: "needs_attention",
      title: "Low average lead quality",
      message: `Average quality score is ${summary.averageQualityScore}/100.`,
      suggestedAction: "Improve intake completeness or revisit qualification criteria.",
      reasons: [`averageQualityScore=${summary.averageQualityScore}`],
      warnings: [],
      sortWeight: 50 + Math.round(50 - summary.averageQualityScore),
    });
  }

  // surface health-only warnings without duplicating already-added items
  const addedIds = new Set(items.map((i) => i.id));
  for (const h of health) {
    const id = `health_${h.id}`;
    if (addedIds.has(id)) continue;
    if (h.severity !== "warning") continue;
    items.push({
      id,
      state: "needs_attention",
      title: h.title,
      message: h.message,
      suggestedAction: h.recommendation,
      reasons: [`pipelineHealth=${h.id}`],
      warnings: [],
      sortWeight: 40 + Math.round(h.metricValue || 0),
    });
  }

  if (items.length === 0) {
    items.push({
      id: "pipeline_healthy",
      state: "healthy",
      title: "Pipeline looks healthy",
      message: `No major issues across ${total} leads in view.`,
      suggestedAction: "Keep monitoring follow-ups and close decisions.",
      reasons: summary.warnings.length
        ? summary.warnings.map((w) => `summary:${w}`)
        : ["No risk thresholds tripped."],
      warnings: summary.warnings,
      sortWeight: 10,
    });
    return { state: "healthy", items: sortItems(items) };
  }

  // Attach summary warnings to the first needs_attention item (no duplication of cards)
  if (summary.warnings.length > 0) {
    items[0].warnings = [...items[0].warnings, ...summary.warnings];
  }

  return { state: "needs_attention", items: sortItems(items) };
}

function sortItems(
  items: LeadCommandCenterGuidanceItem[],
): LeadCommandCenterGuidanceItem[] {
  return [...items].sort((a, b) => {
    const sa = STATE_WEIGHT[a.state];
    const sb = STATE_WEIGHT[b.state];
    if (sa !== sb) return sb - sa;
    if (a.sortWeight !== b.sortWeight) return b.sortWeight - a.sortWeight;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
