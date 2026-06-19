/**
 * Pure tests for the temperature display unit preference.
 *
 * Asserts:
 *  - Default is Fahrenheit.
 *  - Switching to Celsius persists & is read back correctly.
 *  - Storage corruption / unsupported envs fail open to Fahrenheit.
 *  - formatTemperatureDisplay handles C/F/unknown sources, null,
 *    NaN, Infinity, negatives, and rounding boundaries (.4/.5/.6).
 *  - No double-conversion when value is already in the display unit.
 *  - Only temperature is converted — caller decides; no other metric
 *    paths touched here.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_TEMPERATURE_UNIT,
  TEMPERATURE_UNIT_OPTIONS,
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  clearTemperatureUnitPreference,
  formatTemperatureDisplay,
  loadTemperatureUnitPreference,
  resolveTemperatureUnitPreference,
  saveTemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("temperatureUnitPreference — defaults and persistence", () => {
  it("defaults to fahrenheit", () => {
    expect(DEFAULT_TEMPERATURE_UNIT).toBe("fahrenheit");
    expect(loadTemperatureUnitPreference()).toBe("fahrenheit");
  });

  it("persists and reloads the user's celsius choice", () => {
    saveTemperatureUnitPreference("celsius");
    expect(loadTemperatureUnitPreference()).toBe("celsius");
  });

  it("ignores corrupted storage values and returns the default", () => {
    window.localStorage.setItem("verdant:temperatureUnit", "kelvin");
    expect(loadTemperatureUnitPreference()).toBe("fahrenheit");
  });

  it("clear restores the default", () => {
    saveTemperatureUnitPreference("celsius");
    clearTemperatureUnitPreference();
    expect(loadTemperatureUnitPreference()).toBe("fahrenheit");
  });

  it("resolveTemperatureUnitPreference normalizes unknown values", () => {
    expect(resolveTemperatureUnitPreference("fahrenheit")).toBe("fahrenheit");
    expect(resolveTemperatureUnitPreference("celsius")).toBe("celsius");
    expect(resolveTemperatureUnitPreference("kelvin")).toBe("fahrenheit");
    expect(resolveTemperatureUnitPreference(null)).toBe("fahrenheit");
  });

  it("exposes the expected option set with fahrenheit recommended", () => {
    expect(TEMPERATURE_UNIT_OPTIONS.map((o) => o.key)).toEqual([
      "fahrenheit",
      "celsius",
    ]);
    expect(TEMPERATURE_UNIT_OPTIONS[0].recommended).toBe(true);
  });
});

describe("temperatureUnitPreference — pure conversions", () => {
  it("C↔F single-source-of-truth conversions are exact", () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(100)).toBe(212);
    expect(celsiusToFahrenheit(-40)).toBe(-40);
    expect(fahrenheitToCelsius(32)).toBe(0);
    expect(fahrenheitToCelsius(212)).toBe(100);
  });
});

describe("formatTemperatureDisplay — rendering and rounding", () => {
  it("renders Fahrenheit by default from canonical Celsius", () => {
    expect(formatTemperatureDisplay(20)).toBe("68°F");
    expect(formatTemperatureDisplay(24.4)).toBe("76°F"); // 75.92 → 76
  });

  it("honors an explicit celsius display unit override", () => {
    expect(formatTemperatureDisplay(20, { unit: "celsius" })).toBe("20°C");
    expect(formatTemperatureDisplay(20.45, { unit: "celsius", digits: 1 })).toBe(
      "20.5°C",
    );
  });

  it("supports persisted preference: switching to celsius affects display only", () => {
    saveTemperatureUnitPreference("celsius");
    expect(formatTemperatureDisplay(20)).toBe("20°C");
    saveTemperatureUnitPreference("fahrenheit");
    expect(formatTemperatureDisplay(20)).toBe("68°F");
  });

  it("never double-converts when value is already in the display unit", () => {
    // Value is already °F; preference is fahrenheit → no conversion.
    expect(formatTemperatureDisplay(75, { valueUnit: "F" })).toBe("75°F");
    // Value is already °F; preference is celsius → convert ONCE.
    expect(
      formatTemperatureDisplay(75, { valueUnit: "F", unit: "celsius", digits: 1 }),
    ).toBe("23.9°C");
    // Value is canonical °C; preference is fahrenheit → convert ONCE.
    // 24°C → 75.2°F; not 167°F.
    expect(formatTemperatureDisplay(24, { unit: "fahrenheit", digits: 1 })).toBe(
      "75.2°F",
    );
  });

  it("returns 'Unknown unit' for ambiguous sources (never guesses)", () => {
    expect(formatTemperatureDisplay(25, { valueUnit: "unknown" })).toBe(
      "Unknown unit",
    );
  });

  it("returns 'Unknown' for null / undefined / NaN / Infinity (no NaN°F leaks)", () => {
    expect(formatTemperatureDisplay(null)).toBe("Unknown");
    expect(formatTemperatureDisplay(undefined)).toBe("Unknown");
    expect(formatTemperatureDisplay(Number.NaN)).toBe("Unknown");
    expect(formatTemperatureDisplay(Number.POSITIVE_INFINITY)).toBe("Unknown");
    expect(formatTemperatureDisplay(Number.NEGATIVE_INFINITY)).toBe("Unknown");
  });

  it("supports custom unavailable copy", () => {
    expect(
      formatTemperatureDisplay(null, { unavailableLabel: "—" }),
    ).toBe("—");
  });

  it("rounds .4 / .5 / .6 boundaries consistently at 0 digits", () => {
    // toFixed rounding (banker-ish per engine, but consistent across calls).
    expect(formatTemperatureDisplay(0.4, { unit: "celsius" })).toBe("0°C");
    expect(formatTemperatureDisplay(0.6, { unit: "celsius" })).toBe("1°C");
    // .5 round-up (JS toFixed for positive 0.5 → "1").
    expect(formatTemperatureDisplay(0.5, { unit: "celsius" })).toBe("1°C");
  });

  it("handles negatives (cold-room edge cases)", () => {
    expect(formatTemperatureDisplay(-10)).toBe("14°F");
    expect(formatTemperatureDisplay(-10, { unit: "celsius" })).toBe("-10°C");
  });
});

describe("formatTemperatureDisplay — safety", () => {
  it("never mutates the supplied numeric input or options object", () => {
    const opts = { unit: "celsius" as const, digits: 1 };
    const before = JSON.stringify(opts);
    formatTemperatureDisplay(20, opts);
    expect(JSON.stringify(opts)).toBe(before);
  });

  it("does not interfere with non-temperature metrics — caller chooses when to call this", () => {
    // Sanity: VPD/RH/EC/pH/CO2 values must not be passed through this
    // formatter. Smoke-check that a humidity-looking number doesn't gain
    // °F semantics on its own — it only does if the caller asks.
    expect(formatTemperatureDisplay(55, { unit: "celsius" })).toBe("55°C");
    expect(formatTemperatureDisplay(55, { unit: "celsius" })).not.toMatch(/%/);
  });
});
