/**
 * Read-only Daily Grow Check consistency indicator (plant scope).
 *
 * Derived from existing plant QuickLog diary entries and manual sensor
 * readings for the plant's current tent — no writes, no persistence,
 * no health claims based on check frequency.
 */
import { Link } from "react-router-dom";
import { Activity, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSensorReadings } from "@/hooks/use-sensor-readings";
import { useDiaryEntries } from "@/hooks/use-diary-entries";
import { usePlants } from "@/hooks/use-plants";
import {
  buildDailyGrowCheckConsistency,
  CONSISTENCY_WINDOW_DAYS,
} from "@/lib/dailyGrowCheckConsistencyRules";

interface Props {
  plantId: string;
  currentTentId: string | null;
}

export default function PlantDailyGrowCheckConsistencyCard({
  plantId,
  currentTentId,
}: Props) {
  const { data: rawReadings = [] } = useSensorReadings(currentTentId ?? undefined);
  const { data: rawDiary = [] } = useDiaryEntries();
  const { data: plants = [] } = usePlants();

  const plantsInTentCount = currentTentId
    ? plants.filter((p) => p.tent_id === currentTentId).length
    : 0;

  const summary = buildDailyGrowCheckConsistency({
    now: new Date(),
    windowDays: CONSISTENCY_WINDOW_DAYS,
    plantId,
    currentTentId,
    plantsInTentCount,
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

  const todayLabel = summary.todayHasActivity
    ? "Check activity detected"
    : "No check activity today";

  return (
    <Card
      data-testid="plant-daily-grow-check-consistency"
      data-plant-id={plantId}
      data-checked-days={summary.checkedDays}
      data-current-streak={summary.currentStreak}
      data-today-active={summary.todayHasActivity ? "1" : "0"}
      className="p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4" />
            <span>Check Consistency</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Current rhythm</p>
        </div>
        <Button
          asChild
          size="sm"
          className="gradient-leaf text-primary-foreground shrink-0"
          data-testid="plant-daily-grow-check-consistency-cta"
        >
          <Link to={`/daily-check?plantId=${plantId}`}>
            Start Daily Grow Check <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {summary.hasAnyActivity ? (
        <div className="space-y-1">
          <div
            className="text-base font-semibold"
            data-testid="plant-daily-grow-check-consistency-main"
          >
            Checked {summary.checkedDays} of last {summary.windowDays} days
          </div>
          <div
            className="text-sm text-muted-foreground"
            data-testid="plant-daily-grow-check-consistency-streak"
          >
            Current streak: {summary.currentStreak} day
            {summary.currentStreak === 1 ? "" : "s"}
          </div>
          {summary.missedDays > 0 && (
            <div
              className="text-xs text-muted-foreground"
              data-testid="plant-daily-grow-check-consistency-missed"
            >
              Missed days: {summary.missedDays}
            </div>
          )}
          <div
            className="text-sm"
            data-testid="plant-daily-grow-check-consistency-today"
          >
            Today: {todayLabel}
          </div>
        </div>
      ) : (
        <div
          className="text-sm text-muted-foreground"
          data-testid="plant-daily-grow-check-consistency-empty"
        >
          No check activity in the last {summary.windowDays} days.
        </div>
      )}

      {!currentTentId && (
        <p
          className="text-xs text-amber-300"
          data-testid="plant-daily-grow-check-consistency-unassigned"
        >
          Assign this plant to a tent to include manual tent snapshots.
        </p>
      )}
    </Card>
  );
}
