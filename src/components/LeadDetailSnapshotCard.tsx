import { Badge } from "@/components/ui/badge";
import { buildLeadDetailSnapshot } from "@/lib/leadDetailSnapshotRules";
import type { LeadRow } from "@/hooks/useLeadsList";

export interface LeadDetailSnapshotCardProps {
  lead: LeadRow | null;
}

/**
 * Read-only presenter for the composed Lead Detail Snapshot.
 *
 * Performs no I/O and no external communication. Renders the snapshot
 * produced by buildLeadDetailSnapshot.
 */
export default function LeadDetailSnapshotCard({
  lead,
}: LeadDetailSnapshotCardProps) {
  const s = buildLeadDetailSnapshot(lead);

  return (
    <div
      className="rounded-md border border-border/40 bg-card/30 p-3 space-y-2"
      data-testid="lead-detail-snapshot"
      data-is-fallback={s.isFallback ? "true" : "false"}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">
            {s.displayName}
          </div>
          <div className="text-xs text-muted-foreground">
            Created {s.createdLabel}
          </div>
        </div>
        <Badge variant="outline" className="tabular-nums">
          {s.quality.grade} · {s.quality.score}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1 text-xs">
        <Badge variant={s.statusKnown ? "secondary" : "outline"}>
          {s.status}
        </Badge>
        <Badge variant={s.leadTypeKnown ? "outline" : "destructive"}>
          {s.leadType}
        </Badge>
        <Badge variant={s.sourceKnown ? "outline" : "destructive"}>
          {s.source}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Next action</dt>
        <dd className="font-medium text-foreground">
          {s.nextAction.label}
          <span className="ml-1 text-muted-foreground">
            ({s.nextAction.priority})
          </span>
        </dd>
        <dt className="text-muted-foreground">Activity events</dt>
        <dd className="tabular-nums">{s.activityCount}</dd>
      </dl>

      {s.warnings.length > 0 && (
        <p
          className="text-xs text-destructive"
          data-testid="lead-detail-snapshot-warnings"
        >
          {s.warnings.join("; ")}
        </p>
      )}
    </div>
  );
}
