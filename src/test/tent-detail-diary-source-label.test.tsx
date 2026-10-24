/**
 * Codex P2 on #2303 at 4a304fe3: Tent Detail's VPD provenance chip must show
 * Tonight's "Diary note" for a generic diary blob, not formatSensorSourceLabel's
 * "Manual reading". The presenter prefers observation.sourceLabel.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import type { SensorReading } from "@/mock";
import type { SensorReadingLike } from "@/lib/sensorSnapshot";

const OWNED_TENT = {
  id: "tent-1",
  name: "Proof tent",
  stage: "veg",
  light: { on: false, schedule: "", wattage: 0 },
  growId: "grow-1",
};

const state = vi.hoisted(() => ({
  rows: [] as SensorReadingLike[],
  manuals: [] as SensorReading[],
  tent: null as unknown,
  snapshot: { status: "idle", snapshot: null } as { status: string; snapshot: unknown },
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/hooks/useGrowData", async (original) => ({
  ...(await original<typeof import("@/hooks/useGrowData")>()),
  useGrowTent: () => ({
    data: state.tent,
    isLoading: false,
    isPending: false,
    isError: false,
    fetchStatus: "idle",
  }),
  useGrowPlants: () => ({
    data: [],
    isPending: false,
    isFetching: false,
    isError: false,
    isSuccess: true,
    fetchStatus: "idle",
  }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: state.rows, isPending: false, isError: false }),
}));
vi.mock("@/hooks/useSensorsQuickLogManualReadings", () => ({
  useSensorsQuickLogManualReadings: () => ({
    data: state.manuals,
    isPending: false,
    isLoading: false,
    isError: false,
    isSuccess: true,
    fetchStatus: "idle",
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useImportedSensorHistory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useImportedSensorHistory")>()),
  useImportedSensorHistory: () => ({ data: [], isPending: false, isError: false }),
}));
vi.mock("@/hooks/useCsvHistoryWindow", () => ({ useCsvHistoryWindow: () => ({}) }));
vi.mock("@/hooks/useTentPlantRosterActivity", () => ({
  useTentPlantRosterActivity: () => ({ byPlantId: {}, isLoading: false, isError: false }),
}));
vi.mock("@/components/VpdStageMissingBadge", () => ({ default: () => null }));
vi.mock("@/components/EcowittTentSnapshotV0Card", () => ({ default: () => null }));
vi.mock("@/components/EnvironmentStabilityCard", () => ({ default: () => null }));
vi.mock("@/components/WateringCadenceHistoryStrip", () => ({ default: () => null }));
vi.mock("@/components/DrybackMonitoringStrip", () => ({ default: () => null }));
vi.mock("@/components/TentAiDoctorSessionsPanel", () => ({ default: () => null }));
vi.mock("@/components/StageBadge", () => ({ default: () => null }));
vi.mock("@/components/MetricChip", () => ({
  default: ({ label, value }: { label: string; value: unknown }) => (
    <span data-testid={`metric-chip-${label}`}>{String(value)}</span>
  ),
}));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () => state.snapshot,
}));
vi.mock("@/components/SensorChart", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));
vi.mock("@/components/CreatePlantDialog", () => ({ default: () => null }));
vi.mock("@/components/AddExistingPlantDialog", () => ({ default: () => null }));
vi.mock("@/components/PlantCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/OneTentLoopNextStepCard", () => ({ default: () => null }));
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
vi.mock("@/components/FirstPlantMemoryCta", () => ({ default: () => null }));
vi.mock("@/components/TentPlantRosterPanel", () => ({ default: () => null }));
vi.mock("@/components/TentPlantTabs", () => ({ default: () => null }));
vi.mock("@/components/TentPlantActivityPanels", () => ({ default: () => null }));
vi.mock("@/components/StartPhenoHuntButton", () => ({ default: () => null }));
vi.mock("@/components/TentPendingOutcomeNotice", () => ({ default: () => null }));

import TentDetail from "@/pages/TentDetail";
import { DIARY_SOURCE_LABEL } from "@/lib/tonightTentHomeViewModel";
import { MANUAL_READING_LABEL } from "@/lib/manualSensorSourceLabel";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const clients: QueryClient[] = [];

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/tents/tent-1"]}>
        <Routes>
          <Route path="/tents/:id" element={<TentDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  state.rows = [];
  state.manuals = [];
  state.tent = OWNED_TENT;
  state.snapshot = { status: "idle", snapshot: null };
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.useRealTimers();
});

describe("Tent detail diary blob provenance (Codex P2 on #2303 at 4a304fe3)", () => {
  it("labels a generic diary snapshot VPD as a diary note, never Manual reading", () => {
    state.snapshot = {
      status: "ok",
      snapshot: {
        source: "diary",
        ts: new Date(NOW.getTime() - 30 * 60 * 1000).toISOString(),
        temp: (80 - 32) / 1.8,
        rh: 50,
        vpd: null,
      },
    };
    mount();
    const source = screen.getByTestId("tent-detail-vpd-source");
    expect(source).toHaveTextContent(DIARY_SOURCE_LABEL);
    expect(source).not.toHaveTextContent(/Manual/);
  });

  it("keeps a real Quick Log manual VPD labelled Manual reading", () => {
    const ts = new Date(NOW.getTime() - 30 * 60 * 1000).toISOString();
    state.manuals = [
      {
        ts,
        capturedAt: ts,
        tentId: "tent-1",
        temp: 0,
        rh: 0,
        vpd: 1.1,
        co2: 0,
        soil: 0,
        observedMetrics: ["vpd"],
        source: "manual",
        status: "usable",
      },
    ];
    mount();
    const source = screen.getByTestId("tent-detail-vpd-source");
    expect(source).toHaveTextContent(MANUAL_READING_LABEL);
    expect(source).not.toHaveTextContent(DIARY_SOURCE_LABEL);
  });
});
