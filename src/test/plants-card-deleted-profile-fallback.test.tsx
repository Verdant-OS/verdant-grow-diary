/**
 * #2257 (VER-221, option A): a /plants card with no profile photo shows the
 * plant's newest diary photo, matching the Plant Detail hero. The visible
 * cards' photos are signed in one batched request; a plant with no photo
 * keeps the "No plant photo yet" empty state.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { mapPlantRow } from "@/lib/growAdapters";
import type { PlantRow } from "@/lib/db";
import type { Plant } from "@/mock";

const USER_ID = "owner-1";
type ProfileReply = { data: { signedUrl: string } | null; error: { message: string } | null };
const signer = vi.hoisted(() => ({
  calls: [] as string[][],
  fail: new Set<string>(),
  failedProfiles: new Set<string>(),
  profileReplies: new Map<string, Promise<ProfileReply>>(),
}));
const PROFILE_PATH = "owner-1/profiles/deleted.jpg";
const PROFILE_REF = "storage://diary-photos/owner-1/profiles/deleted.jpg";
const DIARY_URL = "https://signed.example/owner-1/diary/a-new.jpg";
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
        createSignedUrl: async (path: string) => {
          const pending = signer.profileReplies.get(path);
          if (pending) return pending;
          if (signer.failedProfiles.has(path)) {
            return { data: null, error: { message: "Object not found" } };
          }
          return { data: { signedUrl: `https://profiles.example/${path}` }, error: null };
        },
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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  const ui = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/plants"]}>
        <Plants />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(ui());
  return { ...view, refresh: () => view.rerender(ui()) };
}

function card(name: string) {
  return screen.getAllByTestId("plant-card").find((el) => el.textContent?.includes(name))!;
}

beforeEach(() => {
  signer.calls = [];
  signer.fail = new Set();
  signer.failedProfiles = new Set();
  signer.profileReplies = new Map();
  plants = [plant("A", "Alpha", PROFILE_REF)];
  diary = [
    photo("a-old", "A", "2026-10-01T00:00:00Z"),
    photo("a-new", "A", "2026-10-10T00:00:00Z"),
  ];
});

/** Real page, profile resolver and diary signer projection; only data/network edges are doubled. */
describe("deleted /plants profile object falls back only after profile resolution fails", () => {
  it("renders the newest owned diary photo after a deleted profile object fails to sign", async () => {
    signer.failedProfiles.add(PROFILE_PATH);
    const view = renderPlants();
    await waitFor(() =>
      expect(within(card("Alpha")).getByRole("img")).toHaveAttribute("src", DIARY_URL),
    );
    expect(signer.calls).toEqual([["owner-1/diary/a-new.jpg"]]);
    view.refresh();
    expect(within(card("Alpha")).getByRole("img")).toHaveAttribute("src", DIARY_URL);
    expect(signer.calls).toEqual([["owner-1/diary/a-new.jpg"]]);
  });

  it("keeps a valid profile ahead of an available diary fallback", async () => {
    renderPlants();
    await waitFor(() =>
      expect(within(card("Alpha")).getByRole("img")).toHaveAttribute(
        "src",
        "https://profiles.example/owner-1/profiles/deleted.jpg",
      ),
    );
    expect(signer.calls).toEqual([]);
  });

  it("keeps the placeholder while the profile is loading, then shows that profile", async () => {
    let settle!: (reply: ProfileReply) => void;
    signer.profileReplies.set(
      PROFILE_PATH,
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    renderPlants();
    expect(within(card("Alpha")).getByText("No plant photo yet")).toBeInTheDocument();
    expect(signer.calls).toEqual([]);
    await act(async () => {
      settle({ data: { signedUrl: "https://profiles.example/loaded-profile.jpg" }, error: null });
    });
    await waitFor(() =>
      expect(within(card("Alpha")).getByRole("img")).toHaveAttribute(
        "src",
        "https://profiles.example/loaded-profile.jpg",
      ),
    );
    expect(signer.calls).toEqual([]);
  });

  it("does not reuse an old profile failure while a replacement profile loads", async () => {
    signer.failedProfiles.add(PROFILE_PATH);
    const view = renderPlants();
    await waitFor(() =>
      expect(within(card("Alpha")).getByRole("img")).toHaveAttribute("src", DIARY_URL),
    );
    let settle!: (reply: ProfileReply) => void;
    signer.profileReplies.set(
      "owner-1/profiles/replacement.jpg",
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    plants = [plant("A", "Alpha", "storage://diary-photos/owner-1/profiles/replacement.jpg")];
    view.refresh();
    expect(within(card("Alpha")).getByText("No plant photo yet")).toBeInTheDocument();
    // The placeholder SVG also has an image role; no actual photo may flash here.
    expect(card("Alpha").querySelector("img")).not.toBeInTheDocument();
    await act(async () => {
      settle({ data: { signedUrl: "https://profiles.example/replacement.jpg" }, error: null });
    });
    await waitFor(() =>
      expect(within(card("Alpha")).getByRole("img")).toHaveAttribute(
        "src",
        "https://profiles.example/replacement.jpg",
      ),
    );
  });
});
