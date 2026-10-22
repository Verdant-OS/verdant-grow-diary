/**
 * The Daily Check archive guard is opt-in via registration. Quick Log surfaces
 * outside Daily Check must not block saves when the row is archived.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

const harness = vi.hoisted(() => ({
  archived: true,
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => harness.rpc(...args),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        limit: async () => ({
          data: table === "plants" ? [{ is_archived: harness.archived }] : [],
          error: null,
        }),
        maybeSingle: async () => ({
          data: table === "plants" ? { is_archived: harness.archived } : null,
          error: null,
        }),
        insert: vi.fn(),
        update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      };
      return builder;
    },
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "Grow One", stage: "veg" }],
    activeGrow: { id: "g1", name: "Grow One", stage: "veg" },
    activeGrowId: "g1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "p1", name: "Plant One", grow_id: "g1", tent_id: "t1", stage: "veg" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "t1", name: "Tent One", grow_id: "g1" }] }),
}));
vi.mock("@/lib/sensor", () => ({
  useLatestTentSensorSnapshot: () => ({
    status: "empty",
    snapshot: { status: "empty", source: null, captured_at: null, metrics: {} },
  }),
}));
vi.mock("@/hooks/usePhenoEvidenceCaptureContext", () => ({
  usePhenoEvidenceCaptureContext: () => ({ status: "disabled", context: null }),
}));
vi.mock("@/components/QuickLogSensorSnapshotStrip", () => ({ default: () => null }));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));
vi.mock("@/hooks/useRecentWateringsForVolumeDefaults", () => ({
  useRecentWateringsForVolumeDefaults: () => ({ data: [] }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn(), warning: vi.fn() },
}));

import QuickLog from "@/components/QuickLog";
import { activeDailyCheckPlantArchiveSaveGuard } from "@/lib/dailyCheckPlantArchiveSaveGuard";

function renderQuickLog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickLog
        open
        onOpenChange={() => {}}
        prefill={{ plantId: "p1", growId: "g1", tentId: "t1" }}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  clearLocalStorageForTest();
  window.sessionStorage.clear();
  harness.archived = true;
  harness.rpc.mockReset();
  harness.rpc.mockResolvedValue({
    data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000001" },
    error: null,
  });
  expect(activeDailyCheckPlantArchiveSaveGuard()).toBeNull();
});
afterEach(cleanup);

describe("Quick Log archive guard scope", () => {
  it("does not block a save when Daily Check has not registered a guard", async () => {
    renderQuickLog();
    const save = screen.getByTestId("quick-log-save");
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Outside Daily Check" } });
    fireEvent.click(save);
    await waitFor(() => expect(harness.rpc).toHaveBeenCalled());
    expect(
      screen.queryByText("This plant was archived. Pick another plant."),
    ).not.toBeInTheDocument();
  });
});
