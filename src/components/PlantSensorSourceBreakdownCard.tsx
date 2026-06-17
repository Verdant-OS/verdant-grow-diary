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
 * Click-through: navigates to the all-grow Timeline filtered to the
 * selected source. Timeline does not yet support plant-scoped filtering
 * via URL params, so per-plant click-through is intentionally omitted
 * here (tracked as a follow-up).
 *
 * Safety contract:
 *   - No writes. No alerts. No queued actions. No AI calls. Read-only.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  summarizeSensorSources,
  type SensorSourceSummaryReading,
} from "@/lib/sensorSourceSummaryRules";
import SensorSourceSummaryWidget from "@/components/SensorSourceSummaryWidget";
import SensorSourceInlineLegend from "@/components/SensorSourceInlineLegend";

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

function extractSnapshot(details: unknown): SensorSourceSummaryReading | null {
  if (!details || typeof details !== "object") return null;
  const d = details as Record<string, unknown>;
  const raw = d.sensor_snapshot ?? d.sensor;
  if (!raw || typeof raw !== "object") return null;
  const snap = raw as { source?: unknown; ts?: unknown };
  const source =
    typeof snap.source === "string" && snap.source.trim() !== ""
      ? snap.source
      : null;
  const ts = typeof snap.ts === "string" && snap.ts ? snap.ts : null;
  return { source, captured_at: ts };
}

export function buildPlantSensorSourceReadings(
  rows: ReadonlyArray<DiaryRow>,
): SensorSourceSummaryReading[] {
  const out: SensorSourceSummaryReading[] = [];
  for (const r of rows) {
    const snap = extractSnapshot(r.details);
    if (!snap) continue;
    // Quick Log snapshots with no explicit source are intrinsically
    // grower-entered → inject "manual" so unknown/unrecognised explicit
    // source strings can still be surfaced as "invalid" downstream.
    out.push({
      source: snap.source ?? "manual",
      captured_at: snap.captured_at ?? r.entry_at ?? null,
      ts: r.entry_at,
    });
  }
  return out;
}


export const PLANT_SENSOR_SOURCE_HISTORY_LIMIT = 200;

async function fetchPlantDiaryRows(plantId: string): Promise<DiaryRow[]> {
  const { data, error } = await supabase
    .from("diary_entries")
    .select("entry_at, details")
    .eq("plant_id", plantId)
    .order("entry_at", { ascending: false })
    .limit(PLANT_SENSOR_SOURCE_HISTORY_LIMIT);
  if (error) throw error;
  return (data ?? []) as DiaryRow[];
}

export default function PlantSensorSourceBreakdownCard({
  plantId,
  range,
  className,
  rows: providedRows,
}: Props) {
  const enabled = !!plantId && providedRows == null;
  const { data: fetched = [] } = useQuery({
    queryKey: ["plant_sensor_source_history", plantId ?? null],
    enabled,
    queryFn: () => fetchPlantDiaryRows(plantId as string),
  });
  const rows = providedRows ?? fetched;

  const readings = useMemo(() => buildPlantSensorSourceReadings(rows), [rows]);

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

  return (
    <section
      className={className}
      data-testid="plant-sensor-source-breakdown"
      aria-label="Plant sensor source breakdown"
    >
      {summary.isEmpty ? (
        <div className="rounded-2xl border border-border/50 bg-secondary/20 p-4">
          <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground">
              Sensor sources for this plant
            </h3>
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
          // Timeline does not yet support plant-scoped URL filtering, so
          // the click-through opens the Timeline filtered to the source
          // without a `plantId` constraint. (Follow-up: thread plantId
          // through Timeline filters once it is safe to do so.)
          plantId={null}
        />
      )}
    </section>
  );
}
