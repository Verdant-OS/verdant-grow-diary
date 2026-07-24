import { useMemo } from "react";
import type { DiaryCalendarDayGroup, DiaryCalendarEvent } from "@/lib/diaryCalendarViewModel";
import {
  buildCultivationCalendarMonthGrid,
  type CultivationCalendarMonthGridLoggedGroup,
} from "@/lib/cultivationCalendarMonthGridRules";
import {
  resolveCultivationCalendarStagePalette,
  type CultivationCalendarProjectedReviewBlock,
} from "@/lib/cultivationCalendarProjectionRules";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const STAGE_LEGEND_STAGES = ["seedling", "veg", "flower", "drying"] as const;
const MAX_VISIBLE_LOGGED_FACTS = 2;
const MAX_VISIBLE_ADVISORY_REVIEWS = 1;
const NEUTRAL_FACT_BLOCK_CLASS =
  "border border-border/50 bg-secondary/60 text-foreground hover:bg-secondary/80";

export interface CultivationCalendarMonthGridProps {
  /** UTC calendar month in YYYY-MM form. */
  monthKey: string | null | undefined;
  /** Already-presented and allowlisted diary facts grouped by UTC day. */
  groups: readonly DiaryCalendarDayGroup[] | null | undefined;
  /** Conservative, history-derived review opportunities. These remain advisory. */
  projectedReviews?: readonly CultivationCalendarProjectedReviewBlock[] | null;
  /** The current manually logged grow stage, shown in the badge and legend only. */
  activeStage?: string | null;
  /** Injectable instant for UTC today highlighting. Defaults to the current instant. */
  now?: Date | string | null;
  /** Opens the existing detail view for a logged fact only. */
  onOpenEvent?: (event: DiaryCalendarEvent) => void;
}

function buildLoggedGroups(
  groups: readonly DiaryCalendarDayGroup[] | null | undefined,
): CultivationCalendarMonthGridLoggedGroup[] {
  if (!Array.isArray(groups)) return [];

  return groups.map((group) => ({
    dateKey: group.dateKey,
    events: group.events.map((event) => ({
      id: event.id,
      kind: event.kind,
      label: event.label,
    })),
  }));
}

function buildEventLookup(
  groups: readonly DiaryCalendarDayGroup[] | null | undefined,
): Map<string, DiaryCalendarEvent> {
  const eventsById = new Map<string, DiaryCalendarEvent>();
  if (!Array.isArray(groups)) return eventsById;

  for (const group of groups) {
    for (const event of group.events) {
      eventsById.set(event.id, event);
    }
  }

  return eventsById;
}

function formatMonthLabel(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthIndex) ||
    monthIndex < 0 ||
    monthIndex > 11
  ) {
    return monthKey;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthIndex, 1)));
}

function dayAriaLabel({
  dateKey,
  isToday,
  loggedCount,
  advisoryCount,
}: {
  dateKey: string;
  isToday: boolean;
  loggedCount: number;
  advisoryCount: number;
}): string {
  const parts = [dateKey];
  if (isToday) parts.push("today");
  parts.push(
    loggedCount === 0
      ? "no logged care"
      : `${loggedCount} logged ${loggedCount === 1 ? "fact" : "facts"}`,
  );
  parts.push(
    advisoryCount === 0
      ? "no history-derived reviews"
      : `${advisoryCount} history-derived ${advisoryCount === 1 ? "review" : "reviews"}`,
  );
  return parts.join(", ");
}

/**
 * Read-only monthly cultivation calendar. Actual diary facts and history-derived
 * review opportunities intentionally use different block treatments: only facts
 * can open a detail view, and the grid never writes, schedules, or queues work.
 */
export default function CultivationCalendarMonthGrid({
  monthKey,
  groups,
  projectedReviews,
  activeStage,
  now,
  onOpenEvent,
}: CultivationCalendarMonthGridProps) {
  const grid = useMemo(
    () =>
      buildCultivationCalendarMonthGrid({
        monthKey,
        loggedGroups: buildLoggedGroups(groups),
        projectedReviews,
        today: now ?? new Date(),
      }),
    [groups, monthKey, now, projectedReviews],
  );
  const eventsById = useMemo(() => buildEventLookup(groups), [groups]);

  if (!grid.isValidMonth || !grid.monthKey) {
    return (
      <section
        aria-label="Cultivation calendar month grid"
        className="rounded-xl border border-border/50 bg-card/40 p-4"
        data-testid="cultivation-calendar-month-grid"
      >
        <p className="text-sm text-muted-foreground" data-testid="cultivation-calendar-month-empty">
          Choose a valid month to view your plant memory.
        </p>
      </section>
    );
  }

  const currentStagePalette = resolveCultivationCalendarStagePalette(activeStage);
  const gridHasEvents = grid.days.some((day) => day.hasLoggedFacts || day.hasAdvisoryReviews);

  return (
    <section
      aria-label={`Cultivation calendar for ${formatMonthLabel(grid.monthKey)}`}
      className="rounded-xl border border-border/50 bg-card/40 p-3 sm:p-4"
      data-testid="cultivation-calendar-month-grid"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{formatMonthLabel(grid.monthKey)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Logged care is solid. Dashed blocks are history-derived review opportunities, not
            scheduled work.
          </p>
        </div>
        <span
          className={cn(
            "inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
            currentStagePalette?.blockClassName ??
              "border border-border/50 bg-secondary/60 text-muted-foreground",
          )}
          data-testid="cultivation-calendar-active-stage"
        >
          {currentStagePalette ? `${currentStagePalette.label} stage` : "Stage not set"}
        </span>
      </div>

      <div
        aria-label="Stage colour legend"
        className="mt-3 flex flex-wrap items-center gap-1.5"
        data-testid="cultivation-calendar-stage-legend"
      >
        <span className="mr-1 text-[11px] text-muted-foreground">
          Stage colour follows the manually logged stage.
        </span>
        {STAGE_LEGEND_STAGES.map((stage) => {
          const palette = resolveCultivationCalendarStagePalette(stage);
          if (!palette) return null;
          return (
            <span
              key={stage}
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                palette.blockClassName,
              )}
            >
              {palette.label}
            </span>
          );
        })}
      </div>

      {!gridHasEvents && (
        <p
          className="mt-4 rounded-lg border border-dashed border-border/60 bg-secondary/20 px-3 py-2 text-xs text-muted-foreground"
          data-testid="cultivation-calendar-grid-empty"
        >
          No logged care or history-derived reviews in this month yet. Your calendar stays quiet
          until plant memory exists.
        </p>
      )}

      <p
        id="cultivation-calendar-mobile-scroll-hint"
        className="mt-3 text-xs text-muted-foreground md:hidden"
      >
        Swipe horizontally to see the full week and any care blocks off-screen.
      </p>

      <div
        className="mt-4 overflow-x-auto overscroll-x-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        data-testid="cultivation-calendar-horizontal-scroll"
        role="region"
        tabIndex={0}
        aria-label="Scrollable monthly cultivation calendar"
        aria-describedby="cultivation-calendar-mobile-scroll-hint"
      >
        <div className="min-w-[42rem]" role="grid" aria-label="Monthly cultivation calendar">
          <div className="grid grid-cols-7 gap-px text-center" role="row">
            {WEEKDAY_LABELS.map((day) => (
              <div
                key={day}
                role="columnheader"
                className="px-1 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px rounded-lg border border-border/50 bg-border/50">
            {grid.days.map((day) => {
              const visibleFacts = day.loggedFacts.slice(0, MAX_VISIBLE_LOGGED_FACTS);
              const visibleReviews = day.advisoryReviews.slice(0, MAX_VISIBLE_ADVISORY_REVIEWS);
              const hiddenItemCount =
                day.loggedFacts.length -
                visibleFacts.length +
                (day.advisoryReviews.length - visibleReviews.length);

              return (
                <article
                  key={day.dateKey}
                  role="gridcell"
                  aria-label={dayAriaLabel({
                    dateKey: day.dateKey,
                    isToday: day.isToday,
                    loggedCount: day.loggedFacts.length,
                    advisoryCount: day.advisoryReviews.length,
                  })}
                  className={cn(
                    "min-h-28 bg-card/80 p-1.5 sm:min-h-32 sm:p-2",
                    !day.isInMonth && "bg-muted/20 text-muted-foreground",
                    day.isToday && "ring-1 ring-inset ring-primary/70",
                  )}
                  data-testid="cultivation-calendar-day"
                  data-date-key={day.dateKey}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={cn(
                        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-medium",
                        day.isToday && "bg-primary text-primary-foreground",
                      )}
                    >
                      {day.dayOfMonth}
                    </span>
                    {!day.isInMonth && (
                      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                        Adjacent
                      </span>
                    )}
                  </div>

                  <div className="mt-1 space-y-1">
                    {visibleFacts.map((fact) => {
                      const sourceEvent = eventsById.get(fact.id);
                      const palette = resolveCultivationCalendarStagePalette(sourceEvent?.stage);
                      const canOpen = !!sourceEvent && !!onOpenEvent;

                      return (
                        <button
                          key={fact.id}
                          type="button"
                          disabled={!canOpen}
                          onClick={() => {
                            if (sourceEvent) onOpenEvent?.(sourceEvent);
                          }}
                          className={cn(
                            "block w-full rounded-md px-1.5 py-1 text-left text-[10px] font-medium leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default",
                            palette?.blockClassName ?? NEUTRAL_FACT_BLOCK_CLASS,
                          )}
                          data-testid="cultivation-calendar-fact-block"
                          aria-label={
                            canOpen ? `View logged ${fact.label}` : `Logged ${fact.label}`
                          }
                        >
                          <span className="block truncate">{fact.label}</span>
                        </button>
                      );
                    })}

                    {visibleReviews.map((review) => (
                      <div
                        key={review.id}
                        role="note"
                        title={review.advisoryText}
                        className="rounded-md border border-dashed border-primary/45 bg-primary/5 px-1.5 py-1 text-[10px] leading-tight text-muted-foreground"
                        data-testid="cultivation-calendar-advisory-block"
                      >
                        <span className="block font-medium text-foreground">
                          Suggested review · history-derived
                        </span>
                        <span className="block truncate">{review.advisoryText}</span>
                      </div>
                    ))}

                    {hiddenItemCount > 0 && (
                      <p className="px-1 text-[10px] text-muted-foreground">
                        +{hiddenItemCount} more in detailed history
                      </p>
                    )}

                    {!day.hasLoggedFacts && !day.hasAdvisoryReviews && (
                      <span className="sr-only">No logged care or history-derived reviews.</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
