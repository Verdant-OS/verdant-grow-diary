import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  evaluateCommandCenterGuidance,
  type LeadCommandCenterGuidanceItem,
  type LeadCommandCenterGuidanceState,
} from "@/lib/leadCommandCenterGuidanceRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const STATE_VARIANT: Record<
  LeadCommandCenterGuidanceState,
  "destructive" | "default" | "secondary" | "outline"
> = {
  needs_attention: "destructive",
  empty: "outline",
  healthy: "secondary",
};

const STATE_LABEL: Record<LeadCommandCenterGuidanceState, string> = {
  needs_attention: "Needs attention",
  empty: "Empty",
  healthy: "Healthy",
};

export interface LeadCommandCenterGuidanceProps {
  leads: readonly LeadRow[];
  hasActiveFilters?: boolean;
  totalUnfiltered?: number;
}

/**
 * Read-only presenter for command-center guidance.
 *
 * Performs no I/O. Scoped to whichever leads list is passed in.
 */
export default function LeadCommandCenterGuidance({
  leads,
  hasActiveFilters,
  totalUnfiltered,
}: LeadCommandCenterGuidanceProps) {
  const result = useMemo(
    () =>
      evaluateCommandCenterGuidance(leads, Date.now(), {
        hasActiveFilters,
        totalUnfiltered,
      }),
    [leads, hasActiveFilters, totalUnfiltered],
  );

  return (
    <div
      className="rounded-xl border border-border/50 bg-card/40 p-4"
      data-testid="lead-command-center-guidance"
      data-state={result.state}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Operator Guidance
        </h3>
        <Badge variant={STATE_VARIANT[result.state]}>
          {STATE_LABEL[result.state]}
        </Badge>
      </div>
      <ul className="mt-3 space-y-2">
        {result.items.map((i) => (
          <GuidanceRow key={i.id} item={i} />
        ))}
      </ul>
    </div>
  );
}

function GuidanceRow({ item }: { item: LeadCommandCenterGuidanceItem }) {
  return (
    <li
      className="rounded-md border border-border/40 bg-card/30 p-2"
      data-testid="lead-command-center-guidance-item"
      data-state={item.state}
      data-guidance-id={item.id}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-foreground">{item.title}</div>
          <div className="text-xs text-muted-foreground">{item.message}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            <span className="text-foreground">Suggested:</span>{" "}
            {item.suggestedAction}
          </div>
          {item.warnings.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
              {item.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          )}
        </div>
        <Badge variant={STATE_VARIANT[item.state]}>
          {STATE_LABEL[item.state]}
        </Badge>
      </div>
    </li>
  );
}
