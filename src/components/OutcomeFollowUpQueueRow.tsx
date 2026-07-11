/**
 * OutcomeFollowUpQueueRow — one completed-action review row. Presenter only:
 * all copy/derivation comes from the queue view model; the row emits an
 * intent via onAction and never writes or automates anything.
 */
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { actionDetailPath } from "@/lib/routes";
import type {
  OutcomeQueueRow,
} from "@/lib/outcomeFollowUpQueueViewModel";
import type { SafeEpisodeCta } from "@/lib/plantMemoryEpisodeViewModel";

export interface OutcomeFollowUpQueueRowProps {
  readonly row: OutcomeQueueRow;
  readonly onAction: (cta: SafeEpisodeCta, actionQueueId: string) => void;
}

export function OutcomeFollowUpQueueRow({ row, onAction }: OutcomeFollowUpQueueRowProps) {
  return (
    <li className="rounded-xl border border-border p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium break-words">{row.actionSummary}</p>
          <p className="text-sm text-muted-foreground">{row.plantTentContext}</p>
        </div>
        <Badge
          variant={row.needsReview ? "destructive" : "secondary"}
          aria-label={`Status: ${row.stateLabel}`}
        >
          {row.stateLabel}
        </Badge>
      </div>

      <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Completed</dt>
          <dd>
            <time dateTime={row.completedAt}>{formatWhen(row.completedAt)}</time>
          </dd>
        </div>
        {row.outcomeStatusLabel ? (
          <div>
            <dt className="text-muted-foreground">Recorded response</dt>
            <dd>{row.outcomeStatusLabel}</dd>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Evidence</dt>
          <dd>{row.evidenceSummary}</dd>
        </div>
      </dl>

      <p className="text-xs text-muted-foreground">{row.uncertaintyLine}</p>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onAction(row.cta, row.actionQueueId)}>
          {row.ctaLabel}
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link to={actionDetailPath(row.actionQueueId)}>View original action</Link>
        </Button>
      </div>
    </li>
  );
}

function formatWhen(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "Unknown time";
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
