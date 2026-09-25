/**
 * Tent Detail judges a tent's readings by the same stage Alerts use.
 *
 * QA 2026-09-24, BUG-006 follow-up: Alerts and the scoped Dashboard resolve
 * the stage from the grow row, the tent and the active plants in scope, but
 * Tent Detail used `tents.stage` alone. With one Flower plant in a tent still
 * marked Veg, a 0.85 kPa VPD read "In Veg VPD range" on Tent Detail although
 * Flower targets are 1.0–1.5 kPa.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import type { Plant } from "@/mock";

let plants: Plant[] = [];
const NOW = new Date().toISOString();
const STABLE_READINGS = [
  { ts: NOW, metric: "vpd_kpa", value: 0.85, source: "manual", tent_id: "tent-77" },
];

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: STABLE_READINGS, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useImportedSensorHistory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useImportedSensorHistory")>()),
  useImportedSensorHistory: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useTentPlantRosterActivity", () => ({
  useTentPlantRosterActivity: () => ({ byPlantId: {}, isLoading: false, isError: false }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", stage: "veg" }] }),
}));
// Sibling panels with unrelated reads; the stage-driven header stays real.
vi.mock("@/components/EcowittLatestSnapshotCard", () => ({ default: () => null }));
vi.mock("@/components/WateringCadenceHistoryStrip", () => ({ default: () => null }));
vi.mock("@/components/DrybackMonitoringStrip", () => ({ default: () => null }));
vi.mock("@/components/TentAiDoctorSessionsPanel", () => ({ default: () => null }));
vi.mock("@/components/TentManualSnapshotHistoryList", () => ({ default: () => null }));
vi.mock("@/components/ManualSnapshotTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/TimelineMemorySection", () => ({ default: () => null }));
vi.mock("@/components/QuickLogGroupedTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/TentSensorWebhookSettingsCard", () => ({ default: () => null }));
vi.mock("@/components/TentBridgeTokensCard", () => ({ default: () => null }));
vi.mock("@/components/TentSensorSourceHealthCard", () => ({ default: () => null }));
vi.mock("@/components/CreatePlantDialog", () => ({ default: () => null }));
vi.mock("@/components/AddExistingPlantDialog", () => ({ default: () => null }));
vi.mock("@/components/StartPhenoHuntButton", () => ({ default: () => null }));
vi.mock("@/components/TentCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/PlantCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));
vi.mock("@/hooks/useGrowData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useGrowData")>()),
  useGrowTent: () => ({
    data: {
      id: "tent-77",
      name: "Veg Tent",
      growId: "grow-1",
      stage: "veg",
      light: { on: true, schedule: "18/6", wattage: 400 },
      alertCount: 0,
    },
    isLoading: false,
    isError: false,
  }),
  useGrowPlants: () => ({ data: plants, isLoading: false, isFetching: false, isError: false }),
}));

import TentDetail from "@/pages/TentDetail";

function plant(stage: Plant["stage"]): Plant {
  return {
    id: "plant-1",
    name: "Aurora",
    strain: "Test cultivar",
    tentId: "tent-77",
    growId: "grow-1",
    stage,
    isArchived: false,
  } as unknown as Plant;
}

function renderTent() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/tents/tent-77"]}>
        <Routes>
          <Route path="/tents/:id" element={<TentDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  plants = [];
});

describe("Tent Detail stage hint follows the plants in the tent", () => {
  it("QA repro: VPD 0.85 with a Flower plant in a Veg tent is below the Flower range", () => {
    plants = [plant("flower")];
    renderTent();
    expect(screen.getByTestId("tent-detail-vpd-stage-hint")).toHaveTextContent(
      "Below Flower VPD range",
    );
  });

  it("without a plant signal the tent and grow still decide", () => {
    renderTent();
    expect(screen.getByTestId("tent-detail-vpd-stage-hint")).toHaveTextContent("In Veg VPD range");
  });
});
