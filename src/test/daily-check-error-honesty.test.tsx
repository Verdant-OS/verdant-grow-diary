import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  growPlantsError: false,
  growPlantsLoading: false,
  growTentsError: false,
  growTentsLoading: false,
  sensorError: false,
  sensorLoading: false,
  diaryError: false,
  diaryLoading: false,
  currentSensorStatusByTent: {} as Record<string, "loading" | "success" | "error">,
  growPlantsRefetch: vi.fn(async () => undefined),
  growTentsRefetch: vi.fn(async () => undefined),
  sensorRefetch: vi.fn(async () => undefined),
  diaryRefetch: vi.fn(async () => undefined),
  currentSensorRefetch: vi.fn(async () => undefined),
}));

const PLANTS = [
  {
    id: "plant-1",
    name: "Northern Lights",
    strain: "Northern Lights",
    stage: "veg",
    health: "healthy",
    tentId: "tent-1",
    growId: "grow-1",
    isArchived: false,
    photo: null,
    startedAt: null,
    lastNote: null,
  },
];

const TENTS = [{ id: "tent-1", name: "Tent One" }];

vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlants: () => ({
    data: PLANTS,
    isError: state.growPlantsError,
    isLoading: state.growPlantsLoading,
    refetch: state.growPlantsRefetch,
  }),
  useGrowTents: () => ({
    data: TENTS,
    isError: state.growTentsError,
    isLoading: state.growTentsLoading,
    refetch: state.growTentsRefetch,
  }),
  getGrowDataMeta: () => undefined,
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({
    data: [],
    isError: state.sensorError,
    isLoading: state.sensorLoading,
    refetch: state.sensorRefetch,
  }),
  useSensorReadingsByTents: () => ({
    byTent: {},
    statusByTent: state.currentSensorStatusByTent,
    refetch: state.currentSensorRefetch,
  }),
}));

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({
    data: [],
    isError: state.diaryError,
    isLoading: state.diaryLoading,
    refetch: state.diaryRefetch,
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: TENTS }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: PLANTS }),
}));

vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/hooks/useSensorBridgeHealth", () => ({
  useSensorBridgeHealth: () => ({ data: null }),
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrowName: null,
    isValidScopedGrow: true,
    backHref: "/",
  }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "Grow One" }] }),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/components/CreatePlantDialog", () => ({ default: () => null }));
vi.mock("@/components/PlantCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/PlantPhoto", () => ({ default: () => null }));
vi.mock("@/components/GrowDataSourceDisclosure", () => ({ default: () => null }));

import DailyGrowCheckStatusCard from "@/components/DailyGrowCheckStatusCard";
import DashboardDailyGrowCheckPanel from "@/components/DashboardDailyGrowCheckPanel";
import PlantDetailAiDoctorReadiness from "@/components/PlantDetailAiDoctorReadiness";
import Plants from "@/pages/Plants";

function renderWithProviders(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.growPlantsError = false;
  state.growPlantsLoading = false;
  state.growTentsError = false;
  state.growTentsLoading = false;
  state.sensorError = false;
  state.sensorLoading = false;
  state.diaryError = false;
  state.diaryLoading = false;
  state.currentSensorStatusByTent = {};
  vi.clearAllMocks();
});

describe("Daily Grow Check failed-read honesty", () => {
  it("keeps Plant AI Doctor sensor failures distinct from an empty sensor snapshot and retries", () => {
    const tentId = "11111111-1111-4111-8111-111111111111";
    state.currentSensorStatusByTent = { [tentId]: "error" };

    renderWithProviders(
      <PlantDetailAiDoctorReadiness plantId="plant-1" tentId={tentId} stage="veg" />,
    );

    const alert = screen.getByTestId("plant-detail-ai-doctor-readiness-sensor-error");
    expect(alert).toHaveTextContent("Current sensor evidence unavailable");
    expect(alert).toHaveTextContent("will not treat the result as an empty snapshot");
    expect(screen.queryByText("No sensor snapshot.")).toBeNull();
    expect(screen.queryByTestId("plant-detail-ai-doctor-sensor-evidence-panel")).toBeNull();
    expect(screen.queryByTestId("plant-detail-ai-doctor-readiness-badge")).toBeNull();

    fireEvent.click(screen.getByTestId("plant-detail-ai-doctor-readiness-sensor-error-retry"));
    expect(state.currentSensorRefetch).toHaveBeenCalledTimes(1);
  });

  it.each(["sensor", "diary"] as const)(
    "does not show Plants daily-check badges or Start check when the %s evidence read fails",
    (failedRead) => {
      if (failedRead === "sensor") state.sensorError = true;
      else state.diaryError = true;

      renderWithProviders(<Plants />);

      const alert = screen.getByTestId("plants-daily-check-evidence-error");
      expect(alert).toHaveTextContent(
        "daily check status is unavailable rather than assumed empty",
      );
      expect(screen.queryByText(/Needs check/i)).toBeNull();
      expect(screen.queryAllByTestId("plant-card-daily-check-badge")).toHaveLength(0);
      expect(screen.queryAllByTestId("plant-card-daily-check-cta")).toHaveLength(0);

      fireEvent.click(screen.getByTestId("plants-daily-check-evidence-error-retry"));
      expect(state.sensorRefetch).toHaveBeenCalledTimes(1);
      expect(state.diaryRefetch).toHaveBeenCalledTimes(1);
    },
  );

  it("does not show Dashboard empty or Start-check surfaces when its evidence read fails, and retries every read", () => {
    state.sensorError = true;

    renderWithProviders(<DashboardDailyGrowCheckPanel scopedGrowId={null} />);

    const alert = screen.getByTestId("dashboard-daily-grow-check-panel-evidence-error");
    expect(alert).toHaveTextContent("cannot confirm which plants need a check");
    expect(screen.queryByTestId("dashboard-daily-grow-check-panel")).toBeNull();
    expect(screen.queryByTestId("dashboard-daily-grow-check-panel-empty")).toBeNull();
    expect(screen.queryByTestId("dashboard-daily-grow-check-panel-empty-cta")).toBeNull();
    expect(screen.queryByTestId("dashboard-daily-grow-check-panel-row-actions")).toBeNull();

    fireEvent.click(screen.getByTestId("dashboard-daily-grow-check-panel-evidence-error-retry"));
    expect(state.growPlantsRefetch).toHaveBeenCalledTimes(1);
    expect(state.growTentsRefetch).toHaveBeenCalledTimes(1);
    expect(state.sensorRefetch).toHaveBeenCalledTimes(1);
    expect(state.diaryRefetch).toHaveBeenCalledTimes(1);
  });

  it("keeps Daily Grow Check status failures distinct from no recent activity and retries both evidence reads", () => {
    state.diaryError = true;

    renderWithProviders(<DailyGrowCheckStatusCard />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("data-kind", "unavailable");
    expect(alert).toHaveTextContent("today's check status is unknown");
    expect(
      screen.queryByText("Run a quick check to log conditions and notes for today."),
    ).toBeNull();
    expect(screen.queryByTestId("daily-grow-check-status-cta")).toBeNull();

    fireEvent.click(screen.getByTestId("daily-grow-check-status-retry"));
    expect(state.sensorRefetch).toHaveBeenCalledTimes(1);
    expect(state.diaryRefetch).toHaveBeenCalledTimes(1);
  });

  it("keeps Daily Grow Check status loading distinct from no recent activity and without a Start Check CTA", () => {
    state.sensorLoading = true;

    renderWithProviders(<DailyGrowCheckStatusCard />);

    const loading = screen.getByRole("status");
    expect(loading).toHaveAttribute("data-kind", "loading");
    expect(loading).toHaveTextContent("Checking today's grow activity");
    expect(
      screen.queryByText("Run a quick check to log conditions and notes for today."),
    ).toBeNull();
    expect(screen.queryByTestId("daily-grow-check-status-cta")).toBeNull();
    expect(screen.queryByTestId("daily-grow-check-status-retry")).toBeNull();
  });
});
