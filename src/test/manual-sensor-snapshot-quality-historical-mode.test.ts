/**
 * Historical mode for evaluateManualSensorSnapshotQuality.
 *
 * Hard guarantees:
 *  - Old-but-valid captured readings are NOT marked stale/invalid by time.
 *  - Historical mode never claims current AI Doctor / Action Queue support.
 *  - Suspicious values (humidity stuck, EC unit mismatch, pH out of range)
 *    still classify as invalid/needs-review.
 *  - Historical summary copy is grower-clear and not current-room.
 *  - Current mode (default) behavior is preserved.
 */
import { describe, expect, it } from "vitest";
import { evaluateManualSensorSnapshotQuality } from "@/lib/manualSensorSnapshotQualityRules";

const NOW = Date.parse("2026-06-15T12:00:00.000Z");
const oldTs = new Date(NOW - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7d ago

describe("evaluateManualSensorSnapshotQuality — historical mode", () => {
  it("old-but-valid manual reading is historical-usable, not stale", () => {
    const r = evaluateManualSensorSnapshotQuality(
      {
        source: "manual",
        captured_at: oldTs,
        temperature_c: 24,
        humidity_pct: 55,
      },
      { nowMs: NOW, mode: "historical" },
    );
    expect(r.quality).toBe("usable");
    expect(r.summary).toBe("Historical review reading");
    expect(r.reasons.some((x) => /older than/i.test(x))).toBe(false);
    expect(r.canSupportAiDoctorCurrentContext).toBe(false);
    expect(r.canSupportActionSuggestionPreview).toBe(false);
    expect(r.reasons.some((x) => /Not current-room guidance/i.test(x))).toBe(true);
  });

  it("suspicious humidity still flags invalid in historical mode", () => {
    const r = evaluateManualSensorSnapshotQuality(
      {
        source: "manual",
        captured_at: oldTs,
        humidity_pct: 100,
      },
      { nowMs: NOW, mode: "historical" },
    );
    expect(r.quality).toBe("invalid");
    expect(r.summary).toBe("Historical invalid reading — review before use");
    expect(r.canSupportAiDoctorCurrentContext).toBe(false);
  });

  it("EC unit mismatch still flags invalid in historical mode", () => {
    const r = evaluateManualSensorSnapshotQuality(
      { source: "manual", captured_at: oldTs, soil_ec_mscm: 1500 },
      { nowMs: NOW, mode: "historical" },
    );
    expect(r.quality).toBe("invalid");
    expect(r.invalidFields).toContain("soil_ec_mscm");
  });

  it("pH out of range flags invalid in historical mode", () => {
    const r = evaluateManualSensorSnapshotQuality(
      { source: "manual", captured_at: oldTs, ph: 13 },
      { nowMs: NOW, mode: "historical" },
    );
    expect(r.quality).toBe("invalid");
    expect(r.summary).toBe("Historical invalid reading");
  });

  it("CSV-source historical reading is needs_review and not current-room", () => {
    const r = evaluateManualSensorSnapshotQuality(
      { source: "csv", captured_at: oldTs, temperature_c: 24, humidity_pct: 55 },
      { nowMs: NOW, mode: "historical" },
    );
    expect(r.quality).toBe("needs_review");
    expect(r.summary).toBe("Historical reading needs review");
    expect(r.canSupportAiDoctorCurrentContext).toBe(false);
  });

  it("current mode default is preserved when option omitted", () => {
    const r = evaluateManualSensorSnapshotQuality(
      { source: "manual", captured_at: oldTs, temperature_c: 24, humidity_pct: 55 },
      { nowMs: NOW },
    );
    // 7d ago → stale in current mode
    expect(r.quality).toBe("needs_review");
    expect(r.summary).toBe("Needs review");
    expect(r.canSupportAiDoctorCurrentContext).toBe(false);
  });
});
