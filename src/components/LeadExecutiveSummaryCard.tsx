import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  buildLeadExecutiveSummary,
  type LeadExecutiveSummary,
  type LeadExecutiveSummaryState,
} from "@/lib/leadExecutiveSummaryRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const STATE_VARIANT: Record<
  LeadExecutiveSummaryState,
  "destructive" | "default" | "secondary" | "outline"
> = {
  risky: "destructive",
  needs_attention: "default",
  healthy: "secondary",
  empty: "outline",
};

const STATE_LABEL: Record<LeadExecutiveSummaryState, string> = {
  risky: "Risky",
  needs_attention: "Needs attention",
  healthy: "Healthy",
  empty: "Empty",
};

export interface LeadExecutiveSummaryCardProps {
  leads: readonly LeadRow[];
}

/**
 * Read-only presenter for the executive summary. Performs no I/O.
 */
export default function LeadExecutiveSummaryCard({
  leads,
}: LeadExecutiveSummaryCardProps) {
  const summary: LeadExecutiveSummary = useMemo(
    () => buildLeadExecutiveSummary(leads),
    [leads],
  );

  return (
    <div
      className="rounded-xl border border-border/50 bg-card/40 p-4"
      data-testid="lead-executive-summary"
      data-state={summary.overallState}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold">
            {summary.headline}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {summary.subheadline}
          </p>
        </div>
        <Badge variant={STATE_VARIANT[summary.overallState]}>
          {STATE_LABEL[summary.overallState]}
        </Badge>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-border/40 bg-card/30 p-2">
          <div className="text-xs text-muted-foreground">
            {summary.topMetricLabel}
          </div>
          <div className="mt-1 font-display text-2xl font-semibold">
            {summary.topMetricValue}
          </div>
        </div>
        <div className="rounded-md border border-border/40 bg-card/30 p-2">
          <div className="text-xs text-muted-foreground">Recommended next</div>
          <div className="mt-1 text-sm">{summary.primaryRecommendation}</div>
        </div>
      </div>

      {summary.supportingReasons.length > 0 && (
        <ul
          className="mt-3 list-inside list-disc text-xs text-muted-foreground"
          data-testid="lead-executive-summary-reasons"
        >
          {summary.supportingReasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      {summary.warnings.length > 0 && (
        <ul
          className="mt-2 list-inside list-disc text-xs text-destructive"
          data-testid="lead-executive-summary-warnings"
        >
          {summary.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      {summary.linkedSectionIds.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {summary.linkedSectionIds.map((id) => (
            <Badge key={id} variant="outline" data-testid="lead-executive-summary-link">
              {id.replace(/_/g, " ")}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
