/**
 * Review of #2742: a newer manual temperature/humidity pair replaces the
 * current VPD, and the VPD card still charts recorded CSV history.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { afterEach, describe, expect, it, vi } from "vitest";
import Sensors from "@/pages/Sensors";
import { LatestVpdReadingSelection } from "@/lib/latestVpdReadingSelection";
import { calculateVPD } from "@/lib/sensors/calculateVPD";
import { deriveVpd } from "@/lib/vpdCalculationRules";
import type { SensorReading } from "@/mock";

const state = vi.hoisted(() => ({
  sensors: [] as SensorReading[],
}));
const TENT = "11111111-1111-4111-8111-111111111111";

vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({
    data: [
      {
        id: TENT,
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
  useSensorsQuickLogManualReadings: () => ({
    data: [],
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: true,
    fetchStatus: "idle",
    refetch: vi.fn(),
  }),
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
    <div data-testid={`chart-${metric}`}>{data.map((r) => `${r.source}:${r.vpd}`).join(",")}</div>
  ),
}));

function row(
  partial: Partial<SensorReading> & Pick<SensorReading, "source" | "capturedAt">,
): SensorReading {
  return {
    tentId: TENT,
    status: "usable",
    ts: partial.capturedAt,
    temp: 24,
    rh: 50,
    vpd: 0,
    co2: 0,
    soil: 0,
    observedMetrics: ["temp", "rh"],
    ...partial,
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
  state.sensors = [];
});

describe("Sensors VPD history when a newer manual pair wins", () => {
  it("keeps recorded CSV history on the chart and shows the derived current value", () => {
    const manualAt = new Date().toISOString();
    const manualTemp = ((74 - 32) * 5) / 9;
    state.sensors = [
      row({
        source: "manual",
        capturedAt: manualAt,
        temp: manualTemp,
        rh: 56,
        vpd: 0,
        observedMetrics: ["temp", "rh"],
      }),
      row({
        source: "csv",
        capturedAt: "2026-10-28T12:30:00.000Z",
        vpd: 0.84,
        observedMetrics: ["temp", "rh", "vpd"],
      }),
    ];
    mount();
    const chart = screen.getByTestId("chart-vpd");
    expect(chart).toHaveTextContent(/csv:0\.84/);
    expect(chart).toHaveTextContent(/manual:/);
    expect(screen.getByTestId("sensors-vpd-derived-value")).toHaveTextContent("1.26 kPa");
    expect(screen.getByTestId("sensors-metric-state-vpd")).toHaveAttribute("data-kind", "derived");
    expect(screen.queryByText(/no recorded vpd history/i)).not.toBeInTheDocument();
  });
});

describe("VPD numeric guards", () => {
  it("uses one result for calculateVPD and deriveVpd", () => {
    const derived = deriveVpd({ temperature: 25, humidity: 60 });
    expect(derived.kind).toBe("derived");
    if (derived.kind === "derived") expect(derived.vpdKpa).toBe(calculateVPD(25, 60));
    expect(calculateVPD(200, 50)).toBeNull();
    expect(deriveVpd({ temperature: 200, humidity: 50 }).kind).toBe("invalid");
    const series = LatestVpdReadingSelection.historyForChart(
      [
        row({
          source: "csv",
          capturedAt: "2026-10-28T12:30:00.000Z",
          vpd: 0.84,
          observedMetrics: ["temp", "rh", "vpd"],
        }),
      ],
      [
        row({
          source: "manual",
          capturedAt: "2026-11-02T20:00:00.000Z",
          temp: 23.33,
          rh: 56,
          observedMetrics: ["temp", "rh"],
        }),
      ],
    );
    expect(series.map((reading) => reading.source)).toEqual(["manual", "csv"]);
    expect(series[0]?.vpd).toBe(calculateVPD(23.33, 56));
  });

  it("does not invent a chart series when nothing recorded VPD", () => {
    expect(
      LatestVpdReadingSelection.historyForChart(
        [],
        [row({ source: "manual", capturedAt: "2026-11-02T20:00:00.000Z", temp: 23, rh: 56 })],
      ),
    ).toEqual([]);
  });
});
