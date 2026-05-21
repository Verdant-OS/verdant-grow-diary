/**
 * Pure logic for the read-only Lead Command Center Executive Summary.
 *
 * UI-only / read-derived. No I/O, no Supabase calls, no persistence.
 * Composes existing rule outputs (status summary, pipeline health,
 * priority queue, data-quality audit, source insights) into a single
 * compact view-model.
 *
 * IMPORTANT: never embeds raw lead data (names, emails, notes, phones,
 * messages, ids) in the returned summary.
 */
import type { LeadRow } from "@/hooks/useLeadsList";
import { summarizeLeadStatuses } from "@/lib/leadStatusSummaryRules";
import { evaluatePipelineHealth } from "@/lib/leadPipelineHealthRules";
import { buildPriorityQueue } from "@/lib/leadPriorityQueueRules";
import { auditLeadDataQuality } from "@/lib/leadDataQualityAuditRules";
import { buildLeadSourceInsights } from "@/lib/leadSourceInsightRules";
import type { LeadCommandCenterSectionId } from "@/lib/leadCommandCenterLayoutRules";

export type LeadExecutiveSummaryState =
  | "healthy"
  | "needs_attention"
  | "risky"
  | "empty";

export interface LeadExecutiveSummary {
  headline: string;
  subheadline: string;
  overallState: LeadExecutiveSummaryState;
  topMetricLabel: string;
  topMetricValue: string;
  primaryRecommendation: string;
  supportingReasons: string[];
  warnings: string[];
  linkedSectionIds: LeadCommandCenterSectionId[];
}

function safePct(num: number, den: number): number {
  if (!den || den <= 0) return 0;
  return Math.round((num / den) * 1000) / 10;
}

/**
 * Build the deterministic executive summary for the current
 * (filtered) lead set.
 */
export function buildLeadExecutiveSummary(
  leads: readonly LeadRow[],
  now: number = Date.now(),
): LeadExecutiveSummary {
  const list = Array.isArray(leads) ? leads : [];
  const total = list.length;

  if (total === 0) {
    return {
      headline: "No leads in view",
      subheadline: "Adjust filters or wait for new submissions.",
      overallState: "empty",
      topMetricLabel: "Leads",
      topMetricValue: "0",
      primaryRecommendation:
        "Clear filters or broaden the search to see pipeline activity.",
      supportingReasons: ["Filtered lead list is empty."],
      warnings: [],
      linkedSectionIds: ["saved_views", "guidance"],
    };
  }

  const summary = summarizeLeadStatuses(list, now);
  const health = evaluatePipelineHealth(list, now);
  const queue = buildPriorityQueue(list, now);
  const audit = auditLeadDataQuality(list, now);
  const insights = buildLeadSourceInsights(list, now);

  const healthWarnings = health.filter((h) => h.severity === "warning");
  const healthWatches = health.filter((h) => h.severity === "watch");
  const highPriorityQueueCount = queue.filter(
    (i) => i.priority === "high",
  ).length;

  const qualityFindings = audit.filter(
    (a) => a.id !== "no_leads" && a.id !== "healthy",
  );
  const qualityWarnings = qualityFindings.filter(
    (a) => a.severity === "warning",
  );

  const reasons: string[] = [];
  const warnings: string[] = [];
  const linked = new Set<LeadCommandCenterSectionId>();

  reasons.push(
    `${total} lead${total === 1 ? "" : "s"} in current view`,
  );
  reasons.push(
    `Avg quality ${summary.averageQualityScore}/100, ${summary.percentClosed}% closed`,
  );

  if (highPriorityQueueCount > 0) {
    reasons.push(
      `${highPriorityQueueCount} high-priority action${highPriorityQueueCount === 1 ? "" : "s"} queued`,
    );
    linked.add("priority_queue");
  }

  for (const w of summary.warnings) warnings.push(w);
  for (const a of qualityWarnings) {
    warnings.push(`${a.title} (${a.count})`);
    linked.add("data_quality");
  }
  for (const h of healthWarnings) {
    warnings.push(h.title);
    linked.add("pipeline_health");
  }
  for (const h of healthWatches) linked.add("pipeline_health");

  // Source insight support
  const positiveSource = insights.find(
    (i) => i.severity === "positive" && i.category === "source",
  );
  const sourceWarning = insights.find(
    (i) => i.severity === "warning" && i.category === "source",
  );
  if (positiveSource || sourceWarning) linked.add("source_insights");
  if (sourceWarning) warnings.push(sourceWarning.title);

  // Decide overall state
  let overallState: LeadExecutiveSummaryState;
  if (
    healthWarnings.length >= 2 ||
    qualityWarnings.length >= 2 ||
    (summary.averageQualityScore < 40 && total >= 3)
  ) {
    overallState = "risky";
  } else if (
    healthWarnings.length === 1 ||
    qualityWarnings.length === 1 ||
    summary.percentNeedingAction >= 50 ||
    highPriorityQueueCount > 0
  ) {
    overallState = "needs_attention";
  } else {
    overallState = "healthy";
  }

  // Headline + recommendation derived from state (no contradictions)
  let headline: string;
  let subheadline: string;
  let primaryRecommendation: string;
  let topMetricLabel: string;
  let topMetricValue: string;

  if (overallState === "healthy") {
    headline = "Pipeline looks healthy";
    subheadline = `${total} leads tracked · avg quality ${summary.averageQualityScore}/100`;
    primaryRecommendation =
      "Keep monitoring follow-ups and close decisions.";
    topMetricLabel = "Avg quality";
    topMetricValue = `${summary.averageQualityScore}/100`;
    linked.add("status_summary");
  } else if (overallState === "needs_attention") {
    headline = "Pipeline needs attention";
    const headlineMetric =
      highPriorityQueueCount > 0
        ? `${highPriorityQueueCount} high-priority action${highPriorityQueueCount === 1 ? "" : "s"} waiting`
        : `${summary.percentNeedingAction}% of leads need action`;
    subheadline = headlineMetric;
    primaryRecommendation =
      highPriorityQueueCount > 0
        ? "Work the priority queue, starting with the top items."
        : "Address the most overdue actions before adding new leads.";
    topMetricLabel = highPriorityQueueCount > 0 ? "High-priority" : "Needs action";
    topMetricValue =
      highPriorityQueueCount > 0
        ? String(highPriorityQueueCount)
        : `${summary.percentNeedingAction}%`;
    linked.add("priority_queue");
    linked.add("guidance");
  } else {
    headline = "Pipeline at risk";
    subheadline = `${healthWarnings.length} health warning${healthWarnings.length === 1 ? "" : "s"} · ${qualityWarnings.length} quality warning${qualityWarnings.length === 1 ? "" : "s"}`;
    primaryRecommendation =
      qualityWarnings.length >= healthWarnings.length && qualityWarnings.length > 0
        ? "Fix data-quality gaps first — they distort every other signal."
        : "Resolve the top pipeline-health warnings before scaling intake.";
    topMetricLabel = "Warnings";
    topMetricValue = String(healthWarnings.length + qualityWarnings.length);
    linked.add("pipeline_health");
    linked.add("data_quality");
    linked.add("guidance");
  }

  // Unknown/missing data lowers confidence -> warnings
  const unknownSource = audit.find((a) => a.id === "missing_source");
  const unknownType = audit.find((a) => a.id === "missing_lead_type");
  const unknownPctSource = unknownSource ? unknownSource.percentage : 0;
  const unknownPctType = unknownType ? unknownType.percentage : 0;
  if (unknownPctSource > 30 || unknownPctType > 30) {
    warnings.push(
      `Confidence lowered: unknown source ${unknownPctSource}%, unknown type ${unknownPctType}%`,
    );
    linked.add("data_quality");
  }

  // Always include status_summary as a navigation anchor
  linked.add("status_summary");

  // Deterministic ordering for linked sections
  const SECTION_ORDER: LeadCommandCenterSectionId[] = [
    "saved_views",
    "guidance",
    "status_summary",
    "pipeline_health",
    "priority_queue",
    "data_quality",
    "source_insights",
    "analytics",
  ];
  const linkedSectionIds = SECTION_ORDER.filter((id) => linked.has(id));

  return {
    headline,
    subheadline,
    overallState,
    topMetricLabel,
    topMetricValue,
    primaryRecommendation,
    supportingReasons: reasons,
    warnings: dedupePreserveOrder(warnings),
    linkedSectionIds,
  };

  function dedupePreserveOrder(arr: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of arr) {
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    // safePct kept reachable to avoid unused-warning when tree-shaken
    void safePct;
    return out;
  }
}
