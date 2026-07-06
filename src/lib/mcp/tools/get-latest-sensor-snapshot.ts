/**
 * get_latest_sensor_snapshot — most recent sensor readings for a tent.
 *
 * Read-only. RLS-scoped through the caller's OAuth token. sensor_readings
 * is long-format (one row per tent/metric/timestamp), so a snapshot is the
 * latest row per metric. Preserves `source` and `quality` labels verbatim
 * so agents can never treat degraded/stale/invalid data as current.
 * Never returns `raw_payload`.
 *
 * Verifies tent ownership first: tents policies are strictly owner-scoped,
 * so an unknown or foreign tent id returns a clean "not found" instead of
 * an empty snapshot.
 */
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "./_supabase";

/** Newest rows to scan when reducing to one reading per metric. */
const SCAN_LIMIT = 50;

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
    "humidity_pct, vpd_kpa, co2_ppm, soil_moisture_pct) for one of the " +
    "signed-in grower's own tents. Every reading includes its `source` " +
    "label (manual/pi_bridge/sim) and `quality` label " +
    "(ok/degraded/stale/invalid). Never treat readings with quality " +
    "other than `ok`, or source `sim`, as current live data. Read-only.",
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
    const { data, error } = await supabase
      .from("sensor_readings")
      .select("id,tent_id,metric,value,quality,source,ts,captured_at")
      .eq("tent_id", tentId)
      .order("ts", { ascending: false })
      .limit(SCAN_LIMIT);
    if (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
    const rows = (data ?? []) as SensorRow[];
    if (rows.length === 0) {
      return {
        content: [{ type: "text", text: "No sensor readings found for that tent." }],
        structuredContent: { snapshot: null },
      };
    }
    // Rows arrive newest-first; keep the first row seen per metric.
    const readings: Record<string, SensorRow> = {};
    for (const row of rows) {
      if (!(row.metric in readings)) readings[row.metric] = row;
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
