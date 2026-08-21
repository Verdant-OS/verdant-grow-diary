/**
 * TentDetail → PlantDetail link must carry tent context as `?tentId=` so
 * PlantDetail loading-slow / error blocked states can always offer a
 * safe "Back to tent" escape path.
 *
 * Pure helper assertions + a focused render assertion against TentDetail.
 * Presenter-only. No Supabase writes, no AI calls, no Action Queue writes.
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TentQuickLogTargetScope } from "@/components/TentQuickLogTargetScope";
import { plantDetailPath } from "@/lib/routes";

const SOLE_PLANT = {
  id: "plant-aaa",
  name: "Aurora",
  strain: "OG",
  stage: "veg",
  health: "ok",
  photo: null,
  tentId: "tent-77",
  growId: "grow-1",
  startedAt: "2026-08-01T00:00:00.000Z",
  isArchived: false,
  lastNote: "",
};

let activePlants = [SOLE_PLANT];
let activePlantsIsFetching = false;
const targetRegistrationMock = vi.fn();

vi.mock("@/components/QuickLogV2Fab", () => ({
  default: ({ defaultTargetKey }: { defaultTargetKey?: string | null }) => (
    <output data-testid="desktop-quick-log-target" data-target-key={defaultTargetKey ?? ""} />
  ),
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock("@/hooks/useImportedSensorHistory", () => ({
  useImportedSensorHistory: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock("@/hooks/useTentPlantRosterActivity", () => ({
  useTentPlantRosterActivity: () => ({ byPlantId: {}, isLoading: false, isError: false }),
}));

// This is a target-routing render test. Keep unrelated read-only panels from
// opening their own Supabase queries so the assertion stays deterministic and
// cannot depend on network access.
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

vi.mock("@/hooks/useGrowData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useGrowData")>();
  return {
    ...actual,
    useGrowTent: () => ({
      data: {
        id: "tent-77",
        name: "Tent 77",
        growId: "grow-1",
        light: { on: true, schedule: "18/6", wattage: 400 },
        ventilation: { fanOn: true, exhaustOn: true, intakeOn: true },
        currentStage: "veg",
      },
      isLoading: false,
      isError: false,
    }),
    useGrowPlants: (
      _tentId: string | undefined,
      _stage?: string,
      options?: { includeArchived?: boolean },
    ) => ({
      data: activePlants,
      isLoading: false,
      isFetching: options?.includeArchived === true ? false : activePlantsIsFetching,
      isError: false,
    }),
    useGrowPlant: () => ({ data: null, isLoading: false, isError: false }),
  };
});

import TentDetail from "@/pages/TentDetail";

function renderTentDetail() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/tents/tent-77"]}>
        <TentQuickLogTargetScope register={targetRegistrationMock}>
          <Routes>
            <Route path="/tents/:id" element={<TentDetail />} />
          </Routes>
        </TentQuickLogTargetScope>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  activePlants = [SOLE_PLANT];
  activePlantsIsFetching = false;
  targetRegistrationMock.mockReset();
});

describe("plantDetailPath tent context option", () => {
  it("appends ?tentId= when supplied and url-encodes it", () => {
    expect(plantDetailPath("p1", { tentId: "tent 1/x" })).toBe("/plants/p1?tentId=tent+1%2Fx");
  });

  it("supports the archived-timeline mode alongside tentId", () => {
    expect(plantDetailPath("p1", { tentId: "t1", mode: "archived-timeline" })).toBe(
      "/plants/p1?tentId=t1&mode=archived-timeline",
    );
  });

  it("remains canonical /plants/:id when no opts are supplied", () => {
    expect(plantDetailPath("p1")).toBe("/plants/p1");
    expect(plantDetailPath("p1", {})).toBe("/plants/p1");
    expect(plantDetailPath("p1", { tentId: null })).toBe("/plants/p1");
  });
});

describe("TentDetail plant card link", () => {
  it("includes ?tentId= for the current tent", () => {
    renderTentDetail();
    const cards = screen.getAllByTestId("tent-detail-plant-card");
    expect(cards.length).toBeGreaterThan(0);
    const link = cards[0].querySelector("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("/plants/plant-aaa?tentId=tent-77");
  });
});

describe("TentDetail Quick Log target evidence", () => {
  it("passes the sole active plant to both the desktop opener and mobile shell", () => {
    renderTentDetail();
    expect(screen.getByTestId("desktop-quick-log-target")).toHaveAttribute(
      "data-target-key",
      "plant:plant-aaa",
    );
    expect(targetRegistrationMock).toHaveBeenLastCalledWith({
      clear: false,
      tentId: "tent-77",
      soleActivePlantId: "plant-aaa",
    });
  });

  it("keeps both surfaces at tent scope when more than one active plant is present", () => {
    activePlants = [SOLE_PLANT, { ...SOLE_PLANT, id: "plant-bbb", name: "Borealis" }];
    renderTentDetail();
    expect(screen.getByTestId("desktop-quick-log-target")).toHaveAttribute(
      "data-target-key",
      "tent:tent-77",
    );
    expect(targetRegistrationMock).toHaveBeenLastCalledWith({
      clear: false,
      tentId: "tent-77",
      soleActivePlantId: null,
    });
  });

  it("keeps both surfaces at tent scope while a cached sole-plant roster refreshes", () => {
    activePlantsIsFetching = true;
    renderTentDetail();
    expect(screen.getByTestId("desktop-quick-log-target")).toHaveAttribute(
      "data-target-key",
      "tent:tent-77",
    );
    expect(targetRegistrationMock).toHaveBeenLastCalledWith({
      clear: false,
      tentId: "tent-77",
      soleActivePlantId: null,
    });
  });
});
