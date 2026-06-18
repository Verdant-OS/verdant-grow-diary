import { useEffect, useMemo, useState } from "react";
import {
  Droplets,
  Utensils,
  Stethoscope,
  Thermometer,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import {
  buildDiaryCalendarViewModel,
  summarizeDiaryCalendar,
  filterDiaryCalendarGroups,
  filterDiaryCalendarGroupsByMonth,
  defaultDiaryCalendarMonth,
  shiftMonthKey,
  formatDiaryCalendarMonthLabel,
  diaryCalendarMonthEmptyTitle,
  computeDiaryCalendarFilterCounts,
  currentMonthKey,
  newestMatchingDateKeyInMonth,
  DIARY_CALENDAR_EMPTY_HINT,
  DIARY_CALENDAR_FILTERS,
  type DiaryCalendarRawEntry,
  type DiaryCalendarEvent,
  type DiaryCalendarEventKind,
  type DiaryCalendarFilter,
} from "@/lib/diaryCalendarViewModel";
import {
  buildDiaryCalendarEventDrawerViewModel,
  DIARY_CALENDAR_DRAWER_VIEW_LABEL,
  type DiaryCalendarEventDrawerViewModel,
} from "@/lib/diaryCalendarEventDrawerViewModel";
import DiaryCalendarEventDrawer from "@/components/DiaryCalendarEventDrawer";
import {
  readPersistedDiaryCalendarFilter,
  writePersistedDiaryCalendarFilter,
} from "@/lib/diaryCalendarFilterPersistence";

import { cn } from "@/lib/utils";

export const ENVIRONMENT_CHECK_SHOW_DETAILS_LABEL = "Show details";
export const ENVIRONMENT_CHECK_HIDE_DETAILS_LABEL = "Hide details";

const KIND_TONE: Record<DiaryCalendarEventKind, string> = {
  watering: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  feeding: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  diagnosis: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  environment: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

const KIND_ICON: Record<DiaryCalendarEventKind, typeof Droplets> = {
  watering: Droplets,
  feeding: Utensils,
  diagnosis: Stethoscope,
  environment: Thermometer,
};

const KIND_ORDER: readonly DiaryCalendarEventKind[] = [
  "watering",
  "feeding",
  "diagnosis",
  "environment",
];


function formatDateHeader(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map((n) => Number(n));
  if (!y || !m || !d) return dateKey;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export interface DiaryCalendarSectionProps {
  rawEntries: readonly DiaryCalendarRawEntry[] | null | undefined;
  /** Optional limit on number of days shown. Default 12. */
  dayLimit?: number;
  /** Injectable "today" for deterministic tests. Defaults to new Date(). */
  now?: Date;
}

export default function DiaryCalendarSection({
  rawEntries,
  dayLimit = 12,
  now,
}: DiaryCalendarSectionProps) {

  const allGroups = useMemo(
    () => buildDiaryCalendarViewModel(rawEntries ?? []),
    [rawEntries],
  );
  const [filter, setFilterState] = useState<DiaryCalendarFilter>(
    () => readPersistedDiaryCalendarFilter() ?? "all",
  );
  const [expandedEnvIds, setExpandedEnvIds] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleEnvExpanded = (id: string) => {
    setExpandedEnvIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [visibleMonth, setVisibleMonth] = useState<string | null>(() =>
    defaultDiaryCalendarMonth(allGroups, filter)
      ?? defaultDiaryCalendarMonth(allGroups, "all"),
  );

  // If the parent dataset changes and the current month no longer exists,
  // snap to the newest month with matching events under the active filter.
  useEffect(() => {
    if (allGroups.length === 0) {
      if (visibleMonth !== null) setVisibleMonth(null);
      return;
    }
    if (visibleMonth === null) {
      setVisibleMonth(defaultDiaryCalendarMonth(allGroups, filter));
    }
    // Note: we intentionally do not auto-shift away from an empty month
    // chosen by explicit prev/next navigation — empty state will explain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allGroups]);

  // Month-scoped view of the full dataset (before kind filter).
  const monthGroupsAll = useMemo(
    () => filterDiaryCalendarGroupsByMonth(allGroups, visibleMonth),
    [allGroups, visibleMonth],
  );
  // Visible-month counts: badges reflect what's in the visible month so
  // they stay informative as the user navigates history.
  const filterCounts = useMemo(
    () => computeDiaryCalendarFilterCounts(monthGroupsAll),
    [monthGroupsAll],
  );
  const groups = useMemo(
    () => filterDiaryCalendarGroups(monthGroupsAll, filter),
    [monthGroupsAll, filter],
  );
  const visibleGroups = useMemo(
    () => groups.slice(0, Math.max(1, dayLimit)),
    [groups, dayLimit],
  );
  const summary = useMemo(() => summarizeDiaryCalendar(groups), [groups]);
  const rawDetailsById = useMemo(() => {
    const map = new Map<string, unknown>();
    for (const r of rawEntries ?? []) {
      if (r && typeof r.id === "string") map.set(r.id, r.details);
    }
    return map;
  }, [rawEntries]);
  const [drawerEvent, setDrawerEvent] =
    useState<DiaryCalendarEventDrawerViewModel | null>(null);
  const openEventDrawer = (ev: DiaryCalendarEvent) => {
    setDrawerEvent(
      buildDiaryCalendarEventDrawerViewModel(ev, rawDetailsById.get(ev.id) ?? null),
    );
  };
  const [openDay, setOpenDay] = useState<string | null>(
    visibleGroups[0]?.dateKey ?? null,
  );

  // Switching filter: jump to the newest month with matching events under
  // the new filter so the user sees results immediately, and reset the
  // expanded day to the newest match within that month.
  const setFilter = (next: DiaryCalendarFilter) => {
    if (next === filter) return;
    setFilterState(next);
    writePersistedDiaryCalendarFilter(next);
    const nextMonth = defaultDiaryCalendarMonth(allGroups, next) ?? visibleMonth;
    setVisibleMonth(nextMonth);
    const nextMonthGroups = filterDiaryCalendarGroups(
      filterDiaryCalendarGroupsByMonth(allGroups, nextMonth),
      next,
    );
    setOpenDay(nextMonthGroups[0]?.dateKey ?? null);
  };

  // Month nav: shift visible month, reset expanded day to the newest day
  // in the new month (under the active filter) so events render immediately.
  const shiftMonth = (delta: number) => {
    if (!visibleMonth) return;
    const next = shiftMonthKey(visibleMonth, delta);
    setVisibleMonth(next);
    const nextGroups = filterDiaryCalendarGroups(
      filterDiaryCalendarGroupsByMonth(allGroups, next),
      filter,
    );
    setOpenDay(nextGroups[0]?.dateKey ?? null);
  };
  // Today: jump to the current UTC month, keep active filter, and expand
  // the newest matching day in that month. If no matches exist, close the
  // expanded day so we don't leak stale details.
  const goToToday = () => {
    const today = now ?? new Date();
    const todayMonth = currentMonthKey(today);
    setVisibleMonth(todayMonth);
    setOpenDay(newestMatchingDateKeyInMonth(allGroups, todayMonth, filter));
  };


  // Belt-and-braces: never render stale details if the open day was removed
  // (e.g. raw entries changed asynchronously, or month/filter shifted).
  const openDayStillVisible =
    openDay !== null && visibleGroups.some((g) => g.dateKey === openDay);
  const effectiveOpenDay =
    openDay === null || openDayStillVisible ? openDay : null;

  const hasAnyEntries = allGroups.length > 0;
  const monthLabel = visibleMonth
    ? formatDiaryCalendarMonthLabel(visibleMonth)
    : "";


  return (
    <section
      className="glass rounded-2xl p-4"
      aria-label="Diary calendar"
      data-testid="diary-calendar-section"
    >
      <header className="flex items-center gap-2 mb-3">
        <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Calendar
        </h2>
        <span className="text-[11px] text-muted-foreground">
          Watering · Feeding · Diagnosis · Environment · read-only
        </span>

      </header>

      {hasAnyEntries && visibleMonth && (
        <div
          className="mb-3 flex items-center justify-between gap-2"
          data-testid="diary-calendar-month-nav"
        >
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => shiftMonth(-1)}
            data-testid="diary-calendar-month-prev"
            className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-border/50 bg-secondary/50 hover:bg-secondary transition"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <span
            className="text-sm font-medium text-foreground"
            data-testid="diary-calendar-month-label"
            aria-live="polite"
          >
            {monthLabel}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Today"
              onClick={goToToday}
              data-testid="diary-calendar-today"
              className="inline-flex items-center justify-center h-8 px-2.5 rounded-full border border-border/50 bg-secondary/50 hover:bg-secondary transition text-[11px] font-medium"
            >
              Today
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
              data-testid="diary-calendar-month-next"
              className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-border/50 bg-secondary/50 hover:bg-secondary transition"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>

        </div>
      )}

      {hasAnyEntries && (
        <div
          role="group"
          aria-label="Filter calendar by event type"
          className={cn(
            // Mobile: single-row horizontal scroll with comfortable tap targets.
            "mb-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1",
            "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
            // Desktop: wrap chips into multiple rows; smaller gap.
            "sm:mx-0 sm:px-0 sm:pb-0 sm:flex-wrap sm:gap-1.5 sm:overflow-visible",
          )}
          data-testid="diary-calendar-filters"
        >
          {DIARY_CALENDAR_FILTERS.map((f) => {
            const active = filter === f.value;
            const count = filterCounts[f.value];
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={active}
                aria-label={`${f.label}, ${count} ${count === 1 ? "event" : "events"}`}
                onClick={() => setFilter(f.value)}
                data-testid={`diary-calendar-filter-${f.value}`}
                className={cn(
                  // Mobile: 44px-tall comfortable target, no wrapping, no shrink.
                  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-medium transition min-h-[40px]",
                  // Desktop: tighter density to match prior look.
                  "sm:px-2.5 sm:py-1 sm:text-[11px] sm:min-h-0",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary/50 text-foreground border-border/50 hover:bg-secondary",
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-[1.25rem] px-1 rounded-full text-[10px] font-semibold",
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {groups.length === 0 ? (
        filter === "environment" ? (
          <EnvironmentCheckEmptyState />
        ) : (
          <div
            className="py-8 text-center text-sm text-muted-foreground"
            data-testid="diary-calendar-empty"
          >
            <p>{diaryCalendarMonthEmptyTitle(visibleMonth, filter)}</p>
            <p className="text-xs mt-1">{DIARY_CALENDAR_EMPTY_HINT}</p>
          </div>
        )
      ) : (

        <>
          <div className="mb-3 flex flex-wrap gap-1.5 text-[11px]">
            <SummaryChip kind="watering" count={summary.counts.watering} />
            <SummaryChip kind="feeding" count={summary.counts.feeding} />
            <SummaryChip kind="diagnosis" count={summary.counts.diagnosis} />
            <SummaryChip kind="environment" count={summary.counts.environment} />
            <span className="ml-auto text-muted-foreground">
              {summary.totalDays} {summary.totalDays === 1 ? "day" : "days"}
            </span>
          </div>



          <ul className="space-y-2" role="list">
            {visibleGroups.map((group) => {
              const isOpen = effectiveOpenDay === group.dateKey;
              const headingId = `diary-calendar-day-${group.dateKey}`;
              return (
                <li
                  key={group.dateKey}
                  className="rounded-xl border border-border/50 bg-secondary/30 overflow-hidden"
                  data-testid="diary-calendar-day"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`${headingId}-events`}
                    onClick={() =>
                      setOpenDay((prev) => (prev === group.dateKey ? null : group.dateKey))
                    }
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/50 transition"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    )}
                    <h3 id={headingId} className="text-sm font-medium">
                      {formatDateHeader(group.dateKey)}
                    </h3>
                    <div className="ml-auto flex flex-wrap gap-1">
                      {KIND_ORDER.map((k) =>
                        group.counts[k] > 0 ? (
                          <KindChip key={k} kind={k} count={group.counts[k]} compact />
                        ) : null,
                      )}

                    </div>
                  </button>

                  {isOpen && (
                    <ul
                      id={`${headingId}-events`}
                      role="list"
                      className="border-t border-border/40 divide-y divide-border/30"
                    >
                      {group.events.map((ev) => {
                        const Icon = KIND_ICON[ev.kind];
                        const time = new Date(ev.occurredAt).toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        });
                        return (
                          <li
                            key={ev.id}
                            className="px-3 py-2 flex items-start gap-2"
                            data-testid="diary-calendar-event"
                          >
                            <span
                              className={cn(
                                "mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium",
                                KIND_TONE[ev.kind],
                              )}
                            >
                              <Icon className="h-3 w-3" aria-hidden />
                              {ev.label}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                <span>{time}</span>
                                {ev.plantName && (
                                  <span className="truncate">· {ev.plantName}</span>
                                )}
                              </div>
                              {ev.noteSnippet && (
                                <p className="text-xs mt-1 whitespace-pre-wrap break-words">
                                  {ev.noteSnippet}
                                </p>
                              )}
                              <div
                                className="mt-2 rounded-lg border border-border/40 bg-background/40 px-2 py-1.5"
                                data-testid="diary-calendar-event-details"
                                aria-label={ev.details.sectionLabel}
                              >
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                                  {ev.details.sectionLabel}
                                </p>
                                {ev.details.subtitle && (
                                  <p
                                    className="text-[11px] text-muted-foreground italic mb-1"
                                    data-testid="diary-calendar-event-subtitle"
                                  >
                                    {ev.details.subtitle}
                                  </p>
                                )}

                                {ev.kind === "environment" ? (
                                  (() => {
                                    const expanded = expandedEnvIds.has(ev.id);
                                    const fields = ev.details.fields;
                                    const hasValues = fields.length > 0;
                                    return (
                                      <>
                                        {hasValues && (
                                          <p
                                            className="text-[11px] text-foreground"
                                            data-testid="diary-calendar-env-compact"
                                          >
                                            {fields.map((f) => f.value).join(" · ")}
                                          </p>
                                        )}
                                        {expanded && hasValues && (
                                          <dl
                                            className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]"
                                            data-testid="diary-calendar-env-expanded"
                                          >
                                            {fields.map((f) => (
                                              <div key={f.label} className="contents">
                                                <dt className="text-muted-foreground">{f.label}</dt>
                                                <dd className="break-words">{f.value}</dd>
                                              </div>
                                            ))}
                                            {ev.noteSnippet && (
                                              <div className="contents">
                                                <dt className="text-muted-foreground">Note</dt>
                                                <dd className="break-words">{ev.noteSnippet}</dd>
                                              </div>
                                            )}
                                          </dl>
                                        )}
                                        {ev.details.fallback && (
                                          <p className="text-[11px] text-muted-foreground italic">
                                            {ev.details.fallback}
                                          </p>
                                        )}
                                        {(hasValues || ev.noteSnippet) && (
                                          <button
                                            type="button"
                                            onClick={() => toggleEnvExpanded(ev.id)}
                                            aria-expanded={expanded}
                                            aria-label={
                                              expanded
                                                ? ENVIRONMENT_CHECK_HIDE_DETAILS_LABEL
                                                : ENVIRONMENT_CHECK_SHOW_DETAILS_LABEL
                                            }
                                            data-testid="diary-calendar-env-toggle"
                                            className="mt-1 inline-flex items-center text-[11px] font-medium text-primary hover:underline"
                                          >
                                            {expanded
                                              ? ENVIRONMENT_CHECK_HIDE_DETAILS_LABEL
                                              : ENVIRONMENT_CHECK_SHOW_DETAILS_LABEL}
                                          </button>
                                        )}
                                      </>
                                    );
                                  })()
                                ) : (
                                  <>
                                    {ev.details.fields.length > 0 && (
                                      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                                        {ev.details.fields.map((f) => (
                                          <div key={f.label} className="contents">
                                            <dt className="text-muted-foreground">{f.label}</dt>
                                            <dd className="break-words">{f.value}</dd>
                                          </div>
                                        ))}
                                      </dl>
                                    )}
                                    {ev.details.ecPreview && ev.details.ecPreview.visible && (
                                      <p
                                        className="mt-1 text-[11px] text-muted-foreground"
                                        data-testid="diary-calendar-ec-preview"
                                      >
                                        <span className="font-medium text-foreground">
                                          {ev.details.ecPreview.label}:
                                        </span>{" "}
                                        {ev.details.ecPreview.valueDisplay}
                                        <span className="ml-1 italic">
                                          ({ev.details.ecPreview.disclaimer})
                                        </span>
                                      </p>
                                    )}
                                    {ev.details.fallback && (
                                      <p className="text-[11px] text-muted-foreground italic">
                                        {ev.details.fallback}
                                      </p>
                                    )}
                                  </>
                                )}
                              </div>
                              <div className="mt-2">
                                <button
                                  type="button"
                                  onClick={() => openEventDrawer(ev)}
                                  aria-label={DIARY_CALENDAR_DRAWER_VIEW_LABEL}
                                  data-testid="diary-calendar-event-view"
                                  className="inline-flex items-center text-[11px] font-medium text-primary hover:underline"
                                >
                                  {DIARY_CALENDAR_DRAWER_VIEW_LABEL}
                                </button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          {groups.length > visibleGroups.length && (
            <p className="mt-2 text-[11px] text-muted-foreground text-center">
              Showing the most recent {visibleGroups.length} days.
            </p>
          )}
        </>
      )}
      <DiaryCalendarEventDrawer
        model={drawerEvent}
        open={drawerEvent !== null}
        onOpenChange={(open) => {
          if (!open) setDrawerEvent(null);
        }}
      />
    </section>
  );
}

function SummaryChip({ kind, count }: { kind: DiaryCalendarEventKind; count: number }) {
  const Icon = KIND_ICON[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border",
        KIND_TONE[kind],
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {count} {kind}
    </span>
  );
}

function KindChip({
  kind,
  count,
  compact,
}: {
  kind: DiaryCalendarEventKind;
  count: number;
  compact?: boolean;
}) {
  const Icon = KIND_ICON[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border text-[10px] font-medium",
        compact ? "px-1.5 py-0.5" : "px-2 py-0.5",
        KIND_TONE[kind],
      )}
      aria-label={`${count} ${kind}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {count}
    </span>
  );
}

export const ENVIRONMENT_CHECK_EMPTY_TITLE = "No Environment Checks yet";
export const ENVIRONMENT_CHECK_EMPTY_BODY =
  "Log an Environment Check to capture grower-entered temp, humidity, VPD, CO₂, and notes for this day. These entries are diary evidence, not live sensor telemetry.";
export const ENVIRONMENT_CHECK_EMPTY_CTA = "Add Environment Check";
export const ENVIRONMENT_CHECK_EMPTY_CTA_FALLBACK = "Open Quick Log to add one.";

function EnvironmentCheckEmptyState() {
  // Dispatches the existing window event handled by Quick Log / Global Fast
  // Add. No Supabase, no write helpers, no telemetry rows created here.
  const canDispatch =
    typeof window !== "undefined" && typeof window.dispatchEvent === "function";
  const onClick = () => {
    if (!canDispatch) return;
    window.dispatchEvent(
      new CustomEvent("verdant:open-quicklog", {
        detail: { eventType: "environment", source: "diary-calendar-empty" },
      }),
    );
  };
  return (
    <div
      className="py-8 px-4 text-center"
      data-testid="diary-calendar-empty"
      role="status"
    >
      <p className="text-sm font-medium text-foreground">
        {ENVIRONMENT_CHECK_EMPTY_TITLE}
      </p>
      <p
        className="mt-2 text-xs text-muted-foreground max-w-md mx-auto"
        data-testid="diary-calendar-environment-empty-body"
      >
        {ENVIRONMENT_CHECK_EMPTY_BODY}
      </p>
      <button
        type="button"
        onClick={canDispatch ? onClick : undefined}
        disabled={!canDispatch}
        data-testid="diary-calendar-environment-empty-cta"
        aria-label={
          canDispatch
            ? ENVIRONMENT_CHECK_EMPTY_CTA
            : ENVIRONMENT_CHECK_EMPTY_CTA_FALLBACK
        }
        className={cn(
          "mt-4 inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium min-h-[40px] transition",
          canDispatch
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "bg-secondary text-muted-foreground cursor-not-allowed",
        )}
      >
        <Thermometer className="h-3.5 w-3.5" aria-hidden />
        {canDispatch
          ? ENVIRONMENT_CHECK_EMPTY_CTA
          : ENVIRONMENT_CHECK_EMPTY_CTA_FALLBACK}
      </button>
    </div>
  );
}

