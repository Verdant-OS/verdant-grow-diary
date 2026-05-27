import { describe, it, expect } from "vitest";
import {
  buildSensorSourceHealth,
  formatSourceAge,
  SENSOR_SOURCE_STALE_MINUTES,
  type SensorSourceHealthInput,
} from "@/lib/sensorSourceHealthRules";

const NOW = new Date("2026-05-27T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

describe("sensorSourceHealthRules.buildSensorSourceHealth", () => {
  it("returns empty array when no rows", () => {
    expect(buildSensorSourceHealth([], NOW)).toEqual([]);
    expect(buildSensorSourceHealth(null, NOW)).toEqual([]);
    expect(buildSensorSourceHealth(undefined, NOW)).toEqual([]);
  });

  it("groups by source and counts readings", () => {
    const rows: SensorSourceHealthInput[] = [
      { source: "esp32_arduino", metric: "temperature_c", captured_at: minutesAgo(1) },
      { source: "esp32_arduino", metric: "humidity_pct", captured_at: minutesAgo(2) },
      { source: "pi_bridge", metric: "temperature_c", captured_at: minutesAgo(10) },
    ];
    const out = buildSensorSourceHealth(rows, NOW);
    expect(out).toHaveLength(2);
    const esp = out.find((s) => s.source === "esp32_arduino")!;
    expect(esp.readingCount).toBe(2);
    expect(esp.metrics).toEqual(["humidity_pct", "temperature_c"]);
  });

  it("marks source active when newest reading is within 30 minutes", () => {
    const rows: SensorSourceHealthInput[] = [
      { source: "esp32", metric: "temperature_c", captured_at: minutesAgo(SENSOR_SOURCE_STALE_MINUTES - 1) },
    ];
    expect(buildSensorSourceHealth(rows, NOW)[0].status).toBe("active");
  });

  it("marks source stale when newest reading is older than 30 minutes", () => {
    const rows: SensorSourceHealthInput[] = [
      { source: "esp32", metric: "temperature_c", captured_at: minutesAgo(SENSOR_SOURCE_STALE_MINUTES + 5) },
    ];
    expect(buildSensorSourceHealth(rows, NOW)[0].status).toBe("stale");
  });

  it("marks source as no_recent_data when older than the no-data window", () => {
    const rows: SensorSourceHealthInput[] = [
      { source: "old_bridge", metric: "temperature_c", captured_at: minutesAgo(60 * 48) },
    ];
    expect(buildSensorSourceHealth(rows, NOW)[0].status).toBe("no_recent_data");
  });

  it("handles missing / invalid / null timestamps safely", () => {
    const rows: SensorSourceHealthInput[] = [
      { source: "broken", metric: "temperature_c", captured_at: null, ts: null },
      { source: "broken", metric: "humidity_pct", captured_at: "not-a-date", ts: undefined },
    ];
    const out = buildSensorSourceHealth(rows, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("no_recent_data");
    expect(out[0].lastReceivedAt).toBeNull();
    expect(out[0].ageMinutes).toBeNull();
    expect(out[0].readingCount).toBe(2);
  });

  it("falls back to ts when captured_at is missing", () => {
    const rows: SensorSourceHealthInput[] = [
      { source: "esp32", metric: "temperature_c", captured_at: null, ts: minutesAgo(5) },
    ];
    expect(buildSensorSourceHealth(rows, NOW)[0].status).toBe("active");
  });

  it("treats blank/missing source as 'unknown'", () => {
    const rows: SensorSourceHealthInput[] = [
      { source: "", metric: "temperature_c", captured_at: minutesAgo(2) },
      { source: null, metric: "humidity_pct", captured_at: minutesAgo(3) },
    ];
    const out = buildSensorSourceHealth(rows, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("unknown");
    expect(out[0].readingCount).toBe(2);
  });

  it("sorts deterministically: active first, then stale, then no-data; lexical tie-breaker", () => {
    const rows: SensorSourceHealthInput[] = [
      { source: "zeta_stale", captured_at: minutesAgo(45) },
      { source: "alpha_active", captured_at: minutesAgo(2) },
      { source: "bravo_active", captured_at: minutesAgo(2) },
      { source: "yankee_nodata", captured_at: null, ts: null },
      { source: "echo_stale", captured_at: minutesAgo(45) },
    ];
    const out = buildSensorSourceHealth(rows, NOW).map((s) => s.source);
    expect(out).toEqual([
      "alpha_active",
      "bravo_active",
      "echo_stale",
      "zeta_stale",
      "yankee_nodata",
    ]);
  });

  it("does not mutate the input array", () => {
    const rows: SensorSourceHealthInput[] = [
      { source: "esp32", metric: "temperature_c", captured_at: minutesAgo(1) },
    ];
    const snapshot = JSON.stringify(rows);
    buildSensorSourceHealth(rows, NOW);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});

describe("sensorSourceHealthRules.formatSourceAge", () => {
  it("renders friendly labels for the common ranges", () => {
    expect(formatSourceAge(null)).toBe("no data");
    expect(formatSourceAge(0)).toBe("just now");
    expect(formatSourceAge(8)).toBe("8 min ago");
    expect(formatSourceAge(59)).toBe("59 min ago");
    expect(formatSourceAge(60)).toBe("1 hr ago");
    expect(formatSourceAge(60 * 24)).toBe("1 day ago");
    expect(formatSourceAge(60 * 24 * 3)).toBe("3 days ago");
  });
});
