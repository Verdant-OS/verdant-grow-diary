/**
 * Read-only Daily Grow Check consistency indicator (plant scope).
 *
 * Derived from existing plant QuickLog diary entries and manual sensor
 * readings for the plant's current tent — no writes, no persistence,
 * no health claims based on check frequency.
 */
import { Link } from "react-router-dom";
import { Activity, ArrowRight, CheckCircle2, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSensorReadings } from "@/hooks/use-sensor-readings";
import { useDiaryEntries } from "@/hooks/use-diary-entries";
import { usePlants } from "@/hooks/use-plants";
import {
  buildDailyGrowCheckConsistency,
  CONSISTENCY_WINDOW_DAYS,
} from "@/lib/dailyGrowCheckConsistencyRules";
import { deriveDailyGrowCheckGuidance } from "@/lib/dailyGrowCheckGuidanceRules";

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

  const guidance = deriveDailyGrowCheckGuidance(summary);
  const ctaHref = `/daily-check?plantId=${plantId}`;

  return (
    <Card
      data-testid="plant-daily-grow-check-consistency"
      data-plant-id={plantId}
      data-checked-days={summary.checkedDays}
      data-current-streak={summary.currentStreak}
      data-today-active={summary.todayHasActivity ? "1" : "0"}
      data-guidance-state={guidance.state}
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
          <Link to={ctaHref}>
            {guidance.ctaLabel} <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Guidance block — empty state, today-unchecked, inconsistent, or
          today-checked confirmation. */}
      <div
        className="space-y-1"
        data-testid="plant-daily-grow-check-guidance"
        data-guidance-state={guidance.state}
      >
        <div
          className="text-base font-semibold flex items-center gap-2"
          data-testid="plant-daily-grow-check-guidance-headline"
        >
          {guidance.isPositive && (
            <CheckCircle2
              className="h-4 w-4 text-emerald-400"
              aria-hidden="true"
            />
          )}
          <span>{guidance.headline}</span>
        </div>
        <p
          className="text-sm text-muted-foreground"
          data-testid="plant-daily-grow-check-guidance-body"
        >
          {guidance.body}
        </p>
        <p
          className="text-sm"
          data-testid="plant-daily-grow-check-guidance-next-step"
        >
          {guidance.nextStep}
        </p>
      </div>

      {summary.hasAnyActivity && (
        <div className="space-y-1">
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
        </div>
      )}

      {!summary.hasAnyActivity && (
        <div
          className="text-sm text-muted-foreground sr-only"
          data-testid="plant-daily-grow-check-consistency-empty"
        >
          Checked {summary.checkedDays} of last {summary.windowDays} days.
        </div>
      )}

      <p
        className="text-xs text-muted-foreground flex items-start gap-1"
        data-testid="plant-daily-grow-check-what-counts"
      >
        <Info className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
        <span>{guidance.whatCountsHint}</span>
      </p>

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
