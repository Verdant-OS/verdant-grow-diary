/**
 * Production QA 2026-10-14 (Settings → Units → Celsius):
 *  1. /timeline manual snapshot entries still read "… 74°F / 75°F" while the
 *     Dashboard, /tents and the tent page showed 23.3°C.
 *  2. The tent page's "Changed since previous snapshot" showed "Temp -1.0°F"
 *     beside an Air temperature card in °C. A temperature difference converts
 *     by ×5/9 only (no +32 offset), so -1.0°F is about -0.6°C.
 * Stored values stay Celsius; conversion happens at display time only.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { manualSensorReadingsToTimelineEntries } from "@/lib/timelineManualSensorMeasurementRules";
import {
  buildManualSnapshotChangeContext,
  deriveChangeContextFromReadings,
} from "@/lib/manualSensorSnapshotChangeContextRules";
import { buildManualSnapshotHistoryList } from "@/lib/manualSensorSnapshotHistoryListRules";
import { saveTemperatureUnitPreference } from "@/lib/temperatureUnitPreference";
import TentManualSnapshotHistoryList from "@/components/TentManualSnapshotHistoryList";
import TentManualSnapshotChangeContext from "@/components/TentManualSnapshotChangeContext";
import type { SensorReadingRow } from "@/lib/db";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const TENT = "tent-a";

function metricRow(metric: string, value: number, ts: string): SensorReadingRow {
  return {
    id: `${TENT}-${ts}-${metric}`,
    ts,
    captured_at: ts,
    metric,
    value,
    source: "manual",
    tent_id: TENT,
    plant_id: null,
    user_id: "u",
    created_at: ts,
    quality: "ok",
    raw_payload: null,
    device_id: null,
  } as unknown as SensorReadingRow;
}

const T1 = "2026-10-14T10:00:00.000Z";
const T2 = "2026-10-14T11:00:00.000Z";
const rows = [
  metricRow("temperature_c", 25, T1),
  metricRow("humidity_pct", 50, T1),
  metricRow("temperature_c", 24.4, T2),
  metricRow("humidity_pct", 52, T2),
];

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("Timeline manual snapshot receipt note follows the temperature unit", () => {
  it("formats the stored Celsius value in °C when the grower chose Celsius", () => {
    const [receipt] = manualSensorReadingsToTimelineEntries([rows[2], rows[3]], NOW, {
      temperatureUnit: "celsius",
    });
    expect(receipt?.note).toBe("Manual sensor snapshot: 24.4°C, 52% RH");
    expect(receipt?.note).not.toContain("°F");
    // Stored data is untouched: the persisted snapshot still carries temp_f.
    const snap = receipt?.details.manual_sensor_snapshot as { temp_f: number };
    expect(snap.temp_f).toBeCloseTo(75.92, 2);
  });

  it("keeps the Fahrenheit note by default", () => {
    const [receipt] = manualSensorReadingsToTimelineEntries([rows[2], rows[3]], NOW);
    expect(receipt?.note).toBe("Manual sensor snapshot: 75.9°F, 52% RH");
  });
});

describe("Changed since previous snapshot delta follows the temperature unit", () => {
  const latest = { ts: T2, metrics: { temperature_c: 24.4, humidity_pct: 52 } };
  const previous = { ts: T1, metrics: { temperature_c: 25, humidity_pct: 50 } };

  it("shows a Celsius difference with no +32 offset", () => {
    const ctx = buildManualSnapshotChangeContext({ latest, previous, temperatureUnit: "celsius" });
    const temp = ctx.deltas.find((d) => d.key === "temperature_c");
    expect(temp?.formatted).toBe("-0.6°C");
    expect(temp?.delta).toBeCloseTo(-0.6, 5);
  });

  it("keeps the Fahrenheit difference by default", () => {
    const ctx = buildManualSnapshotChangeContext({ latest, previous });
    expect(ctx.deltas.find((d) => d.key === "temperature_c")?.formatted).toBe("-1.1°F");
  });

  it("derives the same unit-aware delta from reading rows", () => {
    const ctx = deriveChangeContextFromReadings(rows, { tentId: TENT, temperatureUnit: "celsius" });
    expect(ctx.deltas.find((d) => d.key === "temperature_c")?.formatted).toBe("-0.6°C");
  });

  it("history list chips and deltas use the chosen unit", () => {
    const entries = buildManualSnapshotHistoryList(rows, {
      tentId: TENT,
      temperatureUnit: "celsius",
    });
    expect(entries[0].metrics.find((m) => m.key === "temperature_c")?.formatted).toBe("24.4°C");
    expect(entries[0].deltas.find((d) => d.key === "temperature_c")?.formatted).toBe("-0.6°C");
    const text = JSON.stringify(entries);
    expect(text).not.toContain("°F");
  });
});

describe("tent page components read the saved unit preference", () => {
  it("Environment panel change context renders the delta in °C", () => {
    saveTemperatureUnitPreference("celsius");
    render(<TentManualSnapshotChangeContext tentId={TENT} readings={rows} />);
    expect(screen.getByText("-0.6°C")).toBeInTheDocument();
    expect(screen.queryByText(/°F/)).toBeNull();
  });

  it("history list renders chips and deltas in °C", () => {
    saveTemperatureUnitPreference("celsius");
    render(
      <TentManualSnapshotHistoryList
        tentId={TENT}
        readings={rows}
        readStatus="success"
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText("24.4°C")).toBeInTheDocument();
    expect(screen.getByText("-0.6°C")).toBeInTheDocument();
    expect(screen.queryByText(/°F/)).toBeNull();
  });
});

import {
  buildTimelineCardSensorSnapshotViewModel,
  buildTimelineSensorSnapshotViewModel,
} from "@/lib/timelineSensorSnapshotViewModel";

describe("Timeline sensor chips convert explicit Fahrenheit snapshots to the chosen unit", () => {
  it("renders a stored temp_f value as °C under the Celsius preference", () => {
    const vm = buildTimelineSensorSnapshotViewModel({ temp_f: 74 }, { preferUnit: "C" });
    expect(vm.kind).toBe("chips");
    const temp = vm.kind === "chips" ? vm.chips.find((c) => c.label === "Temp") : undefined;
    expect(temp?.display).toBe("23.3°C");
    expect(temp?.metric).toBe("temp_c");
  });

  it("keeps the stored temp_f value as °F by default", () => {
    const vm = buildTimelineSensorSnapshotViewModel({ temp_f: 74 });
    const temp = vm.kind === "chips" ? vm.chips.find((c) => c.label === "Temp") : undefined;
    expect(temp?.display).toBe("74°F");
  });

  it("the Timeline card view model takes the grower's unit", () => {
    const { sensorViewModel } = buildTimelineCardSensorSnapshotViewModel(
      { sensor: { temp_f: 75, source: "manual" }, useManualValidation: true },
      { validateManualCompatibility: true, temperatureUnit: "celsius" },
    );
    const temp =
      sensorViewModel.kind === "chips"
        ? sensorViewModel.chips.find((c) => c.label === "Temp")
        : undefined;
    expect(temp?.display).toBe("23.9°C");
  });
});
