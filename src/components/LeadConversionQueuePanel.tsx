import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LeadRow } from "@/hooks/useLeadsList";
import {
  buildLeadConversionQueue,
  type LeadConversionQueueFocus,
  type LeadConversionQueueItem,
} from "@/lib/leadConversionQueueRules";

export interface LeadConversionQueuePanelProps {
  leads: readonly LeadRow[];
  focus: LeadConversionQueueFocus;
  onFocusChange: (focus: LeadConversionQueueFocus) => void;
  onSelectLead: (leadId: string) => void;
  limit?: number;
  now?: number;
}

const FOCUS_OPTIONS: ReadonlyArray<{
  id: LeadConversionQueueFocus;
  label: string;
}> = [
  { id: "all", label: "All checkout requests" },
  { id: "first_contact", label: "First contact" },
  { id: "follow_up", label: "Follow-up" },
];

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function QueueItem({
  item,
  onSelectLead,
}: {
  item: LeadConversionQueueItem;
  onSelectLead: (leadId: string) => void;
}) {
  const timingLabel =
    item.kind === "first_contact"
      ? item.ageDays === null
        ? "Received date unavailable"
        : `${item.ageDays}d since request`
      : item.readiness === "ready_now"
        ? "Due now"
        : "Scheduled later";

  return (
    <li
      className="flex flex-col gap-3 rounded-lg border border-border/50 bg-card/30 p-3 md:flex-row md:items-center md:justify-between"
      data-kind={item.kind}
      data-readiness={item.readiness}
      data-testid="lead-conversion-queue-item"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{item.label}</span>
          <Badge variant={item.readiness === "ready_now" ? "secondary" : "outline"}>
            {timingLabel}
          </Badge>
          <Badge variant="outline">{item.planLabel}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
      </div>
      <Button
        type="button"
        size="sm"
        variant={item.readiness === "ready_now" ? "default" : "outline"}
        className="shrink-0"
        onClick={() => onSelectLead(item.leadId)}
      >
        Open reviewed draft
      </Button>
    </li>
  );
}

/**
 * Operator-only presenter for explicit checkout-notice requests. It opens the
 * existing per-lead reviewed draft; it never sends or logs outreach itself.
 */
export default function LeadConversionQueuePanel({
  leads,
  focus,
  onFocusChange,
  onSelectLead,
  limit = 8,
  now,
}: LeadConversionQueuePanelProps) {
  const queue = useMemo(() => buildLeadConversionQueue(leads, { focus, now }), [focus, leads, now]);
  const visible = queue.items.slice(0, Math.max(0, limit));

  return (
    <section
      className="space-y-4 rounded-xl border border-primary/25 bg-primary/5 p-4"
      data-testid="lead-conversion-queue"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-semibold">Checkout conversion worklist</h2>
            <Badge variant="outline">Operator reviewed</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Explicit checkout-notice requests only. Due follow-ups come first, followed by untouched
            requests. Opening a draft sends nothing and changes no lead or billing state.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Checkout conversion worklist filters">
          {FOCUS_OPTIONS.map((option) => (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant={focus === option.id ? "default" : "outline"}
              aria-pressed={focus === option.id}
              onClick={() => onFocusChange(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="Ready now" value={queue.readyNow} />
        <Metric label="First contacts" value={queue.firstContacts} />
        <Metric label="Follow-ups due" value={queue.followUpsDue} />
        <Metric label="Scheduled later" value={queue.scheduledLater} />
        <Metric label="Needs data review" value={queue.needsDataReview} />
      </div>

      {visible.length === 0 ? (
        <p
          className="rounded-lg border border-border/50 bg-card/30 p-4 text-sm text-muted-foreground"
          data-testid="lead-conversion-queue-empty"
        >
          No eligible checkout requests match this worklist view.
        </p>
      ) : (
        <ol className="space-y-2">
          {visible.map((item) => (
            <QueueItem key={item.leadId} item={item} onSelectLead={onSelectLead} />
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Showing {visible.length} of {queue.items.length} matching requests;{" "}
          {queue.paidInterestRequests} paid-interest records in the current lead scope.
        </span>
        <span>Nothing is sent or logged automatically.</span>
      </div>
    </section>
  );
}
