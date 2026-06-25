/**
 * ggs-soil-sensor-snapshot-attach — Quick Log attach helper tests.
 */
import { describe, it, expect } from "vitest";
import { buildGgsSoilSnapshotAttachDraft } from "@/lib/ggsSoilSensorSnapshotAttach";
import type { GgsSoilReadingDraft } from "@/lib/ggsSoilSensorReadingNormalizer";

function liveDraft(over: Partial<GgsSoilReadingDraft> = {}): GgsSoilReadingDraft {
  return {
    provider: "spider_farmer_ggs",
    transport: "mqtt",
    source: "live",
    status: "accepted",
    confidence: "high",
    tent_id: "tent-1",
    plant_id: null,
    captured_at: "2026-06-17T11:59:30.000Z",
    received_at: "2026-06-17T12:00:00.000Z",
    readings: { soil_moisture_pct: 42, soil_temp_c: 22, ec: 1.5 },
    raw_payload: { soil_moisture: 42 },
    warnings: [],
    ...over,
  };
}

describe("buildGgsSoilSnapshotAttachDraft", () => {
  it("attaches a fresh live GGS reading", () => {
    const d = buildGgsSoilSnapshotAttachDraft(liveDraft(), { tentId: "tent-1" });
    expect(d.attachable).toBe(true);
    expect(d.blockedReason).toBeNull();
    expect(d.source).toBe("live");
    expect(d.readings.soil_moisture_pct).toBe(42);
    expect(d.attachLabel).toMatch(/attach/i);
  });

  it("propagates plant scope when caller provides it", () => {
    const d = buildGgsSoilSnapshotAttachDraft(liveDraft(), {
      tentId: "tent-1",
      plantId: "plant-9",
    });
    expect(d.attachable).toBe(true);
    expect(d.plant_id).toBe("plant-9");
  });

  it("blocks when no reading is available", () => {
    const d = buildGgsSoilSnapshotAttachDraft(null, { tentId: "tent-1" });
    expect(d.attachable).toBe(false);
    expect(d.blockedReason).toBe("no_reading");
  });

  it("blocks when tent scope does not match", () => {
    const d = buildGgsSoilSnapshotAttachDraft(liveDraft({ tent_id: "tent-2" }), {
      tentId: "tent-1",
    });
    expect(d.attachable).toBe(false);
    expect(d.blockedReason).toBe("tent_mismatch");
  });

  it("blocks when plant scope conflicts", () => {
    const d = buildGgsSoilSnapshotAttachDraft(liveDraft({ plant_id: "plant-a" }), {
      tentId: "tent-1",
      plantId: "plant-b",
    });
    expect(d.attachable).toBe(false);
    expect(d.blockedReason).toBe("plant_mismatch");
  });

  it("blocks and visibly marks stale readings", () => {
    const d = buildGgsSoilSnapshotAttachDraft(
      liveDraft({ source: "stale", status: "degraded", confidence: "low" }),
      { tentId: "tent-1" },
    );
    expect(d.attachable).toBe(false);
    expect(d.blockedReason).toBe("stale");
    expect(d.source).toBe("stale");
    expect(d.attachLabel).toMatch(/stale/i);
  });

  it("blocks and visibly marks invalid readings", () => {
    const d = buildGgsSoilSnapshotAttachDraft(
      liveDraft({ source: "invalid", status: "invalid" }),
      { tentId: "tent-1" },
    );
    expect(d.attachable).toBe(false);
    expect(d.blockedReason).toBe("invalid");
    expect(d.attachLabel).toMatch(/invalid/i);
  });

  it("manual reading uses a manual-specific attach label", () => {
    const d = buildGgsSoilSnapshotAttachDraft(
      liveDraft({ source: "manual", transport: "manual" }),
      { tentId: "tent-1" },
    );
    expect(d.attachable).toBe(true);
    expect(d.source).toBe("manual");
    expect(d.attachLabel).toMatch(/manual/i);
  });

  it("never invents missing metrics", () => {
    const d = buildGgsSoilSnapshotAttachDraft(
      liveDraft({ readings: { soil_moisture_pct: 30 } }),
      { tentId: "tent-1" },
    );
    expect(d.readings.soil_temp_c).toBeUndefined();
    expect(d.readings.ec).toBeUndefined();
  });
});
