import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { afterEach, describe, expect, it, vi } from "vitest";
import Sensors from "@/pages/Sensors";
import type { SensorReading } from "@/mock";
import type { SensorReadingRow } from "@/lib/db";
import { groupSensorReadingRows } from "@/lib/growAdapters";

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
  it.each(["live", "manual"] as const)(
    "keeps a previously displayed derived VPD stale when mapped %s readings age",
    (source) => {
      vi.useFakeTimers();
      const now = new Date("2026-09-24T12:00:00Z");
      vi.setSystemTime(now);
      const ts = new Date(now.getTime() - (source === "live" ? 14 : 1439) * 60000).toISOString();
      state.sensors = [
        {
          ...manual(),
          source,
          ts,
          capturedAt: ts,
          observedMetrics: ["temp", "rh"],
          freshness: { floor: null, timeSources: [source] },
        },
      ];
      state.manuals.data = [];
      mount();
      expect(screen.getByTestId("sensors-vpd-derived-value")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(2 * 60000);
      });
      expect(screen.getByTestId("sensors-metric-state-temp")).toHaveAttribute("data-kind", "stale");
      expect(screen.getByTestId("sensors-metric-state-vpd")).toHaveAttribute("data-kind", "stale");
      expect(screen.getByTestId("sensors-vpd-derived-value")).toBeInTheDocument();
      expect(screen.queryByTestId("sensors-stage-status-temp")).not.toBeInTheDocument();
    },
  );

  it("keeps the Quick Log manual window when it replaces a live capture at the same time", () => {
    vi.useFakeTimers();
    const now = new Date("2026-09-24T12:00:00Z");
    vi.setSystemTime(now);
    const ts = new Date(now.getTime() - 14 * 60000).toISOString();
    state.sensors = [
      {
        ...manual(),
        source: "live",
        ts,
        capturedAt: ts,
        freshness: { floor: null, timeSources: ["live"] },
      },
    ];
    state.manuals.data = [{ ...manual(), ts, capturedAt: ts }];
    mount();
    act(() => {
      vi.advanceTimersByTime(2 * 60000);
    });
    expect(screen.getByTestId("sensors-metric-state-temp")).toHaveAttribute("data-kind", "manual");
    expect(screen.getByTestId("sensors-stage-status-temp")).toBeInTheDocument();
  });

  it.each([
    ["live", "ok"],
    ["manual", "ok"],
    ["live", "invalid"],
    ["manual", "invalid"],
  ] as const)(
    "rechecks future %s evidence with quality=%s without replacing query rows",
    (source, quality) => {
      vi.useFakeTimers();
      const now = new Date("2026-09-24T12:00:00Z");
      vi.setSystemTime(now);
      const capturedAt = new Date(now.getTime() + 10 * 60000).toISOString();
      state.sensors = groupSensorReadingRows(
        [
          { metric: "temperature_c", value: 25 },
          { metric: "humidity_pct", value: 55 },
        ].map(
          (metric) =>
            ({
              ...metric,
              id: metric.metric,
              user_id: "owner-a",
              tent_id: TENT,
              source,
              quality,
              captured_at: capturedAt,
              ts: capturedAt,
              created_at: capturedAt,
              device_id: null,
              raw_payload: null,
            }) as SensorReadingRow,
        ),
        now,
      );
      state.manuals.data = [];
      const cachedRows = state.sensors;
      const before = structuredClone(cachedRows);
      mount();
      expect(screen.getByTestId("sensors-metric-state-temp")).toHaveAttribute(
        "data-kind",
        "invalid",
      );
      expect(screen.queryByTestId("sensors-stage-status-temp")).not.toBeInTheDocument();
      expect(screen.queryByTestId("sensors-vpd-derived-value")).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(6 * 60000);
      });
      expect(screen.getByTestId("sensors-metric-state-temp")).toHaveAttribute(
        "data-kind",
        quality === "ok" ? source : "invalid",
      );
      if (quality === "ok") {
        expect(screen.getByTestId("sensors-stage-status-temp")).toBeInTheDocument();
        expect(screen.getByTestId("sensors-stage-status-rh")).toBeInTheDocument();
        expect(screen.getByTestId("sensors-vpd-derived-value")).toBeInTheDocument();
        expect(screen.getByTestId("chart-temp")).toHaveTextContent(source + ":25");
      } else {
        expect(screen.queryByTestId("sensors-stage-status-temp")).not.toBeInTheDocument();
        expect(screen.queryByTestId("sensors-vpd-derived-value")).not.toBeInTheDocument();
      }
      expect(state.sensors).toBe(cachedRows);
      expect(state.sensors).toEqual(before);
      expect(state.sensors[0].status).toBe("invalid");
    },
  );

  it.each([
    ["live", true],
    ["manual", true],
    ["live", false],
    ["manual", false],
  ] as const)(
    "ages %s with observed VPD=%s without replacing query rows",
    (source, observedVpd) => {
      vi.useFakeTimers();
      const now = new Date("2026-09-23T12:00:00Z");
      vi.setSystemTime(now);
      const age = source === "manual" ? 1439 : 14;
      const ts = new Date(now.getTime() - age * 60000).toISOString();
      state.sensors = [
        {
          ...manual(),
          source,
          ts,
          capturedAt: ts,
          observedMetrics: observedVpd ? ["temp", "rh", "vpd"] : ["temp", "rh"],
        },
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
      expect(screen.getByTestId("sensors-metric-state-vpd")).toHaveAttribute("data-kind", "stale");
      if (!observedVpd) expect(screen.getByTestId("sensors-vpd-derived-value")).toBeInTheDocument();
      expect(screen.queryByTestId("sensors-stage-status-temp")).not.toBeInTheDocument();
      expect(screen.queryByTestId("sensors-stage-status-rh")).not.toBeInTheDocument();
      expect(screen.getByTestId("chart-temp")).toHaveTextContent(source + ":25");
    },
  );
});
