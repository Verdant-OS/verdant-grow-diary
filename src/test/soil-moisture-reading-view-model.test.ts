import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildSoilMoistureReadingViewModel,
  type SoilMoistureReadingViewModelInput,
} from "@/lib/soilMoistureReadingViewModel";

const baseInput: SoilMoistureReadingViewModelInput = {
  rawSoilMoisture: 45,
  rawSource: "manual",
  context: {
    growId: "grow-1",
    tentId: "tent-1",
    plantId: "plant-1",
    deviceId: "device-1",
  },
  calibrations: [
    {
      id: "cal-1",
      growId: "grow-1",
      tentId: "tent-1",
      plantId: "plant-1",
      deviceId: "device-1",
      dryRaw: 10,
      wetRaw: 77.3,
      source: "manual",
      isActive: true,
      createdAt: "2026-06-19T08:00:00.000Z",
    },
  ],
};

describe("buildSoilMoistureReadingViewModel", () => {
  it("preserves raw soil moisture when calibrated display is available", () => {
    const vm = buildSoilMoistureReadingViewModel(baseInput);

    expect(vm.rawValue).toBe(45);
    expect(vm.calibratedValue).toBe(52);
    expect(vm.primaryLine).toBe("Soil moisture: 52% calibrated");
  });

  it("labels calibrated value separately from raw value", () => {
    const vm = buildSoilMoistureReadingViewModel(baseInput);

    expect(vm.primaryValueKind).toBe("calibrated");
    expect(vm.rawLine).toBe("Raw reading: 45%");
    expect(vm.calibrationLine).toBe("Calibration: Manual dry/wet baseline · confidence limited");
    expect(vm.rawSourceLine).toBe("Raw source: manual");
    expect(vm.calibrationSourceLine).toBe("Calibration source: manual");
  });

  it("labels missing calibration as not applied and shows raw only", () => {
    const vm = buildSoilMoistureReadingViewModel({
      ...baseInput,
      calibrations: [],
    });

    expect(vm.rawValue).toBe(45);
    expect(vm.calibratedValue).toBeNull();
    expect(vm.primaryValueKind).toBe("raw");
    expect(vm.primaryLine).toBe("Soil moisture: 45% raw");
    expect(vm.calibrationLine).toBe("Calibration: Not applied");
    expect(vm.rawLine).toBeNull();
  });

  it("labels invalid calibration as unavailable and keeps raw display", () => {
    const vm = buildSoilMoistureReadingViewModel({
      ...baseInput,
      calibrations: [
        {
          ...baseInput.calibrations[0],
          dryRaw: 500,
          wetRaw: 500,
        },
      ],
    });

    expect(vm.rawValue).toBe(45);
    expect(vm.calibratedValue).toBeNull();
    expect(vm.primaryLine).toBe("Soil moisture: 45% raw");
    expect(vm.calibrationLine).toBe("Calibration unavailable — invalid baseline");
  });

  it("keeps demo source labeling visible and does not promote it to live", () => {
    const vm = buildSoilMoistureReadingViewModel({
      ...baseInput,
      rawSource: "demo",
      calibrations: [
        {
          ...baseInput.calibrations[0],
          source: "demo",
        },
      ],
    });

    expect(vm.rawSourceLine).toBe("Raw source: demo");
    expect(vm.calibrationLine).toBe("Calibration: Demo dry/wet baseline · confidence limited");
    expect(vm.calibrationSourceLine).toBe("Calibration source: demo");
  });

  it("keeps the read-only display slice free of action, alert, automation, and device-control writes", () => {
    const files = [
      "src/lib/soilMoistureCalibrationSelectionRules.ts",
      "src/lib/soilMoistureReadingViewModel.ts",
      "src/hooks/useSoilMoistureCalibrations.ts",
      "src/pages/Sensors.tsx",
    ];
    const source = files
      .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
      .join("\n");

    expect(source).not.toMatch(
      /\.from\(\s*["'](?:alerts|action_queue|sensor_readings)["']\s*\)\s*\.(?:insert|update|delete|upsert)\s*\(/i,
    );
    expect(source).not.toMatch(
      /\b(?:execute_device|setpoint_write|irrigation_control|light_control|fan_control|setInterval|cron)\b/i,
    );
  });
});
