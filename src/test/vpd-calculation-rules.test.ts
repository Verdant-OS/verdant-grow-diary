import { describe, it, expect } from "vitest";
import {
  deriveVpd,
  fahrenheitToCelsius,
  saturationVaporPressureKpa,
  VPD_NEEDS_INPUTS_LABEL,
} from "@/lib/vpdCalculationRules";

describe("vpdCalculationRules", () => {
  it("derives VPD from valid Celsius temperature and humidity", () => {
    const r = deriveVpd({ temperature: 25, humidity: 60 });
    expect(r.kind).toBe("derived");
    if (r.kind === "derived") {
      // ~1.27 kPa for 25C/60%
      expect(r.vpdKpa).toBeGreaterThan(1.2);
      expect(r.vpdKpa).toBeLessThan(1.35);
      expect(r.tempC).toBe(25);
      expect(r.humidity).toBe(60);
    }
  });

  it("converts Fahrenheit to Celsius before calculation", () => {
    const c = deriveVpd({ temperature: 25, humidity: 60 });
    const f = deriveVpd({
      temperature: 77, // == 25C
      humidity: 60,
      temperatureUnit: "F",
    });
    expect(f.kind).toBe("derived");
    if (f.kind === "derived" && c.kind === "derived") {
      expect(f.vpdKpa).toBeCloseTo(c.vpdKpa, 1);
    }
    expect(fahrenheitToCelsius(32)).toBeCloseTo(0, 5);
    expect(fahrenheitToCelsius(212)).toBeCloseTo(100, 5);
  });

  it("is missing (not invalid) when humidity is absent", () => {
    const r = deriveVpd({ temperature: 25, humidity: null });
    expect(r.kind).toBe("missing");
    if (r.kind === "missing") {
      expect(r.reason).toBe("needs_temperature_and_humidity");
    }
  });

  it("is missing when temperature is absent", () => {
    const r = deriveVpd({ temperature: null, humidity: 50 });
    expect(r.kind).toBe("missing");
  });

  it("is missing when both are absent", () => {
    const r = deriveVpd({});
    expect(r.kind).toBe("missing");
  });

  it("marks invalid humidity outside 0-100", () => {
    expect(deriveVpd({ temperature: 25, humidity: -1 }).kind).toBe("invalid");
    expect(deriveVpd({ temperature: 25, humidity: 101 }).kind).toBe("invalid");
  });

  it("marks invalid temperature outside realistic range", () => {
    expect(deriveVpd({ temperature: 200, humidity: 50 }).kind).toBe(
      "invalid",
    );
  });

  it("exposes calm 'Needs temperature + humidity' label, not 'Unavailable'", () => {
    expect(VPD_NEEDS_INPUTS_LABEL).toBe("Needs temperature + humidity");
    expect(VPD_NEEDS_INPUTS_LABEL.toLowerCase()).not.toContain("unavailable");
  });

  it("saturation vapor pressure is deterministic and positive", () => {
    expect(saturationVaporPressureKpa(20)).toBeGreaterThan(0);
    expect(saturationVaporPressureKpa(20)).toEqual(
      saturationVaporPressureKpa(20),
    );
  });
});

import {
  formatVpdKpa,
  VPD_DERIVED_NOTE,
  VPD_ROUNDING_NOTE,
} from "@/lib/vpdCalculationRules";

describe("formatVpdKpa", () => {
  it("formats 1.206 as '1.21 kPa'", () => {
    expect(formatVpdKpa(1.206)).toBe("1.21 kPa");
  });
  it("formats whole numbers with 2 decimals", () => {
    expect(formatVpdKpa(1)).toBe("1.00 kPa");
  });
  it("returns '—' for null/undefined/NaN/Infinity", () => {
    expect(formatVpdKpa(null)).toBe("—");
    expect(formatVpdKpa(undefined)).toBe("—");
    expect(formatVpdKpa(Number.NaN)).toBe("—");
    expect(formatVpdKpa(Number.POSITIVE_INFINITY)).toBe("—");
  });
  it("exports stable derived + rounding notes", () => {
    expect(VPD_DERIVED_NOTE).toBe("Calculated from temperature and humidity.");
    expect(VPD_ROUNDING_NOTE).toBe("Rounded to 2 decimals.");
  });
});
