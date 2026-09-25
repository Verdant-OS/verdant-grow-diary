/**
 * The Sensors page judges a tent's readings by the same stage Alerts use.
 *
 * QA 2026-09-24, BUG-006 follow-up: Alerts and the scoped Dashboard resolve
 * the stage from the grow row, the tent and the active plants in scope, but
 * Sensors used `tents.stage` alone. With one Flower plant in a tent still
 * marked Veg, Alerts flagged RH 60% (Flower targets 40–55%) while the Sensors
 * chip said "In Veg RH range" for the same reading.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Sensors from "@/pages/Sensors";
import { resolveSensorsTentStage } from "@/lib/sensorsTentStageRules";

const TENT = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f";
const OTHER_TENT = "6b2d7f10-3c4e-4d6f-9a01-2b3c4d5e6f70";

describe("resolveSensorsTentStage", () => {
  it("QA repro: a Flower plant outranks a tent and grow still marked Veg", () => {
    expect(
      resolveSensorsTentStage({
        tentId: TENT,
        tentStage: "veg",
        growStage: "veg",
        plants: [{ tent_id: TENT, stage: "flower" }],
      }),
    ).toBe("flower");
  });

  it("ignores plants in other tents", () => {
    expect(
      resolveSensorsTentStage({
        tentId: TENT,
        tentStage: "veg",
        growStage: null,
        plants: [{ tent_id: OTHER_TENT, stage: "flower" }],
      }),
    ).toBe("veg");
  });

  it("mixed plant stages abstain, so the tent decides", () => {
    expect(
      resolveSensorsTentStage({
        tentId: TENT,
        tentStage: "veg",
        growStage: null,
        plants: [
          { tent_id: TENT, stage: "flower" },
          { tent_id: TENT, stage: "seedling" },
        ],
      }),
    ).toBe("veg");
  });

  it("a harvested plant cannot switch an actively staged grow off", () => {
    expect(
      resolveSensorsTentStage({
        tentId: TENT,
        tentStage: "veg",
        growStage: "veg",
        plants: [{ tent_id: TENT, stage: "harvest" }],
      }),
    ).toBe("veg");
  });

  it("the grow row rescues a tent left at a stale earlier stage", () => {
    expect(
      resolveSensorsTentStage({
        tentId: TENT,
        tentStage: "seedling",
        growStage: "flower",
        plants: [],
      }),
    ).toBe("flower");
  });

  it("pending or failed plant reads add no signal", () => {
    expect(
      resolveSensorsTentStage({ tentId: TENT, tentStage: "veg", growStage: null, plants: null }),
    ).toBe("veg");
  });

  it("returns null without a tent or any recognized stage — never guesses", () => {
    expect(
      resolveSensorsTentStage({
        tentId: null,
        tentStage: "flower",
        growStage: "flower",
        plants: [{ tent_id: TENT, stage: "flower" }],
      }),
    ).toBeNull();
    expect(
      resolveSensorsTentStage({ tentId: TENT, tentStage: null, growStage: "", plants: [] }),
    ).toBeNull();
  });
});

/** Stable tent list — see sensors-operator-diagnostics-wiring for why. */
const STABLE_GROW_TENTS = [{ id: TENT, name: "Tent 1", growId: "g1", stage: "veg" }] as const;
const NOW = new Date().toISOString();
const STABLE_READINGS = [
  {
    ts: NOW,
    capturedAt: NOW,
    tentId: TENT,
    temp: 24,
    rh: 60,
    vpd: 0,
    co2: 0,
    soil: 0,
    observedMetrics: ["temp", "rh"],
    source: "live",
    status: "usable",
  },
];
const plantsState: { data: Array<{ tent_id: string; stage: string }> | undefined } = {
  data: [],
};

vi.mock("@/hooks/useHasRole", () => ({
  useHasRole: () => ({ status: "denied", granted: false, error: null }),
}));
vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({
    data: STABLE_GROW_TENTS,
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
  useGrowSensorReadings: () => ({
    data: STABLE_READINGS,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: plantsState.data, isError: false }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "g1", stage: "veg" }] }),
}));
vi.mock("@/hooks/useSensorsQuickLogManualReadings", () => ({
  useSensorsQuickLogManualReadings: () => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => ({ data: [] }) }));
vi.mock("@/hooks/useSoilMoistureCalibrations", () => ({
  useSoilMoistureCalibrations: () => ({
    data: [],
    availability: "available",
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, session: null, loading: false }),
}));
vi.mock("@/components/EnvironmentCsvImportLauncher", () => ({ default: () => null }));
vi.mock("@/components/SensorBridgeHealthCard", () => ({ default: () => null }));
vi.mock("@/components/SensorChart", () => ({ default: () => null }));
vi.mock("@/components/SensorsTestbenchPanel", () => ({ default: () => null }));

function renderSensors() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/sensors?tent=${TENT}`]}>
        <Sensors />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Sensors page stage chips follow the plants in the tent", () => {
  beforeEach(() => {
    plantsState.data = [];
  });

  it("QA repro: RH 60% with a Flower plant in a Veg tent is above the Flower range", async () => {
    plantsState.data = [{ tent_id: TENT, stage: "flower" }];
    renderSensors();
    expect(await screen.findByTestId("sensors-stage-status-rh")).toHaveTextContent(
      "Above Flower RH range",
    );
  });

  it("without a plant signal the tent and grow still decide", async () => {
    renderSensors();
    expect(await screen.findByTestId("sensors-stage-status-rh")).toHaveTextContent(
      "In Veg RH range",
    );
  });
});
