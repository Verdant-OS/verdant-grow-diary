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

describe("SensorChart null metric values (#2129)", () => {
  it("excludes null values and pluralizes the finite point count", () => {
    const { getByTestId } = render(
      <SensorChart
        data={[
          reading({ ts: "2026-01-08T12:00:00Z", vpd: 1.0 }),
          reading({ ts: "2026-01-09T12:00:00Z", vpd: null as unknown as number }),
          reading({ ts: "2026-01-10T12:00:00Z", vpd: 1.2 }),
        ]}
        metric="vpd"
      />,
    );
    expect(getByTestId("sensor-chart-legend").textContent).toContain("2 points");
  });
});
