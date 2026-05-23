import { Link } from "react-router-dom";
import { ArrowRight, Box, Gauge, NotebookPen } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePlantTentLatestReadings } from "@/hooks/usePlantTentLatestReadings";
import { buildPlantTentEnvironmentView } from "@/lib/plantTentEnvironmentRules";
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
  const view = buildPlantTentEnvironmentView(enabled ? data ?? [] : []);
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
          <Gauge className="h-4 w-4" /> Assigned Tent Environment
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
      </CardContent>
    </Card>
  );
}
