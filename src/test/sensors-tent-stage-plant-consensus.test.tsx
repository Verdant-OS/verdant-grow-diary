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
import { resolveTentEnvironmentStage, resolveTentGrowStage } from "@/lib/tentEnvironmentStageRules";

const TENT = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f";
const OTHER_TENT = "6b2d7f10-3c4e-4d6f-9a01-2b3c4d5e6f70";

describe("resolveTentEnvironmentStage", () => {
  it("QA repro: a Flower plant outranks a tent and grow still marked Veg", () => {
    expect(
      resolveTentEnvironmentStage({
        tentId: TENT,
        tentGrowId: "g1",
        tentStage: "veg",
        growStage: "veg",
        plants: [{ tent_id: TENT, stage: "flower" }],
      }),
    ).toBe("flower");
  });

  it("ignores plants in other tents", () => {
    expect(
      resolveTentEnvironmentStage({
        tentId: TENT,
        tentGrowId: "g1",
        tentStage: "veg",
        growStage: null,
        plants: [{ tent_id: OTHER_TENT, stage: "flower" }],
      }),
    ).toBe("veg");
  });

  it("reads mapped plants (tentId) the same as plant rows (tent_id)", () => {
    expect(
      resolveTentEnvironmentStage({
        tentId: TENT,
        tentGrowId: "g1",
        tentStage: "veg",
        growStage: "veg",
        plants: [
          { tentId: TENT, stage: "flower" },
          { tentId: OTHER_TENT, stage: "seedling" },
        ],
      }),
    ).toBe("flower");
  });

  it("mixed plant stages abstain, so the tent decides", () => {
    expect(
      resolveTentEnvironmentStage({
        tentId: TENT,
        tentGrowId: "g1",
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
      resolveTentEnvironmentStage({
        tentId: TENT,
        tentGrowId: "g1",
        tentStage: "veg",
        growStage: "veg",
        plants: [{ tent_id: TENT, stage: "harvest" }],
      }),
    ).toBe("veg");
  });

  it("the grow row rescues a tent left at a stale earlier stage", () => {
    expect(
      resolveTentEnvironmentStage({
        tentId: TENT,
        tentGrowId: "g1",
        tentStage: "seedling",
        growStage: "flower",
        plants: [],
      }),
    ).toBe("flower");
  });

  it("a plant read with no data yet withholds grading (Codex review on #1683)", () => {
    // Pending, or failed before returning rows: a Flower plant may be in the
    // tent, so the tent and grow alone must not decide.
    expect(
      resolveTentEnvironmentStage({
        tentId: TENT,
        tentGrowId: "g1",
        tentStage: "veg",
        growStage: "veg",
        plants: null,
      }),
    ).toBeNull();
    expect(
      resolveTentEnvironmentStage({
        tentId: TENT,
        tentGrowId: "g1",
        tentStage: "veg",
        growStage: "veg",
        plants: [],
      }),
    ).toBe("veg");
  });

  it("returns null without a tent or any recognized stage — never guesses", () => {
    expect(
      resolveTentEnvironmentStage({
        tentId: null,
        tentGrowId: "g1",
        tentStage: "flower",
        growStage: "flower",
        plants: [{ tent_id: TENT, stage: "flower" }],
      }),
    ).toBeNull();
    expect(
      resolveTentEnvironmentStage({
        tentId: TENT,
        tentGrowId: "g1",
        tentStage: null,
        growStage: "",
        plants: [],
      }),
    ).toBeNull();
  });
});

describe("resolveTentEnvironmentStage: canonical grow attribution (Codex review on #1683)", () => {
  // A plant's own grow_id wins over its tent's grow (growAttributionRules), as
  // on Alerts and the Dashboard: a plant naming grow g2 in g1's tent is g2's.
  it("a plant naming another grow never counts, even in this tent", () => {
    for (const plants of [
      [{ tent_id: TENT, grow_id: "g2", stage: "flower" }],
      [{ tentId: TENT, growId: "g2", stage: "flower" }],
    ]) {
      expect(
        resolveTentEnvironmentStage({
          tentId: TENT,
          tentGrowId: "g1",
          tentStage: "veg",
          growStage: "veg",
          plants,
        }),
      ).toBe("veg");
    }
  });

  it("a plant of this grow, or one with no grow, counts through the tent", () => {
    for (const plant of [
      { tent_id: TENT, grow_id: "g1", stage: "flower" },
      { tentId: TENT, growId: "g1", stage: "flower" },
      { tent_id: TENT, grow_id: null, stage: "flower" },
    ]) {
      expect(
        resolveTentEnvironmentStage({
          tentId: TENT,
          tentGrowId: "g1",
          tentStage: "veg",
          growStage: "veg",
          plants: [plant],
        }),
      ).toBe("flower");
    }
  });

  it("a tent with no grow counts only plants with no grow", () => {
    const input = { tentId: TENT, tentGrowId: null, tentStage: "veg", growStage: null };
    expect(
      resolveTentEnvironmentStage({
        ...input,
        plants: [{ tent_id: TENT, grow_id: "g2", stage: "flower" }],
      }),
    ).toBe("veg");
    expect(
      resolveTentEnvironmentStage({ ...input, plants: [{ tent_id: TENT, stage: "flower" }] }),
    ).toBe("flower");
  });
});

describe("resolveTentGrowStage (Codex review on #1683)", () => {
  // useGrows() exposes an empty list while loading and after a failed read,
  // so a missing grow row must not read as "this grow has no stage".
  const grows = [{ id: "g1", stage: "flower" }];

  it("withholds the grow stage until the list resolves the tent's grow", () => {
    expect(resolveTentGrowStage({ growId: "g1", grows: [], loading: true, error: null })).toEqual({
      growStage: null,
      growStageResolved: false,
    });
    expect(
      resolveTentGrowStage({ growId: "g1", grows: [], loading: false, error: "network" }),
    ).toEqual({ growStage: null, growStageResolved: false });
  });

  it("uses a listed grow even while a refresh is in flight", () => {
    expect(resolveTentGrowStage({ growId: "g1", grows, loading: true, error: null })).toEqual({
      growStage: "flower",
      growStageResolved: true,
    });
  });

  it("a loaded list without the grow, or a tent with no grow, lets tent and plants decide", () => {
    expect(
      resolveTentGrowStage({ growId: "archived", grows, loading: false, error: null }),
    ).toEqual({ growStage: null, growStageResolved: true });
    expect(resolveTentGrowStage({ growId: null, grows: [], loading: true, error: null })).toEqual({
      growStage: null,
      growStageResolved: true,
    });
  });

  it("an unresolved grow stage withholds stage grading entirely", () => {
    expect(
      resolveTentEnvironmentStage({
        tentId: TENT,
        tentGrowId: "g1",
        tentStage: "veg",
        growStage: null,
        growStageResolved: false,
        plants: [{ tent_id: TENT, stage: "flower" }],
      }),
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
const plantsState: {
  data: Array<{ tent_id: string; grow_id?: string | null; stage: string }> | undefined;
  isError?: boolean;
} = {
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
  usePlants: () => ({ data: plantsState.data, isError: plantsState.isError ?? false }),
}));
const growsState: {
  grows: Array<{ id: string; stage: string }>;
  loading: boolean;
  error: string | null;
} = { grows: [{ id: "g1", stage: "veg" }], loading: false, error: null };
vi.mock("@/store/grows", () => ({
  useGrows: () => growsState,
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
    plantsState.isError = false;
    growsState.grows = [{ id: "g1", stage: "veg" }];
    growsState.loading = false;
    growsState.error = null;
  });

  it.each([
    ["loading", true, null],
    ["failed", false, "network"],
  ])("never grades by the tent alone while the grows list is %s", async (_s, loading, error) => {
    // Codex review on #1683: the grow may be Flower; until its row is known
    // the chip must not claim the reading is in the tent's Veg range.
    growsState.grows = [];
    growsState.loading = loading;
    growsState.error = error;
    renderSensors();
    const chip = await screen.findByTestId("sensors-stage-status-rh");
    expect(chip).not.toHaveTextContent("In Veg RH range");
    expect(chip).toHaveTextContent("set stage for humidity guidance");
  });

  it("QA repro: RH 60% with a Flower plant in a Veg tent is above the Flower range", async () => {
    plantsState.data = [{ tent_id: TENT, stage: "flower" }];
    renderSensors();
    expect(await screen.findByTestId("sensors-stage-status-rh")).toHaveTextContent(
      "Above Flower RH range",
    );
  });

  it("a failed plant refresh keeps the cached plant stages (Codex review on #1683)", async () => {
    // React Query keeps `data` when a refetch fails; those stages still hold.
    plantsState.data = [{ tent_id: TENT, stage: "flower" }];
    plantsState.isError = true;
    renderSensors();
    expect(await screen.findByTestId("sensors-stage-status-rh")).toHaveTextContent(
      "Above Flower RH range",
    );
  });

  it("a Flower plant naming another grow does not move this tent's stage", async () => {
    // Codex review on #1683: the plant's own grow_id wins over its tent's.
    plantsState.data = [{ tent_id: TENT, grow_id: "g2", stage: "flower" }];
    renderSensors();
    expect(await screen.findByTestId("sensors-stage-status-rh")).toHaveTextContent(
      "In Veg RH range",
    );
  });

  it.each([
    ["pending", false],
    ["failed with no data", true],
  ])(
    "never grades by the tent and grow alone while the first plant read is %s",
    async (_s, isError) => {
      // Codex review on #1683: with no plant rows yet, a Flower plant may be
      // in this Veg tent, so RH 60% must not read as in the Veg range.
      plantsState.data = undefined;
      plantsState.isError = isError;
      renderSensors();
      const chip = await screen.findByTestId("sensors-stage-status-rh");
      expect(chip).not.toHaveTextContent("In Veg RH range");
      expect(chip).toHaveTextContent("set stage for humidity guidance");
    },
  );

  it("without a plant signal the tent and grow still decide", async () => {
    renderSensors();
    expect(await screen.findByTestId("sensors-stage-status-rh")).toHaveTextContent(
      "In Veg RH range",
    );
  });
});
