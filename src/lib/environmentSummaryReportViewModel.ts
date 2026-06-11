/**
 * environmentSummaryReportViewModel — pure aggregate model for a
 * premium read-only environment summary report over a date range.
 *
 * Pure / deterministic. No I/O, no React, no Supabase, no fetch, no
 * automation, no device control. Never emits `command`, `device_id`,
 * `action_queue`, `control`, `relay`, or `execute` keys.
 */
import type {
  EnvironmentCheckDiaryStatus,
  EnvironmentCheckDiaryViewModel,
} from "./environmentCheckViewModel";
import type { GreenhouseSource } from "./greenhouseLightRules";
import { buildEnvironmentSummaryReportUrl } from "./environmentSummaryNavigationRules";



export type RuleSeverity = "info" | "watch" | "warning" | "critical";

export interface EnvironmentSummaryReportInput {
  startDate: string;
  endDate: string;
  /** Pre-built per-entry view models for the date range. */
  checks: ReadonlyArray<EnvironmentCheckDiaryViewModel>;
  /** Optional rule id to focus the drilldown on. */
  selectedIssueId?: string | null;
}


export interface EnvironmentSummaryMetricCoverage {
  metricKey: string;
  label: string;
  sampleCount: number;
  invalidCount: number;
  reviewRequiredCount: number;
}

export interface EnvironmentSummaryTopIssue {
  ruleId: string;
  label: string;
  count: number;
  severity: RuleSeverity;
  prompt: string;
  relatedEntryIds: string[];
  drilldownUrl: string;
  drilldownLabel: string;
}


export interface EnvironmentSummaryReportViewModel {
  isPremiumReport: true;
  dateRangeLabel: string;
  totalChecks: number;
  statusCounts: Record<EnvironmentCheckDiaryStatus, number>;
  sourceCounts: Record<string, number>;
  metricCoverage: EnvironmentSummaryMetricCoverage[];
  topIssues: EnvironmentSummaryTopIssue[];
  summaryBullets: string[];
  reviewPrompts: string[];
  emptyState: string | null;
}

const STATUS_TO_SEVERITY: Record<EnvironmentCheckDiaryStatus, RuleSeverity> = {
  valid: "info",
  review_required: "warning",
  dst_ambiguous: "warning",
  invalid: "critical",
};

function bumpSeverity(a: RuleSeverity, b: RuleSeverity): RuleSeverity {
  const rank: Record<RuleSeverity, number> = {
    info: 0,
    watch: 1,
    warning: 2,
    critical: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

function fmtDateRange(start: string, end: string): string {
  return `${start} — ${end}`;
}

export function buildEnvironmentSummaryReportViewModel(
  input: EnvironmentSummaryReportInput,
): EnvironmentSummaryReportViewModel {
  const checks = Array.isArray(input?.checks) ? input.checks : [];
  const dateRangeLabel = fmtDateRange(input.startDate, input.endDate);
  const statusCounts: Record<EnvironmentCheckDiaryStatus, number> = {
    valid: 0,
    invalid: 0,
    dst_ambiguous: 0,
    review_required: 0,
  };
  const sourceCounts: Record<string, number> = {};
  const metricMap = new Map<string, EnvironmentSummaryMetricCoverage>();
  const issueMap = new Map<
    string,
    { ruleId: string; label: string; count: number; severity: RuleSeverity; prompt: string }
  >();
  const reviewPrompts: string[] = [];

  for (const c of checks) {
    statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
    sourceCounts[c.sourceLabel] = (sourceCounts[c.sourceLabel] ?? 0) + 1;

    for (const m of c.snapshotSummary) {
      const cur =
        metricMap.get(m.metricKey) ?? {
          metricKey: m.metricKey,
          label: m.label,
          sampleCount: 0,
          invalidCount: 0,
          reviewRequiredCount: 0,
        };
      cur.sampleCount += 1;
      if (m.status === "invalid") cur.invalidCount += 1;
      if (m.status === "review_required" || m.status === "dst_ambiguous")
        cur.reviewRequiredCount += 1;
      metricMap.set(m.metricKey, cur);
    }

    for (const a of c.ruleAnnotations) {
      if (a.status === "valid") continue;
      const sev = STATUS_TO_SEVERITY[a.status];
      const cur = issueMap.get(a.ruleId);
      if (cur) {
        cur.count += 1;
        cur.severity = bumpSeverity(cur.severity, sev);
      } else {
        issueMap.set(a.ruleId, {
          ruleId: a.ruleId,
          label: a.label,
          count: 1,
          severity: sev,
          prompt: a.message,
        });
      }
    }

    if (c.reviewPrompt && !reviewPrompts.includes(c.reviewPrompt)) {
      reviewPrompts.push(c.reviewPrompt);
    }
  }

  // Deterministic ordering: by count desc, then severity desc, then ruleId asc.
  const severityRank: Record<RuleSeverity, number> = {
    info: 0,
    watch: 1,
    warning: 2,
    critical: 3,
  };
  const topIssues: EnvironmentSummaryTopIssue[] = Array.from(issueMap.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const sevDiff = severityRank[b.severity] - severityRank[a.severity];
      if (sevDiff !== 0) return sevDiff;
      return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0;
    });

  const metricCoverage = Array.from(metricMap.values()).sort((a, b) =>
    a.metricKey < b.metricKey ? -1 : a.metricKey > b.metricKey ? 1 : 0,
  );

  const totalChecks = checks.length;
  const emptyState = totalChecks === 0 ? "No environment checks in this date range." : null;

  const summaryBullets: string[] = [];
  if (totalChecks > 0) {
    summaryBullets.push(`${totalChecks} environment check${totalChecks === 1 ? "" : "s"} in range.`);
    summaryBullets.push(`${statusCounts.valid} valid, ${statusCounts.review_required} review-required, ${statusCounts.dst_ambiguous} DST-ambiguous, ${statusCounts.invalid} invalid.`);
  }

  return {
    isPremiumReport: true,
    dateRangeLabel,
    totalChecks,
    statusCounts,
    sourceCounts,
    metricCoverage,
    topIssues,
    summaryBullets,
    reviewPrompts,
    emptyState,
  };
}

export type { GreenhouseSource };
