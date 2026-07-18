/**
 * get_latest_sensor_snapshot — most recent sensor readings for a tent.
 *
 * Read-only. RLS-scoped through the caller's OAuth token. sensor_readings
 * is long-format (one row per tent/metric/timestamp), so a snapshot is the
 * latest row per metric, queried per metric: a single global ORDER BY +
 * LIMIT would let one bursty metric push another metric's latest row out
 * of the scan window and silently drop it from the snapshot.
 *
 * "Latest" means COALESCE(captured_at, ts) DESC — capture time when the
 * ingest path recorded one, ingest time for legacy null-captured rows.
 * PostgREST cannot order by that expression, and captured_at DESC NULLS
 * LAST alone would rank every captured row above every legacy row
 * regardless of recency. So each metric fetches two candidates — the
 * newest captured row (max captured_at) and the newest legacy row (max
 * ts among captured_at IS NULL); the true coalesce-winner is always one
 * of the two. Ties break by ts DESC, created_at DESC (the app loader's
 * convention, src/hooks/useLatestSensorSnapshot.ts), then id DESC so
 * equal timestamps can never flip the snapshot between calls.
 *
 * Preserves `source` and `quality` labels verbatim. Raw provenance is selected
 * only long enough to exclude diagnostic-only Windows testbench rows, then is
 * stripped before tool content is assembled. Trust follows the
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
import { withoutDiagnosticSensorRows } from "../../sensorProvenanceFenceRules";
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

export interface McpSensorQueryRow {
  id: string;
  tent_id: string;
  metric: string;
  value: number;
  quality: string;
  source: string;
  ts: string;
  captured_at: string | null;
  raw_payload?: unknown;
}

export type McpSensorReading = Omit<McpSensorQueryRow, "raw_payload">;

const SENSOR_COLUMNS = "id,tent_id,metric,value,quality,source,ts,captured_at,raw_payload";
const SENSOR_CANDIDATE_LIMIT = 25;

/** Effective capture time: COALESCE(captured_at, ts) as epoch millis. */
function effectiveCaptureMs(row: McpSensorQueryRow): number {
  return Date.parse(row.captured_at ?? row.ts);
}

/** Deterministic winner between the captured and legacy candidates. */
function newerReading(a: McpSensorQueryRow, b: McpSensorQueryRow): McpSensorQueryRow {
  const ea = effectiveCaptureMs(a);
  const eb = effectiveCaptureMs(b);
  if (ea !== eb) return ea > eb ? a : b;
  const ta = Date.parse(a.ts);
  const tb = Date.parse(b.ts);
  if (ta !== tb) return ta > tb ? a : b;
  return a.id > b.id ? a : b;
}

/**
 * Select the newest non-diagnostic row per metric and strip raw provenance.
 * Stable for identical inputs; never mutates caller rows.
 */
export function selectLatestMcpSensorReadings(
  rows: readonly McpSensorQueryRow[] | null | undefined,
): Record<string, McpSensorReading> {
  const selected: Record<string, McpSensorQueryRow> = {};
  for (const row of withoutDiagnosticSensorRows(rows)) {
    if (!row || typeof row.metric !== "string" || row.metric.length === 0) continue;
    const current = selected[row.metric];
    selected[row.metric] = current ? newerReading(current, row) : row;
  }

  return Object.fromEntries(
    Object.entries(selected).map(([metric, row]) => [
      metric,
      {
        id: row.id,
        tent_id: row.tent_id,
        metric: row.metric,
        value: row.value,
        quality: row.quality,
        source: row.source,
        ts: row.ts,
        captured_at: row.captured_at,
      } satisfies McpSensorReading,
    ]),
  );
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
    // Latest row per metric under COALESCE(captured_at, ts) semantics.
    // A bounded candidate window is required because the newest stored row
    // may be diagnostic-only; filtering after LIMIT 1 would hide the newest
    // eligible physical row for the same metric.
    const results = await Promise.all(
      KNOWN_METRICS.flatMap((metric) => [
        supabase
          .from("sensor_readings")
          .select(SENSOR_COLUMNS)
          .eq("tent_id", tentId)
          .eq("metric", metric)
          .not("captured_at", "is", null)
          .order("captured_at", { ascending: false })
          .order("ts", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(SENSOR_CANDIDATE_LIMIT),
        supabase
          .from("sensor_readings")
          .select(SENSOR_COLUMNS)
          .eq("tent_id", tentId)
          .eq("metric", metric)
          .is("captured_at", null)
          .order("ts", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(SENSOR_CANDIDATE_LIMIT),
      ]),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      return {
        content: [{ type: "text", text: `Error: ${failed.error.message}` }],
        isError: true,
      };
    }
    const candidates = results.flatMap((result) =>
      Array.isArray(result.data) ? (result.data as McpSensorQueryRow[]) : [],
    );
    const readings = selectLatestMcpSensorReadings(candidates);
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
