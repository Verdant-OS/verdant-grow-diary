import { useMemo } from "react";
import {
  summarizeLeadStatuses,
  type LeadStatusSummary,
} from "@/lib/leadStatusSummaryRules";
import type { LeadRow } from "@/hooks/useLeadsList";

export interface LeadStatusSummaryStripProps {
  leads: readonly LeadRow[];
}

/**
 * Read-only presenter for the Lead Status Summary Strip.
 *
 * Performs no I/O and no external communication. Scoped to whichever
 * leads list the caller passes in (typically the current filtered set).
 */
export default function LeadStatusSummaryStrip({
  leads,
}: LeadStatusSummaryStripProps) {
  const s = useMemo(() => summarizeLeadStatuses(leads), [leads]);

  return (
    <div
      className="rounded-xl border border-border/50 bg-card/40 p-3"
      data-testid="lead-status-summary"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Cell label="Total" value={s.total} />
        <Cell label="High priority" value={s.highPriority} />
        <Cell label="Needs contact" value={s.needsFirstContact} />
        <Cell label="Follow up" value={s.followUp} />
        <Cell label="Ready to close" value={s.readyToClose} />
        <Cell label="Closed" value={s.closed} />
        <Cell label="Lost" value={s.lost} />
        <Cell label="Review" value={s.reviewManually} />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <Metric label="Avg quality" value={`${s.averageQualityScore}/100`} />
        <Metric label="% closed" value={`${s.percentClosed}%`} />
        <Metric
          label="% needing action"
          value={`${s.percentNeedingAction}%`}
        />
      </div>
      {s.warnings.length > 0 && (
        <p
          className="mt-2 text-xs text-destructive"
          data-testid="lead-status-summary-warnings"
        >
          {s.warnings.join("; ")}
        </p>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-display text-xl font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-md border border-border/40 bg-card/30 px-2 py-1">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export type { LeadStatusSummary };
