/**
 * Verdant MCP server definition.
 *
 * Safety posture (mirrors Verdant knowledge rules):
 *   - Read-only tools only. No Action Queue writes, no device control,
 *     no AI calls, no schema/RLS/Edge changes.
 *   - All tools are RLS-scoped: each tool creates a per-request Supabase
 *     client that forwards the caller's OAuth token, so reads run as the
 *     signed-in user.
 *   - No raw_payload or secret exposure.
 *   - No fabricated live data — sensor rows publish constitution `source`
 *     labels only (live|manual|csv|demo|stale|invalid), never vendor/
 *     transport tokens, plus derived `confidence` and deny-by-default
 *     trust: only quality `ok` + source `live` counts as current live
 *     telemetry; every other label stays non-live.
 *
 * The OAuth issuer must be the direct supabase.co host, built from the
 * project ref (VITE_SUPABASE_PROJECT_ID is inlined by Vite at build time).
 */
import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listGrowsTool from "./tools/list-grows";
import listRecentDiaryEntriesTool from "./tools/list-recent-diary-entries";
import getLatestSensorSnapshotTool from "./tools/get-latest-sensor-snapshot";
import listGrowWalkTargetsTool from "./tools/list-grow-walk-targets";
import getGrowWalkContextTool from "./tools/get-grow-walk-context";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "verdant-grow-os-mcp",
  title: "Verdant Grow OS",
  version: "0.1.0",
  instructions:
    "Read-only access to the signed-in Verdant grower's own data. " +
    "Use `list_grows` to enumerate grows, `list_recent_diary_entries` " +
    "for recent log entries in a grow the caller owns, and " +
    "`get_latest_sensor_snapshot` for the most recent reading per " +
    "metric in a tent the caller owns. Use `list_grow_walk_targets` " +
    "to rank owned tents and plants for physical inspection, then " +
    "`get_grow_walk_context` to retrieve bounded, source-labeled evidence " +
    "for one exact owned target. Grow Walk priority is scouting guidance, " +
    "not diagnosis. Photo rows are metadata only unless an image is " +
    "separately supplied and inspected. Sensor readings publish " +
    "constitution `source` labels only (live|manual|csv|demo|stale|" +
    "invalid), never vendor/transport tokens, plus `quality`, derived " +
    "`confidence` (0–1), and freshness. Trust is deny-by-default: a " +
    "reading is current live telemetry ONLY when its quality is `ok` " +
    "AND its source is `live` (fresh validated connected telemetry). " +
    "Every other source or quality keeps its label and is never live: " +
    "manual stays manual, csv stays csv, demo stays demo, and stale or " +
    "invalid labels are never current or healthy. This server never " +
    "writes, never starts AI Doctor, never spends AI credits, never " +
    "approves Action Queue items, and never controls devices.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listGrowsTool,
    listRecentDiaryEntriesTool,
    getLatestSensorSnapshotTool,
    listGrowWalkTargetsTool,
    getGrowWalkContextTool,
  ],
});
