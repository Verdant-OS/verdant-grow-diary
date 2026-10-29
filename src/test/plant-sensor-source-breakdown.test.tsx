/**
 * plant-sensor-source-breakdown — verifies the per-plant breakdown
 * card classifies diary `sensor_snapshot` rows through the canonical
 * source rules and renders the correct counts / empty state.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PlantSensorSourceBreakdownCard from "@/components/PlantSensorSourceBreakdownCard";
import { buildPlantSensorSourceReadings } from "@/lib/plantSensorSourceHistoryRules";

function withProviders(node: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

const ROWS_PLANT_A = [
  {
    entry_at: "2026-06-10T12:00:00Z",
    details: { sensor_snapshot: { source: "live", ts: "2026-06-10T12:00:00Z" } },
  },
  {
    entry_at: "2026-06-11T12:00:00Z",
    details: { sensor_snapshot: { source: "csv" } },
  },
  {
    // Quick Log snapshot without explicit source → counts as manual.
    entry_at: "2026-06-12T12:00:00Z",
    details: { sensor_snapshot: { temp: 22 } },
  },
  {
    // Non-sensor entry, must be ignored.
    entry_at: "2026-06-13T12:00:00Z",
    details: { event_type: "note" },
  },
  {
    // Unknown source string → invalid, never live.
    entry_at: "2026-06-14T12:00:00Z",
    details: { sensor_snapshot: { source: "totally-unknown" } },
  },
];

describe("buildPlantSensorSourceReadings", () => {
  it("ignores non-sensor diary rows", () => {
    const out = buildPlantSensorSourceReadings(ROWS_PLANT_A);
    // 5 rows in, 1 non-sensor dropped → 4 sensor-derived readings.
    expect(out.length).toBe(4);
  });

  it("falls back to entry_at when snapshot has no ts", () => {
    const out = buildPlantSensorSourceReadings([
      {
        entry_at: "2026-06-15T12:00:00Z",
        details: { sensor_snapshot: { source: "manual" } },
      },
    ]);
    expect(out[0].captured_at).toBe("2026-06-15T12:00:00Z");
  });

  it("prefers the snapshot's captured_at over ts and over entry_at (Copilot on #2586)", () => {
    const out = buildPlantSensorSourceReadings([
      {
        entry_at: "2026-06-16T12:05:00Z",
        details: {
          sensor_snapshot: { source: "manual", captured_at: "2026-06-15T06:00:00Z" },
        },
      },
      {
        entry_at: "2026-06-16T12:05:00Z",
        details: {
          sensor_snapshot: {
            source: "csv",
            captured_at: "2026-06-01T06:00:00Z",
            ts: "2026-06-16T12:00:00Z",
          },
        },
      },
      {
        entry_at: "2026-06-16T12:05:00Z",
        details: { manual_sensor_snapshot: { source: "manual", ts: "2026-06-16T11:00:00Z" } },
      },
    ]);
    expect(out.map((r) => r.captured_at)).toEqual([
      "2026-06-15T06:00:00Z",
      "2026-06-01T06:00:00Z",
      "2026-06-16T11:00:00Z",
    ]);
    // The diary entry time stays the range key.
    expect(out.every((r) => r.ts === "2026-06-16T12:05:00Z")).toBe(true);
  });
});

describe("buildPlantSensorSourceReadings marks every reading as a persisted snapshot", () => {
  it("sets context so a stored live claim cannot read fresh (Codex P1 on #2586)", () => {
    const out = buildPlantSensorSourceReadings([
      {
        entry_at: "2026-06-16T12:05:00Z",
        details: { sensor_snapshot: { source: "live", ts: "2026-06-16T12:04:00Z" } },
      },
      {
        entry_at: "2026-06-16T12:05:00Z",
        details: { manual_sensor_snapshot: { source: "manual", ts: "2026-06-16T12:04:00Z" } },
      },
      {
        entry_at: "2026-06-16T12:05:00Z",
        details: { sensor_snapshot: { temp: 22 } },
      },
    ]);
    expect(out).toHaveLength(3);
    expect(out.every((r) => r.context === "persisted_snapshot")).toBe(true);
  });
});

describe("PlantSensorSourceBreakdownCard freshness uses the snapshot capture time", () => {
  it("counts a manual snapshot captured 30 hours ago as stale even on a five-minute-old entry", () => {
    const now = Date.now();
    const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
    render(
      withProviders(
        <PlantSensorSourceBreakdownCard
          plantId="p-fresh"
          rows={[
            {
              entry_at: iso(5 * 60_000),
              details: { sensor_snapshot: { source: "manual", captured_at: iso(30 * 3_600_000) } },
            },
          ]}
        />,
      ),
    );
    expect(screen.getByTestId("sensor-source-summary-count-manual")).toHaveTextContent("1");
    expect(screen.getByTestId("sensor-source-summary-count-stale")).toHaveTextContent("1");
    expect(screen.getByTestId("sensor-source-summary-freshness-count-fresh")).toHaveTextContent(
      "0",
    );
    expect(screen.getByTestId("sensor-source-summary-freshness-count-stale")).toHaveTextContent(
      "1",
    );
  });

  it("never counts a five-minute-old persisted live claim as fresh (Codex P1 on #2586)", () => {
    const now = Date.now();
    const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
    render(
      withProviders(
        <PlantSensorSourceBreakdownCard
          plantId="p-persisted-live"
          rows={[
            {
              entry_at: iso(5 * 60_000),
              details: { sensor_snapshot: { source: "live", captured_at: iso(5 * 60_000) } },
            },
          ]}
        />,
      ),
    );
    // The row still claims live provenance; its freshness is unknown, not fresh.
    expect(screen.getByTestId("sensor-source-summary-count-live")).toHaveTextContent("1");
    expect(screen.getByTestId("sensor-source-summary-freshness-count-fresh")).toHaveTextContent(
      "0",
    );
    expect(screen.getByTestId("sensor-source-summary-freshness-count-unknown")).toHaveTextContent(
      "1",
    );
  });
});

describe("PlantSensorSourceBreakdownCard", () => {
  it("renders counts per canonical source using diary rows", () => {
    render(withProviders(<PlantSensorSourceBreakdownCard plantId="p1" rows={ROWS_PLANT_A} />));
    expect(screen.getByTestId("plant-sensor-source-breakdown")).toBeInTheDocument();
    expect(screen.getByTestId("sensor-source-summary-count-live")).toHaveTextContent("1");
    expect(screen.getByTestId("sensor-source-summary-count-csv")).toHaveTextContent("1");
    expect(screen.getByTestId("sensor-source-summary-count-manual")).toHaveTextContent("1");
    expect(screen.getByTestId("sensor-source-summary-count-invalid")).toHaveTextContent("1");
  });

  it("threads the real plant id through each source Timeline link", () => {
    render(
      withProviders(<PlantSensorSourceBreakdownCard plantId="plant a/1" rows={ROWS_PLANT_A} />),
    );

    const href = screen.getByTestId("sensor-source-summary-link-live").getAttribute("href");
    expect(href).toBe("/timeline?sensorSources=live&plantId=plant+a%2F1");
  });

  it("does not count rows the caller did not supply (plant isolation)", () => {
    // Only "Plant A" rows are passed in; no readings for other plants
    // are visible. (The hook scopes the fetch by plant_id; here we
    // assert the presenter trusts the supplied list.)
    render(
      withProviders(
        <PlantSensorSourceBreakdownCard
          plantId="p1"
          rows={[
            {
              entry_at: "2026-06-10T12:00:00Z",
              details: { sensor_snapshot: { source: "live" } },
            },
          ]}
        />,
      ),
    );
    expect(screen.getByTestId("sensor-source-summary-count-live")).toHaveTextContent("1");
    expect(screen.getByTestId("sensor-source-summary-count-csv")).toHaveTextContent("0");
  });

  it("renders empty state when no sensor diary rows exist", () => {
    render(
      withProviders(
        <PlantSensorSourceBreakdownCard
          plantId="p1"
          rows={[{ entry_at: "2026-06-10T12:00:00Z", details: { event_type: "note" } }]}
        />,
      ),
    );
    expect(screen.getByTestId("plant-sensor-source-breakdown-empty")).toHaveTextContent(
      /no sensor readings found for this plant/i,
    );
    // The legend is still rendered so growers can learn what each source means.
    expect(screen.getByTestId("plant-sensor-source-breakdown-legend")).toBeInTheDocument();
  });

  it("classifies unknown source as invalid (never live)", () => {
    render(
      withProviders(
        <PlantSensorSourceBreakdownCard
          plantId="p1"
          rows={[
            {
              entry_at: "2026-06-10T12:00:00Z",
              details: { sensor_snapshot: { source: "mystery-source" } },
            },
          ]}
        />,
      ),
    );
    expect(screen.getByTestId("sensor-source-summary-count-invalid")).toHaveTextContent("1");
    expect(screen.getByTestId("sensor-source-summary-count-live")).toHaveTextContent("0");
  });

  it("returns null when no plantId is provided", () => {
    const { container } = render(withProviders(<PlantSensorSourceBreakdownCard plantId={null} />));
    expect(container.querySelector('[data-testid="plant-sensor-source-breakdown"]')).toBeNull();
  });
});
