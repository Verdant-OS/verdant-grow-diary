/**
 * Repair of #2148 (Codex P2 4288338469): a timestamp that lacks the selected
 * metric must stay in the chart data as a null gap, so Recharts breaks the
 * line instead of drawing a continuous trend across a period with no
 * measurement. The legend count still counts only finite plotted values.
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { SensorReading } from "@/mock";

const captured = vi.hoisted(() => ({ data: [] as Array<{ ts: string; value: unknown }> }));

vi.mock("recharts", () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const Chart = ({
    data,
    children,
  }: {
    data: Array<{ ts: string; value: unknown }>;
    children?: ReactNode;
  }) => {
    captured.data = data;
    return <>{children}</>;
  };
  const Nothing = () => null;
  return {
    ResponsiveContainer: Passthrough,
    AreaChart: Chart,
    LineChart: Chart,
    Area: Nothing,
    Line: Nothing,
    XAxis: Nothing,
    YAxis: Nothing,
    Tooltip: Nothing,
    CartesianGrid: Nothing,
  };
});

import SensorChart from "@/components/SensorChart";

function reading(over: Partial<SensorReading>): SensorReading {
  return {
    ts: "2026-01-10T12:00:00Z",
    tentId: "t1",
    temp: 24,
    rh: 55,
    vpd: 1.1,
    co2: 800,
    soil: 40,
    source: "manual",
    status: "usable",
    capturedAt: "2026-01-10T12:00:00Z",
    ...over,
  };
}

describe("SensorChart keeps missing-metric gaps (#2148 repair)", () => {
  it("keeps a row without a finite value as a null point between finite neighbours", () => {
    const { getByTestId } = render(
      <SensorChart
        data={[
          reading({ ts: "2026-01-08T12:00:00Z", vpd: 1.1 }),
          reading({ ts: "2026-01-09T12:00:00Z", vpd: Number.NaN }),
          reading({ ts: "2026-01-10T12:00:00Z", vpd: 1.3 }),
        ]}
        metric="vpd"
      />,
    );
    expect(captured.data.map((point) => point.value)).toEqual([1.1, null, 1.3]);
    expect(getByTestId("sensor-chart-legend").textContent).toContain("2 points");
  });
});
