/**
 * Tent Detail grow-scope identity: URL/query growId must match the tent.
 *
 * Same-family contract as plant detail. Fail-closed when ?growId= is present
 * and ≠ tent.grow_id. Matching growId (or no growId) still renders.
 * Presenter-only. No Supabase writes.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { isQueryGrowScopeMismatch, readEntityGrowId } from "@/lib/detailGrowScopeRules";

const TENT_ID = "12a9ac5a-b70f-4a5e-8e44-44ba9204b495";
const REAL_GROW_ID = "4cad3cae-21e3-42f8-8372-2f6237205db3";
const ORPHAN_GROW_ID = "00000000-0000-4000-8000-000000000099";

const fixtureTent = {
  id: TENT_ID,
  name: "Fixture Tent A",
  growId: REAL_GROW_ID,
  light: { on: true, schedule: "18/6", wattage: 400 },
  ventilation: { fanOn: true, exhaustOn: true, intakeOn: true },
  currentStage: "seedling",
};

const refetch = vi.fn().mockResolvedValue({ data: null });
let mockState: { data: unknown; isLoading: boolean; isError: boolean } = {
  data: fixtureTent,
  isLoading: false,
  isError: false,
};

vi.mock("@/hooks/useGrowData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useGrowData")>();
  return {
    ...actual,
    useGrowTent: () => ({ ...mockState, refetch }),
    useGrowPlants: () => ({
      data: [
        {
          id: "plant-1",
          name: "Roster Plant",
          strain: "OG",
          stage: "seedling",
          health: "ok",
          photo: null,
          tentId: TENT_ID,
          growId: REAL_GROW_ID,
          startedAt: "2026-07-01T00:00:00.000Z",
          isArchived: false,
          lastNote: "",
        },
      ],
      isLoading: false,
      isFetching: false,
      isError: false,
    }),
  };
});

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useImportedSensorHistory", () => ({
  useImportedSensorHistory: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useTentPlantRosterActivity", () => ({
  useTentPlantRosterActivity: () => ({ byPlantId: {}, isLoading: false, isError: false }),
}));
vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));
vi.mock("@/components/EcowittTentSnapshotV0Card", () => ({ default: () => null }));
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

import TentDetail from "@/pages/TentDetail";

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/tents/:id" element={<TentDetail />} />
          <Route path="/tents" element={<div>Tents list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("shared isQueryGrowScopeMismatch (tent entity)", () => {
  it("uses the same helper plant detail uses", () => {
    expect(isQueryGrowScopeMismatch(fixtureTent, null)).toBe(false);
    expect(isQueryGrowScopeMismatch(fixtureTent, REAL_GROW_ID)).toBe(false);
    expect(isQueryGrowScopeMismatch(fixtureTent, ORPHAN_GROW_ID)).toBe(true);
    expect(readEntityGrowId({ grow_id: REAL_GROW_ID })).toBe(REAL_GROW_ID);
  });
});

describe("TentDetail grow-scope mismatch integration", () => {
  it("does not render tent body or plant roster when query growId mismatches", () => {
    mockState = { data: fixtureTent, isLoading: false, isError: false };
    renderAt(`/tents/${TENT_ID}?growId=${ORPHAN_GROW_ID}`);
    expect(screen.getByTestId("tent-detail-not-found")).toBeInTheDocument();
    expect(screen.getByText(/tent not found/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Fixture Tent A" })).toBeNull();
    expect(screen.queryByText("Roster Plant")).toBeNull();
    expect(screen.getByRole("link", { name: /back to tents/i })).toHaveAttribute("href", "/tents");
  });

  it("still renders tent detail when query growId matches", () => {
    mockState = { data: fixtureTent, isLoading: false, isError: false };
    renderAt(`/tents/${TENT_ID}?growId=${REAL_GROW_ID}`);
    expect(screen.queryByTestId("tent-detail-not-found")).toBeNull();
    expect(screen.getByText("Fixture Tent A")).toBeInTheDocument();
  });

  it("still renders tent detail when query growId is omitted", () => {
    mockState = { data: fixtureTent, isLoading: false, isError: false };
    renderAt(`/tents/${TENT_ID}`);
    expect(screen.queryByTestId("tent-detail-not-found")).toBeNull();
    expect(screen.getByText("Fixture Tent A")).toBeInTheDocument();
  });
});
