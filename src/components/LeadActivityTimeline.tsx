import {
  buildLeadActivityTimeline,
  type LeadActivityEvent,
} from "@/lib/leadActivityRules";
import type { LeadRow } from "@/hooks/useLeadsList";

export interface LeadActivityTimelineProps {
  lead: LeadRow | null;
}

/**
 * Read-only presenter for the derived Lead Activity Timeline.
 *
 * Does not perform any I/O. Renders strictly from LeadRow fields via
 * buildLeadActivityTimeline. No external communication.
 */
export default function LeadActivityTimeline({
  lead,
}: LeadActivityTimelineProps) {
  if (!lead) {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid="lead-activity-timeline-empty"
      >
        No lead selected.
      </p>
    );
  }

  const events = buildLeadActivityTimeline(lead);

  if (events.length === 0) {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid="lead-activity-timeline-empty"
      >
        No derived activity available.
      </p>
    );
  }

  return (
    <ol
      className="space-y-2 text-xs text-muted-foreground"
      data-testid="lead-activity-timeline"
    >
      {events.map((ev) => (
        <TimelineRow key={ev.id} event={ev} />
      ))}
    </ol>
  );
}

function TimelineRow({ event }: { event: LeadActivityEvent }) {
  return (
    <li
      className="rounded-md border border-border/40 bg-card/30 p-2"
      data-event-type={event.type}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">{event.label}</span>
        <span className="tabular-nums">
          {event.at ? new Date(event.at).toLocaleString() : "—"}
        </span>
      </div>
      {event.detail && <div className="mt-1">{event.detail}</div>}
    </li>
  );
}
