import { useMemo, useState } from "react";
import { Droplets, Utensils, Stethoscope, CalendarDays, ChevronDown, ChevronRight } from "lucide-react";
import {
  buildDiaryCalendarViewModel,
  summarizeDiaryCalendar,
  filterDiaryCalendarGroups,
  diaryCalendarEmptyTitleFor,
  computeDiaryCalendarFilterCounts,
  DIARY_CALENDAR_EMPTY_HINT,
  DIARY_CALENDAR_FILTERS,
  type DiaryCalendarRawEntry,
  type DiaryCalendarEventKind,
  type DiaryCalendarFilter,
} from "@/lib/diaryCalendarViewModel";
import { cn } from "@/lib/utils";

const KIND_TONE: Record<DiaryCalendarEventKind, string> = {
  watering: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  feeding: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  diagnosis: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

const KIND_ICON: Record<DiaryCalendarEventKind, typeof Droplets> = {
  watering: Droplets,
  feeding: Utensils,
  diagnosis: Stethoscope,
};

function formatDateHeader(dateKey: string): string {
  // YYYY-MM-DD; render in UTC to match grouping bucket.
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
}

export default function DiaryCalendarSection({
  rawEntries,
  dayLimit = 12,
}: DiaryCalendarSectionProps) {
  const allGroups = useMemo(
    () => buildDiaryCalendarViewModel(rawEntries ?? []),
    [rawEntries],
  );
  const [filter, setFilterState] = useState<DiaryCalendarFilter>("all");
  const groups = useMemo(
    () => filterDiaryCalendarGroups(allGroups, filter),
    [allGroups, filter],
  );
  const visibleGroups = useMemo(
    () => groups.slice(0, Math.max(1, dayLimit)),
    [groups, dayLimit],
  );
  const summary = useMemo(() => summarizeDiaryCalendar(groups), [groups]);
  const filterCounts = useMemo(() => computeDiaryCalendarFilterCounts(allGroups), [allGroups]);
  const [openDay, setOpenDay] = useState<string | null>(
    visibleGroups[0]?.dateKey ?? null,
  );

  // Switching filter: jump to the newest day under the new filter so events
  // remain visible immediately. Explicit user collapse (openDay=null) is
  // preserved within a filter.
  const setFilter = (next: DiaryCalendarFilter) => {
    if (next === filter) return;
    setFilterState(next);
    const nextGroups = filterDiaryCalendarGroups(allGroups, next);
    setOpenDay(nextGroups[0]?.dateKey ?? null);
  };

  // Belt-and-braces: never render stale details if the open day was removed
  // (e.g. raw entries changed asynchronously).
  const openDayStillVisible =
    openDay !== null && visibleGroups.some((g) => g.dateKey === openDay);
  const effectiveOpenDay =
    openDay === null || openDayStillVisible ? openDay : null;

  const hasAnyEntries = allGroups.length > 0;

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
          Watering · Feeding · Diagnosis · read-only
        </span>
      </header>

      {hasAnyEntries && (
        <div
          role="group"
          aria-label="Filter calendar by event type"
          className="mb-3 flex flex-wrap gap-1.5"
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
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary/50 text-foreground border-border/50 hover:bg-secondary",
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-[1rem] px-1 rounded-full text-[10px] font-semibold",
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
        <div
          className="py-8 text-center text-sm text-muted-foreground"
          data-testid="diary-calendar-empty"
        >
          <p>{diaryCalendarEmptyTitleFor(filter)}</p>
          <p className="text-xs mt-1">{DIARY_CALENDAR_EMPTY_HINT}</p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5 text-[11px]">
            <SummaryChip kind="watering" count={summary.counts.watering} />
            <SummaryChip kind="feeding" count={summary.counts.feeding} />
            <SummaryChip kind="diagnosis" count={summary.counts.diagnosis} />
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
                      {(["watering", "feeding", "diagnosis"] as DiaryCalendarEventKind[]).map(
                        (k) =>
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
