/**
 * Codex P2 on #2107: the sensor snapshot gate and the sheet's save seam must
 * share one °F → °C conversion. These pin the shared helper and prove the
 * gate's temperature verdict matches what the payload builder decides for
 * the converted value.
 */
import { describe, expect, it } from "vitest";
import {
  convertTypedTemperatureToCelsius,
  typedTemperatureToCelsiusInput,
} from "@/lib/quickLogTypedTemperatureRules";
import { assessQuickLogSensorSnapshotGate } from "@/lib/quickLogSensorSnapshotGateRules";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import type { TemperatureUnitPreference } from "@/lib/temperatureUnitPreference";

const TENT_ID = "22222222-2222-4222-8222-222222222222";

function payloadAccepts(temperatureC: string): boolean {
  const r = buildQuickLogV2SavePayload({
    resolved: { ok: true, targetType: "tent", targetId: TENT_ID, tentId: TENT_ID, plantId: null },
    action: "note",
    volumeMl: "",
    note: "Reading",
    temperatureC,
    humidityPct: "",
    vpdKpa: "",
    idempotencyKey: "typed-temperature-parity",
  });
  return r.ok;
}

describe("convertTypedTemperatureToCelsius", () => {
  it("converts plain °F decimals and rounds to 2 dp", () => {
    expect(convertTypedTemperatureToCelsius("77", "fahrenheit")).toEqual({
      kind: "celsius",
      value: 25,
    });
    expect(convertTypedTemperatureToCelsius(" 140.004 ", "fahrenheit")).toEqual({
      kind: "celsius",
      value: 60,
    });
  });

  it("treats °F text outside the plain-decimal grammar as unconvertible", () => {
    for (const raw of ["1e2", "0x10", "Infinity", "77f", "abc"]) {
      expect(convertTypedTemperatureToCelsius(raw, "fahrenheit"), raw).toEqual({
        kind: "unconvertible",
      });
    }
  });

  it("reads Celsius as the payload reads it and reports blank as empty", () => {
    expect(convertTypedTemperatureToCelsius("25.5", "celsius")).toEqual({
      kind: "celsius",
      value: 25.5,
    });
    expect(convertTypedTemperatureToCelsius("abc", "celsius")).toEqual({ kind: "unconvertible" });
    expect(convertTypedTemperatureToCelsius("  ", "fahrenheit")).toEqual({ kind: "empty" });
    expect(convertTypedTemperatureToCelsius(null, "celsius")).toEqual({ kind: "empty" });
  });
});

describe("typedTemperatureToCelsiusInput (save seam)", () => {
  it("emits the converted °C string for convertible °F input", () => {
    expect(typedTemperatureToCelsiusInput("77", "fahrenheit")).toBe("25");
    expect(typedTemperatureToCelsiusInput("140.004", "fahrenheit")).toBe("60");
  });

  it("passes Celsius, blank and unconvertible input through unchanged", () => {
    expect(typedTemperatureToCelsiusInput(" 25 ", "celsius")).toBe(" 25 ");
    expect(typedTemperatureToCelsiusInput("", "fahrenheit")).toBe("");
    expect(typedTemperatureToCelsiusInput("1e2", "fahrenheit")).toBe("1e2");
  });
});

describe("gate and save seam agree on every convertible temperature", () => {
  const cases: Array<[string, TemperatureUnitPreference]> = [
    ["14", "fahrenheit"],
    ["13.99", "fahrenheit"],
    ["140", "fahrenheit"],
    ["140.004", "fahrenheit"],
    ["140.01", "fahrenheit"],
    ["77", "fahrenheit"],
    ["-10", "celsius"],
    ["-10.01", "celsius"],
    ["60", "celsius"],
    ["60.01", "celsius"],
    ["0x10", "celsius"],
  ];
  it.each(cases)("%s %s", (raw, unit) => {
    const gate = assessQuickLogSensorSnapshotGate({
      temperatureInput: raw,
      humidityInput: "",
      vpdInput: "",
      temperatureUnit: unit,
    });
    const accepted = payloadAccepts(typedTemperatureToCelsiusInput(raw, unit));
    expect(gate.fields.temperature === undefined).toBe(accepted);
  });
});
