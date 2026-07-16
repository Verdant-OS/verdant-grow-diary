/**
 * get_latest_sensor_snapshot — most recent sensor readings for a tent.
 *
 * Read-only. RLS-scoped through the caller's OAuth token. sensor_readings
 * is long-format (one row per tent/metric/timestamp), so a snapshot is the
 * latest row per metric, queried per metric: a single global ORDER BY +
 * LIMIT would let one bursty metric push another metric's latest row out
 * of the scan window and silently drop it from the snapshot.
 *
 * Rows are ordered by capture time (captured_at) first — `ts` is ingest
 * time, which bridge/CSV backfills and retries can reorder — with the
 * ts DESC, created_at DESC tie-breakers the app's sensor loader uses
 * (src/hooks/useLatestSensorSnapshot.ts), then id DESC so equal
 * timestamps can never flip the snapshot between calls.
 *
 * Preserves `source` and `quality` labels verbatim. Trust follows the
 * canonical SENSOR TRUTH contract: only quality `ok` + source `live`
 * (fresh validated connected telemetry) counts as current live data;
 * manual stays manual, csv stays csv, demo stays demo, and
 * sim/stale/invalid/unknown labels are never live.
 * Never returns `raw_payload`.
 *
 * Verifies tent ownership first: tents policies are strictly owner-scoped,
 * so an unknown or foreign tent id returns a clean "not found" instead of
 * an empty snapshot.
 */
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "./_supabase";

/**
 * Long-format metrics accepted by the live schema. Mirrors the
 * validate_sensor_reading() allow-list (supabase/migrations/
 * 20260617164759_*.sql) — a metric missing here would silently vanish
 * from snapshots, so keep this in sync when the trigger gains metrics.
 */
const KNOWN_METRICS = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
  "soil_temp_c",
  "ph",
  "ec",
  "ppfd",
] as const;

interface SensorRow {
  id: string;
  tent_id: string;
  metric: string;
  value: number;
  quality: string;
  source: string;
  ts: string;
  captured_at: string | null;
}

export default defineTool({
  name: "get_latest_sensor_snapshot",
  title: "Get latest sensor snapshot",
  description:
    "Fetch the most recent sensor reading per metric (temperature_c, " +
    "humidity_pct, vpd_kpa, co2_ppm, soil_moisture_pct, soil_temp_c, ph, " +
    "ec, ppfd) for one of the signed-in grower's own tents, ordered by " +
    "capture time (captured_at, falling back to ingest time). Every " +
    "reading keeps its `source` and `quality` labels verbatim. `quality` " +
    "is one of ok/degraded/stale/invalid. Canonical `source` labels are " +
    "exactly live/manual/csv/demo/stale/invalid, where `live` means " +
    "fresh validated connected telemetry; legacy rows may carry other " +
    "ingest labels such as sim or vendor bridge names. Treat a reading " +
    "as current live telemetry ONLY when its quality is `ok` AND its " +
    "source is `live`. Every other source or quality keeps its label " +
    "and is never live: manual stays manual, csv stays csv, demo stays " +
    "demo, and sim, stale, invalid, or unknown labels are never current " +
    "or healthy. Read-only.",
  inputSchema: {
    tentId: z.string().uuid().describe("Tent id to fetch the latest readings for."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ tentId }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const { data: tent, error: tentError } = await supabase
      .from("tents")
      .select("id,name")
      .eq("id", tentId)
      .maybeSingle();
    if (tentError) {
      return {
        content: [{ type: "text", text: `Error: ${tentError.message}` }],
        isError: true,
      };
    }
    if (!tent) {
      return {
        content: [{ type: "text", text: "Tent not found for the signed-in grower." }],
        isError: true,
      };
    }
    // Latest row per metric. captured_at DESC NULLS LAST first (capture
    // time beats ingest time), then the loader's ts/created_at convention,
    // then id as a total-order tie-breaker.
    const results = await Promise.all(
      KNOWN_METRICS.map((metric) =>
        supabase
          .from("sensor_readings")
          .select("id,tent_id,metric,value,quality,source,ts,captured_at")
          .eq("tent_id", tentId)
          .eq("metric", metric)
          .order("captured_at", { ascending: false, nullsFirst: false })
          .order("ts", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      return {
        content: [{ type: "text", text: `Error: ${failed.error.message}` }],
        isError: true,
      };
    }
    const readings: Record<string, SensorRow> = {};
    for (const result of results) {
      const row = result.data as SensorRow | null;
      if (row) readings[row.metric] = row;
    }
    if (Object.keys(readings).length === 0) {
      return {
        content: [{ type: "text", text: "No sensor readings found for that tent." }],
        structuredContent: { snapshot: null },
      };
    }
    const summary = Object.values(readings)
      .map(
        (r) =>
          `${r.metric}=${r.value} (source: ${r.source}, quality: ${r.quality}, at: ${r.captured_at ?? r.ts})`,
      )
      .join("\n");
    return {
      content: [
        {
          type: "text",
          text: `Latest readings for tent "${tent.name}":\n${summary}`,
        },
      ],
      structuredContent: { snapshot: { tentId, readings } },
    };
  },
});
