/**
 * WateringCadenceHistoryStrip — read-only last-water + interval history.
 *
 * Loads the existing tent irrigation ledger (optionally plant-filtered) and
 * projects it through pure wateringCadenceHistoryRules. Never recommends
 * watering, never invents dryback, never controls devices.
 */
import { useMemo } from "react";
import { Droplets } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTentIrrigationLedger } from "@/hooks/useTentIrrigationLedger";
import {
  WATERING_CADENCE_HISTORY_CAVEAT,
  WATERING_CADENCE_HISTORY_TITLE,
  buildWateringCadenceHistory,
  cadenceEventsFromIrrigationLedger,
} from "@/lib/wateringCadenceHistoryRules";
import { cn } from "@/lib/utils";

export interface WateringCadenceHistoryStripProps {
  tentId: string | null | undefined;
  /** When set, ledger is filtered to this plant. */
  plantId?: string | null;
  growId?: string | null;
  className?: string;
  /** Accessible scope hint, e.g. plant or tent name. */
  scopeLabel?: string | null;
}

export function WateringCadenceHistoryStrip({
  tentId,
  plantId = null,
  growId = null,
  className,
  scopeLabel = null,
}: WateringCadenceHistoryStripProps) {
  const tent = typeof tentId === "string" && tentId.trim() ? tentId.trim() : null;
  const plant = typeof plantId === "string" && plantId.trim() ? plantId.trim() : null;

  const ledger = useTentIrrigationLedger({
    tentId: tent,
    growId,
    plantId: plant,
    pageSize: 15,
  });

  const model = useMemo(
    () =>
      buildWateringCadenceHistory(cadenceEventsFromIrrigationLedger(ledger.rows), {
        now: Date.now(),
      }),
    [ledger.rows],
  );

  const ariaLabel = scopeLabel
    ? `${WATERING_CADENCE_HISTORY_TITLE} for ${scopeLabel}`
    : WATERING_CADENCE_HISTORY_TITLE;

  if (!tent) {
    return (
      <Card
        className={cn("min-w-0", className)}
        data-testid="watering-cadence-history-strip"
        data-status="no_tent"
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <Droplets className="h-4 w-4 text-primary" aria-hidden />
            {WATERING_CADENCE_HISTORY_TITLE}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p data-testid="watering-cadence-history-unavailable">
            Assign a tent to load watering history for this scope.
          </p>
          <p className="text-xs" data-testid="watering-cadence-history-caveat">
            {WATERING_CADENCE_HISTORY_CAVEAT}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (ledger.isLoading) {
    return (
      <Card
        className={cn("min-w-0", className)}
        data-testid="watering-cadence-history-strip"
        data-status="loading"
        aria-busy="true"
        aria-label={ariaLabel}
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <Droplets className="h-4 w-4 text-primary" aria-hidden />
            {WATERING_CADENCE_HISTORY_TITLE}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground" data-testid="watering-cadence-history-loading">
            Loading watering history…
          </p>
        </CardContent>
      </Card>
    );
  }

  if (ledger.isError) {
    return (
      <Card
        className={cn("min-w-0", className)}
        data-testid="watering-cadence-history-strip"
        data-status="error"
        aria-label={ariaLabel}
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <Droplets className="h-4 w-4 text-primary" aria-hidden />
            {WATERING_CADENCE_HISTORY_TITLE}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground" data-testid="watering-cadence-history-error">
            Couldn't load watering history right now.
          </p>
          <button
            type="button"
            className="text-sm font-medium text-primary underline-offset-2 hover:underline min-h-11"
            data-testid="watering-cadence-history-retry"
            onClick={() => ledger.refetch()}
          >
            Retry
          </button>
          <p className="text-xs text-muted-foreground" data-testid="watering-cadence-history-caveat">
            {WATERING_CADENCE_HISTORY_CAVEAT}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn("min-w-0", className)}
      data-testid="watering-cadence-history-strip"
      data-status={model.status}
      data-watering-count={model.wateringCount}
      aria-label={ariaLabel}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Droplets className="h-4 w-4 text-primary" aria-hidden />
          {model.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {model.status === "empty" ? (
          <p className="text-sm text-muted-foreground" data-testid="watering-cadence-history-empty">
            {model.emptyCopy}
          </p>
        ) : (
          <>
            {model.lastWatering ? (
              <div
                className="rounded-md border border-border/60 bg-secondary/10 p-3 space-y-1"
                data-testid="watering-cadence-history-last"
              >
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Last watering
                </p>
                <p className="text-sm font-medium" data-testid="watering-cadence-history-last-relative">
                  {model.lastWatering.relativeLabel}
                </p>
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="watering-cadence-history-last-absolute"
                >
                  {model.lastWatering.absoluteLabel}
                </p>
                <p className="text-sm" data-testid="watering-cadence-history-last-volume">
                  {model.lastWatering.volumeLabel}
                  <span className="text-muted-foreground"> · {model.lastWatering.sourceLabel}</span>
                </p>
              </div>
            ) : null}

            {model.lastInterval ? (
              <div data-testid="watering-cadence-history-interval">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {model.lastInterval.label}
                </p>
                <p
                  className="text-sm font-medium tabular-nums"
                  data-testid="watering-cadence-history-interval-value"
                >
                  {model.lastInterval.valueLabel}
                </p>
              </div>
            ) : null}

            {model.recentWaterings.length > 1 ? (
              <div className="space-y-1.5" data-testid="watering-cadence-history-recent">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Recent waterings
                </p>
                <ul className="space-y-1">
                  {model.recentWaterings.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 text-sm border-b border-border/40 py-1.5 last:border-0"
                      data-testid="watering-cadence-history-recent-row"
                      data-event-id={row.id}
                    >
                      <span className="text-muted-foreground">{row.relativeLabel}</span>
                      <span className="font-medium tabular-nums">{row.volumeLabel}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {ledger.isOlderError ? (
              <p className="text-xs text-muted-foreground" data-testid="watering-cadence-history-truncated">
                Older entries could not be loaded — this strip may be incomplete.
              </p>
            ) : null}
          </>
        )}

        <p className="text-xs text-muted-foreground" data-testid="watering-cadence-history-caveat">
          {model.caveat}
        </p>
      </CardContent>
    </Card>
  );
}

export default WateringCadenceHistoryStrip;
