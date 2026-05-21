import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  evaluatePipelineHealth,
  type LeadPipelineHealthSeverity,
  type LeadPipelineHealthWarning,
} from "@/lib/leadPipelineHealthRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const SEVERITY_VARIANT: Record<
  LeadPipelineHealthSeverity,
  "destructive" | "default" | "secondary" | "outline"
> = {
  warning: "destructive",
  watch: "default",
  info: "secondary",
};

export interface LeadPipelineHealthPanelProps {
  leads: readonly LeadRow[];
}

/**
 * Read-only presenter for the Lead Pipeline Health warnings.
 *
 * Performs no I/O and no external communication. Scoped to whichever
 * leads list the caller passes in.
 */
export default function LeadPipelineHealthPanel({
  leads,
}: LeadPipelineHealthPanelProps) {
  const warnings = useMemo(() => evaluatePipelineHealth(leads), [leads]);

  return (
    <div
      className="rounded-xl border border-border/50 bg-card/40 p-4"
      data-testid="lead-pipeline-health"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Pipeline Health
        </h3>
        <span className="text-xs text-muted-foreground">
          {warnings.length} signal{warnings.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {warnings.map((w) => (
          <HealthRow key={w.id} warning={w} />
        ))}
      </ul>
    </div>
  );
}

function HealthRow({ warning }: { warning: LeadPipelineHealthWarning }) {
  return (
    <li
      className="rounded-md border border-border/40 bg-card/30 p-2"
      data-testid="lead-pipeline-health-item"
      data-severity={warning.severity}
      data-warning-id={warning.id}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-foreground">{warning.title}</div>
          <div className="text-xs text-muted-foreground">{warning.message}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            <span className="text-foreground">Suggested:</span>{" "}
            {warning.recommendation}
          </div>
        </div>
        <Badge variant={SEVERITY_VARIANT[warning.severity]}>
          {warning.severity}
        </Badge>
      </div>
    </li>
  );
}
