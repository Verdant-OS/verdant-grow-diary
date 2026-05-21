import { Badge } from "@/components/ui/badge";
import {
  recommendNextAction,
  type LeadNextActionPriority,
} from "@/lib/leadNextActionRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const PRIORITY_VARIANT: Record<
  LeadNextActionPriority,
  "destructive" | "default" | "secondary" | "outline"
> = {
  high: "destructive",
  medium: "default",
  low: "secondary",
  none: "outline",
};

export interface LeadNextActionPanelProps {
  lead: LeadRow | null;
}

/**
 * Read-only presenter for the Lead Next Action Advisor.
 *
 * Derives the recommendation from existing LeadRow fields via
 * recommendNextAction. Performs no I/O and no external communication.
 */
export default function LeadNextActionPanel({
  lead,
}: LeadNextActionPanelProps) {
  if (!lead) {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid="lead-next-action-empty"
      >
        No lead selected.
      </p>
    );
  }

  const rec = recommendNextAction(lead);

  return (
    <div
      className="space-y-2 rounded-md border border-border/40 bg-card/30 p-3"
      data-testid="lead-next-action"
      data-action-type={rec.type}
      data-priority={rec.priority}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">{rec.label}</span>
        <Badge variant={PRIORITY_VARIANT[rec.priority]}>
          {rec.priority}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{rec.reason}</p>
      {rec.warning && (
        <p
          className="text-xs text-destructive"
          data-testid="lead-next-action-warning"
        >
          {rec.warning}
        </p>
      )}
    </div>
  );
}
