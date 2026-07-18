import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  selectLatestMcpSensorReadings,
  type McpSensorQueryRow,
} from "@/lib/mcp/tools/get-latest-sensor-snapshot";

function physicalGatewayPayload() {
  return {
    vendor: "ecowitt_windows_testbench",
    metadata: {
      reported_verdant_source: "live",
      raw_payload: {
        stationtype: "GW2000A_V3.2.4",
        model: "GW2000A",
        dateutc: "2026-06-09 12:00:00",
      },
    },
  };
}

function row(
  id: string,
  metric: string,
  capturedAt: string,
  rawPayload: unknown,
  value = 24,
): McpSensorQueryRow {
  return {
    id,
    tent_id: "tent-1",
    metric,
    value,
    quality: "ok",
    source: "live",
    ts: capturedAt,
    captured_at: capturedAt,
    raw_payload: rawPayload,
  };
}

describe("MCP latest sensor snapshot — ECOWITT provenance fence", () => {
  it("keeps the generated Supabase edge mirror in provenance-fence parity", () => {
    const mirror = readFileSync(resolve("supabase/functions/mcp/index.ts"), "utf8");
    const publicProjection = mirror.slice(
      mirror.indexOf("function selectLatestMcpSensorReadings"),
      mirror.indexOf("var get_latest_sensor_snapshot_default"),
    );

    expect(mirror).toContain(
      'SENSOR_COLUMNS = "id,tent_id,metric,value,quality,source,ts,captured_at,raw_payload"',
    );
    expect(mirror).toContain('vendor === "ecowitt_windows_testbench"');
    expect(mirror).toContain("var SENSOR_CANDIDATE_LIMIT = 25");
    expect(mirror).toContain("var STALE_THRESHOLD_MS = 30 * 60 * 1e3");
    expect(mirror).toContain("current_live:");
    expect(mirror).toContain("freshness,");
    expect(mirror).not.toMatch(/import mcp from "npm:[A-Za-z]:\\/);
    expect(publicProjection).not.toContain("raw_payload");
  });

  it("returns no live/ok reading for diagnostic-only testbench rows", () => {
    const readings = selectLatestMcpSensorReadings([
      row(
        "diagnostic",
        "temperature_c",
        "2026-06-09T12:00:00Z",
        {
          vendor: "ecowitt_windows_testbench",
          metadata: { confidence: "test" },
        },
        99,
      ),
    ]);

    expect(readings).toEqual({});
  });

  it("uses the older physical row when a newer diagnostic shares its metric", () => {
    const readings = selectLatestMcpSensorReadings([
      row(
        "diagnostic",
        "temperature_c",
        "2026-06-09T12:00:00Z",
        {
          vendor: "ecowitt_windows_testbench",
          metadata: { confidence: "test" },
        },
        99,
      ),
      row("physical", "temperature_c", "2026-06-09T11:59:00Z", physicalGatewayPayload(), 24.3),
    ]);

    expect(readings.temperature_c).toMatchObject({
      id: "physical",
      source: "live",
      quality: "ok",
      value: 24.3,
    });
    expect(JSON.stringify(readings)).not.toContain("raw_payload");
    expect(JSON.stringify(readings)).not.toContain("stationtype");
  });

  it("keeps a physical gateway row carried by the legacy listener vendor", () => {
    const readings = selectLatestMcpSensorReadings(
      [row("physical", "humidity_pct", "2026-06-09T12:00:00Z", physicalGatewayPayload(), 55)],
      { now: new Date("2026-06-09T12:05:00Z") },
    );

    expect(readings.humidity_pct).toMatchObject({
      id: "physical",
      source: "live",
      quality: "ok",
      freshness: "fresh",
      current_live: true,
      value: 55,
    });
  });

  it("marks an aged live/ok row stale at response time without rewriting provenance", () => {
    const readings = selectLatestMcpSensorReadings(
      [
        row(
          "aged-physical",
          "temperature_c",
          "2026-06-09T11:29:59.999Z",
          physicalGatewayPayload(),
          24.1,
        ),
      ],
      { now: new Date("2026-06-09T12:00:00Z") },
    );

    expect(readings.temperature_c).toMatchObject({
      source: "live",
      quality: "ok",
      freshness: "stale",
      current_live: false,
    });
  });

  it("fails closed for a legacy top-level testbench source with no raw lineage", () => {
    const legacy = row("legacy", "temperature_c", "2026-06-09T12:00:00Z", null);
    legacy.source = "ecowitt_windows_testbench";
    expect(selectLatestMcpSensorReadings([legacy])).toEqual({});
  });
});
