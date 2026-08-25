/**
 * mcp-sensor-source-confidence.test.ts — constitution source honesty + derived
 * confidence for MCP sensor publication.
 *
 * Asserts resolved mapper behavior (not source-text scans): vendor/transport
 * tokens never appear in McpSensorReading.source, and every reading carries
 * confidence on the product 0–1 scale.
 */
import { describe, expect, it } from "vitest";
import {
  deriveMcpSensorReadingConfidence,
  selectLatestMcpSensorReadings,
  type McpSensorQueryRow,
} from "@/lib/operatorAccountReadModels";
import { SENSOR_SOURCES } from "@/lib/sensor/sensorSourceRules";

const NOW = new Date("2026-07-19T12:00:00Z");
const FRESH_AT = "2026-07-19T11:55:00Z";
const STALE_AT = "2026-07-19T11:00:00Z";

const CONSTITUTION_SOURCES = new Set<string>(SENSOR_SOURCES);

function row(overrides: Partial<McpSensorQueryRow> = {}): McpSensorQueryRow {
  return {
    id: overrides.id ?? "r1",
    tent_id: overrides.tent_id ?? "tent-1",
    metric: overrides.metric ?? "temperature_c",
    value: overrides.value ?? 24,
    quality: overrides.quality ?? "ok",
    source: overrides.source ?? "live",
    ts: overrides.ts ?? FRESH_AT,
    captured_at: overrides.captured_at === undefined ? FRESH_AT : overrides.captured_at,
    created_at: overrides.created_at ?? FRESH_AT,
    raw_payload: overrides.raw_payload,
  };
}

describe("deriveMcpSensorReadingConfidence", () => {
  it("returns 0 for invalid / implausible / quality-invalid", () => {
    expect(
      deriveMcpSensorReadingConfidence({
        source: "invalid",
        freshness: "fresh",
        quality: "ok",
        plausible: true,
      }),
    ).toBe(0);
    expect(
      deriveMcpSensorReadingConfidence({
        source: "live",
        freshness: "invalid",
        quality: "ok",
        plausible: true,
      }),
    ).toBe(0);
    expect(
      deriveMcpSensorReadingConfidence({
        source: "live",
        freshness: "fresh",
        quality: "invalid",
        plausible: true,
      }),
    ).toBe(0);
    expect(
      deriveMcpSensorReadingConfidence({
        source: "live",
        freshness: "fresh",
        quality: "ok",
        plausible: false,
      }),
    ).toBe(0);
  });

  it("returns low for stale or demo", () => {
    expect(
      deriveMcpSensorReadingConfidence({
        source: "stale",
        freshness: "fresh",
        quality: "ok",
        plausible: true,
      }),
    ).toBe(0.35);
    expect(
      deriveMcpSensorReadingConfidence({
        source: "demo",
        freshness: "fresh",
        quality: "ok",
        plausible: true,
      }),
    ).toBe(0.35);
    expect(
      deriveMcpSensorReadingConfidence({
        source: "live",
        freshness: "stale",
        quality: "ok",
        plausible: true,
      }),
    ).toBe(0.35);
  });

  it("returns medium for manual and csv", () => {
    expect(
      deriveMcpSensorReadingConfidence({
        source: "manual",
        freshness: "fresh",
        quality: "ok",
        plausible: true,
      }),
    ).toBe(0.55);
    expect(
      deriveMcpSensorReadingConfidence({
        source: "csv",
        freshness: "fresh",
        quality: "ok",
        plausible: true,
      }),
    ).toBe(0.55);
  });

  it("returns high only for fresh ok live plausible", () => {
    expect(
      deriveMcpSensorReadingConfidence({
        source: "live",
        freshness: "fresh",
        quality: "ok",
        plausible: true,
      }),
    ).toBe(0.9);
  });
});

describe("MCP sensor publication boundary — source honesty + confidence", () => {
  it.each([
    ["ecowitt", "invalid"],
    ["sim", "demo"],
    ["mqtt", "invalid"],
    ["ha", "invalid"],
    ["home_assistant", "invalid"],
    ["esp32", "invalid"],
    ["webhook", "invalid"],
    ["mystery_bridge", "invalid"],
    ["live", "live"],
    ["manual", "manual"],
    ["csv", "csv"],
    ["demo", "demo"],
    ["stale", "stale"],
    ["invalid", "invalid"],
  ] as const)("maps stored source %s → constitution %s", (stored, expected) => {
    const readings = selectLatestMcpSensorReadings([row({ source: stored })], { now: NOW });
    const reading = readings.temperature_c!;
    expect(reading.source).toBe(expected);
    expect(CONSTITUTION_SOURCES.has(reading.source)).toBe(true);
    expect(reading.source).not.toBe("ecowitt");
    expect(reading.source).not.toBe("sim");
    expect(typeof reading.confidence).toBe("number");
    expect(reading.confidence).toBeGreaterThanOrEqual(0);
    expect(reading.confidence).toBeLessThanOrEqual(1);
  });

  it("never returns vendor/transport strings in the MCP source field", () => {
    const vendors = [
      "ecowitt",
      "sim",
      "mqtt",
      "ha",
      "HA",
      "esp32",
      "webhook",
      "EcoWitt",
      "home_assistant",
      "pi_bridge",
    ];
    for (const vendor of vendors) {
      const reading = selectLatestMcpSensorReadings([row({ source: vendor })], {
        now: NOW,
      }).temperature_c!;
      expect(CONSTITUTION_SOURCES.has(reading.source)).toBe(true);
      expect(reading.source).not.toMatch(/ecowitt|sim|mqtt|ha|esp32|webhook|bridge/i);
    }
  });

  it("does not promote vendor/unknown to live from freshness alone", () => {
    const reading = selectLatestMcpSensorReadings(
      [row({ source: "ecowitt", captured_at: FRESH_AT, ts: FRESH_AT, quality: "ok" })],
      { now: NOW },
    ).temperature_c!;
    expect(reading.source).toBe("invalid");
    expect(reading.freshness).toBe("invalid");
    expect(reading.current_live).toBe(false);
    expect(reading.confidence).toBe(0);
  });

  it("maps sim → demo with low confidence, never live", () => {
    const reading = selectLatestMcpSensorReadings(
      [row({ source: "sim", captured_at: FRESH_AT, quality: "ok" })],
      { now: NOW },
    ).temperature_c!;
    expect(reading.source).toBe("demo");
    expect(reading.current_live).toBe(false);
    expect(reading.confidence).toBe(0.35);
  });

  it("keeps true live + fresh + ok as current_live with high confidence", () => {
    const reading = selectLatestMcpSensorReadings(
      [row({ source: "live", quality: "ok", captured_at: FRESH_AT })],
      { now: NOW },
    ).temperature_c!;
    expect(reading.source).toBe("live");
    expect(reading.freshness).toBe("fresh");
    expect(reading.current_live).toBe(true);
    expect(reading.confidence).toBe(0.9);
  });

  it("ages live readings to low confidence without inventing vendor labels", () => {
    const reading = selectLatestMcpSensorReadings(
      [row({ source: "live", captured_at: STALE_AT, ts: STALE_AT })],
      { now: NOW },
    ).temperature_c!;
    expect(reading.source).toBe("live");
    expect(reading.freshness).toBe("stale");
    expect(reading.current_live).toBe(false);
    expect(reading.confidence).toBe(0.35);
  });

  it("strips raw_payload and never leaks hardware identifiers", () => {
    const reading = selectLatestMcpSensorReadings(
      [
        row({
          source: "ecowitt",
          raw_payload: {
            PASSKEY: "secret",
            mac: "aa:bb:cc",
            token: "bridge-token",
          },
        }),
      ],
      { now: NOW },
    ).temperature_c!;
    expect(reading).not.toHaveProperty("raw_payload");
    expect(JSON.stringify(reading)).not.toMatch(/PASSKEY|aa:bb:cc|bridge-token/);
    expect(reading.source).toBe("invalid");
    expect(typeof reading.confidence).toBe("number");
  });
});
