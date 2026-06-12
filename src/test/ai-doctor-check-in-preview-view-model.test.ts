/**
 * Unit tests for buildAiDoctorCheckInPreviewView.
 */
import { describe, it, expect } from "vitest";
import { compileAiDoctorContextFromRows } from "@/lib/aiDoctorEngine";
import {
  AI_DOCTOR_CHECK_IN_NO_MODEL_NOTICE,
  AI_DOCTOR_CHECK_IN_PREVIEW_NOTICE,
  buildAiDoctorCheckInPreviewView,
} from "@/lib/aiDoctorCheckInPreviewViewModel";

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

function ctx(
  growEvents: ReadonlyArray<Record<string, unknown>>,
  sensorReadings: ReadonlyArray<Record<string, unknown>>,
) {
  return compileAiDoctorContextFromRows({
    plant,
    growEvents,
    sensorReadings,
    now: NOW,
  });
}

describe("buildAiDoctorCheckInPreviewView", () => {
  it("always exposes preview-only + no-model notices", () => {
    const v = buildAiDoctorCheckInPreviewView(
      ctx(
        [{ occurred_at: ago(HOUR), event_type: "watering", source: "manual" }],
        [{ metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" }],
      ),
    );
    expect(v.notices.previewOnly).toBe(AI_DOCTOR_CHECK_IN_PREVIEW_NOTICE);
    expect(v.notices.noModelCalled).toBe(AI_DOCTOR_CHECK_IN_NO_MODEL_NOTICE);
  });

  it("marks context as weak and emphasizes missing info when no sensors", () => {
    const v = buildAiDoctorCheckInPreviewView(ctx([], []));
    expect(v.contextWeak).toBe(true);
    expect(v.confidenceBand).toBe("low");
    expect(v.missingInformation.length).toBeGreaterThan(0);
    expect(v.limitations.some((l) => l.code === "no_sensors")).toBe(true);
  });

  it("flags stale/invalid telemetry as a limitation", () => {
    const v = buildAiDoctorCheckInPreviewView(
      ctx(
        [],
        [
          { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live", quality: "stale" },
          { metric: "humidity_pct", value: 55, captured_at: ago(HOUR), source: "live", quality: "invalid" },
        ],
      ),
    );
    expect(v.limitations.some((l) => l.code === "stale_or_invalid")).toBe(true);
  });

  it("labels demo-only telemetry as demo-only, not live", () => {
    const v = buildAiDoctorCheckInPreviewView(
      ctx(
        [],
        [{ metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "demo" }],
      ),
    );
    expect(v.limitations.some((l) => l.code === "demo_only")).toBe(true);
  });

  it("is deterministic for the same context", () => {
    const c = ctx(
      [{ occurred_at: ago(HOUR), event_type: "watering", source: "manual" }],
      [{ metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" }],
    );
    const a = buildAiDoctorCheckInPreviewView(c);
    const b = buildAiDoctorCheckInPreviewView(c);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("static guard: view-model source has no write/model/API imports", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      "src/lib/aiDoctorCheckInPreviewViewModel.ts",
      "utf8",
    );
    expect(src).not.toMatch(/integrations\/supabase/);
    expect(src).not.toMatch(/functions\s*\.\s*invoke/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/actionQueue(Writer|Insert|Create|Mutation|Append)/i);
    expect(src).not.toMatch(/\.rpc\s*\(/);
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
    expect(src).not.toMatch(/createAlert|insertAlert/);
    expect(src).not.toMatch(/openai|anthropic|gemini|model\.invoke/i);
  });
});
