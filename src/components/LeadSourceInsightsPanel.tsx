import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  buildLeadSourceInsights,
  type LeadSourceInsight,
  type LeadSourceInsightSeverity,
} from "@/lib/leadSourceInsightRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const SEVERITY_VARIANT: Record<
  LeadSourceInsightSeverity,
  "destructive" | "default" | "secondary" | "outline"
> = {
  warning: "destructive",
  watch: "default",
  positive: "secondary",
  info: "outline",
};

export interface LeadSourceInsightsPanelProps {
  leads: readonly LeadRow[];
}

/**
 * Read-only presenter for source/type performance insights.
 * Performs no I/O.
 */
export default function LeadSourceInsightsPanel({
  leads,
}: LeadSourceInsightsPanelProps) {
  const insights = useMemo(() => buildLeadSourceInsights(leads), [leads]);

  return (
    <div
      className="rounded-xl border border-border/50 bg-card/40 p-4"
      data-testid="lead-source-insights"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Source &amp; Type Insights
        </h3>
        <span className="text-xs text-muted-foreground">
          {insights.length} insight{insights.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {insights.map((i) => (
          <InsightRow key={i.id} item={i} />
        ))}
      </ul>
    </div>
  );
}

function InsightRow({ item }: { item: LeadSourceInsight }) {
  return (
    <li
      className="rounded-md border border-border/40 bg-card/30 p-2"
      data-testid="lead-source-insights-item"
      data-severity={item.severity}
      data-category={item.category}
      data-insight-id={item.id}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-foreground">{item.title}</div>
          <div className="text-xs text-muted-foreground">{item.message}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            <span className="text-foreground">{item.metricLabel}:</span>{" "}
            {item.metricValue}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            <span className="text-foreground">Suggested:</span>{" "}
            {item.recommendation}
          </div>
        </div>
        <Badge variant={SEVERITY_VARIANT[item.severity]}>
          {item.severity}
        </Badge>
      </div>
    </li>
  );
}
