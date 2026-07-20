import { describe, expect, it } from "vitest";

import * as publicVpdRules from "@/lib/publicVpdCalculatorRules";
import type { TempUnit } from "@/lib/vpdRules";

type TemperatureFieldValidity = "blank" | "valid" | "out_of_range" | "invalid";

interface TemperatureFieldState {
  displayValue: string;
  rawInput: string;
  canonicalC: number | null;
  validity: TemperatureFieldValidity;
}

type ParseTemperatureField = (rawInput: string, unit: TempUnit) => TemperatureFieldState;
type RedisplayTemperatureField = (
  field: TemperatureFieldState,
  unit: TempUnit,
) => TemperatureFieldState;
type TemperatureEvaluationValue = (field: TemperatureFieldState) => number | null;

function temperatureFieldApi() {
  const candidate = publicVpdRules as unknown as {
    parsePublicVpdTemperatureField?: ParseTemperatureField;
    redisplayPublicVpdTemperatureField?: RedisplayTemperatureField;
    toPublicVpdTemperatureEvaluationValue?: TemperatureEvaluationValue;
  };

  expect(candidate.parsePublicVpdTemperatureField).toBeTypeOf("function");
  expect(candidate.redisplayPublicVpdTemperatureField).toBeTypeOf("function");
  expect(candidate.toPublicVpdTemperatureEvaluationValue).toBeTypeOf("function");

  return {
    parse: candidate.parsePublicVpdTemperatureField!,
    redisplay: candidate.redisplayPublicVpdTemperatureField!,
    evaluationValue: candidate.toPublicVpdTemperatureEvaluationValue!,
  };
}

describe("public VPD temperature field rules", () => {
  it("keeps canonical Celsius exact across repeated unit-only redisplays", () => {
    const { parse, redisplay } = temperatureFieldApi();
    let air = parse("78", "F");
    let leaf = parse("73.4", "F");
    const airCanonicalC = air.canonicalC;
    const leafCanonicalC = leaf.canonicalC;

    air = redisplay(air, "C");
    leaf = redisplay(leaf, "C");
    expect(air.displayValue).toBe("25.6");
    expect(leaf.displayValue).toBe("23");

    air = redisplay(air, "F");
    leaf = redisplay(leaf, "F");
    expect(air.displayValue).toBe("78");
    expect(leaf.displayValue).toBe("73.4");

    for (let index = 0; index < 20; index += 1) {
      const unit: TempUnit = index % 2 === 0 ? "C" : "F";
      air = redisplay(air, unit);
      leaf = redisplay(leaf, unit);
    }

    expect(air).toMatchObject({
      displayValue: "78",
      canonicalC: airCanonicalC,
      validity: "valid",
    });
    expect(leaf).toMatchObject({
      displayValue: "73.4",
      canonicalC: leafCanonicalC,
      validity: "valid",
    });
  });

  it("formats one decimal at most, trims trailing zero, and normalizes negative zero", () => {
    const { parse, redisplay } = temperatureFieldApi();

    expect(redisplay(parse("77", "F"), "C").displayValue).toBe("25");
    expect(redisplay(parse("-0", "C"), "C").displayValue).toBe("0");
    expect(redisplay(parse("-0.01", "C"), "C").displayValue).toBe("0");
  });

  it("keeps blank and malformed or non-finite values distinct without inventing zero", () => {
    const { parse, redisplay, evaluationValue } = temperatureFieldApi();
    const blank = parse("   ", "F");
    const malformed = parse("not-a-number", "F");
    const nonFinite = parse("Infinity", "C");

    expect(blank).toEqual({
      displayValue: "",
      rawInput: "",
      canonicalC: null,
      validity: "blank",
    });
    expect(redisplay(blank, "C")).toEqual(blank);
    expect(evaluationValue(blank)).toBeNull();

    for (const invalid of [malformed, nonFinite]) {
      expect(invalid.validity).toBe("invalid");
      expect(invalid.canonicalC).toBeNull();
      expect(invalid.displayValue).toBe("");
      expect(invalid.displayValue).not.toMatch(/0|nan|infinity/i);
      expect(Number.isNaN(evaluationValue(invalid))).toBe(true);
      expect(redisplay(invalid, "F").validity).toBe("invalid");
    }
  });

  it("preserves finite out-of-range truth through conversion", () => {
    const { parse, redisplay, evaluationValue } = temperatureFieldApi();
    const fahrenheit = parse("141", "F");
    const celsius = redisplay(fahrenheit, "C");
    const roundTrip = redisplay(celsius, "F");

    expect(fahrenheit.validity).toBe("out_of_range");
    expect(celsius).toMatchObject({ displayValue: "60.6", validity: "out_of_range" });
    expect(roundTrip).toMatchObject({ displayValue: "141", validity: "out_of_range" });
    expect(evaluationValue(roundTrip)).toBeGreaterThan(60);

    expect(parse("-20", "C").validity).toBe("valid");
    expect(parse("60", "C").validity).toBe("valid");
    expect(parse("-20.1", "C").validity).toBe("out_of_range");
    expect(parse("60.1", "C").validity).toBe("out_of_range");
  });

  it("does not render an overflowed conversion as Infinity", () => {
    const { parse, redisplay, evaluationValue } = temperatureFieldApi();
    const extreme = parse(String(Number.MAX_VALUE), "C");
    const converted = redisplay(extreme, "F");

    expect(converted.validity).toBe("out_of_range");
    expect(converted.displayValue).toBe("");
    expect(converted.displayValue).not.toMatch(/infinity|nan|0/i);
    expect(evaluationValue(converted)).toBe(Number.MAX_VALUE);
  });

  it("treats a post-conversion edit as a deliberate new canonical value", () => {
    const { parse, redisplay } = temperatureFieldApi();
    const original = parse("78", "F");
    const displayedCelsius = redisplay(original, "C");
    const edited = parse(displayedCelsius.displayValue, "C");

    expect(displayedCelsius.displayValue).toBe("25.6");
    expect(edited.canonicalC).toBe(25.6);
    expect(edited.canonicalC).not.toBe(original.canonicalC);
    expect(redisplay(edited, "F").displayValue).toBe("78.1");
  });
});
