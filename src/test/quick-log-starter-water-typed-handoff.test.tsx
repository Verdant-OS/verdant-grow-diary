import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import { STARTER_WATER_RECOVERY_PENDING } from "@/lib/quickLogPendingStarterWaterStore";
import {
  clearLocalStorageForTest,
  setLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

const writer = vi.fn();
vi.mock("@/lib/writeQuickLogWateringTypedEvent", () => ({
  writeQuickLogWateringTypedEvent: (...args: unknown[]) => writer(...args),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    from: () => ({ insert: vi.fn() }),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      {
        id: "plant-1",
        name: "Plant 1",
        tent_id: "tent-1",
        grow_id: "grow-1",
        stage: "flowering",
      },
    ],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }] }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "Grow 1", stage: "flowering" }] }),
}));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));
vi.mock("@/hooks/useRecentWateringsForVolumeDefaults", () => ({
  useRecentWateringsForVolumeDefaults: () => ({ data: [] }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

const legacyRecord = {
  version: 1,
  ownerId: "user-1",
  createdAt: "2026-09-26T02:00:00.000Z",
  payload: {
    p_target_type: "plant",
    p_target_id: "plant-1",
    p_action: "water",
    p_volume_ml: 250,
    p_note: "Starter Water",
    p_temperature_c: null,
    p_humidity_pct: null,
    p_vpd_kpa: null,
    p_occurred_at: null,
    p_idempotency_key: "starter-water-key-1",
  },
  target: { plantId: "plant-1", tentId: "tent-1", growId: "grow-1" },
  plantName: "Plant 1",
  tentName: "Tent 1",
  growName: "Grow 1",
  stageWasUserTouched: false,
  reviewedDraftId: null,
  reviewedDraftUpdatedAt: null,
};

beforeEach(() => {
  clearLocalStorageForTest();
  window.sessionStorage.clear();
  writer.mockReset();
  writer.mockResolvedValue({ ok: true, eventId: "water-event-1", reused: false });
});

describe("typed Water handoff from the public starter", () => {
  it("rechecks shared recovery before dispatch when another tab claims after the sheet opened", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <QuickLogV2Sheet
          open
          onOpenChange={vi.fn()}
          defaultTargetKey="plant:plant-1"
          defaultAction="water"
        />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "500" } });
    setLocalStorageItemForTest(
      "verdant:quick-log:pending-starter-water:v1:user-1",
      JSON.stringify(legacyRecord),
    );
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => expect(screen.getByText(STARTER_WATER_RECOVERY_PENDING)).toBeVisible());
    expect(writer).not.toHaveBeenCalled();
    expect(screen.queryByTestId("qlv2-post-save")).toBeNull();
  });
});
