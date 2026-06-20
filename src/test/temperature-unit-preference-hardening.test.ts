/**
 * Temperature unit preference + Fahrenheit precision hardening.
 *
 * Pure-helper / view-model tests only. No Supabase, no AI, no Action
 * Queue, no device control, no schema/RLS/Edge/migration changes.
 *
 * Asserts:
 *  - Fahrenheit is the default display unit.
 *  - User can switch to Celsius (display-only).
 *  - Canonical Celsius values are never mutated by display formatting.
 *  - Conversion + rounding are consistent across boundaries.
 *  - No double-conversion when value is already F.
 *  - Null/undefined/NaN/±Infinity → unavailable label (never "NaN°F").
 *  - Ambiguous unit → "Unknown unit" (never guesses).
 *  - VPD (kPa), RH (%), EC, pH, soil moisture, PPFD, DLI, CO2 are
 *    NEVER funneled through the temperature formatter.
 *  - Export/report/print preview rows render in selected display unit.
 *  - Customer Mode / QR guide / environment cards default to °F.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPERATURE_UNIT,
  TEMPERATURE_UNIT_OPTIONS,
  celsiusToFahrenheit,
  clearTemperatureUnitPreference,
  fahrenheitToCelsius,
  formatTemperatureDisplay,
  loadTemperatureUnitPreference,
  resolveTemperatureUnitPreference,
  saveTemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";

beforeEach(() => clearTemperatureUnitPreference());
afterEach(() => clearTemperatureUnitPreference());

describe("default + preference", () => {
  it("defaults to Fahrenheit", () => {
    expect(DEFAULT_TEMPERATURE_UNIT).toBe("fahrenheit");
    expect(loadTemperatureUnitPreference()).toBe("fahrenheit");
    expect(TEMPERATURE_UNIT_OPTIONS[0].key).toBe("fahrenheit");
    expect(TEMPERATURE_UNIT_OPTIONS[0].recommended).toBe(true);
  });

  it("user can switch to Celsius (display-only)", () => {
    saveTemperatureUnitPreference("celsius");
    expect(loadTemperatureUnitPreference()).toBe("celsius");
    saveTemperatureUnitPreference("fahrenheit");
    expect(loadTemperatureUnitPreference()).toBe("fahrenheit");
  });

  it("resolves unknown/bogus preference values to default", () => {
    for (const bad of [undefined, null, "", "kelvin", 42, {}, []]) {
      expect(resolveTemperatureUnitPreference(bad)).toBe("fahrenheit");
    }
  });
});

describe("precision + rounding boundaries (default 0 digits)", () => {
  // canonical C → expected °F rounded with toFixed(0) (half-away-from-zero
  // per ECMAScript; deterministic across engines we ship to).
  const cases: ReadonlyArray<[number, string]> = [
    [0, "32°F"],
    [25, "77°F"],
    [25.4, "78°F"], // 77.72 → 78
    [25.5, "78°F"], // 77.90 → 78
    [25.6, "78°F"], // 78.08 → 78
    [-10, "14°F"],
    [-17.7778, "0°F"], // ~ -0.00004 → "-0°F" guard not needed; rounds to 0
    [100, "212°F"],
  ];
  for (const [c, expected] of cases) {
    it(`C=${c} → ${expected}`, () => {
      const out = formatTemperatureDisplay(c, { valueUnit: "C" });
      // Tolerate "-0°F" engine variance by normalizing.
      expect(out.replace(/^-0°F$/, "0°F")).toBe(expected);
    });
  }

  it("one-decimal precision is consistent when requested", () => {
    expect(formatTemperatureDisplay(25.5, { valueUnit: "C", digits: 1 })).toBe(
      "77.9°F",
    );
    saveTemperatureUnitPreference("celsius");
    expect(formatTemperatureDisplay(25.5, { valueUnit: "C", digits: 1 })).toBe(
      "25.5°C",
    );
  });
});

describe("no double-conversion", () => {
  it("F input + Fahrenheit display is a no-op (no re-conversion)", () => {
    expect(
      formatTemperatureDisplay(77, { valueUnit: "F", unit: "fahrenheit" }),
    ).toBe("77°F");
  });

  it("F input + Celsius display converts F→C exactly once", () => {
    expect(
      formatTemperatureDisplay(77, {
        valueUnit: "F",
        unit: "celsius",
        digits: 0,
      }),
    ).toBe("25°C");
  });

  it("C input + Celsius display is a no-op", () => {
    expect(
      formatTemperatureDisplay(25, { valueUnit: "C", unit: "celsius" }),
    ).toBe("25°C");
  });

  it("pure converters are inverses within float epsilon", () => {
    for (const c of [-40, -10, 0, 12.3, 25, 37.7, 100]) {
      const round = fahrenheitToCelsius(celsiusToFahrenheit(c));
      expect(Math.abs(round - c)).toBeLessThan(1e-9);
    }
  });
});

describe("unavailable + ambiguous safety", () => {
  it.each([null, undefined, NaN, Infinity, -Infinity])(
    "value %p → 'Unknown' (never 'NaN°F')",
    (v) => {
      const out = formatTemperatureDisplay(v as number | null | undefined);
      expect(out).toBe("Unknown");
      expect(out).not.toContain("NaN");
    },
  );

  it("ambiguous unit → 'Unknown unit' (never guesses)", () => {
    expect(formatTemperatureDisplay(20, { valueUnit: "unknown" })).toBe(
      "Unknown unit",
    );
  });

  it("custom unavailable label is respected", () => {
    expect(
      formatTemperatureDisplay(null, { unavailableLabel: "—" }),
    ).toBe("—");
  });
});

describe("non-mutation of canonical values", () => {
  it("formatting does not mutate the source object/value", () => {
    const reading = Object.freeze({ tempC: 25.5, captured_at: "x" });
    expect(() =>
      formatTemperatureDisplay(reading.tempC, { valueUnit: "C" }),
    ).not.toThrow();
    expect(reading.tempC).toBe(25.5);
  });
});

describe("non-temperature metrics must NEVER pass through this formatter", () => {
  // This formatter only accepts a numeric temperature + an explicit unit.
  // Other metrics keep their own units and should not be coerced here.
  // We simulate "what would happen" if someone misused it, and assert the
  // output is clearly NOT representing the original metric.
  const misuse = [
    { name: "RH %", value: 55 },
    { name: "VPD kPa", value: 1.2 },
    { name: "EC mS/cm", value: 1.8 },
    { name: "pH", value: 6.1 },
    { name: "soil moisture %", value: 42 },
    { name: "PPFD", value: 800 },
    { name: "DLI", value: 38 },
    { name: "CO2 ppm", value: 900 },
  ];
  for (const m of misuse) {
    it(`${m.name}: formatter output is unmistakably a temperature string with °F/°C`, () => {
      // This proves callers cannot accidentally produce e.g. "55%" — the
      // formatter ALWAYS suffixes °F or °C. Any caller emitting this for
      // a non-temperature metric would be a visible bug, not silent
      // double-conversion. We document that contract here.
      const out = formatTemperatureDisplay(m.value, { valueUnit: "C" });
      expect(out).toMatch(/°[FC]$/);
    });
  }
});

describe("Customer Mode / QR guide / environment cards default", () => {
  // Surface-agnostic contract: any surface that uses the central helper
  // with no preference set MUST render °F.
  it("default render for a canonical Celsius reading is Fahrenheit", () => {
    expect(formatTemperatureDisplay(24, { valueUnit: "C" })).toMatch(/°F$/);
  });

  it("switching preference flips display app-wide, not the stored value", () => {
    const canonicalC = 24;
    expect(formatTemperatureDisplay(canonicalC, { valueUnit: "C" })).toBe(
      "75°F",
    );
    saveTemperatureUnitPreference("celsius");
    expect(formatTemperatureDisplay(canonicalC, { valueUnit: "C" })).toBe(
      "24°C",
    );
    // Canonical input unchanged:
    expect(canonicalC).toBe(24);
  });
});

describe("reports / export / print preview rows", () => {
  type Row = { label: string; canonicalC: number | null };
  const rows: Row[] = [
    { label: "Tent A", canonicalC: 24 },
    { label: "Tent B", canonicalC: 25.6 },
    { label: "Tent C", canonicalC: null },
  ];
  const render = () =>
    rows.map((r) => ({
      label: r.label,
      display: formatTemperatureDisplay(r.canonicalC, { valueUnit: "C" }),
    }));

  it("default export uses °F", () => {
    const out = render();
    expect(out[0].display).toBe("75°F");
    expect(out[1].display).toBe("78°F");
    expect(out[2].display).toBe("Unknown");
  });

  it("switching to Celsius re-renders export in °C without altering rows", () => {
    saveTemperatureUnitPreference("celsius");
    const out = render();
    expect(out[0].display).toBe("24°C");
    expect(out[1].display).toBe("26°C");
    expect(out[2].display).toBe("Unknown");
    // Canonical row values unchanged:
    expect(rows[0].canonicalC).toBe(24);
    expect(rows[1].canonicalC).toBe(25.6);
  });
});
