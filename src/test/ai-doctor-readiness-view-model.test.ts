/**
 * View-model tests for buildAiDoctorReadinessView.
 *
 * Pure unit tests — verify state classification, source labeling,
 * limitations, and that the preview embeds the deterministic Phase 1
 * engine output (no model/network calls).
 */
import { describe, it, expect } from "vitest";
import {
  buildAiDoctorReadinessView,
  AI_DOCTOR_READINESS_STATE_LABELS,
  AI_DOCTOR_PREVIEW_NOTICE,
} from "@/lib/aiDoctorReadinessViewModel";
import { compileAiDoctorContextFromRows } from "@/lib/aiDoctorEngine";

const NOW = new Date("2026-06-10T12:00:00Z");
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
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
}) {
  return compileAiDoctorContextFromRows({
    plant,
    growEvents: opts.growEvents ?? [],
    sensorReadings: opts.sensorReadings ?? [],
    now: NOW,
  });
}

describe("aiDoctorReadinessViewModel", () => {
  it("renders 'ready' when trustworthy live sensor + recent logs exist", () => {
    const context = makeCtx({
      growEvents: [
        { occurred_at: ago(12 * HOUR), event_type: "watering", source: "manual" },
      ],
      sensorReadings: [
        { metric: "temperature_c", value: 24, captured_at: ago(2 * HOUR), source: "live" },
        { metric: "humidity_pct", value: 55, captured_at: ago(2 * HOUR), source: "live" },
      ],
    });
    const v = buildAiDoctorReadinessView({ context, openAlertsCount: 0 });
    expect(v.state).toBe("ready");
    expect(v.stateLabel).toBe(AI_DOCTOR_READINESS_STATE_LABELS.ready);
    expect(v.sourceBadges.find((b) => b.source === "live")?.isTrustworthy).toBe(true);
  });

  it("renders 'sensor_missing' when no sensor groups exist", () => {
    const context = makeCtx({});
    const v = buildAiDoctorReadinessView({ context });
    expect(v.state).toBe("sensor_missing");
    expect(v.stateLabel).toBe("Sensor data missing");
    expect(
      v.limitations.some((l) => l.code === "no_sensors"),
    ).toBe(true);
  });

  it("renders stale/invalid telemetry as a limitation, not as healthy", () => {
    const context = makeCtx({
      sensorReadings: [
        { metric: "temperature_c", value: 24, captured_at: ago(3 * HOUR), source: "live", quality: "stale" },
        { metric: "humidity_pct", value: 55, captured_at: ago(3 * HOUR), source: "live", quality: "invalid" },
      ],
    });
    const v = buildAiDoctorReadinessView({ context });
    expect(v.state).toBe("telemetry_limited");
    expect(v.limitations.some((l) => l.code === "stale_or_invalid")).toBe(true);
    // No live trustworthy bucket
    expect(v.sourceBadges.every((b) => !b.isTrustworthy)).toBe(true);
  });

  it("renders demo-only data as demo_only, never live", () => {
    const context = makeCtx({
      sensorReadings: [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "demo" },
      ],
    });
    const v = buildAiDoctorReadinessView({ context });
    expect(v.state).toBe("demo_only");
    expect(v.stateLabel).toBe("Demo data only");
    const demo = v.sourceBadges.find((b) => b.source === "demo");
    expect(demo?.label).toBe("Demo");
    expect(demo?.isTrustworthy).toBe(false);
    expect(v.sourceBadges.find((b) => b.source === "live")).toBeUndefined();
  });

  it("labels manual and CSV sources correctly", () => {
    const context = makeCtx({
      sensorReadings: [
        { metric: "temperature_c", value: 23, captured_at: ago(HOUR), source: "manual" },
        { metric: "humidity_pct", value: 50, captured_at: ago(2 * HOUR), source: "csv" },
      ],
    });
    const v = buildAiDoctorReadinessView({ context });
    expect(v.sourceBadges.find((b) => b.source === "manual")?.label).toBe("Manual");
    expect(v.sourceBadges.find((b) => b.source === "csv")?.label).toBe("CSV / imported");
  });

  it("preview is labeled 'Preview only — not saved.' and is deterministic", () => {
    const context = makeCtx({
      sensorReadings: [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" },
      ],
    });
    const a = buildAiDoctorReadinessView({ context });
    const b = buildAiDoctorReadinessView({ context });
    expect(a.preview.notice).toBe(AI_DOCTOR_PREVIEW_NOTICE);
    expect(a.preview).toEqual(b.preview);
  });

  it("static guard: view-model source file imports no write/network helpers", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/aiDoctorReadinessViewModel.ts", "utf8");
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
