/**
 * A newer Quick Log replaces only the climate metrics it observed.
 * The Environment strip ages that manual sibling on the 24-hour window.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convertTypedTemperatureToCelsius } from "@/lib/quickLogTypedTemperatureRules";
import { sensorReadingFromQuickLogEnvironmentRow } from "@/lib/sensorsQuickLogManualSeriesRules";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";
import { buildSensorSnapshotReadModel } from "@/lib/sensors/sensorSnapshotReadModel";
import { LIVE_CURRENT_STATE_STALE_MS, MANUAL_CURRENT_STATE_STALE_MS } from "@/lib/sensorTruthCanon";
import { classifySnapshotTruth } from "@/lib/sensorTruthRules";
import {
  resolveDisplayedTentClimateSnapshot,
  resolveTentClimateChipReading,
  type DisplayedTentClimateSnapshot,
} from "@/lib/tentManualEnvironmentSnapshotRules";

const TENT = "tent-start-room";
const NOW = new Date("2026-11-01T13:16:00.000Z");
const WITHIN_MANUAL_WINDOW = new Date(
  NOW.getTime() - LIVE_CURRENT_STATE_STALE_MS - 60_000,
).toISOString();
const PAST_MANUAL_WINDOW = new Date(
  NOW.getTime() - MANUAL_CURRENT_STATE_STALE_MS - 60_000,
).toISOString();

const typed = convertTypedTemperatureToCelsius("76", "fahrenheit");
if (typed.kind !== "celsius") throw new Error("76 °F did not convert");
const TEMP_C = typed.value;

function manualReading(
  at: string,
  climate: { temperature_c: number | null; humidity_pct: number | null },
) {
  return sensorReadingFromQuickLogEnvironmentRow(
    {
      id: "env-1",
      plant_id: null,
      tent_id: TENT,
      occurred_at: at,
      event_type: "environment",
      source: "manual",
      environment: { ...climate, vpd_kpa: null },
    },
    NOW,
  );
}

function liveSnapshot(overrides: Partial<SensorSnapshot> = {}): SensorSnapshot {
  return {
    source: "live",
    ts: "2026-11-01T12:00:00.000Z",
    temp: 21,
    rh: 55,
    vpd: 1.1,
    co2: 800,
    soil: null,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
    tent_id: TENT,
    ...overrides,
  };
}

function chips(
  displayed: DisplayedTentClimateSnapshot,
  sensor: SensorSnapshot,
  sensorStale: boolean,
) {
  return {
    temp: resolveTentClimateChipReading({
      displayed,
      sensorSnapshot: sensor,
      sensorStale,
      metric: "temp",
    }),
    rh: resolveTentClimateChipReading({
      displayed,
      sensorSnapshot: sensor,
      sensorStale,
      metric: "rh",
    }),
    co2: resolveTentClimateChipReading({
      displayed,
      sensorSnapshot: sensor,
      sensorStale,
      metric: "co2",
    }),
  };
}

function shownFrom(
  sensor: SensorSnapshot | null,
  at: string,
  climate: {
    temperature_c: number | null;
    humidity_pct: number | null;
  },
) {
  const reading = manualReading(at, climate);
  return resolveDisplayedTentClimateSnapshot({
    sensorSnapshot: sensor,
    manuals: reading ? [reading] : [],
    tentId: TENT,
    nowMs: NOW.getTime(),
  });
}

describe("tent climate chips keep sensor metrics a manual log did not observe", () => {
  const sensor = liveSnapshot();

  it("keeps live CO₂ and the unobserved humidity when a newer log is temperature only", () => {
    const displayed = shownFrom(sensor, "2026-11-01T13:15:00.000Z", {
      temperature_c: TEMP_C,
      humidity_pct: null,
    });
    expect(displayed.fromManual).toBe(true);
    expect(chips(displayed, sensor, false)).toEqual({
      temp: { value: TEMP_C, stale: false },
      rh: { value: 55, stale: false },
      co2: { value: 800, stale: false },
    });
  });

  it("keeps live temperature and CO₂ when a newer log is humidity only", () => {
    const displayed = shownFrom(sensor, "2026-11-01T13:15:00.000Z", {
      temperature_c: null,
      humidity_pct: 60,
    });
    expect(chips(displayed, sensor, true)).toEqual({
      temp: { value: 21, stale: true },
      rh: { value: 60, stale: false },
      co2: { value: 800, stale: true },
    });
  });

  it("replaces both climate chips and still shows live CO₂ after a full climate log", () => {
    const displayed = shownFrom(sensor, "2026-11-01T13:15:00.000Z", {
      temperature_c: TEMP_C,
      humidity_pct: 60,
    });
    const reading = chips(displayed, sensor, false);
    expect(reading.temp.value).toBe(TEMP_C);
    expect(reading.rh.value).toBe(60);
    expect(reading.co2.value).toBe(800);
  });

  it("leaves every chip on the sensor snapshot when the manual log is older", () => {
    const displayed = shownFrom(sensor, "2026-11-01T11:00:00.000Z", {
      temperature_c: TEMP_C,
      humidity_pct: 60,
    });
    expect(displayed.fromManual).toBe(false);
    expect(chips(displayed, sensor, false)).toEqual({
      temp: { value: 21, stale: false },
      rh: { value: 55, stale: false },
      co2: { value: 800, stale: false },
    });
  });
});

describe("manual Environment strip uses the 24-hour window", () => {
  it("does not mark a manual reading past the live window as stale", () => {
    const displayed = shownFrom(null, WITHIN_MANUAL_WINDOW, {
      temperature_c: TEMP_C,
      humidity_pct: 60,
    });
    expect(displayed.fromManual).toBe(true);
    expect(displayed.stale).toBe(false);
    const model = buildSensorSnapshotReadModel({
      snapshot: displayed.snapshot,
      now: NOW.getTime(),
      truth: displayed.snapshot ? classifySnapshotTruth(displayed.snapshot, NOW.getTime()) : null,
    });
    expect(model.source).toBe("manual");
    expect(model.isStale).toBe(false);
  });

  it("marks a manual reading older than 24 hours stale", () => {
    const displayed = shownFrom(null, PAST_MANUAL_WINDOW, {
      temperature_c: TEMP_C,
      humidity_pct: 60,
    });
    expect(displayed.stale).toBe(true);
    const model = buildSensorSnapshotReadModel({
      snapshot: displayed.snapshot,
      now: NOW.getTime(),
      truth: displayed.snapshot ? classifySnapshotTruth(displayed.snapshot, NOW.getTime()) : null,
    });
    expect(model.isStale).toBe(true);
  });

  it("passes that source-aware truth into the tent Environment strip", () => {
    const page = readFileSync("src/pages/TentDetail.tsx", "utf8");
    expect(page).toContain("classifySnapshotTruth(displayedClimate.snapshot, nowMs)");
    expect(page).toContain('climateChip("co2")');
  });
});
