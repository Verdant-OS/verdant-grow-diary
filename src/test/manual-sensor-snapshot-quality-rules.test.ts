import { describe, expect, it } from "vitest";
import {
  evaluateManualSensorSnapshotQuality,
  MANUAL_SNAPSHOT_CURRENT_STALE_HOURS,
} from "@/lib/manualSensorSnapshotQualityRules";

const NOW = Date.parse("2026-06-15T12:00:00.000Z");
const recent = new Date(NOW - 60 * 60 * 1000).toISOString(); // 1h ago

const valid = {
  temperature_c: 24,
  humidity_pct: 55,
  vpd_kpa: 1.1,
  soil_temp_c: 22,
  soil_moisture_pct: 45,
  soil_ec_mscm: 2.0,
  ph: 6.2,
  captured_at: recent,
};

describe("evaluateManualSensorSnapshotQuality", () => {
  it("valid manual reading is usable and supports AI Doctor current context", () => {
    const r = evaluateManualSensorSnapshotQuality(
      { ...valid, source: "manual" },
      { nowMs: NOW },
    );
    expect(r.quality).toBe("usable");
    expect(r.sourceLabel).toBe("manual");
    expect(r.canSupportAiDoctorCurrentContext).toBe(true);
    expect(r.canSupportActionSuggestionPreview).toBe(true);
    expect(r.invalidFields).toEqual([]);
  });

  it("valid live reading supports Action Queue preview", () => {
    const r = evaluateManualSensorSnapshotQuality(
      { ...valid, source: "live" },
      { nowMs: NOW },
    );
    expect(r.quality).toBe("usable");
    expect(r.canSupportActionSuggestionPreview).toBe(true);
  });

  it("csv reading is history-only and cannot support current decisions", () => {
    const r = evaluateManualSensorSnapshotQuality(
      { ...valid, source: "csv" },
      { nowMs: NOW },
    );
    expect(r.quality).toBe("needs_review");
    expect(r.sourceLabel).toBe("csv");
    expect(r.canSupportAiDoctorCurrentContext).toBe(false);
    expect(r.canSupportActionSuggestionPreview).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/CSV history only/i);
  });

  it("demo reading cannot support current-room decision", () => {
    const r = evaluateManualSensorSnapshotQuality(
      { ...valid, source: "demo" },
      { nowMs: NOW },
    );
    expect(r.canSupportAiDoctorCurrentContext).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/Demo/);
  });

  it("stale source label cannot support current-room decision", () => {
    const r = evaluateManualSensorSnapshotQuality(
      { ...valid, source: "stale" },
      { nowMs: NOW },
    );
    expect(r.canSupportAiDoctorCurrentContext).toBe(false);
  });

  it("unknown source never returns usable", () => {
    const r = evaluateManualSensorSnapshotQuality(
      { ...valid, source: "weirdvendor" },
      { nowMs: NOW },
    );
    expect(r.sourceLabel).toBe("unknown");
    expect(r.quality).not.toBe("usable");
    expect(r.canSupportAiDoctorCurrentContext).toBe(false);
  });

  it("suspicious EC magnitude is flagged invalid", () => {
    const r = evaluateManualSensorSnapshotQuality(
      { ...valid, source: "manual", soil_ec_mscm: 1500 },
      { nowMs: NOW },
    );
    expect(r.quality).toBe("invalid");
    expect(r.invalidFields).toContain("soil_ec_mscm");
  });

  it("humidity stuck at 0 or 100 is flagged invalid", () => {
    const r0 = evaluateManualSensorSnapshotQuality(
      { ...valid, source: "manual", humidity_pct: 0 },
      { nowMs: NOW },
    );
    const r100 = evaluateManualSensorSnapshotQuality(
      { ...valid, source: "manual", humidity_pct: 100 },
      { nowMs: NOW },
    );
    expect(r0.quality).toBe("invalid");
    expect(r100.quality).toBe("invalid");
    expect(r0.invalidFields).toContain("humidity_pct");
  });

  it("pH out of realistic range is flagged invalid", () => {
    const r = evaluateManualSensorSnapshotQuality(
      { ...valid, source: "manual", ph: 12 },
      { nowMs: NOW },
    );
    expect(r.quality).toBe("invalid");
    expect(r.invalidFields).toContain("ph");
  });

  it("missing captured_at is flagged missing", () => {
    const r = evaluateManualSensorSnapshotQuality(
      { ...valid, source: "manual", captured_at: null },
      { nowMs: NOW },
    );
    expect(r.quality).toBe("missing");
    expect(r.missingFields).toContain("captured_at");
    expect(r.canSupportAiDoctorCurrentContext).toBe(false);
  });

  it("stale timestamp (older than threshold) is flagged needs_review", () => {
    const old = new Date(
      NOW - (MANUAL_SNAPSHOT_CURRENT_STALE_HOURS + 2) * 60 * 60 * 1000,
    ).toISOString();
    const r = evaluateManualSensorSnapshotQuality(
      { ...valid, source: "manual", captured_at: old },
      { nowMs: NOW },
    );
    expect(r.quality).toBe("needs_review");
    expect(r.canSupportAiDoctorCurrentContext).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/older than/i);
  });

  it("null/undefined input resolves to missing deterministically", () => {
    const a = evaluateManualSensorSnapshotQuality(null, { nowMs: NOW });
    const b = evaluateManualSensorSnapshotQuality(undefined, { nowMs: NOW });
    expect(a.quality).toBe("missing");
    expect(b.quality).toBe("missing");
    expect(a.summary).toBe(b.summary);
  });

  it("output is deterministic for same input", () => {
    const a = evaluateManualSensorSnapshotQuality(
      { ...valid, source: "manual" },
      { nowMs: NOW },
    );
    const b = evaluateManualSensorSnapshotQuality(
      { ...valid, source: "manual" },
      { nowMs: NOW },
    );
    expect(a).toEqual(b);
  });
});
