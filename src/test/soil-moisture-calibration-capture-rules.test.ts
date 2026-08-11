/**
 * Pure tests for manual dry/wet soil moisture calibration capture.
 */
import { describe, expect, it } from "vitest";
import {
  SOIL_MOISTURE_CALIBRATION_CAPTURE_CAVEAT,
  parseCalibrationRawPoint,
  validateSoilMoistureCalibrationCapture,
} from "@/lib/soilMoistureCalibrationCaptureRules";

const GROW = "11111111-1111-4111-8111-111111111111";
const TENT = "22222222-2222-4222-8222-222222222222";

describe("parseCalibrationRawPoint", () => {
  it("parses numbers and numeric strings", () => {
    expect(parseCalibrationRawPoint(12.5)).toEqual({ ok: true, value: 12.5 });
    expect(parseCalibrationRawPoint("88")).toEqual({ ok: true, value: 88 });
    expect(parseCalibrationRawPoint("").ok).toBe(false);
    expect(parseCalibrationRawPoint(Number.NaN).ok).toBe(false);
  });
});

describe("validateSoilMoistureCalibrationCapture", () => {
  it("requires grow and tent UUIDs plus distinct dry/wet", () => {
    const bad = validateSoilMoistureCalibrationCapture({
      growId: null,
      tentId: TENT,
      dryRaw: 10,
      wetRaw: 80,
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors.growId).toBe("required");

    const identical = validateSoilMoistureCalibrationCapture({
      growId: GROW,
      tentId: TENT,
      dryRaw: 50,
      wetRaw: 50,
    });
    expect(identical.ok).toBe(false);
    expect(identical.errors.dryRaw).toBe("identical_points");
  });

  it("builds a manual active insert payload", () => {
    const ok = validateSoilMoistureCalibrationCapture({
      growId: GROW,
      tentId: TENT,
      dryRaw: "12",
      wetRaw: "90.5",
      notes: " coco 5cm ",
    });
    expect(ok.ok).toBe(true);
    expect(ok.payload).toEqual({
      grow_id: GROW,
      tent_id: TENT,
      plant_id: null,
      device_id: null,
      dry_raw: 12,
      wet_raw: 90.5,
      source: "manual",
      is_active: true,
      notes: "coco 5cm",
      label: "Manual dry/wet baseline",
    });
  });

  it("keeps caveat free of irrigation / factory-live claims", () => {
    const c = SOIL_MOISTURE_CALIBRATION_CAPTURE_CAVEAT.toLowerCase();
    expect(c).toMatch(/display only/);
    expect(c).toMatch(/not a manufacturer curve/);
    expect(c).not.toMatch(/water now/);
    expect(c).not.toMatch(/should water/);
  });
});
