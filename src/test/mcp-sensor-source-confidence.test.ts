import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SENSOR_SOURCES } from "@/lib/sensor/sensorSourceRules";
import {
  selectLatestMcpSensorReadings,
  type McpSensorQueryRow,
  type McpSensorReading,
} from "@/lib/mcp/tools/get-latest-sensor-snapshot";

const NOW = new Date("2026-08-25T12:05:00.000Z");
const FRESH_CAPTURED_AT = "2026-08-25T12:00:00.000Z";

function reading(
  source: string,
  overrides: Partial<McpSensorQueryRow> = {},
): McpSensorReading {
  const metric = overrides.metric ?? "temperature_c";
  const capturedAt = overrides.captured_at ?? FRESH_CAPTURED_AT;
  const result = selectLatestMcpSensorReadings(
    [
      {
        id: "reading-1",
        tent_id: "tent-1",
        metric,
        value: 24,
        quality: "ok",
        source,
        ts: capturedAt,
        captured_at: capturedAt,
        created_at: capturedAt,
        raw_payload: {
          transport: source,
          token: "must-not-cross",
          hardware_id: "must-not-cross",
        },
        ...overrides,
      },
    ],
    { now: NOW },
  )[metric];

  expect(result).toBeDefined();
  if (!result) throw new Error(`Missing MCP reading for ${metric}`);
  return result;
}

describe("MCP sensor source constitution + derived confidence", () => {
  it.each([
    { stored: "live", expected: "live", confidence: 0.9, currentLive: true },
    { stored: "sensor", expected: "live", confidence: 0.9, currentLive: true },
    { stored: "manual", expected: "manual", confidence: 0.6, currentLive: false },
    { stored: "user", expected: "manual", confidence: 0.6, currentLive: false },
    { stored: "csv", expected: "csv", confidence: 0.6, currentLive: false },
    { stored: "import", expected: "csv", confidence: 0.6, currentLive: false },
    { stored: "sim", expected: "demo", confidence: 0.25, currentLive: false },
    { stored: "mock", expected: "demo", confidence: 0.25, currentLive: false },
    { stored: "stale", expected: "stale", confidence: 0.25, currentLive: false },
    { stored: "invalid", expected: "invalid", confidence: 0, currentLive: false },
  ])(
    "maps stored source $stored to constitution source $expected",
    ({ stored, expected, confidence, currentLive }) => {
      const result = reading(stored);

      expect(result.source).toBe(expected);
      expect(SENSOR_SOURCES).toContain(result.source);
      expect(result.confidence).toBe(confidence);
      expect(result.current_live).toBe(currentLive);
    },
  );

  it.each(["ecowitt", "ha", "home_assistant", "mqtt", "esp32", "webhook", "vendor_bridge"])(
    "never publishes vendor or transport source %s",
    (stored) => {
      const result = reading(stored);

      expect(result).toMatchObject({
        source: "invalid",
        freshness: "invalid",
        confidence: 0,
        current_live: false,
      });
      expect(result.source).not.toBe(stored);
      expect(JSON.stringify(result)).not.toContain("must-not-cross");
    },
  );

  it("derives bounded confidence from source, quality, plausibility, and age", () => {
    const cases = [
      reading("live"),
      reading("manual"),
      reading("csv"),
      reading("demo"),
      reading("live", {
        captured_at: "2026-08-25T11:49:59.000Z",
        ts: "2026-08-25T11:49:59.000Z",
      }),
      reading("live", { quality: "degraded" }),
      reading("live", { quality: "stale" }),
      reading("live", { quality: "invalid" }),
      reading("live", { quality: "mystery" }),
      reading("live", { value: 61 }),
    ];

    expect(cases.map(({ confidence }) => confidence)).toEqual([
      0.9,
      0.6,
      0.6,
      0.25,
      0.25,
      0.25,
      0.25,
      0,
      0,
      0,
    ]);
    expect(cases.map(({ freshness }) => freshness)).toEqual([
      "fresh",
      "fresh",
      "fresh",
      "fresh",
      "stale",
      "fresh",
      "stale",
      "invalid",
      "invalid",
      "invalid",
    ]);

    for (const result of cases) {
      expect(result).toHaveProperty("confidence");
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the committed MCP edge mirror on the same publication boundary", () => {
    const bundle = readFileSync(resolve("supabase/functions/mcp/index.ts"), "utf8");
    const selector = bundle.slice(
      bundle.indexOf("function selectLatestMcpSensorReadings"),
      bundle.indexOf("async function getLatestSensorSnapshotForOwnedTent"),
    );

    expect(bundle).toContain("function deriveMcpSensorConfidence");
    expect(selector).toContain("const source = normalizeSensorSource(row.source);");
    expect(selector).toContain("confidence,");
    expect(selector).not.toContain("source: row.source");
    expect(bundle).toContain("confidence: ${r.confidence}");
  });
});
