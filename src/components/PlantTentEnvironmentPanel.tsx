import { Link } from "react-router-dom";
import { ArrowRight, Box, Gauge, NotebookPen } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePlantTentLatestReadings } from "@/hooks/usePlantTentLatestReadings";
import { buildPlantTentEnvironmentView } from "@/lib/plantTentEnvironmentRules";
import { buildRecentSensorSnapshotHistory } from "@/lib/recentSensorSnapshotHistoryRules";
import { SOURCE_LABEL, formatValue } from "@/lib/sensorSnapshot";
import { tempFFromC } from "@/lib/temperatureUnits";
import {
  buildPlantQuickLogPrefill,
  PLANT_QUICKLOG_PREFILL_EVENT,
} from "@/lib/plantQuickLogPrefillRules";

interface Props {
  tentId: string | null | undefined;
  tentName?: string | null;
  plantId?: string | null;
  plantName?: string | null;
  growId?: string | null;
}

export default function PlantTentEnvironmentPanel({ tentId, tentName, plantId, plantName, growId }: Props) {
  const enabled = !!tentId;
  const { data, isLoading } = usePlantTentLatestReadings(tentId ?? null);
  const rows = enabled ? data ?? [] : [];
  const view = buildPlantTentEnvironmentView(rows);
  const recent = buildRecentSensorSnapshotHistory(rows, { limit: 5 });
  const prefill = buildPlantQuickLogPrefill({ plantId, plantName, growId, tentId, tentName });

  function openQuickLog() {
    if (!prefill) return;
    window.dispatchEvent(
      new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, { detail: prefill }),
    );
  }

  return (
    <Card data-testid="plant-tent-environment-panel" className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Gauge className="h-4 w-4" /> Current Environment
        </CardTitle>
        {tentId ? (
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 gap-1" data-testid="plant-tent-environment-view-tent">
            <Link to={`/tents/${tentId}`}>
              <Box className="h-3.5 w-3.5" /> View Tent <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="text-sm">
        {!enabled ? (
          <p
            className="text-muted-foreground"
            data-testid="plant-tent-environment-empty-no-tent"
          >
            Assign this plant to a tent to see its latest environment context.
          </p>
        ) : isLoading ? (
          <p className="text-muted-foreground">Loading latest readings…</p>
        ) : !view.hasReadings ? (
          <p
            className="text-muted-foreground"
            data-testid="plant-tent-environment-empty-no-readings"
          >
            No sensor readings found for this tent yet.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {tentName ? <span>{tentName}</span> : null}
              {view.capturedAt ? (
                <span data-testid="plant-tent-environment-captured">
                  Captured {formatDistanceToNow(new Date(view.capturedAt), { addSuffix: true })}
                </span>
              ) : null}
              {view.sourceLabel ? (
                <span
                  className="rounded-md border px-1.5 py-0.5"
                  data-testid="plant-tent-environment-source"
                >
                  {view.sourceLabel}
                </span>
              ) : null}
              {view.stale ? (
                <span
                  className="rounded-md border border-[hsl(var(--warning))] px-1.5 py-0.5 text-[hsl(var(--warning))]"
                  data-testid="plant-tent-environment-stale"
                >
                  Stale
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {view.metrics.map((m) => (
                <div key={m.key} data-testid={`plant-tent-environment-metric-${m.key}`}>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">
                    {m.label}
                  </div>
                  <div className={m.hasValue ? "" : "text-muted-foreground"}>{m.display}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {enabled && !isLoading ? (
          <div
            className="mt-5 border-t pt-3"
            data-testid="plant-tent-environment-recent-history"
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Recent Sensor Readings
            </div>
            {recent.length === 0 ? (
              <p
                className="text-xs text-muted-foreground"
                data-testid="plant-tent-environment-recent-empty"
              >
                No recent sensor readings yet. Add a manual snapshot to start
                tracking tent conditions.
              </p>
            ) : (
              <ul className="space-y-2">
                {recent.map((r) => {
                  const tempF = tempFFromC(r.temp);
                  return (
                    <li
                      key={r.ts}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
                      data-testid="plant-tent-environment-recent-row"
                    >
                      <span
                        className="rounded-md border px-1.5 py-0.5"
                        data-testid="plant-tent-environment-recent-source"
                      >
                        {SOURCE_LABEL[r.source]}
                      </span>
                      <span
                        className="text-muted-foreground"
                        data-testid="plant-tent-environment-recent-captured"
                      >
                        {formatDistanceToNow(new Date(r.ts), { addSuffix: true })}
                      </span>
                      {r.stale ? (
                        <span
                          className="rounded-md border border-[hsl(var(--warning))] px-1.5 py-0.5 text-[hsl(var(--warning))]"
                          data-testid="plant-tent-environment-recent-stale"
                        >
                          Stale
                        </span>
                      ) : null}
                      {tempF !== null ? (
                        <span>{formatValue(tempF, "°F", 1)}</span>
                      ) : null}
                      {r.rh !== null ? (
                        <span>{formatValue(r.rh, "%", 0)}</span>
                      ) : null}
                      {r.vpd !== null ? (
                        <span>{formatValue(r.vpd, " kPa", 2)}</span>
                      ) : null}
                      {r.co2 !== null ? (
                        <span>{formatValue(r.co2, " ppm", 0)}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
        {enabled && prefill ? (
          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={openQuickLog}
              data-testid="plant-tent-environment-log-with-context"
            >
              <NotebookPen className="h-3.5 w-3.5" /> Log observation with this context
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
