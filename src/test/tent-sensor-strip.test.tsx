// The compact sensor strip under Plants on Grow → Tent (Cheek, 2026-11-28):
// air temperature and RH when two values fit, VPD in kPa when only one fits,
// freshness in both, and "VPD unavailable." without a trustworthy VPD.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TentSensorStrip, { type TentSensorStripProps } from "@/components/TentSensorStrip";

const fiveMinutesAgo = () => new Date(Date.now() - 5 * 60_000).toISOString();

function props(over: Partial<TentSensorStripProps> = {}): TentSensorStripProps {
  return {
    climateFreshness: {
      kind: "single",
      sourceLabel: "EcoWitt",
      capturedAt: fiveMinutesAgo(),
      stale: false,
    },
    temperature: { value: "75.2", unit: "°F" },
    humidity: "61",
    vpd: {
      value: 1.16,
      calculated: false,
      freshness: {
        kind: "single",
        sourceLabel: "EcoWitt",
        capturedAt: fiveMinutesAgo(),
        stale: false,
      },
    },
    vpdDisplay: "1.16",
    ...over,
  };
}

afterEach(() => cleanup());

describe("TentSensorStrip", () => {
  it("shows air temperature and RH with their source and age in the two-value layout", () => {
    render(<TentSensorStrip {...props()} />);
    const climate = screen.getByTestId("tent-detail-sensor-strip-climate");
    expect(within(climate).getByTestId("tent-detail-sensor-strip-air")).toHaveTextContent(
      "Air75.2°F",
    );
    expect(within(climate).getByTestId("tent-detail-sensor-strip-rh")).toHaveTextContent("RH61%");
    const freshness = within(climate).getByTestId("tent-detail-sensor-strip-freshness");
    expect(freshness).toHaveTextContent("EcoWitt");
    expect(freshness).toHaveTextContent("Captured 5 minutes ago");
    expect(within(climate).queryByTestId("tent-detail-sensor-strip-vpd")).toBeNull();
  });

  it("shows VPD in kPa with its own source and age in the one-value layout", () => {
    render(<TentSensorStrip {...props()} />);
    const vpdOnly = screen.getByTestId("tent-detail-sensor-strip-vpd-only");
    expect(within(vpdOnly).getByTestId("tent-detail-sensor-strip-vpd")).toHaveTextContent(
      "VPD1.16kPa",
    );
    const freshness = within(vpdOnly).getByTestId("tent-detail-sensor-strip-vpd-freshness");
    expect(freshness).toHaveTextContent("Captured 5 minutes ago");
    expect(within(vpdOnly).queryByTestId("tent-detail-sensor-strip-air")).toBeNull();
  });

  it("marks a stale reading stale in either layout, never healthy", () => {
    const stale = {
      kind: "single" as const,
      sourceLabel: "CSV",
      capturedAt: fiveMinutesAgo(),
      stale: true,
    };
    render(
      <TentSensorStrip
        {...props({
          climateFreshness: stale,
          vpd: { value: 1.16, calculated: false, freshness: stale },
        })}
      />,
    );
    expect(screen.getByTestId("tent-detail-sensor-strip-stale")).toHaveTextContent("Stale");
    expect(screen.getByTestId("tent-detail-sensor-strip-vpd-stale")).toHaveTextContent("Stale");
  });

  it("says a calculated VPD came from the same capture", () => {
    render(<TentSensorStrip {...props({ vpd: { ...props().vpd, calculated: true } })} />);
    expect(screen.getByTestId("tent-detail-sensor-strip-vpd-only")).toHaveTextContent(
      "Calculated from same-capture temperature and RH",
    );
  });

  it("says VPD unavailable without a trustworthy VPD, and shows no number", () => {
    render(
      <TentSensorStrip
        {...props({
          vpd: { value: null, calculated: false, freshness: { kind: "none" } },
          vpdDisplay: null,
        })}
      />,
    );
    const vpdOnly = screen.getByTestId("tent-detail-sensor-strip-vpd-only");
    expect(vpdOnly).toHaveTextContent("VPD unavailable.");
    expect(within(vpdOnly).queryByTestId("tent-detail-sensor-strip-vpd")).toBeNull();
    expect(vpdOnly).not.toHaveTextContent("kPa");
  });

  it("says a missing value is not reported instead of showing zero", () => {
    render(<TentSensorStrip {...props({ humidity: null })} />);
    const rh = screen.getByTestId("tent-detail-sensor-strip-rh");
    expect(rh).toHaveTextContent("Not reported");
    expect(rh).not.toHaveTextContent("0");
  });

  it("says no readings yet when there are none", () => {
    render(
      <TentSensorStrip
        {...props({
          climateFreshness: { kind: "none" },
          temperature: null,
          humidity: null,
          vpd: { value: null, calculated: false, freshness: { kind: "none" } },
          vpdDisplay: null,
        })}
      />,
    );
    const climate = screen.getByTestId("tent-detail-sensor-strip-climate");
    expect(climate).toHaveTextContent("No readings yet.");
    expect(within(climate).queryByTestId("tent-detail-sensor-strip-air")).toBeNull();
  });
});
