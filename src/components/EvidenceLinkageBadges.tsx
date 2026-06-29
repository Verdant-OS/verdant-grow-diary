/**
 * EvidenceLinkageBadges — read-only presenter shared by Alert review and
 * approval-required Action Queue suggestion surfaces.
 *
 * Renders source badges for each linked timeline evidence reference plus a
 * compact "Linked timeline event" label. Falls back to safe copy when no
 * timeline event is linked.
 *
 * No I/O. No writes. No automation. No device-control copy.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  isTrustedTimelineEventSource,
  originatingTimelineEventLabel,
  TIMELINE_EVIDENCE_NOT_LINKED_COPY,
  type OriginatingTimelineEventRef,
  type OriginatingTimelineEventSource,
} from "@/lib/originatingTimelineEventRules";

const TONE: Record<OriginatingTimelineEventSource, string> = {
  live: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  manual: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  csv: "border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  demo: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  stale: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  invalid: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
  imported: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  unknown: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

export interface EvidenceLinkageBadgesProps {
  /** Normalized timeline event references (already deduped/sorted by VM). */
  events: readonly OriginatingTimelineEventRef[];
  /** Optional override for the surface label. */
  surface?: "alert-review" | "action-queue-suggestion";
  /** Optional copy to show when nothing is linked. */
  fallbackCopy?: string;
  /**
   * Optional presenter-only override for the per-event label. When provided
   * and it returns a non-null value, the human label is rendered in place of
   * the raw `ev.id` string. The underlying `data-event-id` attribute is
   * preserved for tests and provenance equality checks.
   */
  renderEventLabel?: (ev: OriginatingTimelineEventRef) => ReactNode | null;
  className?: string;
  testId?: string;
}

function formatOccurredAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso;
}

export default function EvidenceLinkageBadges({
  events,
  surface = "alert-review",
  fallbackCopy = TIMELINE_EVIDENCE_NOT_LINKED_COPY,
  className,
  testId = "evidence-linkage-badges",
}: EvidenceLinkageBadgesProps) {
  if (!events || events.length === 0) {
    return (
      <div
        data-testid={`${testId}-empty`}
        data-surface={surface}
        className={cn("text-xs text-muted-foreground", className)}
      >
        {fallbackCopy}
      </div>
    );
  }

  return (
    <div
      data-testid={testId}
      data-surface={surface}
      data-count={events.length}
      className={cn("flex flex-col gap-1.5", className)}
    >
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Linked timeline event{events.length === 1 ? "" : "s"}
      </div>
      <ul className="flex flex-col gap-1" role="list">
        {events.map((ev) => {
          const src = (ev.source ?? "unknown") as OriginatingTimelineEventSource;
          const trusted = isTrustedTimelineEventSource(src);
          const occurredAt = formatOccurredAt(ev.occurred_at);
          return (
            <li
              key={ev.id}
              data-testid={`${testId}-item`}
              data-event-id={ev.id}
              data-source={src}
              data-trusted={trusted ? "true" : "false"}
              className="flex flex-wrap items-center gap-2 text-xs"
            >
              <span
                data-testid={`${testId}-source`}
                title={`Evidence source: ${originatingTimelineEventLabel(src)}`}
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  TONE[src],
                )}
              >
                {originatingTimelineEventLabel(src)}
              </span>
              {ev.type && (
                <span className="text-muted-foreground">{ev.type}</span>
              )}
              <span className="font-mono text-[11px] text-muted-foreground">
                {ev.id}
              </span>
              {occurredAt && (
                <span className="text-[11px] text-muted-foreground">
                  {occurredAt}
                </span>
              )}
              {!trusted && (
                <span
                  data-testid={`${testId}-caution`}
                  className="text-[11px] text-amber-700 dark:text-amber-300"
                >
                  Caution: untrusted source — approval required before action.
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
