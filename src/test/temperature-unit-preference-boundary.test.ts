/**
 * Temperature unit preference — boundary regression.
 *
 * Pins the contract between the centralized preference helper
 * (`temperatureUnitPreference.ts`, the only switchable display path) and
 * the legacy Fahrenheit-only helpers (`temperatureUnits.ts`,
 * `temperatureDisplay.ts`, which are F-by-design as named).
 *
 * Goals:
 *  - Centralized helper honors the saved preference end-to-end.
 *  - Never double-converts (C→F→C round-trips exactly).
 *  - Legacy F-only helpers remain pure, side-effect free, and do not
 *    silently couple to localStorage (so flipping preference cannot
 *    accidentally re-convert values already in F).
 *  - Pure: no Supabase, no AI, no Action Queue, no schema, no fetch.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  formatTemperatureDisplay,
  loadTemperatureUnitPreference,
  saveTemperatureUnitPreference,
  clearTemperatureUnitPreference,
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  DEFAULT_TEMPERATURE_UNIT,
} from "@/lib/temperatureUnitPreference";
import {
  formatTempFFromC,
  tempFFromC,
} from "@/lib/temperatureUnits";
import { formatTempDualF } from "@/lib/temperatureDisplay";

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("centralized preference helper", () => {
  it("defaults to Fahrenheit when nothing stored", () => {
    expect(loadTemperatureUnitPreference()).toBe("fahrenheit");
    expect(DEFAULT_TEMPERATURE_UNIT).toBe("fahrenheit");
    expect(formatTemperatureDisplay(20)).toBe("68°F");
  });

  it("honors saved Celsius preference for stored-Celsius values", () => {
    saveTemperatureUnitPreference("celsius");
    expect(loadTemperatureUnitPreference()).toBe("celsius");
    expect(formatTemperatureDisplay(20)).toBe("20°C");
    expect(formatTemperatureDisplay(24.5, { digits: 1 })).toBe("24.5°C");
  });

  it("never double-converts when valueUnit already matches display", () => {
    saveTemperatureUnitPreference("fahrenheit");
    expect(formatTemperatureDisplay(68, { valueUnit: "F" })).toBe("68°F");
    saveTemperatureUnitPreference("celsius");
    expect(formatTemperatureDisplay(20, { valueUnit: "C" })).toBe("20°C");
  });

  it("round-trips C→F→C exactly via pure conversions", () => {
    for (const c of [-10, 0, 18.3, 20, 24.5, 37, 60]) {
      expect(Math.abs(fahrenheitToCelsius(celsiusToFahrenheit(c)) - c)).toBeLessThan(1e-9);
    }
  });

  it("refuses to guess on unknown valueUnit", () => {
    expect(formatTemperatureDisplay(20, { valueUnit: "unknown" })).toBe("Unknown unit");
  });

  it("treats null/NaN/Infinity as Unknown — never invents data", () => {
    expect(formatTemperatureDisplay(null)).toBe("Unknown");
    expect(formatTemperatureDisplay(undefined)).toBe("Unknown");
    expect(formatTemperatureDisplay(Number.NaN)).toBe("Unknown");
    expect(formatTemperatureDisplay(Number.POSITIVE_INFINITY)).toBe("Unknown");
  });

  it("clear restores default without throwing", () => {
    saveTemperatureUnitPreference("celsius");
    clearTemperatureUnitPreference();
    expect(loadTemperatureUnitPreference()).toBe("fahrenheit");
  });
});

describe("legacy F-only helpers are insulated from preference", () => {
  it("formatTempFFromC always returns °F regardless of saved preference", () => {
    saveTemperatureUnitPreference("celsius");
    expect(formatTempFFromC(20)).toBe("68.0°F");
    expect(formatTempFFromC(20, 0)).toBe("68°F");
  });

  it("tempFFromC always returns a Fahrenheit number regardless of preference", () => {
    saveTemperatureUnitPreference("celsius");
    expect(tempFFromC(20)).toBe(68);
    expect(tempFFromC(0)).toBe(32);
    expect(tempFFromC(null)).toBeNull();
  });

  it("formatTempDualF keeps °F-first dual label regardless of preference", () => {
    saveTemperatureUnitPreference("celsius");
    const r = formatTempDualF(20);
    expect(r.display).toBe("68°F / 20°C");
    expect(r.fahrenheit).toBe(68);
    expect(r.celsius).toBe(20);
  });

  it("legacy helpers do not read localStorage (no coupling, no double-convert risk)", () => {
    const spy = vi.spyOn(window.localStorage.__proto__, "getItem");
    formatTempFFromC(20);
    tempFFromC(20);
    formatTempDualF(20);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("safety boundary", () => {
  it("storage key is the scoped Verdant enum, no PII", () => {
    saveTemperatureUnitPreference("celsius");
    const raw = window.localStorage.getItem("verdant:temperatureUnit");
    expect(raw).toBe("celsius");
  });

  it("rejects invalid saved values and falls back to default", () => {
    window.localStorage.setItem("verdant:temperatureUnit", "kelvin");
    expect(loadTemperatureUnitPreference()).toBe("fahrenheit");
  });
});
