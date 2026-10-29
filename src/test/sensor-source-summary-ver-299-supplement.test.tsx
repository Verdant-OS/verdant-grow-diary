/**
 * VER-299 supplemental regression coverage: canon window boundaries, timestamp
 * precedence, page wiring contracts, and plant breakdown freshness via useNowTick.
 */
import type { ReactElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import PlantSensorSourceBreakdownCard from "@/components/PlantSensorSourceBreakdownCard";
import {
  classifySensorSourceSummaryFreshness,
  summarizeSensorSources,
} from "@/lib/sensorSourceSummaryRules";
import { LIVE_CURRENT_STATE_STALE_MS, MANUAL_CURRENT_STATE_STALE_MS } from "@/lib/sensorTruthCanon";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const hoursAgo = (h: number) => minutesAgo(h * 60);

vi.mock("@/hooks/useNowTick", () => ({
  useNowTick: () => NOW,
}));

describe("summarizeSensorSources canon boundaries (VER-299 supplement)", () => {
  it("treats readings at exactly the live/manual window as fresh (age must exceed threshold)", () => {
    const liveAtWindow = new Date(NOW - LIVE_CURRENT_STATE_STALE_MS).toISOString();
    const manualAtWindow = new Date(NOW - MANUAL_CURRENT_STATE_STALE_MS).toISOString();
    const liveJustStale = new Date(NOW - LIVE_CURRENT_STATE_STALE_MS - 1).toISOString();
    const manualJustStale = new Date(NOW - MANUAL_CURRENT_STATE_STALE_MS - 1).toISOString();

    expect(
      summarizeSensorSources([{ source: "live", captured_at: liveAtWindow }], { now: NOW })
        .freshness,
    ).toEqual({ fresh: 1, stale: 0, unknown: 0 });
    expect(
      summarizeSensorSources([{ source: "manual", captured_at: manualAtWindow }], { now: NOW })
        .freshness,
    ).toEqual({ fresh: 1, stale: 0, unknown: 0 });
    expect(
      summarizeSensorSources([{ source: "live", captured_at: liveJustStale }], { now: NOW })
        .freshness.stale,
    ).toBe(1);
    expect(
      summarizeSensorSources([{ source: "manual", captured_at: manualJustStale }], { now: NOW })
        .freshness.stale,
    ).toBe(1);
  });

  it("prefers captured_at over ts for freshness when both are present", () => {
    const reading = {
      source: "live",
      captured_at: minutesAgo(20),
      ts: minutesAgo(5),
    };
    expect(classifySensorSourceSummaryFreshness(reading, NOW)).toBe("stale");
    expect(summarizeSensorSources([reading], { now: NOW }).freshness).toEqual({
      fresh: 0,
      stale: 1,
      unknown: 0,
    });
  });
});

describe("VER-299 wiring contracts", () => {
  function readPage(relativePath: string): string {
    return readFileSync(join(process.cwd(), relativePath), "utf8");
  }

  it("Sensors.tsx injects useNowTick into SensorSourceSummaryWidget options", () => {
    const src = readPage("src/pages/Sensors.tsx");
    expect(src).toMatch(/useNowTick\(\)/);
    expect(src).toContain("<SensorSourceSummaryWidget");
    expect(src).toContain("options={{ now: nowMs }}");
  });

  it("PlantSensorSourceBreakdownCard injects useNowTick into summary options", () => {
    const src = readPage("src/components/PlantSensorSourceBreakdownCard.tsx");
    expect(src).toMatch(/useNowTick\(\)/);
    expect(src).toContain("now: nowMs");
    expect(src).toContain("<SensorSourceSummaryWidget");
  });
});

describe("PlantSensorSourceBreakdownCard freshness (VER-299 supplement)", () => {
  const render = (ui: ReactElement) => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    return rtlRender(
      <QueryClientProvider client={qc}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it("shows a non-zero Stale freshness count for an old manual diary snapshot", () => {
    render(
      <PlantSensorSourceBreakdownCard
        plantId="p-ver-299"
        rows={[
          {
            entry_at: hoursAgo(30),
            details: { sensor_snapshot: { source: "manual", ts: hoursAgo(30) } },
          },
        ]}
      />,
    );
    expect(screen.getByTestId("sensor-source-summary-freshness-count-stale")).toHaveTextContent(
      "1",
    );
    expect(screen.getByTestId("sensor-source-summary-count-stale")).toHaveTextContent("1");
  });
});
