import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  buildPriorityQueue,
  type LeadPriorityQueueItem,
} from "@/lib/leadPriorityQueueRules";
import type { LeadNextActionPriority } from "@/lib/leadNextActionRules";
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

export interface LeadPriorityQueuePanelProps {
  leads: readonly LeadRow[];
  /** Optional max rows to show inline; default 5. */
  limit?: number;
  onSelectLead?: (leadId: string) => void;
}

/**
 * Read-only presenter for the derived Lead Priority Queue.
 *
 * Performs no I/O and no external communication. Renders strictly from the
 * leads passed in by the caller.
 */
export default function LeadPriorityQueuePanel({
  leads,
  limit = 5,
  onSelectLead,
}: LeadPriorityQueuePanelProps) {
  const queue = useMemo(() => buildPriorityQueue(leads), [leads]);

  if (queue.length === 0) {
    return (
      <div
        className="rounded-xl border border-border/50 bg-card/40 p-4"
        data-testid="lead-priority-queue-empty"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Priority Queue
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          No leads to prioritise.
        </p>
      </div>
    );
  }

  const visible = queue.slice(0, Math.max(0, limit));

  return (
    <div
      className="rounded-xl border border-border/50 bg-card/40 p-4"
      data-testid="lead-priority-queue"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Priority Queue
        </h3>
        <span className="text-xs text-muted-foreground">
          Top {visible.length} of {queue.length}
        </span>
      </div>
      <ol className="mt-3 space-y-2">
        {visible.map((item) => (
          <QueueRow key={item.leadId} item={item} onSelect={onSelectLead} />
        ))}
      </ol>
    </div>
  );
}

function QueueRow({
  item,
  onSelect,
}: {
  item: LeadPriorityQueueItem;
  onSelect?: (leadId: string) => void;
}) {
  const interactive = typeof onSelect === "function";
  const Inner = (
    <div className="flex w-full items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">
          {item.label}
        </div>
        <div className="text-xs text-muted-foreground">
          {item.actionLabel} — {item.reason}
        </div>
        {item.warnings.length > 0 && (
          <div
            className="mt-1 text-xs text-destructive"
            data-testid="queue-row-warnings"
          >
            {item.warnings.join("; ")}
          </div>
        )}
      </div>
      <Badge variant={PRIORITY_VARIANT[item.priority]}>{item.priority}</Badge>
    </div>
  );
  return (
    <li
      className="rounded-md border border-border/40 bg-card/30 p-2"
      data-action-type={item.actionType}
      data-priority={item.priority}
      data-testid="lead-priority-queue-item"
    >
      {interactive ? (
        <button
          type="button"
          onClick={() => onSelect?.(item.leadId)}
          className="w-full text-left"
        >
          {Inner}
        </button>
      ) : (
        Inner
      )}
    </li>
  );
}
