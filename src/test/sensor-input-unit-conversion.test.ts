import { describe, expect, it } from "vitest";
import {
  AIR_TEMP_PLACEHOLDER,
  celsiusToInputString,
  convertTemperatureInputString,
  describeTypicalAirTempRange,
  detectTemperatureUnitMismatch,
  formatTemperatureWithUnit,
  parseTemperatureInput,
  resolveTemperatureInputUnit,
  temperatureInputUnitFromPreference,
  TEMPERATURE_INPUT_UNITS,
  TEMPERATURE_UNIT_SYMBOL,
  toCelsiusInputString,
  toFahrenheitInputString,
  TYPICAL_AIR_TEMP_RANGE,
} from "@/lib/sensorInputUnitConversion";
import { resolveManualAirTemp, validateManualEntry } from "@/lib/sensorReadingManualEntryRules";
import { evaluateManualSnapshotAdvisor } from "@/lib/manualSensorSnapshotAdvisorRules";

describe("parseTemperatureInput", () => {
  it("treats blank input as unknown, never zero", () => {
    for (const raw of ["", "   ", null, undefined]) {
      const p = parseTemperatureInput(raw, "C");
      expect(p.kind).toBe("empty");
      expect(p.celsius).toBeNull();
      expect(p.enteredValue).toBeNull();
    }
  });

  it("rejects unparseable input instead of coercing it", () => {
    for (const raw of ["abc", "--5", "1,5", {}, [], true, Number.NaN, Infinity]) {
      expect(parseTemperatureInput(raw, "F").kind).toBe("invalid");
    }
  });

  it("converts a Celsius entry to canonical Celsius unchanged", () => {
    const p = parseTemperatureInput("24", "C");
    expect(p.kind).toBe("ok");
    expect(p.enteredValue).toBe(24);
    expect(p.celsius).toBeCloseTo(24, 6);
    expect(p.fahrenheit).toBeCloseTo(75.2, 4);
  });

  it("converts a Fahrenheit entry to Celsius exactly once", () => {
    const p = parseTemperatureInput(75, "F");
    expect(p.celsius).toBeCloseTo(23.888889, 5);
    expect(p.fahrenheit).toBe(75);
  });

  it("accepts compact or spaced Fahrenheit and Celsius suffixes", () => {
    const fahrenheit = parseTemperatureInput("72°F", "C");
    expect(fahrenheit).toMatchObject({
      kind: "ok",
      unit: "F",
      enteredValue: 72,
    });
    expect(fahrenheit.celsius).toBeCloseTo(22.222222, 5);

    const celsius = parseTemperatureInput("22 °C", "F");
    expect(celsius).toMatchObject({
      kind: "ok",
      unit: "C",
      enteredValue: 22,
      celsius: 22,
    });
  });

  it("accepts case-insensitive short and long unit names", () => {
    expect(parseTemperatureInput("72 f", "C").unit).toBe("F");
    expect(parseTemperatureInput("72 FAHRENHEIT", "C").unit).toBe("F");
    expect(parseTemperatureInput("22 c", "F").unit).toBe("C");
    expect(parseTemperatureInput("22 celsius", "F").unit).toBe("C");
  });

  it("lets an explicit suffix override the field preference", () => {
    expect(parseTemperatureInput("72°F", "C").celsius).toBeCloseTo(22.222222, 5);
    expect(parseTemperatureInput("22°C", "F").celsius).toBe(22);
  });

  it("rejects partial, unknown, or duplicated suffixes", () => {
    for (const raw of ["72°F later", "22 kelvin", "72°F°C", "72Fjunk", "°F", "72°"]) {
      expect(parseTemperatureInput(raw, "F").kind).toBe("invalid");
    }
  });

  it("handles negative and zero temperatures without treating them as missing", () => {
    const zeroC = parseTemperatureInput(0, "C");
    expect(zeroC.kind).toBe("ok");
    expect(zeroC.celsius).toBe(0);
    expect(zeroC.fahrenheit).toBeCloseTo(32, 6);

    const negF = parseTemperatureInput(-10, "F");
    expect(negF.kind).toBe("ok");
    expect(negF.celsius).toBeCloseTo(-23.333333, 5);
  });

  it("never guesses the unit — the same number means different things per unit", () => {
    expect(parseTemperatureInput(24, "C").celsius).toBeCloseTo(24, 6);
    expect(parseTemperatureInput(24, "F").celsius).toBeCloseTo(-4.444444, 5);
  });

  it("defaults an unrecognized unit to Fahrenheit rather than throwing", () => {
    expect(parseTemperatureInput(75, "K" as never).unit).toBe("F");
    expect(resolveTemperatureInputUnit(null)).toBe("F");
    expect(resolveTemperatureInputUnit("C")).toBe("C");
  });

  it("is deterministic across repeated calls", () => {
    expect(parseTemperatureInput("68.4", "F")).toEqual(parseTemperatureInput("68.4", "F"));
  });
});

describe("typical-range and mismatch hints", () => {
  it("flags values outside the typical band in the unit entered", () => {
    const coldF = parseTemperatureInput(30, "F");
    expect(coldF.outOfTypicalRangeHint).toContain("50–100°F");
    expect(coldF.outOfTypicalRangeHint).toContain("30°F");

    const hotC = parseTemperatureInput(41, "C");
    expect(hotC.outOfTypicalRangeHint).toContain("10–38°C");
    expect(hotC.outOfTypicalRangeHint).toContain("41°C");
  });

  it("stays quiet inside the typical band for both units", () => {
    expect(parseTemperatureInput(75, "F").outOfTypicalRangeHint).toBeNull();
    expect(parseTemperatureInput(24, "C").outOfTypicalRangeHint).toBeNull();
  });

  it("warns about a Celsius value typed into a Fahrenheit field", () => {
    const hint = detectTemperatureUnitMismatch(24, "F");
    expect(hint).toContain("looks like a Celsius value");
    expect(hint).toContain("Double-check");
  });

  it("warns about a Fahrenheit value typed into a Celsius field", () => {
    const hint = detectTemperatureUnitMismatch(75, "C");
    expect(hint).toContain("looks like a Fahrenheit value");
  });

  it("does not warn about plausible room temperatures in either unit", () => {
    expect(detectTemperatureUnitMismatch(75, "F")).toBeNull();
    expect(detectTemperatureUnitMismatch(24, "C")).toBeNull();
  });

  it("exposes a matching band, symbol, and placeholder for every supported unit", () => {
    for (const unit of TEMPERATURE_INPUT_UNITS) {
      expect(TEMPERATURE_UNIT_SYMBOL[unit]).toMatch(/^°[FC]$/);
      expect(AIR_TEMP_PLACEHOLDER[unit]).toMatch(/^\d+$/);
      expect(TYPICAL_AIR_TEMP_RANGE[unit].min).toBeLessThan(TYPICAL_AIR_TEMP_RANGE[unit].max);
      expect(describeTypicalAirTempRange(unit)).toContain(TEMPERATURE_UNIT_SYMBOL[unit]);
    }
  });

  it("formats values with their unit and trims pointless decimals", () => {
    expect(formatTemperatureWithUnit(24, "C")).toBe("24°C");
    expect(formatTemperatureWithUnit(75.24, "F")).toBe("75.2°F");
  });
});

describe("input bridging helpers", () => {
  it("bridges a Celsius entry to a Fahrenheit string for legacy consumers", () => {
    expect(Number(toFahrenheitInputString("24", "C"))).toBeCloseTo(75.2, 4);
    expect(Number(toFahrenheitInputString("75", "F"))).toBe(75);
  });

  it("bridges explicitly suffixed text to canonical Celsius", () => {
    expect(Number(toCelsiusInputString("72°F", "C"))).toBeCloseTo(22.22, 2);
    expect(toCelsiusInputString("22 °C", "F")).toBe("22");
    expect(toCelsiusInputString("22.12345", "C")).toBe("22.12345");
    expect(toCelsiusInputString("", "F")).toBe("");
    expect(toCelsiusInputString("72°K", "F")).toBe("72°K");
  });

  it("honors an explicit suffix in Fahrenheit legacy bridges", () => {
    expect(Number(toFahrenheitInputString("22 °C", "F"))).toBeCloseTo(71.6, 4);
    expect(Number(toFahrenheitInputString("72°F", "C"))).toBe(72);
  });

  it("bridges empty and invalid entries to an empty string, not zero", () => {
    expect(toFahrenheitInputString("", "C")).toBe("");
    expect(toFahrenheitInputString("abc", "F")).toBe("");
  });

  it("renders a stored Celsius value in the grower's entry unit", () => {
    expect(celsiusToInputString(24, "C")).toBe("24");
    expect(celsiusToInputString(24, "F")).toBe("75.2");
    expect(celsiusToInputString(null, "F")).toBe("");
    expect(celsiusToInputString(Number.NaN, "C")).toBe("");
  });

  it("re-expresses typed text when the grower switches unit mid-edit", () => {
    expect(convertTemperatureInputString("24", "C", "F")).toBe("75.2");
    expect(convertTemperatureInputString("75.2", "F", "C")).toBe("24");
    expect(convertTemperatureInputString("24", "C", "C")).toBe("24");
  });

  it("preserves in-progress text rather than destroying it on a unit switch", () => {
    expect(convertTemperatureInputString("", "C", "F")).toBe("");
    expect(convertTemperatureInputString("-", "C", "F")).toBe("-");
  });

  it("round-trips a value through both units without drift", () => {
    const there = convertTemperatureInputString("24", "C", "F");
    expect(convertTemperatureInputString(there, "F", "C")).toBe("24");
  });

  it("maps the saved display preference onto an entry unit", () => {
    expect(temperatureInputUnitFromPreference("celsius")).toBe("C");
    expect(temperatureInputUnitFromPreference("fahrenheit")).toBe("F");
  });
});

describe("validateManualEntry with an explicit entry unit", () => {
  it("stores a Celsius entry as the same Celsius value", () => {
    const v = validateManualEntry({ airTemp: 24, airTempUnit: "C", humidityPct: 55 });
    expect(v.ok).toBe(true);
    expect(v.metrics.find((m) => m.metric === "temperature_c")?.value).toBeCloseTo(24, 2);
  });

  it("stores a Fahrenheit entry converted to Celsius exactly once", () => {
    const v = validateManualEntry({ airTemp: 75, airTempUnit: "F" });
    expect(v.metrics.find((m) => m.metric === "temperature_c")?.value).toBeCloseTo(23.89, 2);
  });

  it("stores suffixed values using the suffix rather than the selected field unit", () => {
    const fromF = validateManualEntry({
      airTemp: "72°F",
      airTempUnit: "C",
    });
    const fromC = validateManualEntry({
      airTemp: "22 °C",
      airTempUnit: "F",
    });
    expect(fromF.ok).toBe(true);
    expect(fromF.metrics.find((m) => m.metric === "temperature_c")?.value).toBeCloseTo(22.22, 2);
    expect(fromC.ok).toBe(true);
    expect(fromC.metrics.find((m) => m.metric === "temperature_c")?.value).toBe(22);
  });

  it("keeps the legacy airTempF field working unchanged", () => {
    const legacy = validateManualEntry({ airTempF: 75 });
    const explicit = validateManualEntry({ airTemp: 75, airTempUnit: "F" });
    expect(legacy.metrics).toEqual(explicit.metrics);
  });

  it("prefers the explicit field when both are supplied", () => {
    const v = validateManualEntry({ airTempF: 75, airTemp: 24, airTempUnit: "C" });
    expect(v.metrics.find((m) => m.metric === "temperature_c")?.value).toBeCloseTo(24, 2);
  });

  it("falls back to the legacy field when the explicit one is blank", () => {
    const v = validateManualEntry({ airTempF: 75, airTemp: "", airTempUnit: "C" });
    expect(v.metrics.find((m) => m.metric === "temperature_c")?.value).toBeCloseTo(23.89, 2);
  });

  it("phrases the out-of-range warning in the unit the grower typed", () => {
    const c = validateManualEntry({ airTemp: 45, airTempUnit: "C" });
    expect(c.warnings.some((w) => w.includes("°C"))).toBe(true);
    expect(c.warnings.some((w) => w.includes("50–100°F"))).toBe(false);

    const f = validateManualEntry({ airTempF: 30 });
    expect(f.warnings.some((w) => w.includes("50–100°F"))).toBe(true);
  });

  it("warns but does not block a plausible-unit mix-up — the grower decides", () => {
    const v = validateManualEntry({ airTemp: 75, airTempUnit: "C" });
    expect(v.ok).toBe(true);
    expect(v.warnings.some((w) => w.includes("looks like a Fahrenheit value"))).toBe(true);
  });

  it("blocks an unparseable temperature rather than saving a wrong number", () => {
    const v = validateManualEntry({ airTemp: "abc", airTempUnit: "C" });
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes("finite number"))).toBe(true);
    expect(v.metrics.some((m) => m.metric === "temperature_c")).toBe(false);
  });

  it("never emits a temperature metric when the field is left blank", () => {
    const v = validateManualEntry({ airTemp: "", airTempUnit: "C", humidityPct: 55 });
    expect(v.metrics.some((m) => m.metric === "temperature_c")).toBe(false);
  });

  it("resolveManualAirTemp reports the unit it actually used", () => {
    expect(resolveManualAirTemp({ airTemp: 24, airTempUnit: "C" }).unit).toBe("C");
    expect(resolveManualAirTemp({ airTempF: 75 }).unit).toBe("F");
  });
});

describe("advisor honors the declared entry unit", () => {
  it("no longer scolds a Celsius grower for entering a Celsius value", () => {
    const r = evaluateManualSnapshotAdvisor({ airTemp: 24, airTempUnit: "C" });
    expect(r.warnings.some((w) => w.includes("looks like a Celsius value"))).toBe(false);
  });

  it("still catches a Celsius value typed into the Fahrenheit field", () => {
    const r = evaluateManualSnapshotAdvisor({ airTempF: 24 });
    expect(r.warnings.some((w) => w.includes("looks like a Celsius value"))).toBe(true);
  });

  it("derives the VPD preview from the correctly converted Celsius value", () => {
    const fromC = evaluateManualSnapshotAdvisor({
      airTemp: 23.888889,
      airTempUnit: "C",
      humidityPct: 55,
    });
    const fromF = evaluateManualSnapshotAdvisor({ airTempF: 75, humidityPct: 55 });
    expect(fromC.derivedVpdKpa).toBeCloseTo(fromF.derivedVpdKpa as number, 3);
  });
});
