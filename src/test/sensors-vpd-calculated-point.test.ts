/**
 * Review of #2742: a VPD point calculated from temperature and humidity is
 * tagged calculated. It is drawn as calculated and left out of CSV export.
 */
import { describe, expect, it } from "vitest";
import { buildSensorReadingsCsv } from "@/lib/sensorChartExport";
import { LatestVpdReadingSelection } from "@/lib/latestVpdReadingSelection";
import { hasObservedSensorMetric } from "@/lib/sensorReadingSelectionRules";
import { normalizeSensorReading } from "@/lib/sensors/normalizeSensorReading";
import { calculateVPD } from "@/lib/sensors/calculateVPD";
import { buildTentSnapshotView } from "@/lib/dashboardEnvironmentSnapshotViewModel";
import type { SensorReading } from "@/mock";

const TENT = "11111111-1111-4111-8111-111111111111";

function row(
  partial: Partial<SensorReading> & Pick<SensorReading, "source" | "capturedAt">,
): SensorReading {
  return {
    tentId: TENT,
    status: "usable",
    ts: partial.capturedAt,
    temp: 24,
    rh: 50,
    vpd: 0,
    co2: 0,
    soil: 0,
    observedMetrics: ["temp", "rh"],
    ...partial,
  };
}

describe("calculated VPD chart points", () => {
  const series = LatestVpdReadingSelection.historyForChart(
    [
      row({
        source: "csv",
        capturedAt: "2026-10-28T12:30:00.000Z",
        vpd: 0.84,
        observedMetrics: ["temp", "rh", "vpd"],
      }),
    ],
    [
      row({
        source: "manual",
        capturedAt: "2026-11-02T20:00:00.000Z",
        temp: 23.33,
        rh: 56,
        observedMetrics: ["temp", "rh"],
      }),
    ],
  );

  it("tags the derived point calculated and leaves recorded VPD observed", () => {
    const calculated = series.find((reading) => reading.source === "manual");
    const recorded = series.find((reading) => reading.source === "csv");
    expect(calculated?.vpdPointKind).toBe("calculated");
    expect(hasObservedSensorMetric(calculated!, "vpd")).toBe(false);
    expect(recorded?.vpdPointKind).not.toBe("calculated");
    expect(hasObservedSensorMetric(recorded!, "vpd")).toBe(true);
  });

  it("does not export a calculated point as an observed VPD", () => {
    const csv = buildSensorReadingsCsv(series, Date.parse("2026-11-02T21:00:00.000Z"));
    expect(csv).toContain("0.84");
    expect(csv).not.toContain(
      String(series.find((reading) => reading.vpdPointKind === "calculated")?.vpd),
    );
    const lines = csv.split("\n").slice(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("csv");
  });
});

describe("ingest VPD stays outside the display temperature range", () => {
  it("still stores a VPD when temperature is above 80 °C", () => {
    expect(calculateVPD(90, 50)).toBeNull();
    const normalized = normalizeSensorReading(
      { temperature_c: 90, humidity: 50 },
      {
        source: "manual",
        sourceIdentity: "manual_entry",
        transport: "manual",
        tentId: TENT,
        capturedAt: "2026-06-15T11:50:00Z",
        now: new Date("2026-06-15T12:00:00Z"),
      },
    );
    expect(normalized.metrics.vpd_kpa).not.toBeNull();
  });
});

describe("dashboard snapshot calculates only a current cohort with no stored VPD", () => {
  const now = Date.parse("2026-11-02T21:00:00.000Z");

  it("shows the calculated VPD when the current cohort stored temperature and humidity only", () => {
    const view = buildTentSnapshotView(
      [
        {
          ts: "2026-11-02T20:00:00.000Z",
          captured_at: "2026-11-02T20:00:00.000Z",
          metric: "temperature_c",
          value: 23.33,
          source: "manual",
        },
        {
          ts: "2026-11-02T20:00:00.000Z",
          captured_at: "2026-11-02T20:00:00.000Z",
          metric: "humidity_pct",
          value: 56,
          source: "manual",
        },
      ],
      "veg",
      now,
    );
    expect(view.metrics.find((metric) => metric.key === "vpd")?.display).toBe("1.26");
  });

  it("keeps a stored VPD from the same cohort instead of replacing it", () => {
    const view = buildTentSnapshotView(
      [
        {
          ts: "2026-11-02T20:00:00.000Z",
          captured_at: "2026-11-02T20:00:00.000Z",
          metric: "temperature_c",
          value: 23.33,
          source: "manual",
        },
        {
          ts: "2026-11-02T20:00:00.000Z",
          captured_at: "2026-11-02T20:00:00.000Z",
          metric: "humidity_pct",
          value: 56,
          source: "manual",
        },
        {
          ts: "2026-11-02T20:00:00.000Z",
          captured_at: "2026-11-02T20:00:00.000Z",
          metric: "vpd_kpa",
          value: 0.84,
          source: "manual",
        },
      ],
      "veg",
      now,
    );
    expect(view.metrics.find((metric) => metric.key === "vpd")?.display).toBe("0.84");
  });
});
