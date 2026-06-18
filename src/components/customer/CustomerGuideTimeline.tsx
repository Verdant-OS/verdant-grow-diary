/**
 * CustomerGuideTimeline — presenter for the customer-facing timeline
 * shell. Renders the empty-state copy when no public events are present.
 *
 * Hard constraints:
 *  - Does not query private diary entries or sensor_readings.
 *  - Renders only the fields explicitly present on
 *    CustomerGuideTimelineEvent (no raw_payload, no plant/tent ids).
 */
import type { CustomerGuideTimelineEvent } from "@/lib/customerModeGuideViewModel";

export interface CustomerGuideTimelineProps {
  label: "Customer-facing timeline";
  events: ReadonlyArray<CustomerGuideTimelineEvent>;
  emptyCopy: string;
}

export default function CustomerGuideTimeline({
  label,
  events,
  emptyCopy,
}: CustomerGuideTimelineProps) {
  const isEmpty = events.length === 0;
  return (
    <section
      data-testid="customer-guide-timeline"
      data-empty={isEmpty ? "true" : "false"}
      aria-labelledby="customer-guide-timeline-heading"
      className="rounded-xl border border-border/60 bg-card/60 p-5"
    >
      <h2
        id="customer-guide-timeline-heading"
        className="text-base font-semibold tracking-tight"
      >
        {label}
      </h2>
      {isEmpty ? (
        <p
          data-testid="customer-guide-timeline-empty"
          className="mt-3 text-sm text-muted-foreground"
        >
          {emptyCopy}
        </p>
      ) : (
        <ol className="mt-4 space-y-3" data-testid="customer-guide-timeline-list">
          {events.map((event) => (
            <li
              key={event.id}
              data-testid={`customer-guide-timeline-event-${event.id}`}
              className="rounded-lg border border-border/40 p-3"
            >
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {event.whenLabel}
              </p>
              <p className="mt-1 text-sm font-medium">{event.title}</p>
              {event.description ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {event.description}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
