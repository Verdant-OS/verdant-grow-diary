/**
 * environmentCheckQuickLogRules — pure helper tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildEnvironmentCheckDetails,
  hasAnyEnvironmentCheckMeasurement,
  resolvePreviewWaterTempC,
  ENVIRONMENT_CHECK_HELPER_COPY,
  fahrenheitToCelsius,
  celsiusToFahrenheit,
} from "../lib/environmentCheckQuickLogRules";

describe("buildEnvironmentCheckDetails — happy path", () => {
  it("returns null when nothing is entered", () => {
    expect(buildEnvironmentCheckDetails({})).toBeNull();
    expect(
      buildEnvironmentCheckDetails({
        roomTempF: "",
        humidityPct: "",
        vpdKpa: "",
        waterTempValue: "",
        ecMscm: "",
        note: "",
      }),
    ).toBeNull();
  });

  it("includes only user-entered, parseable, in-range values", () => {
    const env = buildEnvironmentCheckDetails({
      roomTempF: "76",
      humidityPct: "55",
      vpdKpa: "1.1",
      ecMscm: "1.4",
      note: "  Tent feels stable  ",
    });
    expect(env).toEqual({
      room_temp_f: 76,
      humidity_pct: 55,
      vpd_kpa: 1.1,
      water_temp_f: null,
      water_temp_c: null,
      ec_mscm: 1.4,
      note: "Tent feels stable",
    });
  });

  it("stores water temp in °F primary and derives °C when unit=F", () => {
    const env = buildEnvironmentCheckDetails({
      waterTempValue: "68",
      waterTempUnit: "F",
    });
    expect(env?.water_temp_f).toBe(68);
    expect(env?.water_temp_c).toBe(20);
  });

  it("stores water temp in °C and derives °F when unit=C", () => {
    const env = buildEnvironmentCheckDetails({
      waterTempValue: "20",
      waterTempUnit: "C",
    });
    expect(env?.water_temp_c).toBe(20);
    expect(env?.water_temp_f).toBe(68);
  });

  it("silently drops water temp when unit is missing — never infers a unit", () => {
    const env = buildEnvironmentCheckDetails({
      waterTempValue: "20",
      // waterTempUnit omitted
    });
    expect(env).toBeNull();
  });

  it("drops out-of-range values (descriptive bound)", () => {
    const env = buildEnvironmentCheckDetails({
      roomTempF: "9999",
      humidityPct: "150",
      vpdKpa: "9",
      ecMscm: "50",
      waterTempValue: "200",
      waterTempUnit: "F",
    });
    expect(env).toBeNull();
  });

  it("does not leak raw_payload / service_role / token strings", () => {
    const env = buildEnvironmentCheckDetails({
      note: "raw_payload service_role bearer abc",
      roomTempF: "76",
    });
    expect(env?.note).toBe("raw_payload service_role bearer abc");
    // Note is a free-text field; envelope keys must NOT contain those names.
    expect(Object.keys(env!).join(",")).not.toMatch(
      /raw_payload|service_role|token/,
    );
  });
});

describe("hasAnyEnvironmentCheckMeasurement", () => {
  it("is false for empty input", () => {
    expect(hasAnyEnvironmentCheckMeasurement({})).toBe(false);
  });
  it("is true when any measurement is present (ignoring note)", () => {
    expect(
      hasAnyEnvironmentCheckMeasurement({ humidityPct: "55" }),
    ).toBe(true);
  });
  it("is false when only a note is present", () => {
    expect(
      hasAnyEnvironmentCheckMeasurement({ note: "tent is calm" } as never),
    ).toBe(false);
  });
});

describe("resolvePreviewWaterTempC", () => {
  it("returns null without a unit (no silent inference)", () => {
    expect(resolvePreviewWaterTempC({ waterTempValue: "20" })).toBeNull();
  });
  it("returns Celsius directly when unit=C", () => {
    expect(
      resolvePreviewWaterTempC({ waterTempValue: "20", waterTempUnit: "C" }),
    ).toBe(20);
  });
  it("converts Fahrenheit to Celsius when unit=F", () => {
    const c = resolvePreviewWaterTempC({
      waterTempValue: "68",
      waterTempUnit: "F",
    });
    expect(c).toBeCloseTo(20, 5);
  });
  it("returns null for out-of-range temperatures", () => {
    expect(
      resolvePreviewWaterTempC({ waterTempValue: "999", waterTempUnit: "F" }),
    ).toBeNull();
  });
});

describe("Pure unit converters", () => {
  it("F→C and C→F are inverse to floating-point precision", () => {
    expect(fahrenheitToCelsius(32)).toBeCloseTo(0, 5);
    expect(fahrenheitToCelsius(212)).toBeCloseTo(100, 5);
    expect(celsiusToFahrenheit(0)).toBeCloseTo(32, 5);
    expect(celsiusToFahrenheit(100)).toBeCloseTo(212, 5);
  });
});

describe("Helper copy is calm and unambiguous", () => {
  it("matches the stable calm-empty-state copy", () => {
    expect(ENVIRONMENT_CHECK_HELPER_COPY).toBe(
      "Add any measurements you have. A note alone is okay.",
    );
  });
});
