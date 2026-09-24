import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { mapPlantRow } from "@/lib/growAdapters";
import type { PlantRow } from "@/lib/db";
import type { Plant } from "@/mock";

let plants: Plant[] = [];
const query = <T,>(data: T) => ({
  data,
  status: "success",
  fetchStatus: "idle",
  isLoading: false,
  isPending: false,
  isError: false,
  isFetching: false,
  isPlaceholderData: false,
  error: null,
  refetch: vi.fn(),
});

vi.mock("@/hooks/useGrowData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useGrowData")>()),
  useGrowPlants: () => query(plants),
  useGrowTents: () => query([]),
}));
vi.mock("@/hooks/use-diary-entries", () => ({ useDiaryEntries: () => query([]) }));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => query([]),
  useSensorReadingsByTents: () => ({
    byTent: {},
    statusByTent: {},
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: null,
  }),
}));
vi.mock("@/store/grows", () => ({ useGrows: () => ({ grows: [], loading: false, error: null }) }));
vi.mock("@/hooks/useDashboardScopedData", () => ({
  useDashboardScopedData: () => ({
    recent: { status: "ok", items: [] },
    pending: { status: "ok", items: [] },
  }),
}));
vi.mock("@/hooks/useOneTentActivationEvidence", () => ({
  useOneTentActivationEvidence: () => ({
    status: "idle",
    summary: { count: 0, latestAt: null, latestSource: null },
  }),
}));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () => ({
    status: "idle",
    snapshot: {
      source: "unavailable",
      ts: null,
      temp: null,
      rh: null,
      vpd: null,
      co2: null,
      soil: null,
      soil_ec: null,
      soil_temp: null,
      ppfd: null,
      device_id: null,
      csvVendor: null,
    },
  }),
}));
vi.mock("@/hooks/useEnvironmentTrends", () => ({
  useEnvironmentTrends: () => ({ status: "idle", trends: null }),
}));
vi.mock("@/hooks/useGrowTargets", () => ({
  useGrowTargets: () => ({ status: "idle", targets: null, reload: vi.fn() }),
}));
vi.mock("@/hooks/usePersistEnvironmentAlerts", () => ({
  usePersistEnvironmentAlerts: () => undefined,
}));
vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({ status: "ok", alerts: [], error: null, reload: vi.fn() }),
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => undefined }));

// Isolate unrelated readers/writers. Real Plants cards, Dashboard counting and
// KpiCard rendering remain in the test, fed through the real row adapter.
vi.mock("@/components/CreatePlantDialog", () => ({ default: () => null }));
vi.mock("@/components/PlantCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/GrowDataSourceDisclosure", () => ({ default: () => null }));
vi.mock("@/components/DashboardDataSourceDisclosure", () => ({ default: () => null }));
vi.mock("@/components/EcowittLatestSnapshotCard", () => ({ default: () => null }));
vi.mock("@/components/StabilityChipDrilldown", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));
vi.mock("@/components/SensorChart", () => ({ default: () => null }));
vi.mock("@/components/OnboardingChecklistCard", () => ({ default: () => null }));
vi.mock("@/components/PublicQuickLogHandoffCard", () => ({ default: () => null }));
vi.mock("@/components/FirstRunChecklist", () => ({ default: () => null }));
vi.mock("@/components/OnboardingProgressPill", () => ({ default: () => null }));
vi.mock("@/components/OperatorModeCallout", () => ({ default: () => null }));
vi.mock("@/components/ReleaseReadinessOperatorCard", () => ({ default: () => null }));
vi.mock("@/components/LineageRepairCta", () => ({ default: () => null }));
vi.mock("@/components/DashboardPendingOutcomeReviewsCard", () => ({ default: () => null }));
vi.mock("@/components/SafeByDesignNotice", () => ({ default: () => null }));
vi.mock("@/components/DashboardSensorHealthSummary", () => ({ default: () => null }));
vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));
vi.mock("@/components/DailyGrowCheckStatusCard", () => ({ default: () => null }));
vi.mock("@/components/DashboardDailyGrowCheckPanel", () => ({ default: () => null }));
vi.mock("@/components/GuidedActionChecklistPanel", () => ({ default: () => null }));

import Plants from "@/pages/Plants";
import Dashboard from "@/pages/Dashboard";

function sourcePlant(id: string, health: unknown): Plant {
  return mapPlantRow({
    id,
    user_id: "owner-1",
    name: `Plant ${id}`,
    tent_id: null,
    grow_id: null,
    strain: "",
    stage: "veg",
    started_at: "2026-08-01T00:00:00Z",
    health,
    photo_url: null,
    last_note: null,
    is_archived: false,
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

function renderPage(page: "plants" | "dashboard") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[page === "plants" ? "/plants" : "/dashboard"]}>
        {page === "plants" ? <Plants /> : <Dashboard />}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  plants = [];
});

describe("mapped unknown health stays honest in plant summaries", () => {
  it.each([null, undefined, "unknown", "not_enough_evidence", "invalid"])(
    "renders source health %s neutrally rather than healthy or issue",
    (health) => {
      plants = [sourcePlant("A", health)];
      renderPage("plants");
      expect(screen.getByText("Plant health: unknown")).toBeInTheDocument();
      const chip = screen.getByLabelText(
        "Plant health status: unknown. Sensor status is shown separately.",
      );
      const dot = chip.querySelector('[aria-hidden="true"]');
      expect(dot).not.toBeNull();
      expect(dot).toHaveClass("bg-muted-foreground");
      expect(dot).not.toHaveClass("bg-destructive");
      expect(dot?.className).not.toContain("--success");
      expect(screen.queryByText("Plant health: healthy")).not.toBeInTheDocument();
    },
  );

  it.each([
    ["healthy", "bg-[hsl(var(--success))]"],
    ["watch", "bg-[hsl(var(--warning))]"],
    ["issue", "bg-destructive"],
  ])("preserves recorded %s profile presentation", (health, toneClass) => {
    plants = [sourcePlant("A", health)];
    renderPage("plants");
    expect(screen.getByText(`Plant health: ${health}`)).toBeInTheDocument();
    const chip = screen.getByLabelText(
      `Plant health status: ${health}. Sensor status is shown separately.`,
    );
    expect(chip.querySelector('[aria-hidden="true"]')).toHaveClass(toneClass);
  });

  it("does not inflate Dashboard marked-healthy count with missing or invalid health", () => {
    plants = [
      sourcePlant("A", null),
      sourcePlant("B", "unknown"),
      sourcePlant("C", "invalid"),
      sourcePlant("D", "healthy"),
      sourcePlant("E", "watch"),
    ];
    renderPage("dashboard");
    const hint = screen.getByText("1 marked healthy · user-assigned, not sensor-derived");
    const card = hint.parentElement;
    expect(card).not.toBeNull();
    expect(within(card!).getByText("Plants")).toBeInTheDocument();
    expect(within(card!).getByText("5")).toBeInTheDocument();
  });
});
