/**
 * An archive read that fails, returns no row, or returns an unexpected
 * shape blocks the save and asks the grower to retry. The plant that would
 * be written is the one that is checked, including a frozen v2 retry.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimPendingQuickLogActivity } from "@/lib/quickLogPendingActivityStore";
import { claimPendingQuickLogNote } from "@/lib/quickLogPendingNoteStore";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

const harness = vi.hoisted(() => ({
  read: "flag" as "flag" | "error" | "empty" | "shape",
  readPlantIds: [] as string[],
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => harness.rpc(...args),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: (column: string, value: string) => {
          if (table === "plants" && column === "id") harness.readPlantIds.push(value);
          return builder;
        },
        limit: async () => {
          if (table !== "plants") return { data: [], error: null };
          if (harness.read === "error") return { data: null, error: { message: "unavailable" } };
          if (harness.read === "empty") return { data: [], error: null };
          if (harness.read === "shape") return { data: [{ is_archived: "yes" }], error: null };
          return { data: [{ is_archived: false }], error: null };
        },
        maybeSingle: async () => ({ data: null, error: null }),
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
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

const RETRY = "Couldn't check whether this plant is archived. Try again.";
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
  harness.read = "flag";
  harness.readPlantIds = [];
  harness.rpc.mockReset();
  harness.rpc.mockResolvedValue({
    data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000001" },
    error: null,
  });
});
afterEach(cleanup);

async function expectBlocked(action: () => void) {
  action();
  expect(harness.rpc).not.toHaveBeenCalled();
  expect(await screen.findByText(RETRY)).toBeInTheDocument();
  expect(harness.rpc).not.toHaveBeenCalled();
}

describe("unreadable archive status blocks the plant that would be saved", () => {
  it("does not save the dialog note when the archive read returns no row", async () => {
    harness.read = "empty";
    renderQuickLog();
    const save = screen.getByTestId("quick-log-save");
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "New growth" } });
    await expectBlocked(() => fireEvent.click(save));
  });

  it("does not save the dialog activity when the archive read fails", async () => {
    harness.read = "error";
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
    await expectBlocked(() => fireEvent.click(screen.getByTestId(`${prefix}-save`)));
  });

  it("does not retry the original activity when the archive row has an unexpected shape", async () => {
    harness.read = "shape";
    expect(
      claimPendingQuickLogActivity({
        version: 1,
        ownerId: "u1",
        createdAt: new Date().toISOString(),
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
    await expectBlocked(() => fireEvent.click(retry));
  });

  it("does not save from the v2 sheet when the archive read fails", async () => {
    harness.read = "error";
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Note" }));
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Sheet note after a failed check" },
    });
    await expectBlocked(() => fireEvent.click(screen.getByTestId("qlv2-save")));
  });

  it("does not retry the frozen v2 note when the archive read returns no row", async () => {
    harness.read = "empty";
    expect(
      claimPendingQuickLogNote({
        version: 1,
        ownerId: "u1",
        createdAt: "2026-10-19T18:00:00.000Z",
        attachments: { photo: false, video: false },
        payload: {
          p_target_type: "plant",
          p_target_id: "frozen-plant",
          p_action: "note",
          p_volume_ml: null,
          p_note: "Frozen note",
          p_temperature_c: null,
          p_humidity_pct: null,
          p_vpd_kpa: null,
          p_occurred_at: "2026-10-19T18:00:00.000Z",
          p_details: { source: "manual" },
          p_stage: null,
          p_idempotency_key: "frozen-note-key",
        },
        resolved: {
          ok: true,
          targetType: "plant",
          targetId: "frozen-plant",
          plantId: "frozen-plant",
          tentId: "t1",
          growId: "g1",
        },
      }).status,
    ).toBe("claimed");
    renderSheet();
    await expectBlocked(() => fireEvent.click(screen.getByTestId("qlv2-save-retry")));
    expect(harness.readPlantIds).toContain("frozen-plant");
  });
});
