import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DrybackMonitoringStrip } from "@/components/DrybackMonitoringStrip";
import { useSoilMoistureCalibrations } from "@/hooks/useSoilMoistureCalibrations";
import { hasDrybackSoilMoistureReadings } from "@/lib/drybackMonitoringRules";

// Issues #2009 / #2699: a new Free grower with no soil sensor opened the plant
// or tent page and got a 404 on soil_moisture_calibrations plus the
// "Calibration records are unavailable" notice on every load.

const GROW_ID = "11111111-1111-4111-8111-111111111111";
const TENT_ID = "22222222-2222-4222-8222-222222222222";

const MISSING_TABLE_ERROR = {
  code: "PGRST205",
  message: "Could not find the table 'public.soil_moisture_calibrations' in the schema cache",
};

const state = vi.hoisted(() => ({
  calibrationRequests: 0,
  calibrationRows: [] as Record<string, unknown>[],
  calibrationError: null as Record<string, unknown> | null,
  sensorRows: [] as Record<string, unknown>[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "soil_moisture_calibrations") state.calibrationRequests += 1;
      const query = {
        select: () => query,
        eq: () => query,
        order: () =>
          Promise.resolve({ data: state.calibrationRows, error: state.calibrationError }),
      };
      return query;
    },
  },
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({
    data: state.sensorRows,
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

function soilRow(id: string, value: number, minutesAgo: number) {
  return {
    id,
    metric: "soil_moisture_pct",
    value,
    captured_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    source: "manual",
    quality: null,
  };
}

function tempRow(id: string) {
  return {
    id,
    metric: "temperature_f",
    value: 75,
    captured_at: new Date().toISOString(),
    source: "manual",
    quality: null,
  };
}

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderStrip() {
  const queryClient = newQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <DrybackMonitoringStrip growId={GROW_ID} tentId={TENT_ID} />
    </QueryClientProvider>,
  );
}

describe("hasDrybackSoilMoistureReadings", () => {
  it("is false for no rows, null, and non-soil metrics", () => {
    expect(hasDrybackSoilMoistureReadings(undefined)).toBe(false);
    expect(hasDrybackSoilMoistureReadings(null)).toBe(false);
    expect(hasDrybackSoilMoistureReadings([])).toBe(false);
    expect(hasDrybackSoilMoistureReadings([tempRow("t1")])).toBe(false);
  });

  it("is true when any row is a soil moisture reading, including a zero value", () => {
    expect(hasDrybackSoilMoistureReadings([tempRow("t1"), soilRow("s1", 0, 5)])).toBe(true);
    expect(hasDrybackSoilMoistureReadings([{ metric: "VWC", value: 40 }])).toBe(true);
  });
});

describe("useSoilMoistureCalibrations enabled flag and missing table", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    state.calibrationRequests = 0;
    state.calibrationRows = [];
    state.calibrationError = null;
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  function renderCalibrationHook(enabled: boolean | undefined) {
    const queryClient = newQueryClient();
    return renderHook(
      () => useSoilMoistureCalibrations({ growId: GROW_ID, tentId: TENT_ID, enabled }),
      {
        wrapper: ({ children }: PropsWithChildren) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      },
    );
  }

  it("makes no request and stays idle when the caller disables it", async () => {
    state.calibrationError = MISSING_TABLE_ERROR;
    const { result } = renderCalibrationHook(false);

    // Give a would-be request a chance to fire.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(state.calibrationRequests).toBe(0);
    expect(result.current.availability).toBe("idle");
    expect(result.current.isError).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("degrades a missing table (404 / PGRST205) to schema_unavailable without an error", async () => {
    state.calibrationError = MISSING_TABLE_ERROR;
    const { result } = renderCalibrationHook(undefined);

    await waitFor(() => expect(result.current.availability).toBe("schema_unavailable"));
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual([]);
    expect(state.calibrationRequests).toBe(1);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("DrybackMonitoringStrip calibration lookup gate", () => {
  beforeEach(() => {
    state.calibrationRequests = 0;
    state.calibrationRows = [];
    state.calibrationError = null;
    state.sensorRows = [];
  });

  it("a tent with no soil readings makes no calibration request and shows no notice", async () => {
    // Prod today: the table is missing, so any request would 404.
    state.calibrationError = MISSING_TABLE_ERROR;
    state.sensorRows = [tempRow("t1")];

    renderStrip();

    const strip = await screen.findByTestId("dryback-monitoring-strip");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(state.calibrationRequests).toBe(0);
    expect(strip).toHaveAttribute("data-calibration-availability", "idle");
    expect(screen.queryByTestId("dryback-monitoring-calibration-unavailable")).toBeNull();
    expect(screen.queryByText(/Calibration records are unavailable/i)).toBeNull();
  });

  it("a grower with soil readings and saved calibrations still gets them applied", async () => {
    state.sensorRows = [soilRow("s1", 50, 30), soilRow("s2", 48, 20), soilRow("s3", 46, 10)];
    state.calibrationRows = [
      {
        id: "cal-1",
        grow_id: GROW_ID,
        tent_id: TENT_ID,
        plant_id: null,
        device_id: null,
        dry_raw: 20,
        wet_raw: 80,
        source: "manual",
        is_active: true,
        created_at: "2026-11-01T00:00:00.000Z",
        updated_at: "2026-11-01T00:00:00.000Z",
      },
    ];

    renderStrip();

    await waitFor(() =>
      expect(screen.getByTestId("dryback-monitoring-strip")).toHaveAttribute(
        "data-calibration-availability",
        "available",
      ),
    );
    expect(state.calibrationRequests).toBe(1);
    expect(screen.getByTestId("dryback-monitoring-strip")).toHaveAttribute(
      "data-series-kind",
      "calibrated",
    );
    expect(screen.queryByTestId("dryback-monitoring-calibration-unavailable")).toBeNull();
  });

  it("a grower with soil readings on a deployment without the table is told calibration is unknown", async () => {
    state.calibrationError = MISSING_TABLE_ERROR;
    state.sensorRows = [soilRow("s1", 50, 30), soilRow("s2", 48, 20)];

    renderStrip();

    expect(
      await screen.findByTestId("dryback-monitoring-calibration-unavailable"),
    ).toHaveTextContent(/calibration status is unknown/i);
    expect(state.calibrationRequests).toBe(1);
  });
});
