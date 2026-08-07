/**
 * DrybackMonitoringStrip — read-only substrate dryback windows.
 *
 * Loads tent soil_moisture series + irrigation ledger waterings, projects
 * through pure drybackMonitoringRules. Never recommends irrigation.
 */
import { useMemo } from "react";
import { Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSensorReadings } from "@/hooks/use-sensor-readings";
import { useTentIrrigationLedger } from "@/hooks/useTentIrrigationLedger";
import {
  DRYBACK_MONITORING_CAVEAT,
  DRYBACK_MONITORING_TITLE,
  buildDrybackMonitoringFromSensorRows,
  type DrybackWindowView,
} from "@/lib/drybackMonitoringRules";
import { cn } from "@/lib/utils";

export interface DrybackMonitoringStripProps {
  tentId: string | null | undefined;
  /** Optional plant filter for watering markers only (soil series stays tent-scoped). */
  plantId?: string | null;
  growId?: string | null;
  scopeLabel?: string | null;
  className?: string;
}

function qualityBadgeVariant(
  quality: DrybackWindowView["quality"],
): "default" | "secondary" | "outline" | "destructive" {
  if (quality === "usable") return "default";
  if (quality === "weak") return "secondary";
  return "outline";
}

function WindowBlock({
  title,
  window,
  testId,
}: {
  title: string;
  window: DrybackWindowView;
  testId: string;
}) {
  return (
    <div
      className="rounded-md border border-border/60 bg-secondary/10 p-3 space-y-1.5"
      data-testid={testId}
      data-window-id={window.id}
      data-quality={window.quality}
      data-kind={window.kind}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</p>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={qualityBadgeVariant(window.quality)} data-testid={`${testId}-quality`}>
            {window.quality}
          </Badge>
          {window.confidence ? (
            <Badge variant="outline" data-testid={`${testId}-confidence`}>
              {window.confidence}
            </Badge>
          ) : null}
        </div>
      </div>
      <p className="text-sm font-medium" data-testid={`${testId}-summary`}>
        {window.summaryLine}
      </p>
      <p className="text-xs text-muted-foreground" data-testid={`${testId}-source`}>
        {window.sourceLabel}
        {window.sampleCount > 0 ? ` · ${window.sampleCount} samples` : ""}
      </p>
      {window.warnings.length > 0 ? (
        <ul className="text-xs text-muted-foreground list-disc pl-4" data-testid={`${testId}-warnings`}>
          {window.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function DrybackMonitoringStrip({
  tentId,
  plantId = null,
  growId = null,
  scopeLabel = null,
  className,
}: DrybackMonitoringStripProps) {
  const tent = typeof tentId === "string" && tentId.trim() ? tentId.trim() : null;
  const plant = typeof plantId === "string" && plantId.trim() ? plantId.trim() : null;

  const readingsQuery = useSensorReadings(tent, 300);
  const ledger = useTentIrrigationLedger({
    tentId: tent,
    growId,
    plantId: plant,
    pageSize: 30,
  });

  const model = useMemo(() => {
    const waterings = ledger.rows
      .filter((r) => r.kind === "watering")
      .map((r) => ({
        id: r.id,
        occurredAt: r.occurredAt,
        volumeMl: r.volumeMl,
      }));
    return buildDrybackMonitoringFromSensorRows(readingsQuery.data ?? [], waterings, {
      now: Date.now(),
    });
  }, [readingsQuery.data, ledger.rows]);

  const ariaLabel = scopeLabel
    ? `${DRYBACK_MONITORING_TITLE} for ${scopeLabel}`
    : DRYBACK_MONITORING_TITLE;

  if (!tent) {
    return (
      <Card
        className={cn("min-w-0", className)}
        data-testid="dryback-monitoring-strip"
        data-status="no_tent"
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <Gauge className="h-4 w-4 text-primary" aria-hidden />
            {DRYBACK_MONITORING_TITLE}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p data-testid="dryback-monitoring-unavailable">
            Assign a tent with soil moisture readings to monitor dryback.
          </p>
          <p className="text-xs" data-testid="dryback-monitoring-caveat">
            {DRYBACK_MONITORING_CAVEAT}
          </p>
        </CardContent>
      </Card>
    );
  }

  const loading = readingsQuery.isLoading || ledger.isLoading;
  if (loading) {
    return (
      <Card
        className={cn("min-w-0", className)}
        data-testid="dryback-monitoring-strip"
        data-status="loading"
        aria-busy="true"
        aria-label={ariaLabel}
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <Gauge className="h-4 w-4 text-primary" aria-hidden />
            {DRYBACK_MONITORING_TITLE}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground" data-testid="dryback-monitoring-loading">
            Loading dryback evidence…
          </p>
        </CardContent>
      </Card>
    );
  }

  if (readingsQuery.isError && ledger.isError) {
    return (
      <Card
        className={cn("min-w-0", className)}
        data-testid="dryback-monitoring-strip"
        data-status="error"
        aria-label={ariaLabel}
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <Gauge className="h-4 w-4 text-primary" aria-hidden />
            {DRYBACK_MONITORING_TITLE}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground" data-testid="dryback-monitoring-error">
            Couldn't load soil moisture or watering markers right now.
          </p>
          <button
            type="button"
            className="text-sm font-medium text-primary underline-offset-2 hover:underline min-h-11"
            data-testid="dryback-monitoring-retry"
            onClick={() => {
              void readingsQuery.refetch();
              ledger.refetch();
            }}
          >
            Retry
          </button>
          <p className="text-xs text-muted-foreground" data-testid="dryback-monitoring-caveat">
            {DRYBACK_MONITORING_CAVEAT}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn("min-w-0", className)}
      data-testid="dryback-monitoring-strip"
      data-status={model.status}
      data-usable-windows={model.usableWindowCount}
      data-sample-count={model.sampleCount}
      aria-label={ariaLabel}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Gauge className="h-4 w-4 text-primary" aria-hidden />
          {model.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {model.status === "empty" || model.status === "insufficient" ? (
          <p className="text-sm text-muted-foreground" data-testid="dryback-monitoring-empty">
            {model.emptyCopy}
          </p>
        ) : null}

        {model.latestClosed ? (
          <WindowBlock
            title="Latest closed window"
            window={model.latestClosed}
            testId="dryback-monitoring-latest-closed"
          />
        ) : null}

        {model.openWindow ? (
          <WindowBlock
            title="Open window (since last watering)"
            window={model.openWindow}
            testId="dryback-monitoring-open"
          />
        ) : null}

        {model.recentWindows.length > 1 ? (
          <div className="space-y-1.5" data-testid="dryback-monitoring-recent">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Recent windows
            </p>
            <ul className="space-y-1">
              {model.recentWindows.map((w) => (
                <li
                  key={w.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 text-sm border-b border-border/40 py-1.5 last:border-0"
                  data-testid="dryback-monitoring-recent-row"
                  data-window-id={w.id}
                >
                  <span className="text-muted-foreground">
                    {w.kind === "open" ? "Open" : "Closed"} · {w.quality}
                  </span>
                  <span className="font-medium tabular-nums text-right">{w.summaryLine}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground" data-testid="dryback-monitoring-meta">
          {model.sampleCount} soil moisture sample
          {model.sampleCount === 1 ? "" : "s"} · {model.wateringMarkerCount} watering marker
          {model.wateringMarkerCount === 1 ? "" : "s"} · {model.usableWindowCount} usable window
          {model.usableWindowCount === 1 ? "" : "s"}
        </p>

        {(readingsQuery.isError || ledger.isError || ledger.isOlderError) && (
          <p className="text-xs text-muted-foreground" data-testid="dryback-monitoring-partial">
            Some history could not be loaded — this strip may be incomplete.
          </p>
        )}

        <p className="text-xs text-muted-foreground" data-testid="dryback-monitoring-caveat">
          {model.caveat}
        </p>
      </CardContent>
    </Card>
  );
}

export default DrybackMonitoringStrip;
