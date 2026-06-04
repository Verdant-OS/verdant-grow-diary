/**
 * TimelineMemorySection — read-only, filterable Plant/Tent timeline that
 * merges diary entries and manual sensor snapshot cards.
 *
 * Hard constraints:
 *  - Filtering / classification / chip counts live in
 *    `src/lib/timelineFilterRules.ts` + `src/lib/timelineFilterViewModel.ts`.
 *  - Manual snapshot rendering reuses `<ManualSnapshotTimelineCard>` —
 *    no metric/unit/validation tables are duplicated here.
 *  - No writes, no automation, no live/synced/connected/imported labels.
 *  - Empty filtered state copy is exactly: "No events match this filter."
 */
import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ManualSnapshotTimelineCard from "@/components/ManualSnapshotTimelineCard";
import TimelineFilterBar from "@/components/TimelineFilterBar";
import {
  useTimelineMemory,
  type TimelineMemoryScope,
} from "@/hooks/useTimelineMemory";
import {
  filterTimelineMemoryItems,
  type TimelineFilterKey,
  type TimelineMemoryItem,
} from "@/lib/timelineFilterRules";
import {
  buildTimelineFilterChips,
  TIMELINE_FILTER_EMPTY_STATE_COPY,
  TIMELINE_FILTER_RESET_KEY,
} from "@/lib/timelineFilterViewModel";
import { formatSnapshotTimestamp } from "@/lib/dateFormat";

type Props =
  | { scope: "plant"; plantId: string | null | undefined }
  | { scope: "tent"; tentId: string | null | undefined };

function toScope(props: Props): TimelineMemoryScope | null {
  if (props.scope === "plant") {
    return props.plantId ? { kind: "plant", plantId: props.plantId } : null;
  }
  return props.tentId ? { kind: "tent", tentId: props.tentId } : null;
}

function DiaryItemRow({ item }: { item: Extract<TimelineMemoryItem, { kind: "diary" }> }) {
  return (
    <div
      data-testid="timeline-memory-diary-item"
      data-item-key={item.key}
      data-event-type={item.eventType ?? ""}
      className="rounded-lg border border-border/40 bg-card/40 p-3 text-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className="text-[10px]">
          {item.eventType ?? "note"}
        </Badge>
        <time
          dateTime={item.occurredAt}
          className="text-xs text-muted-foreground"
          data-testid="timeline-memory-diary-item-ts"
        >
          {formatSnapshotTimestamp(item.occurredAt)}
        </time>
      </div>
      {item.note && (
        <p className="mt-1.5 text-sm text-foreground/90 break-words">{item.note}</p>
      )}
      {item.hasPhoto && (
        <p className="mt-1 text-xs text-muted-foreground">Photo attached.</p>
      )}
    </div>
  );
}

export const AI_DOCTOR_EVIDENCE_AUDIT_TITLE =
  "AI Doctor evaluated sensor evidence";

export const AI_DOCTOR_EVIDENCE_AUDIT_COPY: Record<
  Extract<TimelineMemoryItem, { kind: "ai_doctor_sensor_evidence_audit" }>["status"],
  string
> = {
  usable: "AI Doctor used this as healthy sensor evidence.",
  stale: "AI Doctor treated this as stale cautionary context.",
  invalid: "AI Doctor rejected this sensor evidence as invalid.",
  needs_review: "AI Doctor flagged this sensor evidence for review.",
  no_data: "AI Doctor had no usable sensor evidence.",
};

function AiDoctorEvidenceAuditRow({
  item,
}: {
  item: Extract<TimelineMemoryItem, { kind: "ai_doctor_sensor_evidence_audit" }>;
}) {
  return (
    <div
      data-testid="timeline-memory-ai-doctor-evidence-audit"
      data-item-key={item.key}
      data-status={item.status}
      data-reason-code={item.reasonCode ?? ""}
      data-counts-as-healthy={item.countsAsHealthyEvidence ? "yes" : "no"}
      data-mode={item.mode}
      className="rounded-lg border border-border/40 bg-card/40 p-3 text-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className="text-[10px]">
          AI Doctor
        </Badge>
        <time
          dateTime={item.occurredAt}
          className="text-xs text-muted-foreground"
          data-testid="timeline-memory-ai-doctor-evidence-audit-ts"
        >
          {formatSnapshotTimestamp(item.occurredAt)}
        </time>
      </div>
      <p className="mt-1.5 text-sm font-medium text-foreground/90">
        {AI_DOCTOR_EVIDENCE_AUDIT_TITLE}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Status: {item.status}
        {item.reasonCode ? ` · Reason: ${item.reasonCode}` : ""} · Healthy
        evidence: {item.countsAsHealthyEvidence ? "yes" : "no"}
      </p>
      <p className="mt-1 text-xs text-foreground/80">
        {AI_DOCTOR_EVIDENCE_AUDIT_COPY[item.status]}
      </p>
    </div>
  );
}

export default function TimelineMemorySection(props: Props) {
  const scope = toScope(props);
  const { items, isLoading, isError, refetch } = useTimelineMemory(scope);
  const [filter, setFilter] = useState<TimelineFilterKey>(TIMELINE_FILTER_RESET_KEY);

  const chips = useMemo(() => buildTimelineFilterChips(items, filter), [items, filter]);
  const visible = useMemo(() => filterTimelineMemoryItems(items, filter), [items, filter]);

  return (
    <Card data-testid="timeline-memory-section" data-scope={props.scope}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" aria-hidden /> Timeline memory
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Diary entries and grower-recorded snapshots in this scope.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {scope === null ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="timeline-memory-no-scope"
          >
            Open a {props.scope} to see its timeline.
          </p>
        ) : isLoading ? (
          <div
            className="h-16 rounded-md bg-muted/40 animate-pulse"
            data-testid="timeline-memory-loading"
            role="status"
            aria-label="Loading timeline"
          />
        ) : isError ? (
          <div
            role="alert"
            data-testid="timeline-memory-error"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-center justify-between gap-2"
          >
            <span>Couldn't load timeline memory right now.</span>
            <button
              type="button"
              data-testid="timeline-memory-retry"
              onClick={() => refetch()}
              className="text-xs px-3 min-h-11 inline-flex items-center rounded-md border border-border/60 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div
            data-testid="timeline-memory-empty"
            className="rounded-md border border-border/40 bg-muted/30 p-3 text-sm space-y-1"
          >
            <p className="text-foreground">No plant history yet.</p>
            <p className="text-muted-foreground">
              Use Fast Add or Quick Log to record an observation, watering,
              feeding, photo, or environment check.
            </p>
          </div>
        ) : (
          <>
            <TimelineFilterBar
              chips={chips}
              selected={filter}
              onSelect={setFilter}
              resetKey={TIMELINE_FILTER_RESET_KEY}
            />
            {visible.length === 0 ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="timeline-memory-filter-empty"
              >
                {TIMELINE_FILTER_EMPTY_STATE_COPY}
              </p>
            ) : (
              <ul className="space-y-3" data-testid="timeline-memory-list">
                {visible.map((item) =>
                  item.kind === "manual_sensor_snapshot" ? (
                    <li key={`snap:${item.key}`}>
                      <ManualSnapshotTimelineCard card={item.card} />
                    </li>
                  ) : item.kind === "ai_doctor_sensor_evidence_audit" ? (
                    <li key={`aiaudit:${item.key}`}>
                      <AiDoctorEvidenceAuditRow item={item} />
                    </li>
                  ) : item.kind === "diary" ? (
                    <li key={`diary:${item.key}`}>
                      <DiaryItemRow item={item} />
                    </li>
                  ) : (
                    <li
                      key={`unknown:${(item as { key?: string }).key ?? Math.random()}`}
                      data-testid="timeline-memory-unknown-fallback"
                      className="rounded-md border border-border/40 bg-muted/20 p-2 text-xs text-muted-foreground"
                    >
                      Entry (unsupported type, hidden from filters).
                    </li>
                  ),
                )}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
