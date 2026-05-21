/**
 * Pure logic for read-only Lead Source Performance Insights.
 *
 * UI-only / read-derived. No I/O, no Supabase calls, no persistence.
 * Reuses leadAnalyticsRules grouping helpers and leadDataQualityAuditRules
 * for the unknown-source/type signal — no duplicated math.
 */
import type { LeadRow } from "@/hooks/useLeadsList";
import {
  UNKNOWN,
  formatRate,
  groupByLeadType,
  groupBySource,
  type GroupStats,
} from "@/lib/leadAnalyticsRules";
import { auditLeadDataQuality } from "@/lib/leadDataQualityAuditRules";

export type LeadSourceInsightCategory =
  | "source"
  | "lead_type"
  | "data_quality"
  | "sample_size";

export type LeadSourceInsightSeverity =
  | "info"
  | "watch"
  | "warning"
  | "positive";

export interface LeadSourceInsight {
  id: string;
  category: LeadSourceInsightCategory;
  severity: LeadSourceInsightSeverity;
  title: string;
  message: string;
  metricLabel: string;
  metricValue: string;
  recommendation: string;
  /** Higher = more urgent. Deterministic for the same input. */
  sortWeight: number;
}

const SEVERITY_WEIGHT: Record<LeadSourceInsightSeverity, number> = {
  warning: 4,
  watch: 3,
  positive: 2,
  info: 1,
};

const CATEGORY_WEIGHT: Record<LeadSourceInsightCategory, number> = {
  source: 4,
  lead_type: 3,
  data_quality: 2,
  sample_size: 1,
};

/** Minimum group size to make a confident close-rate claim. */
const SUFFICIENT_GROUP_SAMPLE = 5;
/** Minimum total leads to make pipeline-wide claims. */
const SUFFICIENT_TOTAL_SAMPLE = 5;
/** Threshold for "low close rate" highlight on high-volume sources. */
const LOW_CLOSE_RATE = 0.1;
/** Volume threshold (fraction of total) to count as "high volume" source. */
const HIGH_VOLUME_FRACTION = 0.4;

function isKnown(stats: GroupStats): boolean {
  return stats.key !== UNKNOWN;
}

/**
 * Build deterministic source/type performance insights for the
 * (filtered) lead set.
 */
export function buildLeadSourceInsights(
  leads: readonly LeadRow[],
  now: number = Date.now(),
): LeadSourceInsight[] {
  const list = Array.isArray(leads) ? [...leads] : [];
  const total = list.length;
  const out: LeadSourceInsight[] = [];

  if (total === 0) {
    out.push({
      id: "no_data",
      category: "sample_size",
      severity: "info",
      title: "No leads in current view",
      message: "There is nothing to analyze for source/type performance.",
      metricLabel: "Leads",
      metricValue: "0",
      recommendation: "Clear filters or broaden the search.",
      sortWeight: 10,
    });
    return sortInsights(out);
  }

  if (total < SUFFICIENT_TOTAL_SAMPLE) {
    out.push({
      id: "insufficient_sample",
      category: "sample_size",
      severity: "info",
      title: "Insufficient sample size",
      message: `Only ${total} lead${total === 1 ? "" : "s"} in view — not enough to draw confident conclusions.`,
      metricLabel: "Leads",
      metricValue: String(total),
      recommendation: "Broaden filters or wait for more leads before relying on these insights.",
      sortWeight: 9,
    });
  }

  const sources = groupBySource(list, now);
  const types = groupByLeadType(list, now);
  const knownSources = sources.filter(isKnown);
  const knownTypes = types.filter(isKnown);

  // Best-performing source by closed count (known sources only)
  const closedSorted = [...knownSources]
    .filter((s) => s.closed > 0)
    .sort((a, b) => {
      if (b.closed !== a.closed) return b.closed - a.closed;
      if (b.closed_rate !== a.closed_rate) return b.closed_rate - a.closed_rate;
      return a.key.localeCompare(b.key);
    });
  const best = closedSorted[0];
  if (best) {
    out.push({
      id: "best_source_by_closed",
      category: "source",
      severity: "positive",
      title: `Top closing source: ${best.key}`,
      message: `${best.closed} closed lead${best.closed === 1 ? "" : "s"} from ${best.key}.`,
      metricLabel: "Closed",
      metricValue: String(best.closed),
      recommendation: `Invest more in the ${best.key} channel.`,
      sortWeight: 90,
    });
  }

  // Highest close rate with sufficient sample
  const rateCandidates = knownSources
    .filter((s) => s.total >= SUFFICIENT_GROUP_SAMPLE && s.closed > 0)
    .sort((a, b) => {
      if (b.closed_rate !== a.closed_rate) return b.closed_rate - a.closed_rate;
      if (b.closed !== a.closed) return b.closed - a.closed;
      return a.key.localeCompare(b.key);
    });
  const topRate = rateCandidates[0];
  if (topRate && (!best || topRate.key !== best.key)) {
    out.push({
      id: "highest_close_rate_source",
      category: "source",
      severity: "positive",
      title: `Highest close rate: ${topRate.key}`,
      message: `${topRate.key} closes ${formatRate(topRate.closed_rate)} of its ${topRate.total} leads.`,
      metricLabel: "Close rate",
      metricValue: formatRate(topRate.closed_rate),
      recommendation: `Study what makes ${topRate.key} convert and replicate elsewhere.`,
      sortWeight: 85,
    });
  }

  // High-volume source with low close rate
  const highVolLow = knownSources
    .filter(
      (s) =>
        s.total >= SUFFICIENT_GROUP_SAMPLE &&
        s.total / total >= HIGH_VOLUME_FRACTION &&
        s.closed_rate < LOW_CLOSE_RATE,
    )
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      if (a.closed_rate !== b.closed_rate) return a.closed_rate - b.closed_rate;
      return a.key.localeCompare(b.key);
    });
  const weakHigh = highVolLow[0];
  if (weakHigh) {
    out.push({
      id: "high_volume_low_close",
      category: "source",
      severity: "warning",
      title: `High volume, low close rate: ${weakHigh.key}`,
      message: `${weakHigh.key} brings ${weakHigh.total} leads but closes only ${formatRate(weakHigh.closed_rate)}.`,
      metricLabel: "Close rate",
      metricValue: formatRate(weakHigh.closed_rate),
      recommendation: `Audit ${weakHigh.key} qualification — high volume should not mean low yield.`,
      sortWeight: 80,
    });
  }

  // Data-quality signal: unknown source / lead_type via existing audit
  const audit = auditLeadDataQuality(list, now);
  const unknownSource = audit.find((a) => a.id === "missing_source");
  const unknownType = audit.find((a) => a.id === "missing_lead_type");
  if (unknownSource && unknownSource.percentage > 30) {
    out.push({
      id: "unknown_source_quality",
      category: "data_quality",
      severity: "watch",
      title: "Many leads have unknown source",
      message: `${unknownSource.count}/${total} leads (${unknownSource.percentage}%) have no source recorded.`,
      metricLabel: "% unknown",
      metricValue: `${unknownSource.percentage}%`,
      recommendation:
        "Capture source on intake before trusting source performance.",
      sortWeight: 70 + Math.round(unknownSource.percentage),
    });
  }
  if (unknownType && unknownType.percentage > 30) {
    out.push({
      id: "unknown_type_quality",
      category: "data_quality",
      severity: "watch",
      title: "Many leads have unknown lead type",
      message: `${unknownType.count}/${total} leads (${unknownType.percentage}%) have no lead type recorded.`,
      metricLabel: "% unknown",
      metricValue: `${unknownType.percentage}%`,
      recommendation:
        "Set a lead type at intake before trusting lead-type performance.",
      sortWeight: 65 + Math.round(unknownType.percentage),
    });
  }

  // Best lead type by close rate (with sufficient sample)
  const typeRateCandidates = knownTypes
    .filter((t) => t.total >= SUFFICIENT_GROUP_SAMPLE && t.closed > 0)
    .sort((a, b) => {
      if (b.closed_rate !== a.closed_rate) return b.closed_rate - a.closed_rate;
      if (b.closed !== a.closed) return b.closed - a.closed;
      return a.key.localeCompare(b.key);
    });
  const bestType = typeRateCandidates[0];
  if (bestType) {
    out.push({
      id: "best_lead_type",
      category: "lead_type",
      severity: "positive",
      title: `Strongest lead type: ${bestType.key}`,
      message: `${bestType.key} closes ${formatRate(bestType.closed_rate)} of its ${bestType.total} leads.`,
      metricLabel: "Close rate",
      metricValue: formatRate(bestType.closed_rate),
      recommendation: `Prioritize ${bestType.key} leads in the queue.`,
      sortWeight: 60,
    });
  }

  // Weak lead-type follow-up conversion: high follow_up share, low closed
  const weakTypeCandidates = knownTypes
    .filter(
      (t) =>
        t.total >= SUFFICIENT_GROUP_SAMPLE &&
        t.follow_up >= 2 &&
        t.closed_rate < LOW_CLOSE_RATE,
    )
    .sort((a, b) => {
      if (b.follow_up !== a.follow_up) return b.follow_up - a.follow_up;
      if (a.closed_rate !== b.closed_rate) return a.closed_rate - b.closed_rate;
      return a.key.localeCompare(b.key);
    });
  const weakType = weakTypeCandidates[0];
  if (weakType) {
    out.push({
      id: "weak_lead_type_conversion",
      category: "lead_type",
      severity: "watch",
      title: `Weak follow-up conversion: ${weakType.key}`,
      message: `${weakType.key} has ${weakType.follow_up} in follow-up but closes only ${formatRate(weakType.closed_rate)}.`,
      metricLabel: "Close rate",
      metricValue: formatRate(weakType.closed_rate),
      recommendation: `Review follow-up scripts and qualification for ${weakType.key}.`,
      sortWeight: 55,
    });
  }

  if (out.length === 0) {
    out.push({
      id: "no_signals",
      category: "sample_size",
      severity: "info",
      title: "No notable source/type signals",
      message: `Analyzed ${total} leads — no thresholds tripped.`,
      metricLabel: "Leads",
      metricValue: String(total),
      recommendation: "Keep collecting leads to surface stronger signals.",
      sortWeight: 5,
    });
  }

  return sortInsights(out);
}

/**
 * Ordering:
 *   1. severity weight desc
 *   2. category weight desc
 *   3. sortWeight desc
 *   4. id lexical asc
 */
export function sortInsights(items: LeadSourceInsight[]): LeadSourceInsight[] {
  return [...items].sort((a, b) => {
    const sa = SEVERITY_WEIGHT[a.severity];
    const sb = SEVERITY_WEIGHT[b.severity];
    if (sa !== sb) return sb - sa;
    const ca = CATEGORY_WEIGHT[a.category];
    const cb = CATEGORY_WEIGHT[b.category];
    if (ca !== cb) return cb - ca;
    if (a.sortWeight !== b.sortWeight) return b.sortWeight - a.sortWeight;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
