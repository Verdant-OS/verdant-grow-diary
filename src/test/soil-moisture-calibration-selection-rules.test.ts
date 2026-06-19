import { describe, expect, it } from "vitest";

import {
  selectSoilMoistureCalibration,
  type SoilMoistureCalibrationCandidate,
  type SoilMoistureCalibrationContext,
} from "@/lib/soilMoistureCalibrationSelectionRules";

const context: SoilMoistureCalibrationContext = {
  growId: "grow-1",
  tentId: "tent-1",
  plantId: "plant-1",
  deviceId: "device-1",
};

function calibration(
  patch: Partial<SoilMoistureCalibrationCandidate> = {},
): SoilMoistureCalibrationCandidate {
  return {
    id: "cal-1",
    growId: "grow-1",
    tentId: "tent-1",
    plantId: "plant-1",
    deviceId: "device-1",
    dryRaw: 300,
    wetRaw: 700,
    source: "manual",
    isActive: true,
    createdAt: "2026-06-19T08:00:00.000Z",
    ...patch,
  };
}

describe("selectSoilMoistureCalibration", () => {
  it("selects active calibration for same grow, tent, plant, and device", () => {
    const result = selectSoilMoistureCalibration(context, [calibration()]);

    expect(result.status).toBe("selected");
    expect(result.calibration?.id).toBe("cal-1");
    expect(result.matchScope).toBe("plant");
  });

  it("prefers plant-specific calibration over tent-level calibration", () => {
    const result = selectSoilMoistureCalibration(context, [
      calibration({
        id: "tent-level",
        plantId: null,
        deviceId: null,
        createdAt: "2026-06-19T09:00:00.000Z",
      }),
      calibration({
        id: "plant-specific",
        createdAt: "2026-06-19T08:00:00.000Z",
      }),
    ]);

    expect(result.status).toBe("selected");
    expect(result.calibration?.id).toBe("plant-specific");
  });

  it("rejects wrong grow", () => {
    const result = selectSoilMoistureCalibration(context, [calibration({ growId: "other-grow" })]);

    expect(result.status).toBe("not_applied");
    expect(result.reason).toBe("no_matching_calibration");
  });

  it("rejects wrong tent", () => {
    const result = selectSoilMoistureCalibration(context, [calibration({ tentId: "other-tent" })]);

    expect(result.status).toBe("not_applied");
    expect(result.reason).toBe("no_matching_calibration");
  });

  it("rejects wrong plant when plant-specific context is requested", () => {
    const result = selectSoilMoistureCalibration(context, [
      calibration({ plantId: "other-plant" }),
    ]);

    expect(result.status).toBe("not_applied");
    expect(result.reason).toBe("no_matching_calibration");
  });

  it("rejects wrong device when device-specific context is requested", () => {
    const result = selectSoilMoistureCalibration(context, [
      calibration({ deviceId: "other-device" }),
    ]);

    expect(result.status).toBe("not_applied");
    expect(result.reason).toBe("no_matching_calibration");
  });

  it("rejects inactive calibration", () => {
    const result = selectSoilMoistureCalibration(context, [calibration({ isActive: false })]);

    expect(result.status).toBe("not_applied");
    expect(result.reason).toBe("no_matching_calibration");
  });

  it("rejects invalid dry/wet baseline without falling back silently", () => {
    const result = selectSoilMoistureCalibration(context, [
      calibration({ id: "invalid-plant", dryRaw: 500, wetRaw: 500 }),
      calibration({ id: "valid-tent", plantId: null, deviceId: null }),
    ]);

    expect(result.status).toBe("unavailable");
    expect(result.reason).toBe("invalid_baseline");
    expect(result.calibration?.id).toBe("invalid-plant");
  });
});
