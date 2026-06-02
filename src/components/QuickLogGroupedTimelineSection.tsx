/**
 * QuickLogGroupedTimelineSection — presenter that renders QuickLog v2
 * manual action + sibling environment events as a grouped or standalone
 * timeline list.
 *
 * Hard constraints:
 *  - Presenter-only. All grouping/pairing logic lives in
 *    `quickLogTimelineGroupingViewModel`. No grouping is duplicated here.
 *  - Reuses `<ManualSnapshotTimelineCard>` for environment rendering.
 *  - Source label is always "Manual" — never live/synced/connected/imported.
 *  - No writes, no automation, no device control.
 *  - A grouped environment event never also renders as a standalone card —
 *    the view-model guarantees mutual exclusion at the entry boundary.
 */
import { Droplets, NotebookPen, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ManualSnapshotTimelineCard from "@/components/ManualSnapshotTimelineCard";
import { useQuickLogGroupedTimeline } from "@/hooks/useQuickLogGroupedTimeline";
import type { QuickLogActionEvent, QuickLogTimelineEntry } from "@/lib/quickLogTimelineGroupingViewModel";

const ACTION_SOURCE_LABEL = "Manual";

type Props =
  | { scope: "plant"; plantId: string | null | undefined; tentId: string | null | undefined }
  | { scope: "tent"; tentId: string | null | undefined };

function actionTitle(a: QuickLogActionEvent): string {
  return a.kind === "water" ? "Watering" : "Note";
}

function actionIcon(a: QuickLogActionEvent) {
  return a.kind === "water" ? (
    <Droplets className="h-4 w-4" aria-hidden />
  ) : (
    <NotebookPen className="h-4 w-4" aria-hidden />
  );
}

function ActionDetails({ action }: { action: QuickLogActionEvent }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium">
          {actionIcon(action)}
          <span data-testid="quick-log-grouped-action-title">
            {actionTitle(action)}
          </span>
        </div>
        <Badge variant="secondary" data-testid="quick-log-grouped-action-source">
          {ACTION_SOURCE_LABEL}
        </Badge>
      </div>
      <p
        className="text-xs text-muted-foreground"
        data-testid="quick-log-grouped-action-occurred-at"
      >
        {action.occurredAt}
      </p>
      {action.kind === "water" && action.volumeMl != null && (
        <p className="text-xs" data-testid="quick-log-grouped-action-volume">
          {action.volumeMl} ml
        </p>
      )}
      {action.noteText && (
        <p className="text-sm text-foreground/90 break-words" data-testid="quick-log-grouped-action-note">
          {action.noteText}
        </p>
      )}
    </div>
  );
}

function EntryItem({ entry }: { entry: QuickLogTimelineEntry }) {
  if (entry.kind === "grouped") {
    return (
      <Card
        data-testid="quick-log-grouped-card"
        data-entry-kind="grouped"
        data-action-id={entry.action.id}
        data-environment-id={entry.environment.id}
        data-occurred-at={entry.occurredAt}
      >
        <CardContent className="space-y-3 p-3">
          <ActionDetails action={entry.action} />
          <ManualSnapshotTimelineCard card={entry.environmentCard} />
        </CardContent>
      </Card>
    );
  }
  if (entry.kind === "action") {
    return (
      <Card
        data-testid="quick-log-grouped-card"
        data-entry-kind="action"
        data-action-id={entry.action.id}
        data-occurred-at={entry.occurredAt}
      >
        <CardContent className="p-3">
          <ActionDetails action={entry.action} />
        </CardContent>
      </Card>
    );
  }
  return (
    <div
      data-testid="quick-log-grouped-card"
      data-entry-kind="environment"
      data-environment-id={entry.environment.id}
      data-occurred-at={entry.occurredAt}
    >
      <ManualSnapshotTimelineCard card={entry.environmentCard} />
    </div>
  );
}

function toScope(props: Props) {
  if (props.scope === "plant") {
    if (!props.plantId) return null;
    return {
      kind: "plant" as const,
      plantId: props.plantId,
      tentId: props.tentId ?? null,
    };
  }
  if (!props.tentId) return null;
  return { kind: "tent" as const, tentId: props.tentId };
}

export default function QuickLogGroupedTimelineSection(props: Props) {
  const scope = toScope(props);
  const { entries, isLoading, isError } = useQuickLogGroupedTimeline(scope);

  return (
    <Card
      data-testid="quick-log-grouped-timeline-section"
      data-scope={props.scope}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" aria-hidden /> QuickLog memory
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Recent Water and Note logs, grouped with the sensor snapshot saved at the same time.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {scope === null ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="quick-log-grouped-timeline-no-scope"
          >
            Open a {props.scope} to see its QuickLog memory.
          </p>
        ) : isLoading ? (
          <div
            className="h-16 rounded-md bg-muted/40 animate-pulse"
            data-testid="quick-log-grouped-timeline-loading"
          />
        ) : isError ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="quick-log-grouped-timeline-error"
          >
            Couldn't load QuickLog memory right now.
          </p>
        ) : entries.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="quick-log-grouped-timeline-empty"
          >
            No QuickLog entries yet.
          </p>
        ) : (
          <ul
            className="space-y-3"
            data-testid="quick-log-grouped-timeline-list"
          >
            {entries.map((entry, i) => {
              const key =
                entry.kind === "environment"
                  ? `env:${entry.environment.id}`
                  : `act:${entry.action.id}:${i}`;
              return (
                <li key={key}>
                  <EntryItem entry={entry} />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
