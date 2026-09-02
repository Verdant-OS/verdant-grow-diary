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
  manualSensorLogsToReadingRows,
  fahrenheitToCelsius,
} from "@/lib/plantAiDoctorContextAdapter";
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
