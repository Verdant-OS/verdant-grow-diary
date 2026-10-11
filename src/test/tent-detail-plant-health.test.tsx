import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { mapPlantRow } from "@/lib/growAdapters";
import type { PlantRow } from "@/lib/db";
import type { Plant } from "@/mock";

let plants: Plant[] = [];

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useImportedSensorHistory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useImportedSensorHistory")>()),
  useImportedSensorHistory: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useTentPlantRosterActivity", () => ({
  useTentPlantRosterActivity: () => ({ byPlantId: {}, isLoading: false, isError: false }),
}));
// These sibling panels perform unrelated reads. The plant card, photo, stage,
// archive toggle and link remain real; none of the asserted content is mocked.
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
      name: "Flower Tent",
      growId: "grow-1",
      stage: "flower",
      light: { on: true, schedule: "12/12", wattage: 400 },
      alertCount: 0,
    },
    isLoading: false,
    isError: false,
  }),
  useGrowPlants: (
    _tentId: string | undefined,
    _stage?: string,
    options?: { includeArchived?: boolean },
  ) => ({
    data: options?.includeArchived ? plants : plants.filter((plant) => !plant.isArchived),
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
}));

import TentDetail from "@/pages/TentDetail";

function sourcePlant(health: unknown, isArchived = false): Plant {
  // A malformed inbound health value is the regression input. Keep the real
  // adapter in this path so a restored healthy fallback cannot evade the test.
  return mapPlantRow({
    id: "plant-1",
    user_id: "owner-1",
    tent_id: "tent-77",
    name: "Aurora",
    strain: "Test cultivar",
    grow_id: "grow-1",
    stage: "flower",
    started_at: "2026-08-01T00:00:00Z",
    health,
    photo_url: null,
    last_note: null,
    is_archived: isArchived,
    schema_version: 1,
    medium: null,
    pot_size: null,
    pheno_hunt_id: null,
    plant_type: "unknown",
    candidate_label: null,
    candidate_number: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-09-16T00:00:00Z",
  } as unknown as PlantRow);
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

describe("Tent plant cards do not infer assessed health from profile values", () => {
  it.each([null, undefined, "unknown", "not_enough_evidence", "healthy", "watch", "issue"])(
    "does not publish a health verdict for stored value %s",
    (health) => {
      plants = [sourcePlant(health)];
      renderTent();
      const card = screen.getByTestId("tent-detail-plant-card");
      expect(within(card).getByText("Aurora")).toBeInTheDocument();
      expect(within(card).getByText("Test cultivar")).toBeInTheDocument();
      expect(within(card).getByText("Flower")).toBeInTheDocument();
      expect(within(card).getByRole("link")).toHaveAttribute(
        "href",
        "/plants/plant-1?tentId=tent-77",
      );
      expect(
        within(card).queryByText(/^(healthy|watch|issue|unknown|not_enough_evidence)$/i),
      ).not.toBeInTheDocument();
    },
  );

  it("keeps archived history reachable without adding an unsupported health verdict", () => {
    plants = [sourcePlant("healthy", true)];
    renderTent();
    fireEvent.click(screen.getByRole("button", { name: /show archived/i }));
    const card = screen.getByTestId("tent-detail-plant-card");
    expect(card).toHaveAttribute("data-archived", "true");
    expect(within(card).getByText("Archived")).toBeInTheDocument();
    expect(within(card).getByRole("link")).toHaveAttribute(
      "href",
      "/plants/plant-1?tentId=tent-77",
    );
    expect(within(card).queryByText(/^healthy$/i)).not.toBeInTheDocument();
  });
});
