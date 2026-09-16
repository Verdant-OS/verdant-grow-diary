import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Sensors from "@/pages/Sensors";
import type { SensorReading } from "@/mock";

const state = vi.hoisted(() => ({
  manuals: {
    data: [] as SensorReading[],
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: true,
    fetchStatus: "idle",
    refetch: vi.fn(),
  },
  sensors: [] as SensorReading[],
}));
const TENT = "11111111-1111-4111-8111-111111111111";
vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({
    data: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Tent A",
        growId: "grow-a",
        stage: "veg",
      },
    ],
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
  useGrowSensorReadings: () => ({
    data: state.sensors,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useSensorsQuickLogManualReadings", () => ({
  useSensorsQuickLogManualReadings: () => state.manuals,
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useSoilMoistureCalibrations", () => ({
  useSoilMoistureCalibrations: () => ({
    data: [],
    availability: "available",
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useHasRole", () => ({
  useHasRole: () => ({ status: "denied", granted: false, error: null }),
}));
vi.mock("@/hooks/useEcowittIngestAuditProofRows", () => ({
  useEcowittIngestAuditProofRows: () => ({ status: "idle", rows: [] }),
}));
vi.mock("@/components/EnvironmentCsvImportLauncher", () => ({ default: () => null }));
vi.mock("@/components/ManualSensorReadingCard", () => ({
  default: () => <div>Manual capture remains available</div>,
}));
vi.mock("@/components/SoilMoistureCalibrationCaptureCard", () => ({ default: () => null }));
vi.mock("@/components/SensorBridgeHealthCard", () => ({ default: () => null }));
vi.mock("@/components/SensorsTestbenchPanel", () => ({ default: () => null }));
vi.mock("@/components/ManualSensorTrendChart", () => ({ default: () => null }));
vi.mock("@/components/SensorChart", () => ({
  default: ({ data, metric }: { data: SensorReading[]; metric: string }) => (
    <div data-testid={`chart-${metric}`}>{data.map((r) => `${r.source}:${r.temp}`).join(",")}</div>
  ),
}));
function manual(): SensorReading {
  return {
    tentId: TENT,
    source: "manual",
    status: "usable",
    ts: new Date().toISOString(),
    capturedAt: new Date().toISOString(),
    temp: 25,
    rh: 55,
    vpd: 1.2,
    co2: 0,
    soil: 0,
    observedMetrics: ["temp", "rh", "vpd"],
  };
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/sensors?tentId=${TENT}&tentIntent=required`]}>
        <Sensors />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  Object.assign(state.manuals, {
    data: [],
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: true,
    fetchStatus: "idle",
  });
  state.manuals.refetch.mockClear();
  state.sensors = [];
});
describe("Sensors page manual-history read state", () => {
  it("shows unavailability and scoped Retry instead of false empty claims", async () => {
    state.manuals.isError = true;
    state.manuals.isSuccess = false;
    mount();
    const notice = await screen.findByTestId("sensors-manual-history-error");
    expect(notice).toHaveTextContent("Quick Log manual history unavailable");
    expect(screen.queryByText(/No temperature reading yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No sensor readings found for this range/)).not.toBeInTheDocument();
    expect(screen.getByText("Manual capture remains available")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("sensors-manual-history-error-retry"));
    expect(state.manuals.refetch).toHaveBeenCalledTimes(1);
  });
  it.each(["fetching", "paused"])("keeps a first %s read unresolved", async (fetchStatus) => {
    Object.assign(state.manuals, {
      isPending: true,
      isLoading: fetchStatus === "fetching",
      isSuccess: false,
      fetchStatus,
    });
    mount();
    const notice = await screen.findByTestId("sensors-manual-history-pending");
    expect(notice).toHaveTextContent(
      fetchStatus === "paused" ? "Waiting for connection" : "Checking Quick Log manual history",
    );
    expect(screen.queryByText(/No temperature reading yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No sensor readings found for this range/)).not.toBeInTheDocument();
  });
  it("retains a cached or surviving manual reading with explicit incomplete-read copy", async () => {
    Object.assign(state.manuals, { data: [manual()], isError: true, isSuccess: false });
    mount();
    expect(await screen.findByTestId("sensors-manual-history-error")).toHaveTextContent(
      /previously loaded readings may be out of date/i,
    );
    expect(screen.getByTestId("chart-temp")).toHaveTextContent("manual:25");
    expect(screen.getByTestId("sensors-metric-state-temp")).toHaveTextContent("Manual");
    expect(screen.getByRole("region", { name: "Sensor source summary" })).toHaveTextContent(
      "1 reading",
    );
  });
  it("keeps surviving sensor-table data when the manual sources are unavailable", async () => {
    state.sensors = [manual()];
    Object.assign(state.manuals, { isError: true, isSuccess: false });
    mount();
    await screen.findByTestId("sensors-manual-history-error");
    expect(screen.getByTestId("chart-temp")).toHaveTextContent("manual:25");
  });
  it("preserves successful empty copy once both manual reads completed", async () => {
    mount();
    await waitFor(() =>
      expect(screen.getByTestId("sensors-empty-temp")).toHaveTextContent(
        "No temperature reading yet",
      ),
    );
    expect(screen.getByRole("region", { name: "Sensor source summary" })).toHaveTextContent(
      "No sensor readings found for this range",
    );
    expect(screen.queryByTestId("sensors-manual-history-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sensors-manual-history-pending")).not.toBeInTheDocument();
  });
  it("leaves fully resolved manual source labels and count unchanged", async () => {
    state.manuals.data = [manual()];
    mount();
    expect(await screen.findByTestId("chart-temp")).toHaveTextContent("manual:25");
    expect(screen.getByTestId("sensors-metric-state-temp")).toHaveTextContent("Manual");
    expect(screen.getByRole("region", { name: "Sensor source summary" })).toHaveTextContent(
      "1 reading",
    );
    expect(screen.queryByTestId("sensors-manual-history-error")).not.toBeInTheDocument();
  });
  it("marks temp/rh/vpd unresolved while manual history is still pending", async () => {
    Object.assign(state.manuals, {
      isPending: true,
      isLoading: true,
      isSuccess: false,
      fetchStatus: "fetching",
    });
    mount();
    await screen.findByTestId("sensors-manual-history-pending");
    for (const key of ["temp", "rh", "vpd"] as const) {
      const badge = screen.getByTestId(`sensors-metric-state-${key}`);
      expect(badge).toHaveAttribute("data-kind", "unresolved");
      expect(badge).toHaveTextContent("Checking readings");
      expect(screen.getByTestId(`sensors-empty-${key}`)).toHaveTextContent(
        "Checking Quick Log manual history",
      );
    }
    expect(screen.getByTestId("sensors-metric-state-soil")).not.toHaveAttribute(
      "data-kind",
      "unresolved",
    );
  });
  it("hides stability and source summary during pending reads with no surviving data", async () => {
    Object.assign(state.manuals, {
      isPending: true,
      isSuccess: false,
      fetchStatus: "fetching",
    });
    mount();
    await screen.findByTestId("sensors-manual-history-pending");
    expect(screen.queryByTestId("sensors-environment-stability")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sensor source summary" })).not.toBeInTheDocument();
  });
  it("shows Unavailable on empty temp/rh/vpd when manual history read failed", async () => {
    Object.assign(state.manuals, { isError: true, isSuccess: false });
    mount();
    await screen.findByTestId("sensors-manual-history-error");
    for (const key of ["temp", "rh", "vpd"] as const) {
      const badge = screen.getByTestId(`sensors-metric-state-${key}`);
      expect(badge).toHaveAttribute("data-kind", "unresolved");
      expect(badge).toHaveTextContent("Unavailable");
      expect(screen.getByTestId(`sensors-empty-${key}`)).toHaveTextContent(
        /could not be fully checked/i,
      );
    }
  });
  it("does not relabel resolved temp/rh/vpd as unresolved while manual history is pending", async () => {
    state.sensors = [manual()];
    Object.assign(state.manuals, {
      isPending: true,
      isSuccess: false,
      fetchStatus: "fetching",
    });
    mount();
    await screen.findByTestId("sensors-manual-history-pending");
    for (const key of ["temp", "rh", "vpd"] as const) {
      const badge = screen.getByTestId(`sensors-metric-state-${key}`);
      expect(badge).not.toHaveAttribute("data-kind", "unresolved");
      expect(badge).toHaveTextContent("Manual");
    }
    expect(screen.getByRole("region", { name: "Sensor source summary" })).toHaveTextContent(
      "1 reading",
    );
  });
});
