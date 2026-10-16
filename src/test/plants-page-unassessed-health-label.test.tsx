/**
 * QA #1989: /plants must say a plant was not assessed when no grower
 * assessment is stored. A missing, null, or "unknown" health is not "healthy".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
vi.mock("@/components/CreatePlantDialog", () => ({ default: () => null }));
vi.mock("@/components/PlantCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/GrowDataSourceDisclosure", () => ({ default: () => null }));

import Plants from "@/pages/Plants";
import { plantHealthStatusLabel } from "@/lib/plantHealthRules";

function sourcePlant(health: unknown): Plant {
  return mapPlantRow({
    id: "plant-unassessed",
    user_id: "owner-1",
    name: "QA Test",
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
    updated_at: "2026-10-15T00:00:00Z",
  } as unknown as PlantRow);
}

describe("#1989 /plants not assessed", () => {
  beforeEach(() => {
    plants = [];
  });

  it.each([null, undefined, "unknown"])("labels stored health %s as not assessed", (health) => {
    expect(plantHealthStatusLabel(health)).toBe("not assessed");
  });

  it("renders not assessed on the plants card and keeps an explicit healthy assessment", () => {
    plants = [sourcePlant(null)];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/plants"]}>
          <Plants />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText("Plant health: not assessed")).toBeInTheDocument();
    expect(screen.queryByText("Plant health: healthy")).not.toBeInTheDocument();
    expect(screen.queryByText("Plant health: unknown")).not.toBeInTheDocument();
  });
});
