/**
 * Timeline headline temperature unit.
 *
 * Stored sensor temperatures are canonical Celsius. The measurement /
 * sensor_snapshot summary suffix used to print the raw value with a bare
 * degree sign ("Measurement · 24.44° · 56% RH") while the row body showed
 * the grower's unit ("76.0°F"), so the headline read as a wrong number.
 * The suffix must carry the unit and follow the grower's preference.
 */
import { describe, it, expect } from "vitest";
import { resolveQuickLogEventIdentity } from "@/lib/quickLogEventIdentityRules";
import { buildMeasurementHistory } from "@/lib/quickLogHistoryRules";
import type { NormalizedDiaryEntry } from "@/lib/diaryEntryRules";

const BARE_DEGREE = /\d°(?![FC])/;

function measurementEntry(): NormalizedDiaryEntry {
  return {
    id: "entry-temp-1",
    growId: "grow-1",
    plantId: "plant-1",
    tentId: "tent-1",
    stage: null,
    eventType: "measurement",
    note: "",
    photoUrl: null,
    createdAt: "2026-11-18T01:16:00.000Z",
    createdAtLabel: "Nov 18",
    dayOfGrow: null,
    weekOfGrow: null,
    details: { sensorSnapshot: { temp: 24.44, rh: 56 } },
    warnings: [],
    isValidForAiContext: true,
  } as unknown as NormalizedDiaryEntry;
}

describe("measurement summary suffix temperature unit", () => {
  it("defaults to Fahrenheit with the unit symbol, never a bare degree", () => {
    const identity = resolveQuickLogEventIdentity({
      eventType: "measurement",
      details: { sensorSnapshot: { temp: 24.44, rh: 56 } },
    });
    expect(identity.summarySuffix).toBe("76.0°F · 56% RH");
    expect(identity.summarySuffix).not.toMatch(BARE_DEGREE);
  });

  it("renders Celsius with the unit symbol when the grower prefers Celsius", () => {
    const identity = resolveQuickLogEventIdentity(
      {
        eventType: "quick_log",
        details: { declaredEventType: "sensor_snapshot", sensorSnapshot: { temp: 24.44 } },
      },
      { temperatureUnit: "celsius" },
    );
    expect(identity.summarySuffix).toBe("24.4°C");
  });

  it("leaves the suffix without a temperature when none was saved", () => {
    const identity = resolveQuickLogEventIdentity({
      eventType: "measurement",
      details: { sensorSnapshot: { rh: 56 } },
    });
    expect(identity.summarySuffix).toBe("56% RH");
  });

  it("carries the grower's unit through the measurement history lane", () => {
    const [celsiusRow] = buildMeasurementHistory([measurementEntry()], {
      temperatureUnit: "celsius",
    });
    expect(celsiusRow.summarySuffix).toBe("24.4°C · 56% RH");

    const [defaultRow] = buildMeasurementHistory([measurementEntry()]);
    expect(defaultRow.summarySuffix).toBe("76.0°F · 56% RH");
    expect(defaultRow.summarySuffix).not.toMatch(BARE_DEGREE);
  });
});
