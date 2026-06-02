/**
 * QuickLogGroupedTimelineSection — presenter that renders QuickLog v2
 * manual action + sibling environment events as a grouped or standalone
 * timeline list.
 *
 * Hard constraints:
 *  - Presenter-only. All grouping/pairing logic lives in
 *    `quickLogTimelineGroupingViewModel`. All filter logic lives in
 *    `quickLogGroupedTimelineFilterViewModel`. No business rules here.
 *  - Reuses `<ManualSnapshotTimelineCard>` for environment rendering.
 *  - Real source label is always "Manual" — never live/synced/connected/imported.
 *  - Demo/sample entries (never produced by the live hook) render with an
 *    explicit "Demo data" or "Sample timeline entry" label so they can
 *    never be mistaken for real plant memory.
 *  - No writes, no automation, no device control.
 *  - The "Create Quick Log" button opens the existing QuickLogV2Sheet
 *    flow without prefilling or submitting anything.
 */
import { useMemo, useState } from "react";
import { Droplets, NotebookPen, History, PlusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ManualSnapshotTimelineCard from "@/components/ManualSnapshotTimelineCard";
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import { useQuickLogGroupedTimeline } from "@/hooks/useQuickLogGroupedTimeline";
import type {
  QuickLogActionEvent,
  QuickLogTimelineEntry,
} from "@/lib/quickLogTimelineGroupingViewModel";
import {
  QUICK_LOG_GROUPED_TIMELINE_FILTERS,
  QUICK_LOG_GROUPED_TIMELINE_FILTER_LABELS,
  QUICK_LOG_GROUPED_TIMELINE_EMPTY_OVERALL_TEXT,
  QUICK_LOG_GROUPED_TIMELINE_EMPTY_FILTERED_TEXT,
  QUICK_LOG_GROUPED_TIMELINE_CREATE_BUTTON_LABEL,
  QUICK_LOG_MANUAL_SOURCE_LABEL,
  QUICK_LOG_DEMO_SOURCE_LABEL,
  QUICK_LOG_SAMPLE_SOURCE_LABEL,
  filterQuickLogGroupedTimelineEntries,
  type QuickLogGroupedTimelineFilter,
} from "@/lib/quickLogGroupedTimelineFilterViewModel";
import {
  QUICK_LOG_AUDIT_ACTION_SUBCARD_TITLE,
  QUICK_LOG_AUDIT_ENVIRONMENT_SUBCARD_TITLE,
  auditToggleLabel,
  isAuditableQuickLogEntry,
} from "@/lib/quickLogTimelineAuditViewModel";

/**
 * A demo/sample timeline entry. Never produced by the live hook — used
 * only by explicit demo surfaces or fixtures. Must always render with an
 * explicit demo/sample label, never "Manual".
 */
export interface DemoQuickLogTimelineEntry {
  entry: QuickLogTimelineEntry;
  /** "demo" → "Demo data" badge. "sample" → "Sample timeline entry" badge. */
  variant: "demo" | "sample";
}

type Props =
  | {
      scope: "plant";
      plantId: string | null | undefined;
      tentId: string | null | undefined;
      demoEntries?: ReadonlyArray<DemoQuickLogTimelineEntry>;
    }
  | {
      scope: "tent";
      tentId: string | null | undefined;
      demoEntries?: ReadonlyArray<DemoQuickLogTimelineEntry>;
    };

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

function ActionDetails({
  action,
  sourceLabel,
  sourceTestId,
}: {
  action: QuickLogActionEvent;
  sourceLabel: string;
  sourceTestId: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium">
          {actionIcon(action)}
          <span data-testid="quick-log-grouped-action-title">
            {actionTitle(action)}
          </span>
        </div>
        <Badge variant="secondary" data-testid={sourceTestId}>
          {sourceLabel}
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
        <p
          className="text-sm text-foreground/90 break-words"
          data-testid="quick-log-grouped-action-note"
        >
          {action.noteText}
        </p>
      )}
    </div>
  );
}

interface EntryItemProps {
  entry: QuickLogTimelineEntry;
  demoVariant?: "demo" | "sample";
}

function EntryItem({ entry, demoVariant }: EntryItemProps) {
  const isDemo = !!demoVariant;
  const sourceLabel = isDemo
    ? demoVariant === "demo"
      ? QUICK_LOG_DEMO_SOURCE_LABEL
      : QUICK_LOG_SAMPLE_SOURCE_LABEL
    : QUICK_LOG_MANUAL_SOURCE_LABEL;
  const sourceTestId = isDemo
    ? "quick-log-grouped-action-demo-source"
    : "quick-log-grouped-action-source";

  const commonDataAttrs = {
    "data-testid": "quick-log-grouped-card",
    "data-occurred-at": entry.occurredAt,
    "data-demo": isDemo ? "true" : "false",
    "data-demo-variant": demoVariant ?? "",
  } as const;

  // Audit toggle: local UI state, only on grouped entries.
  const [auditExpanded, setAuditExpanded] = useState(false);
  // In-place Review Panel: independent local UI state, only on grouped entries.
  const [reviewOpen, setReviewOpen] = useState(false);
  const auditable = isAuditableQuickLogEntry(entry);
  const reviewable =
    entry.kind === "grouped" && isReviewableQuickLogEntry(entry);
  const reviewActionSection =
    entry.kind === "grouped"
      ? buildQuickLogReviewActionSection(entry)
      : null;

  if (entry.kind === "grouped") {
    return (
      <Card
        {...commonDataAttrs}
        data-entry-kind="grouped"
        data-action-id={entry.action.id}
        data-environment-id={entry.environment.id}
        data-audit-expanded={auditExpanded ? "true" : "false"}
        data-review-open={reviewOpen ? "true" : "false"}
      >
        <CardContent className="space-y-3 p-3">
          {auditExpanded ? (
            <div
              className="space-y-3"
              data-testid="quick-log-grouped-audit-expanded"
            >
              <div
                className="rounded-md border border-border/60 p-3 space-y-1"
                data-testid="quick-log-grouped-audit-action-subcard"
              >
                <p
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  data-testid="quick-log-grouped-audit-action-subcard-title"
                >
                  {QUICK_LOG_AUDIT_ACTION_SUBCARD_TITLE}
                </p>
                <ActionDetails
                  action={entry.action}
                  sourceLabel={sourceLabel}
                  sourceTestId={sourceTestId}
                />
              </div>
              <div
                className="rounded-md border border-border/60 p-3 space-y-2"
                data-testid="quick-log-grouped-audit-environment-subcard"
              >
                <p
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  data-testid="quick-log-grouped-audit-environment-subcard-title"
                >
                  {QUICK_LOG_AUDIT_ENVIRONMENT_SUBCARD_TITLE}
                </p>
                <ManualSnapshotTimelineCard card={entry.environmentCard} />
              </div>
            </div>
          ) : (
            <>
              <ActionDetails
                action={entry.action}
                sourceLabel={sourceLabel}
                sourceTestId={sourceTestId}
              />
              <ManualSnapshotTimelineCard card={entry.environmentCard} />
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {auditable && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAuditExpanded((v) => !v)}
                aria-expanded={auditExpanded}
                data-testid="quick-log-grouped-audit-toggle"
              >
                {auditToggleLabel(auditExpanded)}
              </Button>
            )}
            {reviewable && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setReviewOpen((v) => !v)}
                aria-expanded={reviewOpen}
                data-testid="quick-log-grouped-review-trigger"
              >
                {reviewTriggerLabel(reviewOpen)}
              </Button>
            )}
          </div>
          {reviewOpen && reviewActionSection && (
            <section
              className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3"
              aria-label={QUICK_LOG_REVIEW_PANEL_TITLE}
              data-testid="quick-log-grouped-review-panel"
            >
              <header className="flex items-center justify-between gap-2">
                <h4
                  className="text-sm font-semibold"
                  data-testid="quick-log-grouped-review-panel-title"
                >
                  {QUICK_LOG_REVIEW_PANEL_TITLE}
                </h4>
              </header>
              <div
                className="rounded-md border border-border/40 bg-background p-3 space-y-1"
                data-testid="quick-log-grouped-review-action-section"
              >
                <p
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  data-testid="quick-log-grouped-review-action-section-title"
                >
                  {QUICK_LOG_REVIEW_ACTION_SECTION_TITLE}
                </p>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span
                    className="text-sm font-medium"
                    data-testid="quick-log-grouped-review-action-kind"
                  >
                    {reviewActionSection.kindLabel}
                  </span>
                  <Badge
                    variant="secondary"
                    data-testid="quick-log-grouped-review-action-source"
                  >
                    {reviewActionSection.sourceLabel}
                  </Badge>
                </div>
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="quick-log-grouped-review-action-occurred-at"
                >
                  {reviewActionSection.occurredAt}
                </p>
                {reviewActionSection.volumeMl != null && (
                  <p
                    className="text-xs"
                    data-testid="quick-log-grouped-review-action-volume"
                  >
                    {reviewActionSection.volumeMl} ml
                  </p>
                )}
                {reviewActionSection.noteText && (
                  <p
                    className="text-sm text-foreground/90 break-words"
                    data-testid="quick-log-grouped-review-action-note"
                  >
                    {reviewActionSection.noteText}
                  </p>
                )}
              </div>
              <div
                className="rounded-md border border-border/40 bg-background p-3 space-y-2"
                data-testid="quick-log-grouped-review-environment-section"
              >
                <p
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  data-testid="quick-log-grouped-review-environment-section-title"
                >
                  {QUICK_LOG_REVIEW_ENVIRONMENT_SECTION_TITLE}
                </p>
                <ManualSnapshotTimelineCard card={entry.environmentCard} />
              </div>
            </section>
          )}
        </CardContent>
      </Card>
    );
  }
  if (entry.kind === "action") {
    return (
      <Card
        {...commonDataAttrs}
        data-entry-kind="action"
        data-action-id={entry.action.id}
      >
        <CardContent className="p-3">
          <ActionDetails
            action={entry.action}
            sourceLabel={sourceLabel}
            sourceTestId={sourceTestId}
          />
        </CardContent>
      </Card>
    );
  }
  return (
    <div
      {...commonDataAttrs}
      data-entry-kind="environment"
      data-environment-id={entry.environment.id}
    >
      {isDemo && (
        <div className="mb-1">
          <Badge variant="secondary" data-testid="quick-log-grouped-env-demo-source">
            {sourceLabel}
          </Badge>
        </div>
      )}
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

function defaultTargetKeyFor(props: Props): string | null {
  if (props.scope === "plant") {
    return props.plantId ? `plant:${props.plantId}` : null;
  }
  return props.tentId ? `tent:${props.tentId}` : null;
}

export default function QuickLogGroupedTimelineSection(props: Props) {
  const scope = toScope(props);
  const { entries, isLoading, isError } = useQuickLogGroupedTimeline(scope);
  const [filter, setFilter] = useState<QuickLogGroupedTimelineFilter>("all");
  const [quickLogOpen, setQuickLogOpen] = useState(false);

  // Combine real entries with explicit demo/sample fixtures. Demo entries
  // keep their variant so the badge stays honest. Real entries always
  // render with "Manual".
  type Wrapped = { entry: QuickLogTimelineEntry; demoVariant?: "demo" | "sample" };
  const wrapped: Wrapped[] = useMemo(() => {
    const real: Wrapped[] = entries.map((e) => ({ entry: e }));
    const demo: Wrapped[] = (props.demoEntries ?? []).map((d) => ({
      entry: d.entry,
      demoVariant: d.variant,
    }));
    return [...real, ...demo];
  }, [entries, props.demoEntries]);

  const filteredWrapped = useMemo(
    () =>
      wrapped.filter((w) =>
        filterQuickLogGroupedTimelineEntries([w.entry], filter).length > 0,
      ),
    [wrapped, filter],
  );

  const hasAnyEntries = wrapped.length > 0;

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
        <div
          className="flex flex-wrap gap-2 pt-2"
          role="group"
          aria-label="QuickLog timeline filter"
          data-testid="quick-log-grouped-timeline-filters"
        >
          {QUICK_LOG_GROUPED_TIMELINE_FILTERS.map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={active}
                data-testid={`quick-log-grouped-timeline-filter-${f}`}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground hover:bg-muted",
                )}
              >
                {QUICK_LOG_GROUPED_TIMELINE_FILTER_LABELS[f]}
              </button>
            );
          })}
        </div>
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
        ) : !hasAnyEntries ? (
          <div
            className="space-y-3"
            data-testid="quick-log-grouped-timeline-empty"
          >
            <p className="text-sm text-muted-foreground">
              {QUICK_LOG_GROUPED_TIMELINE_EMPTY_OVERALL_TEXT}
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => setQuickLogOpen(true)}
              data-testid="quick-log-grouped-timeline-create-button"
            >
              <PlusCircle className="mr-2 h-4 w-4" aria-hidden />
              {QUICK_LOG_GROUPED_TIMELINE_CREATE_BUTTON_LABEL}
            </Button>
          </div>
        ) : filteredWrapped.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="quick-log-grouped-timeline-empty-filtered"
          >
            {QUICK_LOG_GROUPED_TIMELINE_EMPTY_FILTERED_TEXT}
          </p>
        ) : (
          <ul
            className="space-y-3"
            data-testid="quick-log-grouped-timeline-list"
          >
            {filteredWrapped.map((w, i) => {
              const entry = w.entry;
              const key =
                entry.kind === "environment"
                  ? `env:${entry.environment.id}:${i}`
                  : `act:${entry.action.id}:${i}`;
              return (
                <li key={key}>
                  <EntryItem entry={entry} demoVariant={w.demoVariant} />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      <QuickLogV2Sheet
        open={quickLogOpen}
        onOpenChange={setQuickLogOpen}
        defaultTargetKey={defaultTargetKeyFor(props)}
      />
    </Card>
  );
}
