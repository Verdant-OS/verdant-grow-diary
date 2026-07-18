/**
 * environmentCheckQuickLogRules — pure helper tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildEnvironmentCheckDetails,
  hasAnyEnvironmentCheckMeasurement,
  resolvePreviewWaterTempC,
  validateEnvironmentCheckSensorBand,
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

  it("keeps VPD inside the canonical band (up to 10 kPa), not the old 4 kPa cap", () => {
    // Reconciled onto the single canonical band (isVpdValid: 0..10). A VPD of
    // 9 kPa is physically real in a hot, bone-dry space and must NOT be
    // silently dropped the way the old private 0..4 bound did.
    const env = buildEnvironmentCheckDetails({ vpdKpa: "9" });
    expect(env).not.toBeNull();
    expect(env?.vpd_kpa).toBe(9);
  });

  it("drops values outside the canonical band (defensive floor for the pure builder)", () => {
    const env = buildEnvironmentCheckDetails({
      roomTempF: "9999",
      humidityPct: "150",
      vpdKpa: "12",
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

describe("validateEnvironmentCheckSensorBand — canonical band, blocking (matches v2)", () => {
  // Reconciles v1 onto the single canonical band shared with Quick Log v2
  // (isTemperatureValid: -10..60°C, isHumidityValid: 0..100, isVpdValid:
  // 0..10; null = not provided). Unlike the old silent clamp-to-null, an
  // out-of-band value now BLOCKS with the same reason code v2 emits so the
  // grower sees an error instead of losing the reading.
  function reason(input: Parameters<typeof validateEnvironmentCheckSensorBand>[0]): string {
    const r = validateEnvironmentCheckSensorBand(input);
    if (r.ok === true) throw new Error("expected the band check to fail");
    return r.reason;
  }

  it("passes when nothing is entered (all fields optional)", () => {
    expect(validateEnvironmentCheckSensorBand({}).ok).toBe(true);
  });

  it("passes a plausible, in-band environment check", () => {
    expect(
      validateEnvironmentCheckSensorBand({
        roomTempF: "76",
        humidityPct: "55",
        vpdKpa: "1.1",
      }).ok,
    ).toBe(true);
  });

  it("accepts VPD up to the canonical maximum (10 kPa)", () => {
    expect(validateEnvironmentCheckSensorBand({ vpdKpa: "10" }).ok).toBe(true);
  });

  it("accepts VPD 8 kPa (in-band, above the retired 4 kPa cap)", () => {
    expect(validateEnvironmentCheckSensorBand({ vpdKpa: "8" }).ok).toBe(true);
  });

  it("blocks VPD above the canonical maximum with vpd_out_of_range", () => {
    expect(reason({ vpdKpa: "12" })).toBe("vpd_out_of_range");
  });

  it("blocks a physically impossible negative VPD", () => {
    expect(reason({ vpdKpa: "-0.5" })).toBe("vpd_out_of_range");
  });

  it("blocks humidity outside 0-100 with humidity_out_of_range", () => {
    expect(reason({ humidityPct: "150" })).toBe("humidity_out_of_range");
    expect(reason({ humidityPct: "-1" })).toBe("humidity_out_of_range");
  });

  it("blocks a room temperature whose °C equivalent leaves the canonical band", () => {
    // 9999°F is nonsensical; its Celsius conversion is far above 60°C.
    expect(reason({ roomTempF: "9999" })).toBe("temperature_out_of_range");
    // -50°F ≈ -45.6°C, below the -10°C canonical floor.
    expect(reason({ roomTempF: "-50" })).toBe("temperature_out_of_range");
  });

  it("accepts the canonical temperature edges (-10°C = 14°F, 60°C = 140°F)", () => {
    expect(validateEnvironmentCheckSensorBand({ roomTempF: "14" }).ok).toBe(true);
    expect(validateEnvironmentCheckSensorBand({ roomTempF: "140" }).ok).toBe(true);
  });

  it("reports the first offending metric deterministically (temperature before vpd)", () => {
    expect(reason({ roomTempF: "9999", vpdKpa: "12" })).toBe("temperature_out_of_range");
  });
});
