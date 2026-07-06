/**
 * get_latest_sensor_snapshot — most recent sensor reading for a tent.
 *
 * Read-only. RLS-scoped through the caller's OAuth token. Preserves the
 * `source` label verbatim so agents can never treat demo/stale/invalid
 * data as live. Never returns `raw_payload`.
 */
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "./_supabase";

export default defineTool({
  name: "get_latest_sensor_snapshot",
  title: "Get latest sensor snapshot",
  description:
    "Fetch the single most recent sensor reading for one of the signed-in " +
    "grower's tents. Includes temperature/humidity/vpd/co2 fields when " +
    "present and always includes the `source` label " +
    "(live/manual/csv/demo/stale/invalid). Never treat non-live sources " +
    "as current readings. Read-only.",
  inputSchema: {
    tentId: z.string().uuid().describe("Tent id to fetch the latest reading for."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ tentId }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("sensor_readings")
      .select(
        "id,tent_id,plant_id,source,captured_at,temperature_c,humidity_pct,vpd_kpa,co2_ppm,soil_moisture_pct,ph,ec_ms_cm,confidence",
      )
      .eq("tent_id", tentId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
    if (!data) {
      return {
        content: [{ type: "text", text: "No sensor snapshot found for that tent." }],
        structuredContent: { snapshot: null },
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `Latest reading (source: ${data.source}):\n${JSON.stringify(data, null, 2)}`,
        },
      ],
      structuredContent: { snapshot: data },
    };
  },
});
