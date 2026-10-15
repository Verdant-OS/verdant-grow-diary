import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import SensorChart from "@/components/SensorChart";
import type { SensorReading } from "@/mock";

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

describe("SensorChart plotted point count (#2129)", () => {
  it("legend counts only finite values for the selected metric", () => {
    const { getByTestId } = render(
      <SensorChart
        data={[
          reading({ ts: "2026-01-08T12:00:00Z", vpd: 1.1 }),
          reading({ ts: "2026-01-09T12:00:00Z", vpd: Number.NaN }),
          reading({ ts: "2026-01-10T12:00:00Z", vpd: Number.POSITIVE_INFINITY }),
        ]}
        metric="vpd"
      />,
    );
    expect(getByTestId("sensor-chart-legend").textContent).toContain("1 point");
    expect(getByTestId("sensor-chart-legend").textContent).toContain("VPD");
  });
});
