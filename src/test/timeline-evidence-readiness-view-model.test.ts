/**
 * Pure tests for buildTimelineEvidenceReadinessView.
 *
 * Covers:
 *  - per-source labels and trust flags (live/manual/csv/demo/stale/invalid)
 *  - counts: logs, photos, sensor snapshots, watering, feeding, alerts
 *  - missing flags: photos, snapshots, watering, feeding, stage, medium, pot size
 *  - tone copy: ready / limited / untrusted
 *  - never re-labels demo/csv/manual as live; never marks them trustworthy
 *  - tainted extras are clamped, never leaked
 *  - never imports Supabase / fetch / AI helpers
 */
import { describe, it, expect } from "vitest";
import { compileAiDoctorContextFromRows } from "@/lib/aiDoctorEngine";
import {
  buildTimelineEvidenceReadinessView,
  READINESS_LIMITED_COPY,
  READINESS_READY_COPY,
  READINESS_UNTRUSTED_COPY,
} from "@/lib/timelineEvidenceReadinessViewModel";

const NOW = new Date("2026-06-10T12:00:00Z");
const HOUR = 3600 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const plant = {
  id: "p1",
  name: "Plant A",
  strain: "Northern Lights",
  stage: "veg" as const,
  grow_id: "g1",
  tent_id: "t1",
};

function makeCtx(opts: {
  growEvents?: ReadonlyArray<Record<string, unknown>>;
  sensorReadings?: ReadonlyArray<Record<string, unknown>>;
  stage?: string | null;
}) {
  return compileAiDoctorContextFromRows({
    plant: { ...plant, stage: ("stage" in opts ? opts.stage : plant.stage) as never },
    growEvents: opts.growEvents ?? [],
    sensorReadings: opts.sensorReadings ?? [],
    now: NOW,
  });
}

describe("timelineEvidenceReadinessViewModel — counts", () => {
  it("counts logs, watering, feeding, snapshots from compiled context", () => {
    const ctx = makeCtx({
      growEvents: [
        { occurred_at: ago(2 * HOUR), event_type: "watering", source: "manual" },
        { occurred_at: ago(3 * HOUR), event_type: "watering", source: "manual" },
        { occurred_at: ago(4 * HOUR), event_type: "feeding", source: "manual" },
        { occurred_at: ago(5 * HOUR), event_type: "observation", source: "manual" },
      ],
      sensorReadings: [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" },
        { metric: "humidity_pct", value: 55, captured_at: ago(HOUR), source: "live" },
      ],
    });
    const v = buildTimelineEvidenceReadinessView(ctx, {
      recentPhotoCount: 3,
      openAlertsCount: 1,
    });
    expect(v.counts.recentLogs).toBe(4);
    expect(v.counts.recentWatering).toBe(2);
    expect(v.counts.recentFeeding).toBe(1);
    expect(v.counts.recentPhotos).toBe(3);
    expect(v.counts.openAlerts).toBe(1);
    expect(v.counts.recentSensorSnapshots).toBeGreaterThan(0);
  });

  it("clamps negative / non-finite extras to 0 — never invents data", () => {
    const ctx = makeCtx({});
    const v = buildTimelineEvidenceReadinessView(ctx, {
      recentPhotoCount: -5,
      openAlertsCount: Number.NaN,
    });
    expect(v.counts.recentPhotos).toBe(0);
    expect(v.counts.openAlerts).toBe(0);
  });
});

describe("timelineEvidenceReadinessViewModel — missing flags", () => {
  it("flags missing photos / snapshot / watering / feeding when absent", () => {
    const ctx = makeCtx({});
    const v = buildTimelineEvidenceReadinessView(ctx, {});
    const codes = v.missing.map((m) => m.code);
    expect(codes).toContain("no_recent_photos");
    expect(codes).toContain("no_recent_sensor_snapshot");
    expect(codes).toContain("no_recent_watering");
    expect(codes).toContain("no_recent_feeding");
  });

  it("flags unknown stage, medium, pot size when caller marks them unknown", () => {
    const ctx = makeCtx({ stage: null });
    const v = buildTimelineEvidenceReadinessView(ctx, {
      mediumKnown: false,
      potSizeKnown: false,
    });
    const codes = v.missing.map((m) => m.code);
    expect(codes).toContain("unknown_stage");
    expect(codes).toContain("unknown_medium");
    expect(codes).toContain("unknown_pot_size");
  });

  it("does NOT flag medium/pot size when caller says known", () => {
    const ctx = makeCtx({});
    const v = buildTimelineEvidenceReadinessView(ctx, {
      mediumKnown: true,
      potSizeKnown: true,
    });
    const codes = v.missing.map((m) => m.code);
    expect(codes).not.toContain("unknown_medium");
    expect(codes).not.toContain("unknown_pot_size");
  });
});

describe("timelineEvidenceReadinessViewModel — source badges & tone", () => {
  it("ready tone with strong context (live sensor + logs + photo)", () => {
    const ctx = makeCtx({
      growEvents: [
        { occurred_at: ago(2 * HOUR), event_type: "watering", source: "manual" },
        { occurred_at: ago(3 * HOUR), event_type: "feeding", source: "manual" },
      ],
      sensorReadings: [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" },
      ],
    });
    const v = buildTimelineEvidenceReadinessView(ctx, { recentPhotoCount: 2 });
    expect(v.tone).toBe("ready");
    expect(v.headline).toBe(READINESS_READY_COPY);
    expect(v.hasTrustworthySensorSource).toBe(true);
  });

  it("limited tone when context is thin but not untrusted", () => {
    const ctx = makeCtx({
      growEvents: [
        { occurred_at: ago(2 * HOUR), event_type: "watering", source: "manual" },
      ],
      sensorReadings: [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "manual" },
      ],
    });
    const v = buildTimelineEvidenceReadinessView(ctx, { recentPhotoCount: 0 });
    expect(v.tone).toBe("limited");
    expect(v.headline).toBe(READINESS_LIMITED_COPY);
  });

  it("untrusted tone when any sensor group is csv/demo/stale/invalid", () => {
    const ctx = makeCtx({
      sensorReadings: [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "demo" },
      ],
    });
    const v = buildTimelineEvidenceReadinessView(ctx, {});
    expect(v.tone).toBe("untrusted");
    expect(v.headline).toBe(READINESS_UNTRUSTED_COPY);
    expect(v.hasUntrustedSensorSource).toBe(true);
  });

  it("demo / csv / stale / invalid sources never labeled live and never trustworthy", () => {
    for (const src of ["demo", "csv", "stale", "invalid"] as const) {
      const ctx = makeCtx({
        sensorReadings: [
          { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: src },
        ],
      });
      const v = buildTimelineEvidenceReadinessView(ctx, {});
      const badge = v.sourceBadges.find((b) => b.source === src);
      expect(badge).toBeTruthy();
      expect(badge?.label.toLowerCase()).not.toBe("live");
      expect(badge?.trustworthy).toBe(false);
    }
  });

  it("manual + live sources are trustworthy and keep canonical labels", () => {
    const ctx = makeCtx({
      sensorReadings: [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" },
        { metric: "humidity_pct", value: 55, captured_at: ago(HOUR), source: "manual" },
      ],
    });
    const v = buildTimelineEvidenceReadinessView(ctx, {});
    expect(v.sourceBadges.find((b) => b.source === "live")?.trustworthy).toBe(true);
    expect(v.sourceBadges.find((b) => b.source === "live")?.label).toBe("Live");
    expect(v.sourceBadges.find((b) => b.source === "manual")?.trustworthy).toBe(true);
    expect(v.sourceBadges.find((b) => b.source === "manual")?.label).toBe("Manual");
  });

  it("untrusted tone wins when both trustworthy and untrusted sources exist", () => {
    const ctx = makeCtx({
      growEvents: [
        { occurred_at: ago(HOUR), event_type: "watering", source: "manual" },
      ],
      sensorReadings: [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" },
        { metric: "humidity_pct", value: 55, captured_at: ago(HOUR), source: "demo" },
      ],
    });
    const v = buildTimelineEvidenceReadinessView(ctx, { recentPhotoCount: 1 });
    expect(v.tone).toBe("untrusted");
    expect(v.headline).toBe(READINESS_UNTRUSTED_COPY);
  });
});

describe("timelineEvidenceReadinessViewModel — safety", () => {
  it("ignores unknown extras and never returns raw payload fields", () => {
    const ctx = makeCtx({
      sensorReadings: [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "manual" },
      ],
    });
    const v = buildTimelineEvidenceReadinessView(ctx, {
      recentPhotoCount: 1,
      // extra junk that must never appear in output
      ...({ raw_payload: { token: "SECRET" }, private_id: "user-x" } as Record<string, unknown>),
    } as never);
    const json = JSON.stringify(v);
    expect(json).not.toMatch(/raw_payload/i);
    expect(json).not.toMatch(/SECRET/);
    expect(json).not.toMatch(/private_id/i);
    expect(json).not.toMatch(/user-x/);
  });
});
