import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DrybackMonitoringStrip } from "@/components/DrybackMonitoringStrip";

const calibrationState = vi.hoisted(() => ({
  availability: "available" as "available" | "schema_unavailable" | "error",
  isError: false,
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useTentIrrigationLedger", () => ({
  useTentIrrigationLedger: () => ({
    rows: [],
    isLoading: false,
    isError: false,
    isOlderError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useSoilMoistureCalibrations", () => ({
  useSoilMoistureCalibrations: () => ({
    data: [],
    availability: calibrationState.availability,
    isLoading: false,
    isError: calibrationState.isError,
    refetch: vi.fn(),
  }),
}));

describe("DrybackMonitoringStrip calibration availability", () => {
  beforeEach(() => {
    calibrationState.availability = "available";
    calibrationState.isError = false;
  });

  it("warns that calibration is unavailable instead of treating missing schema as uncalibrated", () => {
    calibrationState.availability = "schema_unavailable";

    render(
      <DrybackMonitoringStrip
        growId="11111111-1111-4111-8111-111111111111"
        tentId="22222222-2222-4222-8222-222222222222"
      />,
    );

    expect(screen.getByTestId("dryback-monitoring-calibration-unavailable")).toHaveTextContent(
      /Calibration records are unavailable.*raw soil moisture/i,
    );
    expect(screen.queryByText(/no active dry\/wet baseline/i)).toBeNull();
  });

  it("does not show the unavailable warning when calibration records are available", () => {
    render(
      <DrybackMonitoringStrip
        growId="11111111-1111-4111-8111-111111111111"
        tentId="22222222-2222-4222-8222-222222222222"
      />,
    );

    expect(screen.queryByTestId("dryback-monitoring-calibration-unavailable")).toBeNull();
  });

  it("keeps unrelated calibration read failures visible as unavailable", () => {
    calibrationState.availability = "error";
    calibrationState.isError = true;

    render(
      <DrybackMonitoringStrip
        growId="11111111-1111-4111-8111-111111111111"
        tentId="22222222-2222-4222-8222-222222222222"
      />,
    );

    expect(screen.getByTestId("dryback-monitoring-calibration-unavailable")).toHaveTextContent(
      /calibration status is unknown/i,
    );
  });
});
