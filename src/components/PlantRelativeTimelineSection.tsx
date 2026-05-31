/**
 * Render-only Relative Cultivation Timeline section for Plant Detail.
 *
 * Read-only: projects existing diary entries onto plant-day / stage-day
 * via `relativeTimelineProjectionRules`. No create/edit/delete/drag
 * controls. No writes. No alerts. No Action Queue execution. No device
 * control. No reminder scheduling. No calendar event tables.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Gauge, ImageUp, NotebookPen, Sprout } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import {
  buildRelativeTimelineFilterChips,
  buildRelativeTimelineProjection,
  filterRelativeTimelineItems,
  formatRelativeTimelineEntryDetail,
  formatRelativeTimelineGroupSummary,
  formatRelativeTimelineSummary,
  getRelativeTimelineFilterEmptyState,
  groupRelativeTimelineByStage,
  RELATIVE_TIMELINE_FILTERS,
  summarizeRelativeTimelineItems,
  type RelativeTimelineEntryContext,
  type RelativeTimelineFilterKey,
  type RelativeTimelineItem,
} from "@/lib/relativeTimelineProjectionRules";
import {
  buildRelativeTimelineEmptyState,
  type RelativeTimelineCta,
} from "@/lib/relativeTimelineEmptyStateRules";




interface Props {
  plantId: string | null | undefined;
  plantStartedAt: string | number | Date | null | undefined;
  currentStage?: string | null;
  stageStartedAt?: string | number | Date | null;
  /** Optional human-readable context for each card. */
  plantName?: string | null;
  tentName?: string | null;
  growName?: string | null;
  /** Optional IDs used by the empty-state CTAs to preserve context. */
  growId?: string | null;
  tentId?: string | null;
}

function CtaIcon({ kind }: { kind: RelativeTimelineCta["key"] }) {
  if (kind === "manual-snapshot") return <Gauge className="h-4 w-4" aria-hidden />;
  if (kind === "photo") return <ImageUp className="h-4 w-4" aria-hidden />;
  return <NotebookPen className="h-4 w-4" aria-hidden />;
}

function TimelineEmptyStateCta({ cta }: { cta: RelativeTimelineCta }) {
  const testId = `relative-timeline-empty-cta-${cta.key}`;
  const baseClass =
    "w-full sm:w-auto min-h-[40px] gap-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
  if (cta.disabled) {
    return (
      <div className="flex flex-col gap-1 w-full sm:w-auto">
        <Button
          type="button"
          variant="outline"
          disabled
          aria-disabled
          data-testid={testId}
          data-disabled="true"
          className={baseClass}
        >
          <CtaIcon kind={cta.key} /> {cta.label}
        </Button>
        {cta.disabledReason && (
          <p
            className="text-xs text-muted-foreground"
            data-testid={`${testId}-reason`}
          >
            {cta.disabledReason}
          </p>
        )}
      </div>
    );
  }
  if (cta.mode === "route" && cta.route) {
    return (
      <Button
        asChild
        variant={cta.key === "quicklog" ? "default" : "outline"}
        data-testid={testId}
        data-mode="route"
        data-route={cta.route}
        className={baseClass}
      >
        <Link to={cta.route}>
          <CtaIcon kind={cta.key} /> {cta.label}
        </Link>
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant={cta.key === "quicklog" ? "default" : "outline"}
      onClick={() => {
        if (cta.mode !== "event" || !cta.eventName) return;
        window.dispatchEvent(
          new CustomEvent(cta.eventName, { detail: cta.eventDetail ?? null }),
        );
      }}
      data-testid={testId}
      data-mode="event"
      data-event-name={cta.eventName ?? ""}
      className={baseClass}
    >
      <CtaIcon kind={cta.key} /> {cta.label}
    </Button>
  );
}



function SourceIcon({ source }: { source: RelativeTimelineItem["source"] }) {
  if (source === "photo") return <Camera className="h-3.5 w-3.5" aria-hidden />;
  if (source === "sensor") return <Gauge className="h-3.5 w-3.5" aria-hidden />;
  return <NotebookPen className="h-3.5 w-3.5" aria-hidden />;
}

function TimelineRow({
  item,
  context,
}: {
  item: RelativeTimelineItem;
  context: RelativeTimelineEntryContext;
}) {
  const detail = formatRelativeTimelineEntryDetail(item, context)!;
  return (
    <li
      className="rounded-lg border bg-card/40 p-3 text-sm focus-within:ring-2 focus-within:ring-ring"
      data-testid="relative-timeline-item"
      data-item-id={item.id}
      data-event-type={item.eventType}
      data-source={item.source}
      data-category={detail.categoryKey}
      data-plant-day={item.plantDay ?? ""}
      data-stage-day={item.stageDay ?? ""}
      aria-label={`${detail.categoryLabel} entry — ${detail.summary}`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="secondary"
            className="gap-1"
            data-testid="relative-timeline-source-badge"
            data-source-label={detail.sourceLabel}
          >
            <SourceIcon source={item.source} /> {detail.sourceLabel}
          </Badge>
          {item.stagePreset && (
            <Badge
              variant="outline"
              className={`stage-token-${item.stagePreset.colorToken}`}
              data-testid="relative-timeline-stage-badge"
              data-stage-key={item.stagePreset.key}
              data-stage-color-token={item.stagePreset.colorToken}
            >
              {item.stagePreset.label}
            </Badge>
          )}
          <Badge
            variant="outline"
            data-testid="relative-timeline-event-type"
            data-category-key={detail.categoryKey}
          >
            {detail.categoryLabel}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {item.plantDay !== null && (
            <span data-testid="relative-timeline-plant-day">
              Plant day {item.plantDay}
            </span>
          )}
          {item.stageDay !== null && (
            <span data-testid="relative-timeline-stage-day">
              Stage day {item.stageDay}
            </span>
          )}
          <span
            data-testid="relative-timeline-timestamp"
            data-fallback={detail.timestampIsFallback ? "true" : "false"}
            className={cn(detail.timestampIsFallback && "italic text-muted-foreground/70")}
          >
            {detail.timestampLabel}
          </span>
        </div>
      </div>
      <p
        className={cn(
          "mt-1.5 text-sm break-words",
          detail.summaryIsFallback
            ? "italic text-muted-foreground"
            : "text-foreground/90",
        )}
        data-testid="relative-timeline-title"
        data-summary-fallback={detail.summaryIsFallback ? "true" : "false"}
      >
        {detail.summary}
      </p>
      {detail.hasContext && (
        <p
          className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5"
          data-testid="relative-timeline-context"
        >
          {detail.plantContextLabel && (
            <span data-testid="relative-timeline-context-plant">
              {detail.plantContextLabel}
            </span>
          )}
          {detail.tentContextLabel && (
            <span data-testid="relative-timeline-context-tent">
              {detail.tentContextLabel}
            </span>
          )}
          {detail.growContextLabel && (
            <span data-testid="relative-timeline-context-grow">
              {detail.growContextLabel}
            </span>
          )}
        </p>
      )}
    </li>
  );
}

export default function PlantRelativeTimelineSection({
  plantId,
  plantStartedAt,
  currentStage,
  stageStartedAt,
  plantName,
  tentName,
  growName,
  growId,
  tentId,
}: Props) {
  const { data, isLoading } = usePlantRecentActivity(plantId);
  const [filter, setFilter] = useState<RelativeTimelineFilterKey>("all");
  const entryContext: RelativeTimelineEntryContext = {
    plantName: plantName ?? null,
    tentName: tentName ?? null,
    growName: growName ?? null,
  };

  const emptyState = buildRelativeTimelineEmptyState({
    plantId: plantId ?? null,
    plantName: plantName ?? null,
    growId: growId ?? null,
    tentId: tentId ?? null,
    tentName: tentName ?? null,
  });

  const items = buildRelativeTimelineProjection({
    rawEntries: data ?? [],
    plantId: plantId ?? null,
    plantStartedAt: plantStartedAt ?? null,
    currentStage: currentStage ?? null,
    stageStartedAt: stageStartedAt ?? null,
  });
  const visibleItems = filterRelativeTimelineItems(items, filter);
  const groups = groupRelativeTimelineByStage(visibleItems);

  return (
    <Card data-testid="plant-relative-timeline-section">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sprout className="h-4 w-4" /> Relative Timeline
        </CardTitle>
        <p
          className="text-xs text-muted-foreground"
          data-testid="relative-timeline-helper"
        >
          This timeline is based on plant days, not just calendar dates.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div
            className="h-16 rounded-md bg-muted/40 animate-pulse"
            data-testid="relative-timeline-loading"
          />
        ) : items.length === 0 ? (
          <div
            className="rounded-lg border border-dashed border-border/60 bg-muted/10 p-4 space-y-3"
            data-testid="relative-timeline-empty"
          >
            <p
              className="text-sm text-foreground/90"
              data-testid="relative-timeline-empty-copy"
            >
              {emptyState.copy}
            </p>
            <div
              className="flex flex-col sm:flex-row sm:flex-wrap gap-2"
              data-testid="relative-timeline-empty-ctas"
            >
              {emptyState.ctas.map((cta) => (
                <TimelineEmptyStateCta key={cta.key} cta={cta} />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {(() => {
              const formatted = formatRelativeTimelineSummary(
                summarizeRelativeTimelineItems(items),
              );
              return (
                <div
                  data-testid="relative-timeline-summary"
                  data-total={formatted.chips.find((c) => c.key === "total")?.count ?? 0}
                  className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/40 bg-muted/20 p-2 text-xs"
                >
                  {formatted.chips.map((chip) => (
                    <span
                      key={chip.key}
                      data-testid={`relative-timeline-summary-chip-${chip.key}`}
                      data-count={chip.count}
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 border",
                        chip.key === "total"
                          ? "bg-primary/10 text-foreground border-primary/30 font-medium"
                          : "bg-secondary/40 text-muted-foreground border-border/40",
                      )}
                    >
                      {chip.label}
                    </span>
                  ))}
                  {formatted.lastActivity && (
                    <span
                      data-testid="relative-timeline-summary-last-activity"
                      className="ml-auto text-muted-foreground"
                    >
                      {formatted.lastActivity}
                    </span>
                  )}
                </div>
              );
            })()}
            <div
              role="radiogroup"
              aria-label="Filter timeline by event type"
              data-testid="relative-timeline-filters"
              className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 sm:flex-wrap sm:overflow-visible"
            >
              {buildRelativeTimelineFilterChips(items, filter).map((chip) => {
                const isMuted = chip.disabled;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    role="radio"
                    aria-checked={chip.selected}
                    aria-label={`Filter timeline by ${chip.label} (${chip.count})`}
                    data-testid={`relative-timeline-filter-${chip.key}`}
                    data-selected={chip.selected ? "true" : "false"}
                    data-disabled={isMuted ? "true" : "false"}
                    data-count={chip.count}
                    onClick={() => setFilter(chip.key)}
                    className={cn(
                      "shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors min-h-[32px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                      chip.selected
                        ? "bg-primary text-primary-foreground border-primary"
                        : isMuted
                        ? "bg-muted/30 text-muted-foreground/60 border-border/30 hover:bg-muted/40"
                        : "bg-secondary/40 text-foreground border-border/40 hover:bg-secondary/60",
                    )}
                  >
                    <span>{chip.label}</span>
                    <span
                      data-testid={`relative-timeline-filter-${chip.key}-count`}
                      className={cn(
                        "tabular-nums rounded-full px-1.5 py-0 text-[10px] leading-4",
                        chip.selected
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-background/60 text-muted-foreground",
                      )}
                    >
                      {chip.count}
                    </span>
                  </button>
                );
              })}
            </div>
            {visibleItems.length === 0 ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="relative-timeline-filter-empty"
                data-filter-key={filter}
              >
                {getRelativeTimelineFilterEmptyState(filter)}
              </p>
            ) : (
              <div
                className="space-y-4 max-h-[28rem] overflow-y-auto pr-1"
                data-testid="relative-timeline-list"
              >
                {groups.map((group) => (
                  <section
                    key={group.key}
                    data-testid="relative-timeline-stage-group"
                    data-stage-key={group.key}
                    data-stage-color-token={group.colorToken ?? ""}
                    data-count={group.count}
                    className="space-y-2"
                  >
                    <header className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            group.colorToken
                              ? `stage-token-${group.colorToken}`
                              : undefined
                          }
                          data-testid="relative-timeline-group-stage-badge"
                          data-stage-color-token={group.colorToken ?? ""}
                        >
                          {group.label}
                        </Badge>
                      </div>
                      <span
                        className="text-xs text-muted-foreground"
                        data-testid="relative-timeline-group-count"
                      >
                        {group.count} {group.count === 1 ? "event" : "events"}
                      </span>
                    </header>
                    {(() => {
                      const gs = formatRelativeTimelineGroupSummary(
                        summarizeRelativeTimelineItems(group.items),
                      );
                      return gs.compact ? (
                        <p
                          data-testid="relative-timeline-group-summary"
                          data-stage-key={group.key}
                          data-total={gs.totalLabel ? group.count : 0}
                          className="text-xs text-muted-foreground/90 flex flex-wrap gap-x-1.5"
                        >
                          {gs.compact}
                        </p>
                      ) : null;
                    })()}

                    <ol className="space-y-2">
                      {group.items.map((item) => (
                        <TimelineRow key={item.id} item={item} context={entryContext} />
                      ))}
                    </ol>
                  </section>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

