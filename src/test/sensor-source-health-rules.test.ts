/**
 * Tests for sensorSourceHealthRules pure helpers.
 */
import { describe, it, expect } from "vitest";
import {
  parseTimestamp,
  computeSourceStatus,
  groupReadingsBySource,
  sortSourceSummaries,
  STALE_THRESHOLD_MS,
  type SensorSourceSummary,
} from "@/lib/sensorSourceHealthRules";

const NOW = new Date("2026-05-21T12:00:00.000Z").getTime();
const RECENT = new Date(NOW - 5 * 60_000).toISOString(); // 5 min ago
const STALE_TS = new Date(NOW - 45 * 60_000).toISOString(); // 45 min ago

describe("parseTimestamp", () => {
  it("returns epoch ms for valid ISO string", () => {
    expect(parseTimestamp("2026-05-21T12:00:00.000Z")).toBe(
      new Date("2026-05-21T12:00:00.000Z").getTime(),
    );
  });

  it("returns null for null/undefined", () => {
    expect(parseTimestamp(null)).toBeNull();
    expect(parseTimestamp(undefined)).toBeNull();
  });

  it("returns null for invalid date string", () => {
    expect(parseTimestamp("not-a-date")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseTimestamp("")).toBeNull();
  });
});

describe("computeSourceStatus", () => {
  it("returns active when age is within threshold", () => {
    expect(computeSourceStatus(10 * 60_000)).toBe("active"); // 10 min
  });

  it("returns stale when age exceeds threshold", () => {
    expect(computeSourceStatus(45 * 60_000)).toBe("stale"); // 45 min
  });

  it("returns active at exactly 30 min boundary", () => {
    expect(computeSourceStatus(STALE_THRESHOLD_MS)).toBe("active");
  });

  it("returns stale at 30 min + 1ms", () => {
    expect(computeSourceStatus(STALE_THRESHOLD_MS + 1)).toBe("stale");
  });

  it("returns no_recent_data for null age", () => {
    expect(computeSourceStatus(null)).toBe("no_recent_data");
  });
});

describe("groupReadingsBySource", () => {
  it("groups readings by source label", () => {
    const readings = [
      { source: "manual", ts: RECENT, metric: "temperature_c" },
      { source: "manual", ts: RECENT, metric: "humidity_pct" },
      { source: "esp32_dht22", ts: STALE_TS, metric: "temperature_c" },
    ];
    const result = groupReadingsBySource(readings, NOW);
    expect(result).toHaveLength(2);

    const manual = result.find((s) => s.sourceLabel === "manual");
    expect(manual).toBeDefined();
    expect(manual!.status).toBe("active");
    expect(manual!.metrics).toEqual(["humidity_pct", "temperature_c"]);

    const esp = result.find((s) => s.sourceLabel === "esp32_dht22");
    expect(esp).toBeDefined();
    expect(esp!.status).toBe("stale");
  });

  it("marks source active when last reading is within 30 minutes", () => {
    const readings = [{ source: "webhook_generic", ts: RECENT, metric: "co2_ppm" }];
    const result = groupReadingsBySource(readings, NOW);
    expect(result[0].status).toBe("active");
  });

  it("marks source stale when older than 30 minutes", () => {
    const readings = [{ source: "pi_bridge", ts: STALE_TS, metric: "temperature_c" }];
    const result = groupReadingsBySource(readings, NOW);
    expect(result[0].status).toBe("stale");
  });

  it("handles missing/invalid timestamps safely", () => {
    const readings = [
      { source: "bad_source", ts: null, metric: "temperature_c" },
      { source: "bad_source", ts: "not-a-date", metric: "humidity_pct" },
      { source: "bad_source", ts: undefined, metric: "co2_ppm" },
    ];
    const result = groupReadingsBySource(readings, NOW);
    // All timestamps invalid → no entries aggregated
    expect(result).toHaveLength(0);
  });

  it("handles null/undefined source as 'unknown'", () => {
    const readings = [
      { source: null, ts: RECENT, metric: "temperature_c" },
      { source: undefined, ts: RECENT, metric: "humidity_pct" },
    ];
    const result = groupReadingsBySource(readings, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].sourceLabel).toBe("unknown");
  });

  it("returns empty array for empty input", () => {
    expect(groupReadingsBySource([])).toEqual([]);
    expect(groupReadingsBySource([], NOW)).toEqual([]);
  });

  it("picks the latest timestamp per source", () => {
    const older = new Date(NOW - 20 * 60_000).toISOString();
    const newer = new Date(NOW - 2 * 60_000).toISOString();
    const readings = [
      { source: "manual", ts: older, metric: "temperature_c" },
      { source: "manual", ts: newer, metric: "humidity_pct" },
    ];
    const result = groupReadingsBySource(readings, NOW);
    expect(result[0].lastReceivedAt).toBe(newer);
    expect(result[0].status).toBe("active");
  });
});

describe("sortSourceSummaries", () => {
  it("sorts active before stale before no_recent_data", () => {
    const input: SensorSourceSummary[] = [
      {
        sourceLabel: "z_stale",
        lastReceivedAt: STALE_TS,
        ageMs: 45 * 60_000,
        metrics: [],
        status: "stale",
      },
      {
        sourceLabel: "a_active",
        lastReceivedAt: RECENT,
        ageMs: 5 * 60_000,
        metrics: [],
        status: "active",
      },
      {
        sourceLabel: "m_none",
        lastReceivedAt: STALE_TS,
        ageMs: 999999,
        metrics: [],
        status: "no_recent_data",
      },
    ];
    const result = sortSourceSummaries(input);
    expect(result[0].status).toBe("active");
    expect(result[1].status).toBe("stale");
    expect(result[2].status).toBe("no_recent_data");
  });

  it("sorts lexically within same status group", () => {
    const input: SensorSourceSummary[] = [
      {
        sourceLabel: "esp32_z",
        lastReceivedAt: RECENT,
        ageMs: 5 * 60_000,
        metrics: [],
        status: "active",
      },
      {
        sourceLabel: "esp32_a",
        lastReceivedAt: RECENT,
        ageMs: 5 * 60_000,
        metrics: [],
        status: "active",
      },
      {
        sourceLabel: "esp32_m",
        lastReceivedAt: RECENT,
        ageMs: 5 * 60_000,
        metrics: [],
        status: "active",
      },
    ];
    const result = sortSourceSummaries(input);
    expect(result.map((s) => s.sourceLabel)).toEqual(["esp32_a", "esp32_m", "esp32_z"]);
  });

  it("handles empty array", () => {
    expect(sortSourceSummaries([])).toEqual([]);
  });
});
