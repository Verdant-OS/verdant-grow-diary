import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("Sensor Data idle freshness", () => {
  it.each(["live", "manual"])("ages %s without replacing query rows", (source) => {
    vi.useFakeTimers();
    const now = new Date("2026-09-23T12:00:00Z");
    vi.setSystemTime(now);
    const age = source === "manual" ? 1439 : 14;
    const ts = new Date(now.getTime() - age * 60000).toISOString();
    state.sensors = [
      { ...manual(), source: source as SensorReading["source"], ts, capturedAt: ts },
    ];
    state.manuals.data = [];
    mount();
    expect(screen.getByTestId("sensors-stage-status-temp")).toBeInTheDocument();
    expect(screen.getByTestId("sensors-metric-state-temp")).not.toHaveAttribute(
      "data-kind",
      "stale",
    );
    act(() => {
      vi.advanceTimersByTime(120000);
    });
    expect(screen.getByTestId("sensors-metric-state-temp")).toHaveAttribute("data-kind", "stale");
    expect(screen.queryByTestId("sensors-stage-status-temp")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sensors-stage-status-rh")).not.toBeInTheDocument();
    expect(screen.getByTestId("chart-temp")).toHaveTextContent(source + ":25");
  });
});
