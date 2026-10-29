import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import ImportedSensorHistoryPanel from "@/components/ImportedSensorHistoryPanel";
import { parseEnvironmentCSVText } from "@/lib/csvParser";
import { buildSensorReadingInserts } from "@/lib/environmentCsvImportPersistence";
import {
  buildImportedSensorHistoryViewModel,
  type ImportedSensorHistoryInputRow,
} from "@/lib/importedSensorHistoryViewModel";
import {
  saveTemperatureUnitPreference,
  type TemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";

vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));

// VER-302's four documented CSV readings, represented at the canonical storage boundary.
// Expected display strings are literals, independent of the production conversion helper.
const observations = [
  ["2026-10-28T06:00:00-05:00", 24.5, 58, "76.1 °F", "24.5 °C"],
  ["2026-10-28T06:30:00-05:00", 24.88888888888889, 57, "76.8 °F", "24.9 °C"],
  ["2026-10-28T07:00:00-05:00", 25.222222222222225, 56, "77.4 °F", "25.2 °C"],
  ["2026-10-28T07:30:00-05:00", 25.555555555555557, 55, "78 °F", "25.6 °C"],
] as const;

const row = (
  metric: string,
  value: number | null,
  capturedAt: string = observations[0][0],
): ImportedSensorHistoryInputRow => ({
  tent_id: "ver-302-tent",
  source: "csv",
  metric,
  value,
  captured_at: capturedAt,
  ts: capturedAt,
  created_at: "2026-10-28T13:10:00Z",
});

const readings = Object.freeze(
  observations.flatMap(([time, value, humidity]) => [
    Object.freeze(row("temperature_c", value, time)),
    Object.freeze(row("humidity_pct", humidity, time)),
  ]),
);

afterEach(cleanup);

describe("VER-302 imported temperature display boundary", () => {
  it.each(["fahrenheit", "celsius"] as const)(
    "formats the original four-line CSV after normalization to 12 stored metrics in %s",
    (temperatureUnit) => {
      const parsed = parseEnvironmentCSVText(`timestamp,temperature_f,humidity_pct
2026-10-28T06:00:00-05:00,76.1,58
2026-10-28T06:30:00-05:00,76.8,57
2026-10-28T07:00:00-05:00,77.4,56
2026-10-28T07:30:00-05:00,78.0,55`);
      const stored = buildSensorReadingInserts(parsed.validRows, {
        tent_id: "ver-302-tent",
        user_id: "ver-302-test-user",
        grow_id: "ver-302-test-grow",
      });
      const before = JSON.stringify(stored);
      expect(parsed.errors).toEqual([]);
      expect(parsed.skippedRows).toEqual([]);
      expect(stored).toHaveLength(12);
      const vm = buildImportedSensorHistoryViewModel({
        readings: stored,
        temperatureUnit,
        selectedMetric: "temperature_c",
      });
      expect(vm.recentRows.map((r) => r.displayValue)).toEqual(
        [...observations].reverse().map((o) => o[temperatureUnit === "fahrenheit" ? 3 : 4]),
      );
      expect(vm.totalCount).toBe(12);
      expect(JSON.stringify(stored)).toBe(before);
      expect(JSON.stringify(vm)).not.toContain("raw_payload");
    },
  );

  it.each(["fahrenheit", "celsius"] as const)(
    "renders the four stored CSV readings in %s without changing history",
    (temperatureUnit) => {
      const before = JSON.stringify(readings);
      const vm = buildImportedSensorHistoryViewModel({
        readings,
        temperatureUnit,
        selectedMetric: "temperature_c",
      });
      expect(vm.recentRows.map((r) => r.displayValue)).toEqual(
        [...observations].reverse().map((o) => o[temperatureUnit === "fahrenheit" ? 3 : 4]),
      );
      expect(vm.recentRows.map((r) => r.value)).toEqual(
        [...observations].reverse().map((o) => o[1]),
      );
      expect(vm.recentRows.map((r) => r.capturedAt)).toEqual([
        "2026-10-28T12:30:00.000Z",
        "2026-10-28T12:00:00.000Z",
        "2026-10-28T11:30:00.000Z",
        "2026-10-28T11:00:00.000Z",
      ]);
      expect(vm.visibleCount).toBe(4);
      expect(vm.totalCount).toBe(8);
      expect(JSON.stringify(readings)).toBe(before);
      expect(
        buildImportedSensorHistoryViewModel({
          readings,
          temperatureUnit,
          selectedMetric: "temperature_c",
        }),
      ).toEqual(vm);
    },
  );

  it.each(["temperature_c", "soil_temp_c"])(
    "converts %s only once, keeps boundaries in canonical Celsius, and never rounds before conversion",
    (metric) => {
      const values = [-40, -10.01, -10, 0, 24.88888888888889, 50, 50.01];
      for (const temperatureUnit of ["fahrenheit", "celsius"] as const) {
        const display = values.map(
          (value) =>
            buildImportedSensorHistoryViewModel({
              readings: [row(metric, value)],
              temperatureUnit,
            }).recentRows[0],
        );
        expect(display.map((r) => r.displayValue)).toEqual(
          temperatureUnit === "fahrenheit"
            ? ["-40 °F", "14 °F", "14 °F", "32 °F", "76.8 °F", "122 °F", "122 °F"]
            : ["-40 °C", "-10 °C", "-10 °C", "0 °C", "24.9 °C", "50 °C", "50 °C"],
        );
        expect(display.map((r) => r.outOfRangeNote !== null)).toEqual([
          true,
          true,
          false,
          false,
          false,
          false,
          true,
        ]);
        expect(display.map((r) => r.value)).toEqual(values);
      }
    },
  );

  it.each(["fahrenheit", "celsius"] as const)(
    "keeps invalid temperatures unavailable in %s",
    (temperatureUnit) => {
      for (const metric of ["temperature_c", "soil_temp_c"]) {
        for (const value of [null, NaN, Infinity, -Infinity]) {
          expect(
            buildImportedSensorHistoryViewModel({ readings: [row(metric, value)], temperatureUnit })
              .recentRows[0],
          ).toMatchObject({ value: null, displayValue: "—", outOfRangeNote: null });
        }
      }
    },
  );

  it("never applies temperature conversion to unrelated or unknown metrics or non-CSV sources", () => {
    const others = [
      row("humidity_pct", 58),
      row("soil_moisture_pct", 43),
      row("vpd_kpa", 1.234),
      row("co2_ppm", 801.4),
      row("ppfd", 600.6),
      row("ec", 1.8),
      row("temperature_f", 78),
      { ...row("temperature_c", 999), source: "live" },
    ];
    for (const temperatureUnit of ["fahrenheit", "celsius"] as const) {
      const vm = buildImportedSensorHistoryViewModel({ readings: others, temperatureUnit });
      expect(Object.fromEntries(vm.recentRows.map((r) => [r.metric, r.displayValue]))).toEqual({
        humidity_pct: "58%",
        soil_moisture_pct: "43%",
        vpd_kpa: "1.23 kPa",
        co2_ppm: "801 ppm",
        ppfd: "601 µmol/m²/s",
        ec: "1.8 mS/cm",
        temperature_f: "78",
      });
      expect(vm.totalCount).toBe(7);
    }
  });
});

function mountPanel() {
  return render(
    <MemoryRouter initialEntries={["/tents/ver-302-tent"]}>
      <ImportedSensorHistoryPanel tentId="ver-302-tent" readings={readings} />
    </MemoryRouter>,
  );
}

function expectTemperatureRows(unit: TemperatureUnitPreference) {
  const symbol = unit === "fahrenheit" ? "°F" : "°C";
  fireEvent.click(screen.getByRole("button", { name: `Temperature (${symbol}) (4)` }));
  const cells = within(screen.getByTestId("imported-history-recent-rows"));
  for (const observation of observations) {
    expect(
      cells.getByRole("cell", { name: observation[unit === "fahrenheit" ? 3 : 4] }),
    ).toBeInTheDocument();
  }
  expect(cells.getAllByRole("cell", { name: `Temperature (${symbol})` })).toHaveLength(4);
  expect(screen.getByTestId("imported-history-visible")).toHaveTextContent("4");
}

describe("VER-302 panel uses the real saved preference", () => {
  it.each(["fahrenheit", "celsius"] as const)(
    "restores %s on a fresh mount with canonical rows",
    (unit) => {
      saveTemperatureUnitPreference(unit);
      const first = mountPanel();
      expectTemperatureRows(unit);
      const times = screen.getByTestId("imported-history-recent-rows").textContent;
      first.unmount();
      mountPanel();
      expectTemperatureRows(unit);
      expect(screen.getByTestId("imported-history-recent-rows").textContent).toBe(times);
      expect(screen.getByTestId("imported-history-source-badge")).toHaveTextContent("Source: CSV");
      expect(screen.getByTestId("imported-history-not-live-badge")).toHaveTextContent(
        "Not live data",
      );
    },
  );

  it("updates values and labels on setting changes while preserving the selected canonical filter", () => {
    mountPanel();
    expectTemperatureRows("fahrenheit");
    act(() => {
      saveTemperatureUnitPreference("celsius");
    });
    expect(screen.getByTestId("imported-history-metric-filter-temperature_c")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expectTemperatureRows("celsius");
    act(() => {
      saveTemperatureUnitPreference("fahrenheit");
    });
    expectTemperatureRows("fahrenheit");
    fireEvent.click(screen.getByTestId("imported-history-metric-filter-humidity_pct"));
    expect(screen.getByTestId("imported-history-visible")).toHaveTextContent("4");
    for (const humidity of ["58%", "57%", "56%", "55%"]) {
      expect(
        within(screen.getByRole("table")).getByRole("cell", { name: humidity }),
      ).toBeInTheDocument();
    }
  });

  it.each(["fahrenheit", "celsius"] as const)(
    "labels soil temperature separately in %s",
    (unit) => {
      saveTemperatureUnitPreference(unit);
      render(
        <MemoryRouter>
          <ImportedSensorHistoryPanel tentId="ver-302-tent" readings={[row("soil_temp_c", 25)]} />
        </MemoryRouter>,
      );
      const symbol = unit === "fahrenheit" ? "°F" : "°C";
      expect(
        screen.getByRole("button", { name: `Soil temperature (${symbol}) (1)` }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("cell", { name: `Soil temperature (${symbol})` }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("cell", { name: unit === "fahrenheit" ? "77 °F" : "25 °C" }),
      ).toBeInTheDocument();
    },
  );
});
