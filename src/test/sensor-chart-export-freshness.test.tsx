import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SensorChart from "@/components/SensorChart";
import { buildSensorReadingsCsv, downloadTextFile } from "@/lib/sensorChartExport";
import type { SensorReading } from "@/mock";

vi.mock("@/lib/sensorChartExport", async (original) => ({
  ...(await original<typeof import("@/lib/sensorChartExport")>()),
  downloadTextFile: vi.fn(),
}));
vi.mock("recharts", () => ({
  ResponsiveContainer: () => null,
  AreaChart: () => null,
  Area: () => null,
  LineChart: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
}));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "C",
}));
const capturedAt = "2026-09-24T00:00:00.000Z";
const capturedMs = Date.parse(capturedAt);
function reading(
  source: SensorReading["source"] = "live",
  status: SensorReading["status"] = "usable",
): SensorReading {
  return {
    tentId: "tent-a",
    ts: capturedAt,
    capturedAt,
    source,
    status,
    temp: 25,
    rh: 55,
    vpd: 0,
    co2: 0,
    soil: 0,
    observedMetrics: ["temp", "rh"],
  };
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("sensor chart export freshness", () => {
  it.each([
    ["live", 15],
    ["manual", 1440],
  ] as const)("ages %s only after its boundary and preserves evidence", (source, minutes) => {
    const row = reading(source);
    const before = structuredClone(row);
    const fresh = buildSensorReadingsCsv([row], capturedMs + minutes * 60000);
    const aged = buildSensorReadingsCsv([row], capturedMs + minutes * 60000 + 1);
    expect(fresh).toContain("," + source + ",usable,");
    expect(aged).toBe(fresh.replace(",usable,", ",stale,"));
    expect(aged).toContain(",25,55,,,,,");
    expect(row).toEqual(before);
    expect(buildSensorReadingsCsv([row], capturedMs + minutes * 60000 + 1)).toBe(aged);
  });
  it.each(["invalid", "needs_review", "stale", "no_data"] as const)(
    "preserves %s status",
    (status) => {
      expect(
        buildSensorReadingsCsv([reading("live", status)], capturedMs + 2 * 86400000),
      ).toContain(",live," + status + ",");
    },
  );
  it.each(["csv", "demo"] as const)("preserves %s historical provenance/status", (source) => {
    expect(buildSensorReadingsCsv([reading(source)], capturedMs + 2 * 86400000)).toContain(
      "," + source + ",usable,",
    );
  });
  it.each([
    ["live", 15],
    ["manual", 1440],
  ] as const)("rechecks %s at export click without replacing props", (source, minutes) => {
    vi.useFakeTimers();
    vi.setSystemTime(capturedMs + (minutes - 1) * 60000);
    render(<SensorChart data={[reading(source)]} metric="temp" />);
    fireEvent.click(screen.getByTestId("sensor-chart-export-btn"));
    const fresh = vi.mocked(downloadTextFile).mock.calls[0][0];
    vi.setSystemTime(capturedMs + (minutes + 1) * 60000);
    fireEvent.click(screen.getByTestId("sensor-chart-export-btn"));
    expect(vi.mocked(downloadTextFile).mock.calls[1][0]).toBe(fresh.replace(",usable,", ",stale,"));
    expect(vi.mocked(downloadTextFile).mock.calls[1][0]).toContain("," + source + ",stale,");
  });
});
