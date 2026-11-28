// Grow → Tent: Plants sit directly under the tent header as compact, tappable
// names, with a compact sensor strip right below them and the detailed metrics
// farther down. A tent-level Quick Log sits beside the tent name (Cheek,
// 2026-11-28). jsdom has no layout, so this pins document order, links, the
// See all control and the Quick Log target; the 375px and desktop viewport
// checks are recorded on the pull request.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "@/lib/react-router-compat";
import { plantDetailPath } from "@/lib/routes";
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
// The real sheet is covered by its own suites; here only its launch target matters.
vi.mock("@/components/QuickLogV2Sheet", () => ({
  default: ({ open, defaultTargetKey }: { open: boolean; defaultTargetKey?: string | null }) =>
    open ? <div data-testid="stub-quick-log-sheet" data-target={defaultTargetKey ?? ""} /> : null,
}));

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

function PlantRouteMarker() {
  const location = useLocation();
  return <div data-testid="plant-route">{location.pathname + location.search}</div>;
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
          <Route path="/plants/:plantId" element={<PlantRouteMarker />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function precedes(a: Element, b: Element) {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/** Header, then the plant names, then the sensor strip, then everything else. */
function expectPlantsFirst(tentName: string) {
  const header = screen.getByRole("heading", { level: 1, name: tentName });
  const glance = screen.getByTestId("tent-detail-plants-glance");
  const strip = screen.getByTestId("tent-detail-sensor-strip");
  expect(precedes(header, glance)).toBe(true);
  expect(precedes(screen.getByTestId("tent-detail-data-source-disclosure"), glance)).toBe(true);
  expect(precedes(glance, strip)).toBe(true);
  for (const later of [
    screen.getByTestId("stub-one-tent-loop-next-step"),
    screen.getByTestId("tent-detail-plants-section"),
    screen.getByTestId("tent-detail-metric-chips"),
    screen.getByRole("heading", { level: 2, name: "Environment" }),
  ]) {
    expect(precedes(strip, later)).toBe(true);
  }
  return glance;
}

function glanceItems() {
  return screen.getAllByTestId("tent-detail-plants-glance-item");
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
  it("lists compact plant names under the header, then the sensor strip, then the rest", async () => {
    renderTent(baseTent, [makePlant(1), makePlant(2)]);
    await screen.findAllByTestId("tent-detail-plants-glance-item");
    const glance = expectPlantsFirst("Veg Alpha");
    expect(within(glance).getByRole("heading", { level: 2, name: "Plants (2)" })).toBeVisible();
    expect(glanceItems().map((link) => link.textContent)).toEqual(["Plant 01", "Plant 02"]);
    expect(glanceItems()[0]).toHaveAttribute(
      "href",
      plantDetailPath("plant-1", { tentId: baseTent.id }),
    );
    // Two plants fit everywhere: no See all control.
    expect(screen.queryByTestId("tent-detail-plants-glance-toggle")).toBeNull();
    // The first plant name on the page is the compact link.
    expect(glance).toContainElement(screen.getAllByText("Plant 01")[0]);
    // The full roster stays reachable below.
    expect(
      within(screen.getByTestId("tent-detail-plants-section")).getByRole("heading", {
        level: 2,
        name: "Plants in this tent (2)",
      }),
    ).toBeInTheDocument();
  });

  it("says an empty tent has no plants, still ahead of the sensor strip", async () => {
    renderTent(baseTent, []);
    const empty = await screen.findByTestId("tent-detail-plants-glance-empty");
    expect(empty).toHaveTextContent("No plants in this tent yet.");
    const glance = expectPlantsFirst("Veg Alpha");
    expect(within(glance).getByRole("heading", { level: 2, name: "Plants (0)" })).toBeVisible();
    expect(screen.getByTestId("tent-detail-plants-empty")).toBeInTheDocument();
  });

  it("shows the first names, the total and See all for a busy tent, expanding on the page", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 24 }, (_, i) => makePlant(i + 1));
    renderTent(baseTent, many);
    await screen.findAllByTestId("tent-detail-plants-glance-item");
    const glance = expectPlantsFirst("Veg Alpha");
    expect(within(glance).getByRole("heading", { level: 2, name: "Plants (24)" })).toBeVisible();
    const visibility = () =>
      within(glance)
        .getAllByRole("listitem")
        .map((li) => li.getAttribute("data-visibility"));
    expect(visibility().filter((v) => v === "always")).toHaveLength(6);
    expect(visibility().filter((v) => v === "desktop")).toHaveLength(6);
    expect(visibility().filter((v) => v === "expanded")).toHaveLength(12);

    const toggle = screen.getByTestId("tent-detail-plants-glance-toggle");
    expect(toggle).toHaveTextContent("See all 24 plants");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Keyboard: focus and press Enter.
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent("Show fewer plants");
    expect(visibility().every((v) => v === "always")).toBe(true);
    // Touch: a tap collapses it again.
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(visibility().filter((v) => v === "always")).toHaveLength(6);
    // The detailed roster below still lists every plant.
    expect(screen.getAllByTestId("tent-detail-plant-name")).toHaveLength(24);
  });

  it("opens a plant from its compact name with the keyboard or a tap", async () => {
    const user = userEvent.setup();
    renderTent(baseTent, [makePlant(1), makePlant(2)]);
    const [first] = await screen.findAllByTestId("tent-detail-plants-glance-item");
    first.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByTestId("plant-route")).toHaveTextContent(
      plantDetailPath("plant-1", { tentId: baseTent.id }),
    );
    cleanup();
    renderTent(baseTent, [makePlant(1), makePlant(2)]);
    const items = await screen.findAllByTestId("tent-detail-plants-glance-item");
    await user.click(items[1]);
    expect(await screen.findByTestId("plant-route")).toHaveTextContent(
      plantDetailPath("plant-2", { tentId: baseTent.id }),
    );
  });

  it("keeps Plants directly under a long tent name and its Quick Log", async () => {
    const longName =
      "Flower Room North Rack Two Upper Shelf Left Side Autoflower Pheno Hunt Batch Seven";
    const tent = { ...baseTent, id: "tent-long", name: longName };
    writeTentPlantTabsSelectedPlantId(tent.id, null);
    renderTent(tent, [makePlant(1, tent)]);
    await screen.findAllByTestId("tent-detail-plants-glance-item");
    const glance = expectPlantsFirst(longName);
    const quickLog = screen.getByTestId("tent-detail-header-quick-log");
    const header = screen.getByRole("heading", { level: 1, name: longName }).closest("header");
    expect(header).toContainElement(quickLog);
    expect(precedes(quickLog, glance)).toBe(true);
    expect(glanceItems()[0]).toHaveTextContent("Plant 01");
  });

  it("opens the existing Quick Log on this tent with no plant, even for a one-plant tent", async () => {
    const user = userEvent.setup();
    renderTent(baseTent, [makePlant(1)]);
    await screen.findAllByTestId("tent-detail-plants-glance-item");
    const quickLog = screen.getByTestId("tent-detail-header-quick-log");
    expect(quickLog).toHaveAccessibleName("Quick Log");
    expect(screen.queryByTestId("stub-quick-log-sheet")).toBeNull();
    quickLog.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("stub-quick-log-sheet")).toHaveAttribute(
      "data-target",
      `tent:${baseTent.id}`,
    );
  });

  it("shows both strip layouts, each with freshness, and VPD unavailable without a trusted VPD", async () => {
    renderTent(baseTent, [makePlant(1)]);
    await screen.findAllByTestId("tent-detail-plants-glance-item");
    const climate = screen.getByTestId("tent-detail-sensor-strip-climate");
    const vpdOnly = screen.getByTestId("tent-detail-sensor-strip-vpd-only");
    // The strip's own width (a container query in rem) picks the layout.
    expect(screen.getByTestId("tent-detail-sensor-strip")).toHaveClass("@container");
    expect(climate).toHaveClass("hidden", "@min-[15rem]:block");
    expect(vpdOnly).toHaveClass("block", "@min-[15rem]:hidden");
    expect(within(climate).getByTestId("tent-detail-sensor-strip-freshness")).toHaveTextContent(
      "No readings yet.",
    );
    expect(
      within(vpdOnly).getByTestId("tent-detail-sensor-strip-vpd-unavailable"),
    ).toHaveTextContent("VPD unavailable.");
  });
});
