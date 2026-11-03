/**
 * Review of #2742: a measured VPD between two calculated points must still
 * be drawn. The recorded series is null on calculated rows, and with no dot
 * and no connection across nulls that lone measurement paints nothing.
 */
import { cloneElement, type ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SensorReading } from "@/mock";

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({
      children,
    }: {
      children: ReactElement<{ width?: number; height?: number }>;
    }) => cloneElement(children, { width: 480, height: 220 }),
  };
});

import SensorChart from "@/components/SensorChart";

function reading(ts: string, vpd: number, kind?: SensorReading["vpdPointKind"]): SensorReading {
  return {
    ts,
    tentId: "t1",
    temp: 24,
    rh: 55,
    vpd,
    co2: 0,
    soil: 0,
    source: kind === "calculated" ? "manual" : "csv",
    status: "usable",
    capturedAt: ts,
    observedMetrics: kind === "calculated" ? ["temp", "rh"] : ["temp", "rh", "vpd"],
    ...(kind ? { vpdPointKind: kind } : {}),
  };
}

afterEach(() => {
  cleanup();
});

describe("SensorChart recorded VPD dots", () => {
  it("plots every recorded point when calculated points sit on either side", () => {
    const { container } = render(
      <SensorChart
        data={[
          reading("2026-11-01T12:00:00.000Z", 1.1, "calculated"),
          reading("2026-11-02T12:00:00.000Z", 0.84),
          reading("2026-11-03T12:00:00.000Z", 1.26, "calculated"),
        ]}
        metric="vpd"
        height={220}
        hideRangeSelector
        hideExportButton
      />,
    );
    const circles = [...container.querySelectorAll("circle")];
    const recordedDots = circles.filter((circle) => {
      const fill = circle.getAttribute("fill") ?? "";
      return fill !== "" && fill !== "none" && fill !== "transparent";
    });
    expect(recordedDots).toHaveLength(1);
    expect(circles.length).toBeGreaterThan(recordedDots.length);
    expect(screen.getByTestId("sensor-chart-legend").textContent).toMatch(/1 recorded point/);
    expect(screen.getByTestId("sensor-chart-calculated-legend").textContent).toMatch(
      /2 calculated from temp \+ RH/,
    );
  });
});
