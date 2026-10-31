/**
 * Filming bug #6 (2026-10-22): /sensors showed a calculated VPD on the VPD card
 * (1.13 kPa from temperature + humidity) above an empty VPD chart, because the
 * chart only plots directly recorded VPD rows. With no recorded VPD history
 * the card says so instead of drawing an empty chart.
 */
import { cleanup, render, screen } from "@testing-library/react";
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
  Object.assign(state.manuals, {
    isPending: false,
    isError: false,
    isSuccess: true,
    fetchStatus: "idle",
  });
});

describe("Sensors VPD card with only a calculated VPD", () => {
  it("does not draw an empty VPD chart beside a calculated value", () => {
    state.sensors = [{ ...manual(), vpd: 0, observedMetrics: ["temp", "rh"] }];
    state.manuals.data = [];
    mount();
    expect(screen.getByTestId("sensors-vpd-derived-value")).toBeInTheDocument();
    expect(screen.queryByTestId("chart-vpd")).not.toBeInTheDocument();
    expect(screen.getByTestId("sensors-empty-vpd")).toHaveTextContent(/no recorded vpd history/i);
    // Temperature has recorded rows, so its chart still draws.
    expect(screen.getByTestId("chart-temp")).toBeInTheDocument();
  });

  // Review of #2346 at 452834e: a stale calculated VPD keeps its stale copy.
  it("keeps the stale message for a calculated VPD from an old reading", () => {
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    state.sensors = [
      { ...manual(), ts: old, capturedAt: old, vpd: 0, observedMetrics: ["temp", "rh"] },
    ];
    state.manuals.data = [];
    mount();
    const empty = screen.getByTestId("sensors-empty-vpd");
    expect(empty).toHaveTextContent(/older than the freshness window/i);
    expect(empty).not.toHaveTextContent(/no recorded vpd history/i);
  });

  it("still charts directly recorded VPD rows", () => {
    state.sensors = [manual()];
    state.manuals.data = [];
    mount();
    expect(screen.getByTestId("chart-vpd")).toBeInTheDocument();
  });

  it.each([
    [
      "pending",
      { isPending: true, isSuccess: false, fetchStatus: "fetching" },
      /checking quick log manual history/i,
    ],
    [
      "paused",
      { isPending: true, isSuccess: false, fetchStatus: "paused" },
      /waiting for connection/i,
    ],
    [
      "failed",
      { isError: true, isSuccess: false, fetchStatus: "idle" },
      /could not be fully checked/i,
    ],
  ] as const)(
    "keeps the manual-history status while the history check is %s",
    (_label, query, message) => {
      state.sensors = [{ ...manual(), vpd: 0, observedMetrics: ["temp", "rh"] }];
      state.manuals.data = [];
      Object.assign(state.manuals, query);
      mount();
      expect(screen.getByTestId("sensors-vpd-derived-value")).toBeInTheDocument();
      const empty = screen.getByTestId("sensors-empty-vpd");
      expect(empty).toHaveTextContent(message);
      expect(empty).not.toHaveTextContent(/no recorded vpd history/i);
    },
  );
});
