/**
 * Adapter tests for buildPlantAiDoctorContext.
 *
 * Pure unit tests: ensure diary rows map to grow events and manual
 * sensor logs map to manual-tagged sensor readings (never live).
 */
import { describe, it, expect } from "vitest";
import {
  buildPlantAiDoctorContext,
  diaryEntriesToGrowEventRows,
  fahrenheitToCelsius,
  manualSensorLogsToReadingRows,
  tentManualSensorRowsToPlantSensorLogs,
  tentManualSensorRowsToReadingRows,
} from "@/lib/plantAiDoctorContextAdapter";
import { buildPlantSensorContextAuditView } from "@/lib/plantSensorContextAuditViewModel";
import { buildTimelineEvidenceReadinessView } from "@/lib/timelineEvidenceReadinessViewModel";
import { resolveCanonicalDiaryEventType } from "@/lib/diaryTimelineViewModel";

const NOW = new Date("2026-06-10T12:00:00Z");
const HOUR = 3600 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("plantAiDoctorContextAdapter", () => {
  it("fahrenheitToCelsius converts and rounds", () => {
    expect(fahrenheitToCelsius(75)).toBeCloseTo(23.89, 2);
    expect(fahrenheitToCelsius(null)).toBeNull();
    expect(fahrenheitToCelsius(undefined)).toBeNull();
    expect(fahrenheitToCelsius(Number.NaN)).toBeNull();
  });

  it("diaryEntriesToGrowEventRows preserves timestamp + type", () => {
    const rows = diaryEntriesToGrowEventRows([
      { entry_at: ago(HOUR), entry_type: "watering", note: "200ml" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      occurred_at: expect.any(String),
      event_type: "watering",
      source: "manual",
      note: "200ml",
    });
  });

  it("manualSensorLogsToReadingRows tags rows as manual and converts temp", () => {
    const rows = manualSensorLogsToReadingRows([
      {
        capturedAt: ago(HOUR),
        source: "manual",
        metrics: { temp_f: 75, humidity_percent: 55, ph: 6.2, ec: 1.4 },
      },
    ]);
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.source).toBe("manual");
    }
    const temp = rows.find((r) => r.metric === "temperature_c");
    expect(temp?.value).toBeCloseTo(23.89, 2);
  });

  it("buildPlantAiDoctorContext returns compiler payload with manual sensor group only", () => {
    const ctx = buildPlantAiDoctorContext({
      plant: {
        id: "p1",
        name: "Plant A",
        strain: "Northern Lights",
        stage: "veg",
        grow_id: "g1",
        tent_id: "t1",
      },
      diaryEntries: [{ entry_at: ago(12 * HOUR), entry_type: "watering" }],
      manualSensorLogs: [
        {
          capturedAt: ago(2 * HOUR),
          source: "manual",
          metrics: { temp_f: 75, humidity_percent: 55, ph: null, ec: null },
        },
      ],
      now: NOW,
    });
    expect(ctx.plant_id).toBe("p1");
    expect(ctx.stage).toBe("veg");
    expect(ctx.source_tags).toContain("manual");
    expect(ctx.source_tags).not.toContain("live");
    expect(ctx.recent_grow_events.length).toBe(1);
  });

  it("recovers watering from details.event_type when entry_type is absent", () => {
    const rows = diaryEntriesToGrowEventRows([
      { entry_at: ago(HOUR), details: { event_type: "watering" }, note: "200ml" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe("watering");
  });

  it("keeps explicit entry_type over details.event_type", () => {
    const rows = diaryEntriesToGrowEventRows([
      {
        entry_at: ago(HOUR),
        entry_type: "observation",
        details: { event_type: "watering" },
      },
    ]);
    expect(rows[0].event_type).toBe("observation");
  });

  it("fails closed on unknown or malformed details.event_type", () => {
    expect(
      diaryEntriesToGrowEventRows([
        { entry_at: ago(HOUR), details: { event_type: "not-a-type" } },
      ])[0].event_type,
    ).toBe("diary_entry");
    expect(
      diaryEntriesToGrowEventRows([
        { entry_at: ago(HOUR), details: { event_type: ["watering"] } },
      ])[0].event_type,
    ).toBe("diary_entry");
    expect(
      diaryEntriesToGrowEventRows([{ entry_at: ago(HOUR), details: ["watering"] }])[0].event_type,
    ).toBe("diary_entry");
    expect(
      diaryEntriesToGrowEventRows([{ entry_at: ago(HOUR), details: null }])[0].event_type,
    ).toBe("diary_entry");
  });

  it("does not parse note text as event identity", () => {
    const rows = diaryEntriesToGrowEventRows([
      { entry_at: ago(HOUR), note: "watering 200ml", details: { event_type: "observation" } },
    ]);
    expect(rows[0].event_type).toBe("observation");
    expect(
      resolveCanonicalDiaryEventType({ details: { event_type: "watering" }, entryType: null }),
    ).toBe("watering");
    expect(
      resolveCanonicalDiaryEventType({ entryType: "feeding", details: { event_type: "watering" } }),
    ).toBe("feeding");
  });

  it("same-day watering from details increments readiness and never invents strain", () => {
    const ctx = buildPlantAiDoctorContext({
      plant: {
        id: "p1",
        name: "Plant A",
        stage: "veg",
        grow_id: "g1",
        tent_id: "t1",
      },
      diaryEntries: [{ entry_at: ago(HOUR), details: { event_type: "watering" }, note: "200ml" }],
      manualSensorLogs: [],
      now: NOW,
    });
    const view = buildTimelineEvidenceReadinessView(ctx);
    expect(view.counts.recentWatering).toBe(1);
    expect(view.missing.map((flag) => flag.code)).not.toContain("no_recent_watering");
    expect(ctx.strain == null || ctx.strain === "").toBe(true);
    expect(
      ctx.sensor_groups.every((group) => group.source !== "live" || group.sample_count === 0),
    ).toBe(true);
  });

  it("includes assigned-tent manual sensor_readings when plant diary snapshots are empty", () => {
    const capturedAt = ago(HOUR);
    const ctx = buildPlantAiDoctorContext({
      plant: {
        id: "p1",
        name: "Plant A",
        stage: "veg",
        grow_id: "g1",
        tent_id: "t1",
      },
      diaryEntries: [],
      manualSensorLogs: [],
      tentId: "t1",
      tentSensorRows: [
        {
          tent_id: "t1",
          source: "manual",
          quality: "ok",
          metric: "temp_f",
          value: 75,
          captured_at: capturedAt,
        },
        {
          tent_id: "t1",
          source: "manual",
          quality: "ok",
          metric: "humidity",
          value: 60,
          captured_at: capturedAt,
        },
        {
          tent_id: "t1",
          source: "manual",
          quality: "ok",
          metric: "vpd",
          value: 1,
          captured_at: capturedAt,
        },
      ],
      now: NOW,
    });
    expect(ctx.source_tags).toContain("manual");
    expect(ctx.source_tags).not.toContain("live");
    expect(ctx.sensor_groups.some((group) => group.sample_count > 0)).toBe(true);
  });

  it("maps remasure 76°F / 58% RH tent manuals into plant sensor audit context", () => {
    const capturedAt = ago(HOUR);
    const logs = tentManualSensorRowsToPlantSensorLogs(
      [
        {
          tent_id: "t1",
          source: "manual",
          quality: null,
          metric: "temp_f",
          value: 76,
          captured_at: capturedAt,
        },
        {
          tent_id: "t1",
          source: "manual",
          quality: null,
          metric: "humidity",
          value: 58,
          captured_at: capturedAt,
        },
      ],
      "t1",
    );
    const view = buildPlantSensorContextAuditView(logs, NOW);
    expect(view.status).not.toBe("missing");
    expect(view.message).not.toMatch(/No plant-level manual sensor snapshots found/);
    expect(view.latestCapturedAt).toBe(capturedAt);
    expect(view.metrics.map((metric) => metric.label)).toEqual(
      expect.arrayContaining(["Temperature", "Humidity"]),
    );
  });

  it("rejects stuck-extreme tent humidity instead of treating it as trusted context", () => {
    expect(
      tentManualSensorRowsToReadingRows(
        [
          {
            tent_id: "t1",
            source: "manual",
            quality: null,
            metric: "humidity",
            value: 100,
            captured_at: ago(HOUR),
          },
        ],
        "t1",
      ),
    ).toEqual([]);
  });

  it("rejects implausible tent temperatures instead of feeding them to the compiler", () => {
    const capturedAt = ago(HOUR);
    expect(
      tentManualSensorRowsToReadingRows(
        [
          {
            tent_id: "t1",
            source: "manual",
            quality: "ok",
            metric: "temperature_c",
            value: -100,
            captured_at: capturedAt,
          },
        ],
        "t1",
      ),
    ).toEqual([]);
    expect(
      tentManualSensorRowsToPlantSensorLogs(
        [
          {
            tent_id: "t1",
            source: "manual",
            quality: "ok",
            metric: "temperature_c",
            value: -100,
            captured_at: capturedAt,
          },
        ],
        "t1",
      ),
    ).toEqual([]);
  });

  it("projects CO2, soil moisture, and PPFD tent manuals into compiler readings", () => {
    const capturedAt = ago(HOUR);
    const rows = tentManualSensorRowsToReadingRows(
      [
        {
          tent_id: "t1",
          source: "manual",
          quality: "ok",
          metric: "co2",
          value: 800,
          captured_at: capturedAt,
        },
        {
          tent_id: "t1",
          source: "manual",
          quality: "ok",
          metric: "soil_moisture",
          value: 42,
          captured_at: capturedAt,
        },
        {
          tent_id: "t1",
          source: "manual",
          quality: "ok",
          metric: "ppfd",
          value: 600,
          captured_at: capturedAt,
        },
      ],
      "t1",
    );
    expect(rows.map((row) => row.metric).sort()).toEqual(["co2_ppm", "ppfd", "soil_moisture_pct"]);
    expect(rows.every((row) => row.source === "manual")).toBe(true);
  });

  it("does not emit an empty audit log for a VPD-only tent snapshot", () => {
    const capturedAt = ago(HOUR);
    const logs = tentManualSensorRowsToPlantSensorLogs(
      [
        {
          tent_id: "t1",
          source: "manual",
          quality: "ok",
          metric: "vpd_kpa",
          value: 1.1,
          captured_at: capturedAt,
        },
      ],
      "t1",
    );
    expect(logs).toHaveLength(1);
    expect((logs[0].metrics as Record<string, number>).vpd_kpa).toBe(1.1);
    const view = buildPlantSensorContextAuditView(logs, NOW);
    expect(view.status).not.toBe("missing");
    expect(view.metrics.map((metric) => metric.label)).toEqual(expect.arrayContaining(["VPD"]));
    expect(view.message).not.toMatch(/No plant-level manual sensor snapshots found/);
  });

  it("skips unmapped tent metrics instead of creating empty audit groups", () => {
    expect(
      tentManualSensorRowsToPlantSensorLogs(
        [
          {
            tent_id: "t1",
            source: "manual",
            quality: "ok",
            metric: "unknown_metric",
            value: 1,
            captured_at: ago(HOUR),
          },
        ],
        "t1",
      ),
    ).toEqual([]);
  });

  it("ignores tent manual rows from a different tent", () => {
    const ctx = buildPlantAiDoctorContext({
      plant: {
        id: "p1",
        name: "Plant A",
        stage: "veg",
        grow_id: "g1",
        tent_id: "t1",
      },
      diaryEntries: [],
      manualSensorLogs: [],
      tentId: "t1",
      tentSensorRows: [
        {
          tent_id: "other-tent",
          source: "manual",
          metric: "temp_f",
          value: 75,
          captured_at: ago(HOUR),
        },
      ],
      now: NOW,
    });
    expect(ctx.source_tags).not.toContain("manual");
  });

  it("static guard: adapter imports no Supabase/network/write helpers", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/plantAiDoctorContextAdapter.ts", "utf8");
    expect(src).not.toMatch(/integrations\/supabase/);
    expect(src).not.toMatch(/functions\s*\.\s*invoke/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/actionQueue/i);
    expect(src).not.toMatch(/\.rpc\s*\(/);
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
  });
});
