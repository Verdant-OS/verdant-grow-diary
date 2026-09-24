/**
 * PlantSensorSourceBreakdownCard — read-only per-plant breakdown of
 * sensor-derived diary entries by canonical source (live | manual | csv
 * | demo | stale | invalid).
 *
 * Data source: the same `diary_entries` rows Quick Log writes to. Each
 * row's `details.sensor_snapshot` (or legacy `details.sensor`) is
 * classified through the centralized `sensorSourceSummaryRules` so we
 * never re-derive source classification in two different places.
 *
 * Click-through: navigates to Timeline filtered to both the selected
 * source and this plant. Timeline applies the opaque plant id only to
 * rows already scoped to the authenticated grower and active grow.
 *
 * Safety contract:
 *   - No writes. No alerts. No queued actions. No AI calls. Read-only.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { summarizeSensorSources } from "@/lib/sensorSourceSummaryRules";
import SensorSourceSummaryWidget from "@/components/SensorSourceSummaryWidget";
import SensorSourceInlineLegend from "@/components/SensorSourceInlineLegend";
import { Button } from "@/components/ui/button";
import { contextEvidenceReadStatus } from "@/lib/aiDoctorContextReadStateRules";
import { buildPlantSensorSourceReadings } from "@/lib/plantSensorSourceHistoryRules";
import { selectWithRetractionCompat } from "@/lib/quick-log/retractionFilterCompat";

interface Props {
  plantId: string | null | undefined;
  /** Optional date window — half-open `[from, to)`, ISO strings. */
  range?: { from?: string | null; to?: string | null } | null;
  className?: string;
  /**
   * Optional pre-loaded rows. When supplied the hook is skipped — used
   * by tests and by callers that already loaded diary rows.
   */
  rows?: ReadonlyArray<{
    details: unknown;
    entry_at: string;
  }> | null;
}

interface DiaryRow {
  entry_at: string;
  details: unknown;
}

export const PLANT_SENSOR_SOURCE_HISTORY_LIMIT = 200;

async function fetchPlantDiaryRows(plantId: string): Promise<DiaryRow[]> {
  const { data, error } = await selectWithRetractionCompat((withRetractionFilter) => {
    let query = supabase.from("diary_entries").select("entry_at, details").eq("plant_id", plantId);
    if (withRetractionFilter) query = query.is("retracted_at", null);
    return query.order("entry_at", { ascending: false }).limit(PLANT_SENSOR_SOURCE_HISTORY_LIMIT);
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("Sensor source history unavailable");
  return data as DiaryRow[];
}

export default function PlantSensorSourceBreakdownCard({
  plantId,
  range,
  className,
  rows: providedRows,
}: Props) {
  const enabled = !!plantId && providedRows == null;
  const query = useQuery({
    queryKey: ["diary_entries", "plant_sensor_source_history", plantId ?? null],
    enabled,
    queryFn: () => fetchPlantDiaryRows(plantId as string),
  });
  const readStatus =
    providedRows != null ? "success" : contextEvidenceReadStatus(query.status, query.fetchStatus);

  const readings = useMemo(
    () => buildPlantSensorSourceReadings(providedRows ?? query.data ?? []),
    [providedRows, query.data],
  );

  // When the plant has no sensor-derived diary entries at all in the
  // selected range we render an honest empty state — never invent a
  // healthy "live" classification.
  const summary = summarizeSensorSources(readings, {
    range: range ?? null,
    // Unknown explicit source strings stay flagged as "invalid" rather
    // than being silently relabeled as healthy live/manual data.
    fallback: "invalid",
  });

  if (!plantId) return null;

  if (readStatus !== "success") {
    return (
      <section className={className} aria-label="Plant sensor source breakdown">
        <div
          role={readStatus === "error" ? "alert" : "status"}
          className="rounded-2xl border border-border/50 p-4 space-y-2"
        >
          <p>
            {readStatus === "error"
              ? "Sensor source history unavailable"
              : readStatus === "paused"
                ? "Waiting for connection to load sensor source history"
                : readStatus === "refreshing"
                  ? "Refreshing sensor source history…"
                  : "Loading sensor source history…"}
          </p>
          {query.data != null && (
            <p className="text-xs text-muted-foreground">
              Previously loaded counts are withheld until this history read is confirmed.
            </p>
          )}
          {(readStatus === "error" || readStatus === "paused") && (
            <Button
              variant="outline"
              size="sm"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              Retry
            </Button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      className={className}
      data-testid="plant-sensor-source-breakdown"
      aria-label="Plant sensor source breakdown"
    >
      <p className="text-xs text-muted-foreground mb-2">
        Based on up to {PLANT_SENSOR_SOURCE_HISTORY_LIMIT} latest diary entries for this plant.
        Source history does not confirm current sensor health.
      </p>
      {summary.isEmpty ? (
        <div className="rounded-2xl border border-border/50 bg-secondary/20 p-4">
          <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground">Sensor sources for this plant</h3>
          </div>
          <p
            className="text-xs text-muted-foreground"
            data-testid="plant-sensor-source-breakdown-empty"
          >
            No sensor readings found for this plant in the selected range.
          </p>
          <div className="mt-2">
            <SensorSourceInlineLegend testId="plant-sensor-source-breakdown-legend" />
          </div>
        </div>
      ) : (
        <SensorSourceSummaryWidget
          readings={readings}
          options={{ range: range ?? null, fallback: "invalid" }}
          title="Sensor sources for this plant"
          dateRange={
            range
              ? {
                  from: range.from?.slice(0, 10) ?? null,
                  to: range.to?.slice(0, 10) ?? null,
                }
              : null
          }
          plantId={plantId}
        />
      )}
    </section>
  );
}
