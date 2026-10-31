/**
 * #2015 follow-up: the plant that a Quick Log control actually saves is
 * re-checked, including the dialog activity save, its retry, and the v2 sheet.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimPendingQuickLogActivity } from "@/lib/quickLogPendingActivityStore";
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
import { checkDailyCheckPlantArchiveBeforeSave } from "@/lib/dailyCheckPlantArchiveReadService";
import { registerDailyCheckPlantArchiveSaveGuard } from "@/lib/dailyCheckPlantArchiveSaveGuard";

// Daily Check registers this guard while it is mounted; these tests mount the
// writers directly, so they register the same real guard.
let unregisterArchiveGuard = () => {};
beforeEach(() => {
  unregisterArchiveGuard = registerDailyCheckPlantArchiveSaveGuard(
    checkDailyCheckPlantArchiveBeforeSave,
  );
});
afterEach(() => unregisterArchiveGuard());
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

const MESSAGE = "This plant was archived. Pick another plant.";
const prefix = "quick-log-dialog-all-activities";

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

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open onOpenChange={vi.fn()} defaultTargetKey="plant:p1" />
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
});
afterEach(cleanup);

describe("Quick Log save re-checks the plant it will write", () => {
  it("keeps the v2 sheet locked when the archive re-check blocks an unresolved note retry", async () => {
    harness.archived = false;
    harness.rpc.mockResolvedValueOnce({ data: null, error: { message: "network down" } });
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Note" }));
    const note = screen.getByLabelText("Note (optional)");
    fireEvent.change(note, { target: { value: "Uncertain sheet note" } });
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByLabelText("Note (optional)")).toBeDisabled());
    harness.archived = true;
    fireEvent.click(screen.getByTestId("qlv2-save"));
    expect(await screen.findByText(MESSAGE)).toBeInTheDocument();
    expect(harness.rpc).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Note (optional)")).toBeDisabled();
  });

  it("does not save the dialog note when that plant was archived", async () => {
    renderQuickLog();
    const save = screen.getByTestId("quick-log-save");
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "New growth" } });
    fireEvent.click(save);
    expect(harness.rpc).not.toHaveBeenCalled();
    expect(await screen.findByText(MESSAGE)).toBeInTheDocument();
    expect(harness.rpc).not.toHaveBeenCalled();
  });

  it("does not save the dialog activity when that plant was archived", async () => {
    renderQuickLog();
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-target-card")).toHaveAttribute(
        "data-target-plant-id",
        "p1",
      ),
    );
    fireEvent.click(screen.getByTestId(`${prefix}-picker-note`));
    fireEvent.change(await screen.findByTestId(`${prefix}-note`), {
      target: { value: "Leaf observation" },
    });
    fireEvent.click(screen.getByTestId(`${prefix}-save`));
    expect(harness.rpc).not.toHaveBeenCalled();
    expect(await screen.findByText(MESSAGE)).toBeInTheDocument();
    expect(harness.rpc).not.toHaveBeenCalled();
  });

  it("does not retry the original activity when that plant was archived", async () => {
    const createdAt = new Date().toISOString();
    expect(
      claimPendingQuickLogActivity({
        version: 1,
        ownerId: "u1",
        createdAt,
        input: {
          activityId: "note",
          growId: "g1",
          tentId: "t1",
          plantId: "p1",
          note: "Leaf observation",
          occurredAt: null,
          extraDetails: null,
          idempotencyKey: "idem-key-01",
        },
        receipt: { symptomCheck: false, harvestDetails: null },
      }).status,
    ).toBe("claimed");
    renderQuickLog();
    const retry = await screen.findByTestId(`${prefix}-retry-original`);
    fireEvent.click(retry);
    expect(harness.rpc).not.toHaveBeenCalled();
    expect(await screen.findByText(MESSAGE)).toBeInTheDocument();
    expect(harness.rpc).not.toHaveBeenCalled();
  });

  it("does not save or retry from the v2 sheet when its target plant was archived", async () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Note" }));
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Sheet note after archive" },
    });
    fireEvent.click(screen.getByTestId("qlv2-save"));
    expect(harness.rpc).not.toHaveBeenCalled();
    expect(await screen.findByText(MESSAGE)).toBeInTheDocument();
    expect(harness.rpc).not.toHaveBeenCalled();
  });
});
