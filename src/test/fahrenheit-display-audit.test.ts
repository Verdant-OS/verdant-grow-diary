/**
 * Fahrenheit display audit (presentation-only).
 *
 * Confirms Verdant's centralized temperature display helpers:
 *  - convert stored Celsius to Fahrenheit at the display boundary
 *  - round consistently
 *  - never double-convert
 *  - leave non-temperature metrics (VPD, RH, EC, pH, soil moisture, PPFD, CO2)
 *    untouched
 *  - never invent data from null/invalid input
 *
 * Pure unit tests. No Supabase, no React, no AI, no Action Queue, no edge.
 */
import { describe, it, expect } from "vitest";
import {
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  formatTempFFromC,
  tempFFromC,
} from "@/lib/temperatureUnits";
import { formatTempDualF } from "@/lib/temperatureDisplay";
import { formatSensorValue } from "@/lib/sensorFormat";

describe("Fahrenheit display audit — pure conversion", () => {
  it("converts Celsius to Fahrenheit correctly", () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(100)).toBe(212);
    expect(celsiusToFahrenheit(20)).toBe(68);
    expect(celsiusToFahrenheit(-40)).toBe(-40);
  });

  it("round-trips F→C→F within 1e-9", () => {
    for (const f of [32, 68, 75, 100, -10]) {
      const back = celsiusToFahrenheit(fahrenheitToCelsius(f));
      expect(Math.abs(back - f)).toBeLessThan(1e-9);
    }
  });

  it("formatTempFFromC rounds to requested digits and is null-safe", () => {
    expect(formatTempFFromC(20)).toBe("68.0°F");
    expect(formatTempFFromC(24.345, 1)).toBe("75.8°F");
    expect(formatTempFFromC(null)).toBe("Unknown");
    expect(formatTempFFromC(undefined)).toBe("Unknown");
    expect(formatTempFFromC(Number.NaN)).toBe("Unknown");
  });

  it("tempFFromC preserves null/invalid and never invents data", () => {
    expect(tempFFromC(null)).toBeNull();
    expect(tempFFromC(undefined)).toBeNull();
    expect(tempFFromC(Number.NaN)).toBeNull();
    expect(tempFFromC(20)).toBe(68);
  });

  it("formatTempDualF leads with °F and keeps °C as secondary basis", () => {
    const r = formatTempDualF(20);
    expect(r.display).toBe("68°F / 20°C");
    expect(r.fahrenheit).toBe(68);
    expect(r.celsius).toBe(20);
  });

  it("formatTempDualF rejects implausible / null / NaN values", () => {
    expect(formatTempDualF(null).display).toBeNull();
    expect(formatTempDualF(Number.NaN).display).toBeNull();
    expect(formatTempDualF(-999).display).toBeNull();
    expect(formatTempDualF(999).display).toBeNull();
  });
});

describe("Fahrenheit display audit — no double-conversion", () => {
  it("converting a Celsius value once produces the documented Fahrenheit", () => {
    // 24°C → 75.2°F. Converting again would land at ~167°F.
    expect(formatSensorValue("air_temp_c", 24)).toBe("75.2 °F");
    expect(formatSensorValue("air_temp_c", 24)).not.toMatch(/16[67]/);
  });

  it("helpers do not chain — calling celsiusToFahrenheit on an already-F value is the caller's bug, not the helper's", () => {
    // Sanity guard: helpers are single-purpose. We document the contract
    // so reviewers cannot silently call them twice without it being obvious.
    const onceF = celsiusToFahrenheit(20); // 68
    const twiceF = celsiusToFahrenheit(onceF); // 154.4 — clearly wrong
    expect(onceF).toBe(68);
    expect(twiceF).toBeGreaterThan(150);
  });
});

describe("Fahrenheit display audit — non-temperature metrics untouched", () => {
  it("VPD stays in kPa", () => {
    expect(formatSensorValue("vpd_kpa", 1.16)).toBe("1.16 kPa");
    expect(formatSensorValue("vpd_kpa", 1.16)).not.toMatch(/°F|°C/);
  });

  it("RH stays in % and is not Fahrenheit-converted", () => {
    expect(formatSensorValue("humidity_pct", 55)).toBe("55.0 %");
    expect(formatSensorValue("humidity_pct", 55)).not.toMatch(/°F/);
  });

  it("EC, pH, soil moisture, PPFD, CO2 are not temperature-converted", () => {
    expect(formatSensorValue("reservoir_ec_mscm", 1.85)).toBe("1.85 mS/cm");
    expect(formatSensorValue("soil_ec_mscm", 1.85)).toBe("1.85 mS/cm");
    expect(formatSensorValue("reservoir_ph", 6.2)).toBe("6.20 pH");
    expect(formatSensorValue("soil_moisture_pct", 42)).toBe("42.0 %");
    expect(formatSensorValue("ppfd", 800)).toBe("800 µmol");
    expect(formatSensorValue("co2_ppm", 900)).toBe("900 ppm");
    for (const field of [
      "reservoir_ec_mscm",
      "soil_ec_mscm",
      "reservoir_ph",
      "soil_moisture_pct",
      "ppfd",
      "co2_ppm",
    ] as const) {
      expect(formatSensorValue(field, 10)).not.toMatch(/°F|°C/);
    }
  });

  it("both air_temp_c and soil_temp_c render °F (never °C)", () => {
    expect(formatSensorValue("air_temp_c", 20)).toBe("68.0 °F");
    expect(formatSensorValue("soil_temp_c", 20)).toBe("68.0 °F");
    expect(formatSensorValue("air_temp_c", 20)).not.toMatch(/°C/);
    expect(formatSensorValue("soil_temp_c", 20)).not.toMatch(/°C/);
  });
});
