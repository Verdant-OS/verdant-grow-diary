/**
 * Manual sensor entry — unit-aware air temperature.
 *
 * The air-temp field accepts a typed unit ("72F", "22°C") or a bare number read
 * in the grower's saved preference. This pins the BEHAVIOR of the resulting
 * canonical-Celsius value, the advisor's Celsius-in-a-Fahrenheit-field
 * heuristic, and — most importantly — that no path double-converts.
 *
 * Static markup guards live in manual-sensor-fahrenheit-tent-scoping.test.ts.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { validateManualEntry, fahrenheitToCelsius } from "@/lib/sensorReadingManualEntryRules";
import { evaluateManualSnapshotAdvisor } from "@/lib/manualSensorSnapshotAdvisorRules";
import {
  parseTemperatureInput,
  celsiusToFahrenheit,
  saveTemperatureUnitPreference,
  clearTemperatureUnitPreference,
  type TemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";

/** Mirrors how ManualSensorReadingCard threads a typed value to each consumer. */
function wireTypedTemperature(raw: string, unit: TemperatureUnitPreference) {
  const parsed = parseTemperatureInput(raw, { assumeUnit: unit });
  const celsius = parsed.ok ? parsed.celsius : null;
  const fahrenheit = celsius === null ? null : Math.round(celsiusToFahrenheit(celsius) * 100) / 100;
  return { parsed, celsius, fahrenheit };
}

const tempMetric = (v: ReturnType<typeof validateManualEntry>) =>
  v.metrics.find((m) => m.metric === "temperature_c") ?? null;

beforeEach(() => {
  clearTemperatureUnitPreference();
});

describe("typed unit reaches the store as canonical Celsius", () => {
  it('"22°C" stores 22°C regardless of a Fahrenheit preference', () => {
    const { celsius } = wireTypedTemperature("22°C", "fahrenheit");
    const v = validateManualEntry({ airTempC: celsius, humidityPct: 55 });
    expect(v.ok).toBe(true);
    expect(tempMetric(v)!.value).toBeCloseTo(22, 2);
  });

  it('"72F" stores ~22.22°C regardless of a Celsius preference', () => {
    const { celsius } = wireTypedTemperature("72F", "celsius");
    const v = validateManualEntry({ airTempC: celsius, humidityPct: 55 });
    expect(tempMetric(v)!.value).toBeCloseTo(fahrenheitToCelsius(72), 2);
  });

  it("a bare number follows the saved preference", () => {
    const asF = wireTypedTemperature("72", "fahrenheit");
    expect(tempMetric(validateManualEntry({ airTempC: asF.celsius }))!.value).toBeCloseTo(
      fahrenheitToCelsius(72),
      2,
    );

    const asC = wireTypedTemperature("22", "celsius");
    expect(tempMetric(validateManualEntry({ airTempC: asC.celsius }))!.value).toBeCloseTo(22, 2);
  });

  it("matches the legacy Fahrenheit path exactly — no behavior drift", () => {
    // The old contract: airTempF: 75 → ~23.89°C. A typed "75F" must agree.
    const legacy = tempMetric(validateManualEntry({ airTempF: 75 }))!.value;
    const typed = tempMetric(
      validateManualEntry({ airTempC: wireTypedTemperature("75F", "celsius").celsius }),
    )!.value;
    expect(typed).toBeCloseTo(legacy, 6);
    expect(legacy).toBeCloseTo(23.89, 2);
  });
});

describe("never double-converts", () => {
  it("round-trips every explicit unit through the full wiring", () => {
    for (const unit of ["fahrenheit", "celsius"] as const) {
      for (const f of [32, 50, 72, 75.5, 100]) {
        const { celsius, fahrenheit } = wireTypedTemperature(`${f}F`, unit);
        expect(celsius as number, `${f}F under ${unit}`).toBeCloseTo(fahrenheitToCelsius(f), 6);
        // The Fahrenheit view handed to °F-based helpers must equal what was typed.
        expect(fahrenheit as number, `${f}F under ${unit}`).toBeCloseTo(f, 2);
      }
      for (const c of [0, 18, 22.5, 30]) {
        const { celsius } = wireTypedTemperature(`${c}C`, unit);
        expect(celsius as number, `${c}C under ${unit}`).toBeCloseTo(c, 6);
      }
    }
  });

  it("airTempC wins when both fields are supplied, so a stale °F cannot double-count", () => {
    const v = validateManualEntry({ airTempF: 999, airTempC: 22 });
    expect(tempMetric(v)!.value).toBeCloseTo(22, 2);
  });
});

describe("range warnings are worded in the unit the grower used", () => {
  it("quotes the °F band for Fahrenheit input", () => {
    const cold = validateManualEntry({ airTempF: 30 });
    expect(cold.ok).toBe(true);
    expect(cold.warnings.some((w) => w.includes("50–100°F"))).toBe(true);
  });

  it("quotes the °C band for Celsius input, never a °F range", () => {
    const cold = validateManualEntry({ airTempC: 2 });
    expect(cold.ok).toBe(true);
    expect(cold.warnings.some((w) => w.includes("10–38°C"))).toBe(true);
    expect(cold.warnings.some((w) => w.includes("°F"))).toBe(false);
  });

  it("stays quiet inside the typical band in either unit", () => {
    for (const input of [{ airTempF: 75 }, { airTempC: 24 }]) {
      const v = validateManualEntry(input);
      expect(
        v.warnings.some((w) => w.includes("outside the typical")),
        JSON.stringify(input),
      ).toBe(false);
    }
  });

  it("still derives a VPD preview notice from a Celsius-entered temp", () => {
    const v = validateManualEntry({ airTempC: 24, humidityPct: 55 });
    expect(v.warnings.some((w) => w.includes("Air VPD estimate is preview-only"))).toBe(true);
  });
});

describe("the advisor's Celsius-in-a-°F-field heuristic gets SHARPER", () => {
  it('no longer misfires on an explicit "22°C"', () => {
    // 22 typed bare under °F would look like a Celsius mistake. Typed as "22°C"
    // it is deliberate, arrives as 71.6°F, and must not be second-guessed.
    const { fahrenheit } = wireTypedTemperature("22°C", "fahrenheit");
    expect(fahrenheit as number).toBeCloseTo(71.6, 1);
    const advisor = evaluateManualSnapshotAdvisor({ airTempF: fahrenheit });
    expect(advisor.warnings.some((w) => w.includes("looks like a Celsius value"))).toBe(false);
  });

  it("still catches a bare 22 typed under a °F preference", () => {
    const { fahrenheit } = wireTypedTemperature("22", "fahrenheit");
    expect(fahrenheit as number).toBeCloseTo(22, 2);
    const advisor = evaluateManualSnapshotAdvisor({ airTempF: fahrenheit });
    expect(advisor.warnings.some((w) => w.includes("looks like a Celsius value"))).toBe(true);
  });

  it("does not fire for a bare 22 under a °C preference — it means 22°C", () => {
    const { fahrenheit } = wireTypedTemperature("22", "celsius");
    const advisor = evaluateManualSnapshotAdvisor({ airTempF: fahrenheit });
    expect(advisor.warnings.some((w) => w.includes("looks like a Celsius value"))).toBe(false);
  });
});

describe("unusable input is rejected, never guessed or silently dropped", () => {
  it("reports an unknown unit and yields no temperature metric", () => {
    for (const raw of ["72K", "72°X", "warm"]) {
      const { parsed, celsius } = wireTypedTemperature(raw, "fahrenheit");
      expect(parsed.ok, raw).toBe(false);
      expect(celsius, raw).toBeNull();
      const v = validateManualEntry({ airTempC: celsius, humidityPct: 55 });
      expect(tempMetric(v), raw).toBeNull();
      // Humidity alone still saves — one bad field does not sink the entry.
      expect(v.ok, raw).toBe(true);
    }
  });

  it("an empty field is simply absent, not an error", () => {
    const { parsed, celsius } = wireTypedTemperature("", "fahrenheit");
    expect(parsed.error).toBe("empty");
    expect(celsius).toBeNull();
    const v = validateManualEntry({ airTempC: celsius, humidityPct: 55 });
    expect(v.ok).toBe(true);
    expect(tempMetric(v)).toBeNull();
  });

  it("blocks the save when temperature was the only field and it was unusable", () => {
    const { celsius } = wireTypedTemperature("72K", "fahrenheit");
    const v = validateManualEntry({ airTempC: celsius });
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes("Enter at least one reading"))).toBe(true);
  });
});

describe("saved preference is honored end-to-end", () => {
  it("a bare number follows whatever is in storage", () => {
    saveTemperatureUnitPreference("celsius");
    expect(parseTemperatureInput("22").unit).toBe("C");
    saveTemperatureUnitPreference("fahrenheit");
    expect(parseTemperatureInput("72").unit).toBe("F");
  });

  it("defaults to °F when nothing is saved (parity with prior behavior)", () => {
    const parsed = parseTemperatureInput("75");
    expect(parsed.unit).toBe("F");
    expect(parsed.celsius as number).toBeCloseTo(fahrenheitToCelsius(75), 6);
  });
});
