/**
 * #2257 (VER-221, option A): a /plants card with no profile photo shows the
 * plant's newest diary photo, matching the Plant Detail hero. The visible
 * cards' photos are signed in one batched request; a plant with no photo
 * keeps the "No plant photo yet" empty state.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { mapPlantRow } from "@/lib/growAdapters";
import type { PlantRow } from "@/lib/db";
import type { Plant } from "@/mock";

const USER_ID = "owner-1";
const signer = vi.hoisted(() => ({ calls: [] as string[][], fail: new Set<string>() }));
let plants: Plant[] = [];
let diary: Record<string, unknown>[] = [];

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

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => {
          signer.calls.push([...paths]);
          return {
            data: paths.map((path) =>
              signer.fail.has(path)
                ? { path, signedUrl: null, error: "Object not found" }
                : { path, signedUrl: `https://signed.example/${path}` },
            ),
            error: null,
          };
        },
      }),
    },
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: USER_ID }, loading: false }) }));
vi.mock("@/hooks/useGrowData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useGrowData")>()),
  useGrowPlants: () => query(plants),
  useGrowTents: () => query([]),
}));
vi.mock("@/hooks/use-diary-entries", () => ({ useDiaryEntries: () => query(diary) }));
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
    snapshot: { source: "unavailable", ts: null },
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

function plant(id: string, name: string, photoUrl: string | null): Plant {
  return mapPlantRow({
    id,
    user_id: USER_ID,
    name,
    tent_id: null,
    grow_id: null,
    strain: "",
    stage: "veg",
    started_at: "2026-08-01T00:00:00Z",
    health: "healthy",
    photo_url: photoUrl,
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

const photo = (id: string, plantId: string, entryAt: string) => ({
  id,
  user_id: USER_ID,
  plant_id: plantId,
  entry_at: entryAt,
  entry_type: "photo",
  photo_url: `${USER_ID}/diary/${id}.jpg`,
});

function renderPlants() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/plants"]}>
        <Plants />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function card(name: string) {
  return screen.getAllByTestId("plant-card").find((el) => el.textContent?.includes(name))!;
}

beforeEach(() => {
  signer.calls = [];
  signer.fail = new Set();
  plants = [plant("A", "Alpha", null), plant("B", "Bravo", null)];
  diary = [
    photo("a-old", "A", "2026-10-01T00:00:00Z"),
    photo("a-new", "A", "2026-10-10T00:00:00Z"),
  ];
});

describe("#2257 /plants card diary-photo fallback", () => {
  it("shows the plant's newest diary photo on its card", async () => {
    renderPlants();
    await waitFor(() => {
      const img = within(card("Alpha")).getByRole("img");
      expect(img).toHaveAttribute("src", `https://signed.example/${USER_ID}/diary/a-new.jpg`);
    });
  });

  it("signs the visible cards' photos in one batched request, newest only", async () => {
    renderPlants();
    await waitFor(() => expect(signer.calls.length).toBeGreaterThan(0));
    expect(signer.calls).toEqual([[`${USER_ID}/diary/a-new.jpg`]]);
  });

  it("keeps the empty state for a plant with no diary photo", async () => {
    renderPlants();
    await waitFor(() => expect(signer.calls.length).toBeGreaterThan(0));
    expect(within(card("Bravo")).getByText("No plant photo yet")).toBeInTheDocument();
  });

  it("still shows other plants' photos when one photo fails to sign (review)", async () => {
    diary = [...diary, photo("b-gone", "B", "2026-10-09T00:00:00Z")];
    signer.fail = new Set([`${USER_ID}/diary/b-gone.jpg`]);
    renderPlants();
    await waitFor(() => {
      const img = within(card("Alpha")).getByRole("img");
      expect(img).toHaveAttribute("src", `https://signed.example/${USER_ID}/diary/a-new.jpg`);
    });
    expect(within(card("Bravo")).getByText("No plant photo yet")).toBeInTheDocument();
  });
});
