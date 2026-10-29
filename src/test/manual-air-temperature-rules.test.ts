import { describe, expect, it } from "vitest";
import {
  isManualAirTemperatureValid,
  MANUAL_AIR_TEMP_MAX_C,
  MANUAL_AIR_TEMP_MIN_C,
  MANUAL_AIR_TEMPERATURE_RANGE_MESSAGE_BOTH_UNITS,
  manualAirTemperatureRangeMessage,
} from "@/lib/manualAirTemperatureRules";
import { AIR_TEMP_C_RANGE } from "@/constants/csvValidationRanges";
import { validateManualEntry } from "@/lib/sensorReadingManualEntryRules";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import { quickLogReasonToOperatorMessage } from "@/lib/quickLogSaveErrorMessage";
import { assessQuickLogSensorSnapshotGate } from "@/lib/quickLogSensorSnapshotGateRules";
import {
  describeQuickLogActivityDetails,
  getQuickLogActivityDetailFields,
  validateQuickLogDetailNumberInput,
} from "@/lib/quickLogActivityDetailFields";

describe("manual air temperature band (owner decision 2026-10-28: -10..50 °C)", () => {
  it("is the same band the manual insert validator uses", () => {
    expect(MANUAL_AIR_TEMP_MIN_C).toBe(AIR_TEMP_C_RANGE.min);
    expect(MANUAL_AIR_TEMP_MAX_C).toBe(AIR_TEMP_C_RANGE.max);
    expect([MANUAL_AIR_TEMP_MIN_C, MANUAL_AIR_TEMP_MAX_C]).toEqual([-10, 50]);
  });

  it("accepts the edges and null, rejects just past them and non-finite values", () => {
    for (const v of [null, -10, 0, 24, 50]) expect(isManualAirTemperatureValid(v)).toBe(true);
    for (const v of [-10.01, 50.01, 55, 60, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isManualAirTemperatureValid(v)).toBe(false);
    }
  });

  it("states the band in the grower's unit, and in both where the unit is unknown", () => {
    expect(manualAirTemperatureRangeMessage("fahrenheit")).toBe(
      "Temperature must be between 14 and 122 °F.",
    );
    expect(manualAirTemperatureRangeMessage("celsius")).toBe(
      "Temperature must be between -10 and 50 °C.",
    );
    expect(MANUAL_AIR_TEMPERATURE_RANGE_MESSAGE_BOTH_UNITS).toBe(
      "Temperature must be between -10 and 50 °C (14–122 °F).",
    );
    expect(quickLogReasonToOperatorMessage("temperature_out_of_range")).toBe(
      MANUAL_AIR_TEMPERATURE_RANGE_MESSAGE_BOTH_UNITS,
    );
  });
});

describe("2,462 °F typed at the tent door (Case Files Ep07)", () => {
  it("is refused by the Sensors / Daily Check card before Confirm, with no metric to insert", () => {
    const v = validateManualEntry({ airTemp: "2462", airTempUnit: "F", humidityPct: 55 });
    expect(v.ok).toBe(false);
    expect(v.errors).toContain("Temperature must be between 14 and 122 °F.");
    expect(v.metrics.some((m) => m.metric === "temperature_c")).toBe(false);
  });

  it("blocks the Quick Log snapshot gate in °F", () => {
    const gate = assessQuickLogSensorSnapshotGate({
      temperatureInput: "2462",
      humidityInput: "",
      vpdInput: "",
      temperatureUnit: "fahrenheit",
    });
    expect(gate.blocksSave).toBe(true);
    expect(gate.fields.temperature).toBe("Temperature must be between 14 and 122 °F.");
  });

  it("closes the old 50–60 °C gap: 55 °C no longer builds a Quick Log payload", () => {
    const input = {
      resolved: {
        ok: true as const,
        targetType: "tent" as const,
        targetId: "t1",
        tentId: "t1",
        plantId: null,
      },
      action: "note" as const,
      volumeMl: "",
      note: "check-in",
      temperatureC: "55",
      humidityPct: "",
      vpdKpa: "",
      idempotencyKey: "manual-air-temperature-test-0001",
    };
    expect(buildQuickLogV2SavePayload(input)).toMatchObject({
      ok: false,
      reason: "temperature_out_of_range",
    });
    expect(buildQuickLogV2SavePayload({ ...input, temperatureC: "50" }).ok).toBe(true);
  });

  it("is deterministic", () => {
    const input = { airTemp: "2462", airTempUnit: "F" as const };
    expect(validateManualEntry(input)).toEqual(validateManualEntry(input));
  });
});

describe("Environment-check history keeps rows saved under the old 60 °C band", () => {
  it("still displays a stored 55 °C reading while refusing 55 as new input", () => {
    const lines = describeQuickLogActivityDetails("environment_check", {
      environment_check: { temp_c: 55 },
    });
    expect(lines.find((l) => l.key === "temp_c")?.value).toBe("55 °C");

    const temp = getQuickLogActivityDetailFields("environment_check").find(
      (f) => f.key === "temp_c",
    )!;
    expect(validateQuickLogDetailNumberInput(temp, "55").ok).toBe(false);
  });

  it("still hides an implausible stored value", () => {
    const lines = describeQuickLogActivityDetails("environment_check", {
      environment_check: { temp_c: 999 },
    });
    expect(lines.some((l) => l.key === "temp_c")).toBe(false);
  });
});
