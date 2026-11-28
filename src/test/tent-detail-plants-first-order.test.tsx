// Grow → Tent: Plants sit directly under the tent header, ahead of the
// environment metrics, so a grower sees which plants are in the tent without
// scrolling past the readings (Cheek, 2026-11-28). jsdom has no layout, so this
// pins document order; the 375px and desktop viewport checks are recorded on
// the pull request.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { buildPrivateGrowQueryKey } from "@/lib/growDataQueryKeyRules";
import { clearGrowDataMeta } from "@/hooks/useGrowData";
import type { Tent, Plant } from "@/mock";

const fixture = vi.hoisted(() => ({ fetchTent: vi.fn(), fetchPlants: vi.fn() }));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/lib/growRepo", () => ({
  fetchTent: fixture.fetchTent,
  fetchPlants: fixture.fetchPlants,
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [], isPending: false, isError: false }),
}));
vi.mock("@/hooks/useImportedSensorHistory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useImportedSensorHistory")>()),
  useImportedSensorHistory: () => ({ data: [], isPending: false, isError: false }),
}));
vi.mock("@/hooks/useCsvHistoryWindow", () => ({ useCsvHistoryWindow: () => ({}) }));
vi.mock("@/hooks/useTentPlantRosterActivity", () => ({
  useTentPlantRosterActivity: () => ({ byPlantId: {}, isLoading: false, isError: false }),
}));

// Keep the real header, plant tabs, roster, grid and Environment card. Unrelated
// card IO renders nothing, except the next-step card, which renders a marker so
// its position can be checked.
vi.mock("@/components/OneTentLoopNextStepCard", () => ({
  default: () => <div data-testid="stub-one-tent-loop-next-step" />,
}));
vi.mock("@/components/VpdStageMissingBadge", () => ({ default: () => null }));
vi.mock("@/components/EcowittTentSnapshotV0Card", () => ({ default: () => null }));
vi.mock("@/components/EnvironmentStabilityCard", () => ({ default: () => null }));
vi.mock("@/components/WateringCadenceHistoryStrip", () => ({ default: () => null }));
vi.mock("@/components/DrybackMonitoringStrip", () => ({ default: () => null }));
vi.mock("@/components/TentAiDoctorSessionsPanel", () => ({ default: () => null }));
vi.mock("@/components/StageBadge", () => ({ default: () => null }));
vi.mock("@/components/MetricChip", () => ({ default: () => null }));
vi.mock("@/components/SensorChart", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));
vi.mock("@/components/CreatePlantDialog", () => ({ default: () => null }));
vi.mock("@/components/AddExistingPlantDialog", () => ({ default: () => null }));
vi.mock("@/components/PlantCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/TentCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/PlantPhoto", () => ({ default: () => null }));
vi.mock("@/components/TentManualSnapshotChangeContext", () => ({ default: () => null }));
vi.mock("@/components/TentManualSnapshotHistoryList", () => ({ default: () => null }));
vi.mock("@/components/ManualSnapshotTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/TimelineMemorySection", () => ({ default: () => null }));
vi.mock("@/components/QuickLogGroupedTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/ImportedSensorHistoryPanel", () => ({ default: () => null }));
vi.mock("@/components/TentSensorWebhookSettingsCard", () => ({ default: () => null }));
vi.mock("@/components/TentBridgeTokensCard", () => ({ default: () => null }));
vi.mock("@/components/TentSensorSourceHealthCard", () => ({ default: () => null }));
vi.mock("@/components/SensorSnapshotTruthStrip", () => ({ default: () => null }));
vi.mock("@/components/FirstPlantMemoryCta", () => ({ default: () => null }));
vi.mock("@/components/DiaryEntryRemoveButton", () => ({ default: () => null }));
vi.mock("@/components/StartPhenoHuntButton", () => ({ default: () => null }));
vi.mock("@/components/TentPendingOutcomeNotice", () => ({ default: () => null }));

import TentDetail from "@/pages/TentDetail";
import { writeTentPlantTabsSelectedPlantId } from "@/lib/tentPlantTabsPreferences";

const baseTent: Tent = {
  id: "tent-1",
  name: "Veg Alpha",
  brand: "",
  size: "2x4",
  stage: "veg",
  light: { on: false, schedule: "", wattage: 0 },
  alertCount: 0,
  growId: "grow-1",
};
function makePlant(i: number, tent: Tent = baseTent): Plant {
  return {
    id: `plant-${i}`,
    name: `Plant ${String(i).padStart(2, "0")}`,
    strain: "",
    tentId: tent.id,
    growId: tent.growId,
    stage: "veg",
    startedAt: "2026-09-01",
    health: "healthy",
    photo: "",
    lastNote: "",
  };
}

const clients: QueryClient[] = [];
function renderTent(tent: Tent, plants: Plant[]) {
  fixture.fetchTent.mockResolvedValue(tent);
  fixture.fetchPlants.mockResolvedValue(plants);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  client.setQueryData(buildPrivateGrowQueryKey("owner-1", ["tent", tent.id]), tent);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/tents/" + tent.id]}>
        <Routes>
          <Route path="/tents/:id" element={<TentDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function precedes(a: Element, b: Element) {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/** Plants come right after the header block and before every environment surface. */
function expectPlantsBeforeEnvironment(tentName: string) {
  const plants = screen.getByTestId("tent-detail-plants-first");
  const header = screen.getByRole("heading", { level: 1, name: tentName });
  expect(precedes(header, plants)).toBe(true);
  expect(precedes(screen.getByTestId("tent-detail-data-source-disclosure"), plants)).toBe(true);
  for (const later of [
    screen.getByTestId("tent-detail-metric-chips"),
    screen.getByRole("heading", { level: 2, name: "Environment" }),
    screen.getByTestId("stub-one-tent-loop-next-step"),
  ]) {
    expect(precedes(plants, later)).toBe(true);
  }
  return plants;
}

beforeEach(() => {
  clearGrowDataMeta();
  writeTentPlantTabsSelectedPlantId(baseTent.id, null);
  fixture.fetchTent.mockReset();
  fixture.fetchPlants.mockReset();
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  clearGrowDataMeta();
});

describe("Grow → Tent puts Plants first", () => {
  it("shows the tent's plant names under the header, ahead of the metrics", async () => {
    renderTent(baseTent, [makePlant(1), makePlant(2)]);
    const name = await screen.findAllByTestId("tent-detail-plant-name");
    expect(name.map((n) => n.textContent)).toEqual(["Plant 01", "Plant 02"]);
    const plants = expectPlantsBeforeEnvironment("Veg Alpha");
    expect(within(plants).getByTestId("tent-plant-tabs-tab-plant-1")).toHaveTextContent(
      "Plant 01",
    );
    expect(
      within(plants).getByRole("heading", { level: 2, name: "Plants in this tent (2)" }),
    ).toBeInTheDocument();
    // The first plant name in the whole page sits inside the Plants section.
    const firstName = screen.getAllByText("Plant 01")[0];
    expect(plants).toContainElement(firstName);
  });

  it("keeps the empty-tent state and its add actions in the Plants section, first", async () => {
    renderTent(baseTent, []);
    const empty = await screen.findByTestId("tent-detail-plants-empty");
    expect(empty).toHaveTextContent("No plants in this tent yet.");
    const plants = expectPlantsBeforeEnvironment("Veg Alpha");
    expect(plants).toContainElement(empty);
    expect(
      within(plants).getByRole("heading", { level: 2, name: "Plants in this tent (0)" }),
    ).toBeInTheDocument();
  });

  it("lists every plant of a full tent in order, with the metrics still below", async () => {
    const many = Array.from({ length: 24 }, (_, i) => makePlant(i + 1));
    renderTent(baseTent, many);
    const names = await screen.findAllByTestId("tent-detail-plant-name");
    expect(names).toHaveLength(24);
    expect(names[0]).toHaveTextContent("Plant 01");
    expect(names[23]).toHaveTextContent("Plant 24");
    const plants = expectPlantsBeforeEnvironment("Veg Alpha");
    for (const n of names) expect(plants).toContainElement(n);
    expect(
      within(plants).getByRole("heading", { level: 2, name: "Plants in this tent (24)" }),
    ).toBeInTheDocument();
  });

  it("keeps Plants directly under a long tent name", async () => {
    const longName =
      "Flower Room North Rack Two Upper Shelf Left Side Autoflower Pheno Hunt Batch Seven";
    const tent = { ...baseTent, id: "tent-long", name: longName };
    writeTentPlantTabsSelectedPlantId(tent.id, null);
    renderTent(tent, [makePlant(1, tent)]);
    expect(await screen.findByTestId("tent-detail-plant-name")).toHaveTextContent("Plant 01");
    expectPlantsBeforeEnvironment(longName);
  });
});
