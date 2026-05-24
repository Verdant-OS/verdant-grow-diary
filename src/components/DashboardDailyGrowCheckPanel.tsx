/**
 * Dashboard "Today's Grow Checks" panel.
 *
 * Read-only. Reuses the existing Daily Grow Check consistency + guidance
 * rules so Dashboard and Plant Detail never drift apart.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, Sprout, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDiaryEntries } from "@/hooks/use-diary-entries";
import { useSensorReadings } from "@/hooks/use-sensor-readings";
import { useGrowPlants, useGrowTents } from "@/hooks/useGrowData";
import {
  buildDashboardDailyGrowCheckPanel,
  filterDashboardDailyGrowCheckRows,
  DASHBOARD_DAILY_GROW_CHECK_FILTER_OPTIONS,
  DASHBOARD_DAILY_GROW_CHECK_FILTER_EMPTY,
  type DashboardDailyGrowCheckFilter,
  type PanelPlantInput,
  type PanelTentInput,
} from "@/lib/dashboardDailyGrowCheckPanelRules";
import {
  DAILY_CHECK_SUCCESS_EVENTS,
  ENTRY_CREATED_EVENT,
  SENSOR_READING_CREATED_EVENT,
  refreshDailyCheckQueries,
} from "@/lib/dailyCheckRefreshRules";

interface Props {
  scopedGrowId: string | null;
  className?: string;
}

export default function DashboardDailyGrowCheckPanel({
  scopedGrowId,
  className,
}: Props) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<DashboardDailyGrowCheckFilter>("all");
  const { data: rawPlants = [] } = useGrowPlants(undefined, scopedGrowId ?? undefined);
  const { data: rawTents = [] } = useGrowTents(scopedGrowId ?? undefined);
  const { data: rawReadings = [] } = useSensorReadings(undefined, 500);
  const { data: rawDiary = [] } = useDiaryEntries();

  // Belt-and-suspenders refresh: when QuickLog dispatches
  // `verdant:entry-created` OR the manual sensor reading hook dispatches
  // `verdant:sensor-reading-created`, force the diary + sensor reading
  // caches that back checked-today to refetch. Both surfaces already
  // invalidate on their own; this guarantees the panel never shows
  // stale checked status across tree boundaries. Both events are
  // referenced explicitly so the static contract scanner can see them:
  //   - ENTRY_CREATED_EVENT
  //   - SENSOR_READING_CREATED_EVENT
  useEffect(() => {
    function onEntry() {
      refreshDailyCheckQueries(queryClient);
    }
    for (const name of DAILY_CHECK_SUCCESS_EVENTS) {
      window.addEventListener(name, onEntry);
    }
    return () => {
      for (const name of DAILY_CHECK_SUCCESS_EVENTS) {
        window.removeEventListener(name, onEntry);
      }
    };
  }, [queryClient]);

  const plants: PanelPlantInput[] = rawPlants.map((p) => ({
    id: p.id,
    name: p.name,
    tentId: p.tentId,
    growId: (p as { growId?: string | null }).growId ?? null,
    isArchived: p.isArchived,
    lastNote: p.lastNote,
  }));
  const tents: PanelTentInput[] = rawTents.map((t) => ({ id: t.id, name: t.name }));

  const panel = buildDashboardDailyGrowCheckPanel({
    now: new Date(),
    scopedGrowId,
    plants,
    tents,
    manualReadings: rawReadings
      .filter((r) => r.source === "manual")
      .map((r) => ({
        ts: r.ts,
        created_at: r.created_at,
        id: r.id,
        tent_id: r.tent_id,
      })),
    diaryEntries: rawDiary.map((e) => ({
      entry_at: e.entry_at,
      created_at: e.created_at,
      id: e.id,
      plant_id: e.plant_id,
      tent_id: e.tent_id,
    })),
  });

  const visibleRows = filterDashboardDailyGrowCheckRows(panel.rows, filter);
  const filterHasNoMatches =
    !panel.isEmpty && panel.rows.length > 0 && visibleRows.length === 0;

  return (
    <Card
      data-testid="dashboard-daily-grow-check-panel"
      data-checked={panel.checked}
      data-total={panel.total}
      data-all-checked={panel.allChecked ? "1" : "0"}
      data-is-empty={panel.isEmpty ? "1" : "0"}
      className={`p-4 space-y-3 ${className ?? ""}`}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h2
            className="font-display font-semibold text-base"
            data-testid="dashboard-daily-grow-check-panel-title"
          >
            Today's Grow Checks
          </h2>
          <p
            className="text-xs text-muted-foreground mt-0.5"
            data-testid="dashboard-daily-grow-check-panel-summary"
          >
            {panel.summaryText}
          </p>
        </div>
        {!panel.isEmpty && (
          <Select
            value={filter}
            onValueChange={(v) =>
              setFilter(v as DashboardDailyGrowCheckFilter)
            }
          >
            <SelectTrigger
              className="h-8 w-[180px] text-xs"
              aria-label="Filter today's grow checks"
              data-testid="dashboard-daily-grow-check-panel-filter"
              data-filter={filter}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DASHBOARD_DAILY_GROW_CHECK_FILTER_OPTIONS.map((opt) => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  data-testid={`dashboard-daily-grow-check-panel-filter-option-${opt.value}`}
                >
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>


      {panel.isEmpty && (
        <div
          className="rounded-md border border-dashed border-border/50 p-4 text-center space-y-2"
          data-testid="dashboard-daily-grow-check-panel-empty"
        >
          <Sprout className="h-5 w-5 mx-auto text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{panel.emptyMessage}</p>
          <Button asChild size="sm" variant="outline">
            <Link to={panel.emptyCtaHref}>{panel.emptyCtaLabel}</Link>
          </Button>
        </div>
      )}

      {!panel.isEmpty && panel.allChecked && (
        <p
          className="text-sm text-emerald-300 flex items-center gap-2"
          data-testid="dashboard-daily-grow-check-panel-positive"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <span>{panel.positiveConfirmation}</span>
        </p>
      )}

      {filterHasNoMatches && (
        <p
          className="text-sm text-muted-foreground rounded-md border border-dashed border-border/50 p-3 text-center"
          data-testid="dashboard-daily-grow-check-panel-filter-empty"
        >
          {DASHBOARD_DAILY_GROW_CHECK_FILTER_EMPTY}
        </p>
      )}

      {!panel.isEmpty && visibleRows.length > 0 && (
        <ul
          className="divide-y divide-border/40"
          data-testid="dashboard-daily-grow-check-panel-list"
        >
          {visibleRows.map((row) => (
            <li
              key={row.plantId}
              data-testid="dashboard-daily-grow-check-panel-row"
              data-plant-id={row.plantId}
              data-checked-today={row.checkedToday ? "1" : "0"}
              data-today-method={row.todayMethod}
              className="py-2 flex items-center justify-between gap-3"
            >
              <div className="flex items-start gap-2 min-w-0">
                {row.checkedToday ? (
                  <CheckCircle2
                    className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <Circle
                    className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{row.plantName}</div>
                  <div
                    className="text-xs text-muted-foreground truncate"
                    data-testid="dashboard-daily-grow-check-panel-row-method"
                  >
                    {row.tentName ? `${row.tentName} · ` : ""}
                    {row.shortGuidance}
                  </div>
                </div>
              </div>
              {row.showCta && (
                <Button
                  asChild
                  size="sm"
                  className="gradient-leaf text-primary-foreground shrink-0"
                  data-testid="dashboard-daily-grow-check-panel-row-cta"
                >
                  <Link
                    to={row.ctaHref}
                    aria-label={`Start today's check for ${row.plantName}`}
                  >
                    Start check <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
