/**
 * parseTemperatureInput / formatTemperatureForInput
 *
 * Covers typed temperature entry: explicit unit suffixes ("72°F", "22 °C"),
 * bare numbers resolved against the saved display preference, decimal-comma
 * input, degree-symbol lookalikes, and the refusals — an unrecognized unit is
 * never guessed.
 *
 * Canonical store is Celsius, so every successful parse reports `celsius`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  parseTemperatureInput,
  formatTemperatureForInput,
  saveTemperatureUnitPreference,
  clearTemperatureUnitPreference,
  celsiusToFahrenheit,
  fahrenheitToCelsius,
} from "@/lib/temperatureUnitPreference";

const closeTo = (actual: number | null, expected: number, digits = 6) => {
  expect(actual).not.toBeNull();
  expect(actual as number).toBeCloseTo(expected, digits);
};

beforeEach(() => {
  clearTemperatureUnitPreference();
});

describe("explicit °F input", () => {
  it.each(["72°F", "72 °F", "72°f", "72F", "72 F", "72 f", "72  °F"])(
    "parses %s as 72°F",
    (raw) => {
      const r = parseTemperatureInput(raw);
      expect(r.ok).toBe(true);
      expect(r.unit).toBe("F");
      expect(r.unitAssumed).toBe(false);
      expect(r.value).toBe(72);
      closeTo(r.celsius, fahrenheitToCelsius(72));
    },
  );

  it("71.6°F is exactly 22°C", () => {
    closeTo(parseTemperatureInput("71.6°F").celsius, 22);
  });
});

describe("explicit °C input", () => {
  it.each(["22°C", "22 °C", "22°c", "22C", "22 c"])("parses %s as 22°C", (raw) => {
    const r = parseTemperatureInput(raw);
    expect(r.ok).toBe(true);
    expect(r.unit).toBe("C");
    expect(r.unitAssumed).toBe(false);
    expect(r.celsius).toBe(22);
  });

  it("keeps a Celsius value unconverted", () => {
    expect(parseTemperatureInput("18°C").celsius).toBe(18);
  });
});

describe("bare numbers resolve against the saved preference", () => {
  it("assumes °F when the preference is fahrenheit (the default)", () => {
    saveTemperatureUnitPreference("fahrenheit");
    const r = parseTemperatureInput("72");
    expect(r.ok).toBe(true);
    expect(r.unit).toBe("F");
    expect(r.unitAssumed).toBe(true);
    closeTo(r.celsius, fahrenheitToCelsius(72));
  });

  it("assumes °C when the preference is celsius", () => {
    saveTemperatureUnitPreference("celsius");
    const r = parseTemperatureInput("22");
    expect(r.ok).toBe(true);
    expect(r.unit).toBe("C");
    expect(r.unitAssumed).toBe(true);
    expect(r.celsius).toBe(22);
  });

  it("an explicit suffix always beats the preference", () => {
    saveTemperatureUnitPreference("celsius");
    const r = parseTemperatureInput("72°F");
    expect(r.unit).toBe("F");
    expect(r.unitAssumed).toBe(false);
    closeTo(r.celsius, fahrenheitToCelsius(72));
  });

  it("assumeUnit overrides the saved preference", () => {
    saveTemperatureUnitPreference("fahrenheit");
    const r = parseTemperatureInput("22", { assumeUnit: "C" });
    expect(r.unit).toBe("C");
    expect(r.celsius).toBe(22);
  });

  it("accepts a preference-shaped assumeUnit too", () => {
    const r = parseTemperatureInput("22", { assumeUnit: "celsius" });
    expect(r.unit).toBe("C");
    expect(r.celsius).toBe(22);
  });
});

describe("number formats", () => {
  it("handles negatives", () => {
    expect(parseTemperatureInput("-5°C").celsius).toBe(-5);
    closeTo(parseTemperatureInput("-4°F").celsius, fahrenheitToCelsius(-4));
  });

  it("handles a leading plus", () => {
    expect(parseTemperatureInput("+22°C").celsius).toBe(22);
  });

  it("accepts a decimal comma", () => {
    expect(parseTemperatureInput("22,5°C").celsius).toBe(22.5);
  });

  it("accepts a leading decimal separator", () => {
    expect(parseTemperatureInput(".5C").celsius).toBe(0.5);
    expect(parseTemperatureInput(",5C").celsius).toBe(0.5);
  });

  it("normalizes degree-symbol lookalikes", () => {
    for (const raw of ["22ºC", "22˚C", "22∘C"]) {
      expect(parseTemperatureInput(raw).celsius, raw).toBe(22);
    }
  });

  it("normalizes non-breaking and thin spaces", () => {
    // Built from escapes: literal NBSP/thin-space are indistinguishable in review.
    const NBSP = "\u00A0";
    const NARROW_NBSP = "\u202F";
    const THIN = "\u2009";
    for (const raw of [`22${NBSP}°C`, `22${NARROW_NBSP}°C`, `22${THIN}°C`]) {
      expect(parseTemperatureInput(raw).celsius, JSON.stringify(raw)).toBe(22);
    }
  });

  it("accepts a raw finite number, marking the unit assumed", () => {
    saveTemperatureUnitPreference("celsius");
    const r = parseTemperatureInput(22);
    expect(r.ok).toBe(true);
    expect(r.unitAssumed).toBe(true);
    expect(r.celsius).toBe(22);
  });
});

describe("refusals — never guess", () => {
  it("rejects an unrecognized unit rather than guessing", () => {
    for (const raw of ["72K", "72 K", "72°X", "72kelvin", "72FC", "72CF"]) {
      const r = parseTemperatureInput(raw);
      expect(r.ok, raw).toBe(false);
      expect(r.error, raw).toBe("unknown_unit");
      expect(r.celsius, raw).toBeNull();
    }
  });

  it("rejects non-numeric text", () => {
    for (const raw of ["abc", "warm", "--5", "72 72", "72°F extra", "7.2.5"]) {
      const r = parseTemperatureInput(raw);
      expect(r.ok, raw).toBe(false);
      expect(r.error, raw).toBe("not_a_number");
    }
  });

  it("reports empty input as `empty`, not as an error to shout about", () => {
    for (const raw of ["", "   ", " ", null, undefined]) {
      const r = parseTemperatureInput(raw as string | null | undefined);
      expect(r.ok).toBe(false);
      expect(r.error).toBe("empty");
    }
  });

  it("rejects non-finite numbers", () => {
    for (const raw of [NaN, Infinity, -Infinity]) {
      const r = parseTemperatureInput(raw);
      expect(r.ok).toBe(false);
      expect(r.error).toBe("not_a_number");
    }
  });

  it("never returns a celsius value when !ok", () => {
    for (const raw of ["", "abc", "72K"]) {
      expect(parseTemperatureInput(raw).celsius).toBeNull();
    }
  });
});

describe("no double conversion", () => {
  it("F → celsius → F round-trips", () => {
    for (const f of [-4, 0, 32, 68, 72, 104]) {
      const c = parseTemperatureInput(`${f}°F`).celsius as number;
      expect(celsiusToFahrenheit(c)).toBeCloseTo(f, 6);
    }
  });

  it("an explicit °C value is stored verbatim", () => {
    for (const c of [-10, 0, 18, 22.5, 40]) {
      expect(parseTemperatureInput(`${c}°C`).celsius).toBe(c);
    }
  });
});

describe("formatTemperatureForInput", () => {
  it("renders stored celsius in the preferred unit, unsuffixed", () => {
    saveTemperatureUnitPreference("fahrenheit");
    expect(formatTemperatureForInput(22)).toBe("71.6");
    saveTemperatureUnitPreference("celsius");
    expect(formatTemperatureForInput(22)).toBe("22");
  });

  it("drops a trailing .0 so whole numbers read cleanly", () => {
    saveTemperatureUnitPreference("celsius");
    expect(formatTemperatureForInput(18)).toBe("18");
  });

  it("returns '' for missing/invalid values so it can seed a controlled input", () => {
    for (const v of [null, undefined, NaN, Infinity]) {
      expect(formatTemperatureForInput(v as number | null | undefined)).toBe("");
    }
  });

  it("round-trips through the parser under either preference", () => {
    for (const unit of ["fahrenheit", "celsius"] as const) {
      saveTemperatureUnitPreference(unit);
      const text = formatTemperatureForInput(21.5, { digits: 2 });
      const back = parseTemperatureInput(text);
      expect(back.ok, unit).toBe(true);
      expect(back.celsius as number, unit).toBeCloseTo(21.5, 2);
    }
  });
});
