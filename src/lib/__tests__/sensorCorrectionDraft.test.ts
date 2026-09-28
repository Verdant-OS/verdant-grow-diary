import { describe, expect, it } from "vitest";
import type { ManualCorrectionContext } from "@/lib/manualSensorCorrectionContext";
import { recoveredCorrectionDraftValues } from "@/lib/sensorCorrectionDraft";

const correction = (overrides?: Partial<ManualCorrectionContext>): ManualCorrectionContext => ({
  tentId: "11111111-1111-4111-8111-111111111111",
  originalCapturedAt: "2026-09-16T08:00:00.000Z",
  originalReadingIds: {
    temperature_c: "22222222-2222-4222-8222-222222222222",
    humidity_pct: "33333333-3333-4333-8333-333333333333",
  },
  originalValues: { temperature_c: 24, humidity_pct: 55, co2_ppm: 900 },
  ...overrides,
});

describe("recoveredCorrectionDraftValues", () => {
  it("restores the recovered metrics as a canonical Celsius draft", () => {
    expect(
      recoveredCorrectionDraftValues(correction(), [
        { metric: "temperature_c", value: 26 },
        { metric: "humidity_pct", value: 60 },
        { metric: "co2_ppm", value: 950 },
      ]),
    ).toEqual({
      form: {
        airTemp: "26",
        airTempUnit: "C",
        humidityPct: "60",
        vpdKpa: "",
        co2Ppm: "950",
        soilMoisturePct: "",
        ppfd: "",
      },
      tempUnitOverride: "C",
      devicePreset: "none",
      deviceCustom: "",
      hasEditedReading: true,
      revision: 0,
      pendingStandardSnapshot: null,
      saveUnconfirmed: true,
      lastSaved: null,
    });
  });

  it("returns an empty canonical Celsius draft when no metrics were recovered", () => {
    expect(recoveredCorrectionDraftValues(correction(), [])).toEqual({
      form: {
        airTemp: "",
        airTempUnit: "C",
        humidityPct: "",
        vpdKpa: "",
        co2Ppm: "",
        soilMoisturePct: "",
        ppfd: "",
      },
      tempUnitOverride: "C",
      devicePreset: "none",
      deviceCustom: "",
      hasEditedReading: true,
      revision: 0,
      pendingStandardSnapshot: null,
      saveUnconfirmed: true,
      lastSaved: null,
    });
  });

  it("restores only the recovered subset without backfilling missing metrics", () => {
    expect(
      recoveredCorrectionDraftValues(correction(), [{ metric: "humidity_pct", value: 60 }]),
    ).toEqual({
      form: {
        airTemp: "",
        airTempUnit: "C",
        humidityPct: "60",
        vpdKpa: "",
        co2Ppm: "",
        soilMoisturePct: "",
        ppfd: "",
      },
      tempUnitOverride: "C",
      devicePreset: "none",
      deviceCustom: "",
      hasEditedReading: true,
      revision: 0,
      pendingStandardSnapshot: null,
      saveUnconfirmed: true,
      lastSaved: null,
    });
  });
});
