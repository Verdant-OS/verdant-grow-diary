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
 * Preserves `source` and `quality` labels verbatim, then derives response-time
 * freshness from the effective capture timestamp. Raw provenance is selected
 * only long enough to exclude diagnostic-only Windows testbench rows, then is
 * stripped before tool content is assembled. Trust follows the
 * canonical SENSOR TRUTH contract: only quality `ok` + source `live` +
 * response-time freshness `fresh` counts as current live data;
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
import {
  getLatestSensorSnapshotForOwnedTent,
  selectLatestMcpSensorReadings,
  type McpSensorQueryRow,
  type McpSensorReading,
} from "../../operatorAccountReadModels";
import { supabaseForUser, unauthenticated } from "./_supabase";

export { selectLatestMcpSensorReadings };
export type { McpSensorQueryRow, McpSensorReading };

export default defineTool({
  name: "get_latest_sensor_snapshot",
  title: "Get latest sensor snapshot",
  description:
    "Fetch the most recent sensor reading per metric (temperature_c, " +
    "humidity_pct, vpd_kpa, co2_ppm, soil_moisture_pct, soil_temp_c, ph, " +
    "ec, ppfd) for one of the signed-in grower's own tents, ordered by " +
    "capture time (captured_at, falling back to ingest time). Every " +
    "reading keeps its `source` and `quality` labels verbatim and adds a " +
    "response-time `freshness` field (`fresh`, `stale`, or `invalid`) plus " +
    "`current_live`. `quality` " +
    "is one of ok/degraded/stale/invalid. Canonical `source` labels are " +
    "exactly live/manual/csv/demo/stale/invalid, where `live` means " +
    "fresh validated connected telemetry; legacy rows may carry other " +
    "ingest labels such as sim or vendor bridge names. Treat a reading " +
    "as current live telemetry ONLY when `current_live` is true: quality " +
    "must be `ok`, source must be `live`, and freshness must be `fresh`. " +
    "Every other source, quality, or freshness state keeps its label " +
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
    const result = await getLatestSensorSnapshotForOwnedTent(supabase, tentId);
    if (result.ok === false) {
      return {
        content: [
          {
            type: "text",
            text: result.reason === "unavailable" ? `Error: ${result.message}` : result.message,
          },
        ],
        isError: true,
      };
    }
    if (!result.data.snapshot) {
      return {
        content: [{ type: "text", text: "No sensor readings found for that tent." }],
        structuredContent: { snapshot: null },
      };
    }
    const { readings } = result.data.snapshot;
    const summary = Object.values(readings)
      .map(
        (r) =>
          `${r.metric}=${r.value} (source: ${r.source}, quality: ${r.quality}, freshness: ${r.freshness}, current_live: ${r.current_live}, at: ${r.captured_at ?? r.ts})`,
      )
      .join("\n");
    return {
      content: [
        {
          type: "text",
          text: `Latest readings for tent "${result.data.tent.name}":\n${summary}`,
        },
      ],
      structuredContent: { snapshot: result.data.snapshot },
    };
  },
});
