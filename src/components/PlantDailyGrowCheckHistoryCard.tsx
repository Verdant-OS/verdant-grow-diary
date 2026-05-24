/**
 * Read-only Daily Grow Check history for a single plant.
 *
 * Derived from existing manual sensor readings (for the plant's current
 * tent) and QuickLog diary entries scoped to the plant. No writes.
 */
import { Link } from "react-router-dom";
import { ClipboardCheck, ArrowRight } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSensorReadings } from "@/hooks/use-sensor-readings";
import { useDiaryEntries } from "@/hooks/use-diary-entries";
import { usePlants } from "@/hooks/use-plants";
import {
  buildDailyGrowCheckHistory,
  HISTORY_LABELS,
  type DailyHistoryRow,
} from "@/lib/dailyGrowCheckHistoryRules";

const HISTORY_DAYS = 5;

interface Props {
  plantId: string;
  currentTentId: string | null;
}

function rowTone(kind: DailyHistoryRow["kind"]): string {
  switch (kind) {
    case "both":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "none":
      return "bg-zinc-500/15 text-zinc-300 border-zinc-500/30";
    default:
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
  }
}

export default function PlantDailyGrowCheckHistoryCard({
  plantId,
  currentTentId,
}: Props) {
  const { data: rawReadings = [] } = useSensorReadings(currentTentId ?? undefined);
  const { data: rawDiary = [] } = useDiaryEntries();
  const { data: plants = [] } = usePlants();

  const plantsInTentCount = currentTentId
    ? plants.filter((p) => p.tent_id === currentTentId).length
    : 0;

  const rows = buildDailyGrowCheckHistory({
    now: new Date(),
    days: HISTORY_DAYS,
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

  const unassigned = !currentTentId;

  return (
    <Card
      data-testid="plant-daily-grow-check-history"
      data-plant-id={plantId}
      className="p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClipboardCheck className="h-4 w-4" />
            <span>Daily Grow Check History</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Last {HISTORY_DAYS} days · derived from your existing activity.
          </p>
        </div>
        <Button
          asChild
          size="sm"
          className="gradient-leaf text-primary-foreground shrink-0"
          data-testid="plant-daily-grow-check-history-cta"
        >
          <Link to={`/daily-check?plantId=${plantId}`}>
            Start Daily Grow Check <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {unassigned && (
        <p
          data-testid="plant-daily-grow-check-history-unassigned-note"
          className="text-xs text-amber-300"
        >
          Assign this plant to a tent to include tent snapshots.
        </p>
      )}

      <ul
        className="divide-y divide-border/40 rounded-md border border-border/40"
        data-testid="plant-daily-grow-check-history-rows"
      >
        {rows.map((row) => (
          <li
            key={row.dayKey}
            data-testid="plant-daily-grow-check-history-row"
            data-day-key={row.dayKey}
            data-kind={row.kind}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <div className="font-medium" data-testid="plant-daily-grow-check-history-day-label">
                {row.label}
              </div>
              {row.latestAt && (
                <div className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(row.latestAt), { addSuffix: true })}
                  {" · "}
                  {format(new Date(row.latestAt), "p")}
                </div>
              )}
            </div>
            <Badge
              variant="outline"
              className={rowTone(row.kind)}
              data-testid="plant-daily-grow-check-history-label"
            >
              {row.activityLabel}
            </Badge>
          </li>
        ))}
      </ul>

      {/* Static sentinel: ensure we never accidentally render "completed". */}
      <span className="sr-only" data-testid="plant-daily-grow-check-history-no-completed">
        {Object.values(HISTORY_LABELS).join(" ")}
      </span>
    </Card>
  );
}
