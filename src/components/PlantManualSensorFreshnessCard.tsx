/**
 * PlantManualSensorFreshnessCard — read-only "data decay" surface.
 *
 * Shows the four manual metrics (Temp/Humidity/pH/EC) with a freshness state
 * derived from the latest manually-logged value for this plant. Stale/aging
 * states gently nudge the grower back to Quick Log via an "Update" action.
 *
 * Presenter only. All logic lives in:
 *   - src/lib/manualSensorFreshnessRules.ts
 *   - src/hooks/usePlantManualSensorHistory.ts
 *
 * Never creates alerts, action_queue rows, or device commands.
 */
import { useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildFreshnessSnapshots,
  computeFreshnessCta,
  METRIC_LABELS,
  METRIC_UNITS,
  type FreshnessSnapshot,
  type FreshnessState,
  type ManualSensorMetric,
} from "@/lib/manualSensorFreshnessRules";
import { usePlantManualSensorHistory } from "@/hooks/usePlantManualSensorHistory";

interface Props {
  plantId: string;
  onUpdate?: () => void;
}

function formatValue(metric: ManualSensorMetric, value: number): string {
  switch (metric) {
    case "temp_f":
    case "humidity_percent":
      return String(Math.round(value));
    case "ph":
      return value.toFixed(1);
    case "ec":
      return value.toFixed(2);
  }
}

const STATE_STYLES: Record<FreshnessState, string> = {
  fresh: "text-primary",
  aging: "text-amber-400/90",
  stale: "text-muted-foreground/60",
  missing: "text-muted-foreground/50",
};

const STATE_LABELS: Record<FreshnessState, string> = {
  fresh: "Fresh",
  aging: "Aging",
  stale: "Stale",
  missing: "Not logged yet",
};

export default function PlantManualSensorFreshnessCard({ plantId, onUpdate }: Props) {
  const { data, isLoading } = usePlantManualSensorHistory(plantId);

  const snapshots = useMemo<FreshnessSnapshot[]>(() => {
    return buildFreshnessSnapshots(data ?? {}, new Date());
  }, [data]);

  const cta = useMemo(() => computeFreshnessCta(snapshots), [snapshots]);
  const ctaLabel = cta === "add_first" ? "Add first snapshot" : "Update";
  const showCta = (cta === "update" || cta === "add_first") && !!onUpdate && !isLoading;

  return (
    <section
      data-testid="plant-manual-sensor-freshness-card"
      data-cta={cta}
      className="rounded-2xl border border-border/60 bg-card/40 p-4 grid gap-3"
    >
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Manual sensor memory</h3>
        {showCta ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onUpdate}
            data-testid="plant-manual-sensor-freshness-update"
            data-cta={cta}
            className="h-7 px-2 text-xs text-primary hover:text-primary"
          >
            {ctaLabel}
          </Button>
        ) : null}
      </header>
      <div className="grid grid-cols-2 gap-2">
        {snapshots.map((s) =>
          isLoading ? (
            <div
              key={s.metric}
              className="h-16 rounded-lg bg-muted/30 animate-pulse"
              data-testid={`plant-manual-sensor-freshness-${s.metric}-loading`}
            />
          ) : (
            <FreshnessTile key={s.metric} snapshot={s} />
          ),
        )}
      </div>
    </section>
  );
}

function FreshnessTile({ snapshot }: { snapshot: FreshnessSnapshot }) {
  const { metric, state, value, loggedAt } = snapshot;
  const label = METRIC_LABELS[metric];
  const unit = METRIC_UNITS[metric];

  return (
    <div
      data-testid={`plant-manual-sensor-freshness-${metric}`}
      data-state={state}
      className={cn(
        "rounded-lg border border-border/50 bg-background/40 p-3 grid gap-0.5",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        {(state === "aging" || state === "stale") && (
          <AlertCircle
            className="h-3.5 w-3.5 text-amber-400/90"
            aria-label={STATE_LABELS[state]}
            data-testid={`plant-manual-sensor-freshness-${metric}-indicator`}
          />
        )}
      </div>
      {state === "missing" || value === null ? (
        <span
          className={cn("text-sm", STATE_STYLES[state])}
          data-testid={`plant-manual-sensor-freshness-${metric}-missing`}
        >
          No recent log
        </span>
      ) : (
        <>
          <span className={cn("text-base font-medium", STATE_STYLES[state])}>
            {formatValue(metric, value)}
            {unit && (
              <span className="text-xs text-muted-foreground ml-0.5">{unit}</span>
            )}
          </span>
          {loggedAt && (
            <span className="text-[10px] text-muted-foreground/70">
              {STATE_LABELS[state]} ·{" "}
              {formatDistanceToNow(new Date(loggedAt), { addSuffix: true })}
            </span>
          )}
        </>
      )}
    </div>
  );
}
