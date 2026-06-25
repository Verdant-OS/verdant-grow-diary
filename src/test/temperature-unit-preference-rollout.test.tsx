/**
 * Temperature unit preference rollout — verifies the centralized
 * preference flows through every primary temperature render surface.
 *
 * Pure tests. No Supabase, no AI, no Action Queue, no network.
 * Display-only. Never asserts any change to stored values.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";

import {
  saveTemperatureUnitPreference,
  clearTemperatureUnitPreference,
  formatTemperatureDisplay,
  getTemperatureUnitSymbol,
  convertCelsiusForDisplay,
} from "@/lib/temperatureUnitPreference";
import {
  formatSensorValue,
  sensorFieldUnit,
} from "@/lib/sensorFormat";
import { applyTemperatureUnitToSnapshotMetrics } from "@/lib/sensorSnapshotTemperatureUnitView";
import SensorSnapshotCard from "@/components/SensorSnapshotCard";

beforeEach(() => {
  clearTemperatureUnitPreference();
});

describe("sensorFormat honors temperature preference (default Fahrenheit)", () => {
  it("defaults to °F when nothing is saved (parity with prior behavior)", () => {
    expect(formatSensorValue("air_temp_c", 24.345)).toBe("75.8 °F");
    expect(formatSensorValue("soil_temp_c", 20)).toBe("68.0 °F");
    expect(sensorFieldUnit("air_temp_c")).toBe("°F");
    expect(sensorFieldUnit("soil_temp_c")).toBe("°F");
  });

  it("switches to °C when preference is celsius", () => {
    saveTemperatureUnitPreference("celsius");
    expect(formatSensorValue("air_temp_c", 24.345)).toBe("24.3 °C");
    expect(formatSensorValue("soil_temp_c", 20)).toBe("20.0 °C");
    expect(sensorFieldUnit("air_temp_c")).toBe("°C");
    expect(sensorFieldUnit("soil_temp_c")).toBe("°C");
  });

  it("leaves non-temperature fields untouched in either preference", () => {
    for (const unit of ["fahrenheit", "celsius"] as const) {
      saveTemperatureUnitPreference(unit);
      expect(formatSensorValue("vpd_kpa", 1.16432)).toBe("1.16 kPa");
      expect(formatSensorValue("humidity_pct", 55)).toBe("55.0 %");
      expect(formatSensorValue("reservoir_ec_mscm", 1.85)).toBe("1.85 mS/cm");
      expect(formatSensorValue("reservoir_ph", 6.12)).toBe("6.12 pH");
      expect(formatSensorValue("ppfd", 700)).toBe("700 µmol");
      expect(formatSensorValue("co2_ppm", 800)).toBe("800 ppm");
    }
  });

  it("preserves '—' on missing/invalid input under either preference", () => {
    for (const unit of ["fahrenheit", "celsius"] as const) {
      saveTemperatureUnitPreference(unit);
      expect(formatSensorValue("air_temp_c", null)).toBe("—");
      expect(formatSensorValue("air_temp_c", undefined)).toBe("—");
      expect(formatSensorValue("air_temp_c", Number.NaN)).toBe("—");
      expect(formatSensorValue("soil_temp_c", Number.POSITIVE_INFINITY)).toBe("—");
    }
  });

  it("never double-converts: F→C→F is exact", () => {
    saveTemperatureUnitPreference("fahrenheit");
    const f = formatSensorValue("air_temp_c", 20); // 68.0 °F
    saveTemperatureUnitPreference("celsius");
    const c = formatSensorValue("air_temp_c", 20); // 20.0 °C
    expect(f).toBe("68.0 °F");
    expect(c).toBe("20.0 °C");
  });
});

describe("snapshot temperature unit view (pure helper)", () => {
  it("converts °C metric → °F when preference is fahrenheit (default)", () => {
    const out = applyTemperatureUnitToSnapshotMetrics([
      { key: "temp", display: "24.3", unit: "°C" },
    ]);
    expect(out[0]).toEqual({ key: "temp", display: "75.7", unit: "°F" });
  });

  it("keeps °C when preference is celsius", () => {
    saveTemperatureUnitPreference("celsius");
    const out = applyTemperatureUnitToSnapshotMetrics([
      { key: "temp", display: "24.3", unit: "°C" },
    ]);
    expect(out[0]).toEqual({ key: "temp", display: "24.3", unit: "°C" });
  });

  it("F input + celsius preference converts back to °C exactly once", () => {
    saveTemperatureUnitPreference("celsius");
    const out = applyTemperatureUnitToSnapshotMetrics([
      { key: "temp", display: "68", unit: "°F" },
    ]);
    expect(out[0].unit).toBe("°C");
    expect(Number(out[0].display)).toBeCloseTo(20, 5);
  });

  it("F input + fahrenheit preference is a no-op (no double convert)", () => {
    const out = applyTemperatureUnitToSnapshotMetrics([
      { key: "temp", display: "68.0", unit: "°F" },
    ]);
    expect(out[0]).toEqual({ key: "temp", display: "68.0", unit: "°F" });
  });

  it("never touches non-temperature metrics", () => {
    saveTemperatureUnitPreference("celsius");
    const out = applyTemperatureUnitToSnapshotMetrics([
      { key: "rh", display: "55.0", unit: "%" },
      { key: "vpd", display: "1.16", unit: "kPa" },
      { key: "ec", display: "1.85", unit: "mS/cm" },
      { key: "ph", display: "6.12", unit: "pH" },
    ]);
    expect(out).toEqual([
      { key: "rh", display: "55.0", unit: "%" },
      { key: "vpd", display: "1.16", unit: "kPa" },
      { key: "ec", display: "1.85", unit: "mS/cm" },
      { key: "ph", display: "6.12", unit: "pH" },
    ]);
  });

  it("does not treat soil-moisture (%) as a temperature metric", () => {
    saveTemperatureUnitPreference("celsius");
    const out = applyTemperatureUnitToSnapshotMetrics([
      { key: "soil", display: "42.0", unit: "%" },
    ]);
    expect(out[0]).toEqual({ key: "soil", display: "42.0", unit: "%" });
  });

  it("preserves null displays and unknown-unit metrics", () => {
    saveTemperatureUnitPreference("celsius");
    const out = applyTemperatureUnitToSnapshotMetrics([
      { key: "temp", display: null, unit: "°C" },
      { key: "temp", display: "24.3", unit: null },
      { key: "temp", display: "24.3", unit: "K" },
    ]);
    expect(out[0]).toEqual({ key: "temp", display: null, unit: "°C" });
    expect(out[1]).toEqual({ key: "temp", display: "24.3", unit: null });
    expect(out[2]).toEqual({ key: "temp", display: "24.3", unit: "K" });
  });
});

describe("SensorSnapshotCard renders the preferred temperature unit", () => {
  const snapshot = {
    source: "manual" as const,
    capturedAt: new Date(Date.now() - 60_000).toISOString(),
    metrics: [
      { key: "temp" as const, value: 24, unit: "°C" },
      { key: "rh" as const, value: 55, unit: "%" },
    ],
  };

  it("renders °F by default", () => {
    const { getByTestId } = render(<SensorSnapshotCard snapshot={snapshot} />);
    const tempCell = getByTestId("sensor-snapshot-card-metric-temp");
    expect(tempCell.textContent).toContain("°F");
    expect(tempCell.textContent).not.toContain("°C");
    expect(tempCell.textContent).toMatch(/75/);
  });

  it("renders °C when preference is celsius", () => {
    saveTemperatureUnitPreference("celsius");
    const { getByTestId } = render(<SensorSnapshotCard snapshot={snapshot} />);
    const tempCell = getByTestId("sensor-snapshot-card-metric-temp");
    expect(tempCell.textContent).toContain("°C");
    expect(tempCell.textContent).not.toContain("°F");
    expect(tempCell.textContent).toMatch(/24/);
  });

  it("leaves RH untouched on both preferences", () => {
    const { getByTestId, unmount } = render(
      <SensorSnapshotCard snapshot={snapshot} />,
    );
    expect(getByTestId("sensor-snapshot-card-metric-rh").textContent).toContain("%");
    unmount();
    saveTemperatureUnitPreference("celsius");
    const { getByTestId: get2 } = render(
      <SensorSnapshotCard snapshot={snapshot} />,
    );
    expect(get2("sensor-snapshot-card-metric-rh").textContent).toContain("%");
  });

  it("renders no-data card without crashing when snapshot is null", () => {
    const { getByTestId } = render(<SensorSnapshotCard snapshot={null} />);
    expect(getByTestId("sensor-snapshot-card-empty")).toBeTruthy();
  });
});

describe("Dashboard temperature display reads preference", () => {
  const SRC = readFileSync("src/pages/Dashboard.tsx", "utf8");

  it("uses the centralized formatTemperatureDisplay helper for temp readouts", () => {
    expect(SRC).toContain('from "@/lib/temperatureUnitPreference"');
    expect(SRC).toContain("formatTemperatureDisplay(sensorState.snapshot.temp");
    expect(SRC).toContain("formatTemperatureDisplay(sensorState.snapshot.soil_temp");
  });

  it("does not hardcode formatTempFFromC (legacy Fahrenheit-only) anymore", () => {
    expect(SRC).not.toMatch(/formatTempFFromC\(/);
  });

  it("centralized helper honors localStorage preference", () => {
    expect(formatTemperatureDisplay(20, { digits: 1 })).toBe("68.0°F");
    saveTemperatureUnitPreference("celsius");
    expect(formatTemperatureDisplay(20, { digits: 1 })).toBe("20.0°C");
  });
});

describe("Tent surfaces (TentDetail + Tents) render preferred unit on chips", () => {
  const TENT_DETAIL = readFileSync("src/pages/TentDetail.tsx", "utf8");
  const TENTS = readFileSync("src/pages/Tents.tsx", "utf8");

  it("TentDetail metric chip uses centralized symbol+conversion", () => {
    expect(TENT_DETAIL).toContain("convertCelsiusForDisplay(snap.temp)");
    expect(TENT_DETAIL).toContain("getTemperatureUnitSymbol()");
    expect(TENT_DETAIL).not.toContain('unit="°F"');
  });

  it("Tents list metric chip uses centralized symbol+conversion", () => {
    expect(TENTS).toContain("convertCelsiusForDisplay(last.temp)");
    expect(TENTS).toContain("getTemperatureUnitSymbol()");
    expect(TENTS).not.toContain('unit="°F"');
  });

  it("centralized symbol + conversion flip with preference", () => {
    expect(getTemperatureUnitSymbol()).toBe("°F");
    expect(convertCelsiusForDisplay(20)).toBe(68);
    saveTemperatureUnitPreference("celsius");
    expect(getTemperatureUnitSymbol()).toBe("°C");
    expect(convertCelsiusForDisplay(20)).toBe(20);
    expect(convertCelsiusForDisplay(null)).toBeNull();
    expect(convertCelsiusForDisplay(Number.NaN)).toBeNull();
  });
});
