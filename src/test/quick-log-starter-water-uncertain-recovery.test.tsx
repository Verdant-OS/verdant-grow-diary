import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import {
  setLocalStorageItemForTest,
  clearLocalStorageForTest,
  getLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

const saveMock = vi.fn();
const trackSuccessMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/quickLogSuccessTelemetry", () => ({
  trackQuickLogSuccess: trackSuccessMock,
}));
vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({
    save: (...args: unknown[]) => saveMock(...args),
    saving: false,
    error: null,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    from: () => ({
      insert: vi.fn(),
      update: () => ({ eq: vi.fn() }),
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => {
              const query: any = {
                abortSignal: () => query,
                then: (resolve: any, reject?: any) =>
                  Promise.resolve({ data: [], error: null }).then(resolve, reject),
              };
              return query;
            },
          }),
        }),
      }),
    }),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Test Grow", stage: "veg" }],
    activeGrow: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Test Grow", stage: "veg" },
    activeGrowId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "Test Plant",
        tent_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        grow_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    ],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        name: "Test Tent",
        grow_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    ],
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));

import QuickLog, { type QuickLogPrefill } from "@/components/QuickLog";
import {
  claimPendingStarterWater,
  clearPendingStarterWater,
  readPendingStarterWater,
  TYPED_WATER_RECOVERY_PENDING,
  type PendingStarterWater,
} from "@/lib/quickLogPendingStarterWaterStore";
import {
  claimPendingQuickLogWatering,
  readPendingQuickLogWatering,
  type PendingQuickLogWatering,
} from "@/lib/quickLogPendingWateringStore";
import { QUICK_LOG_V2_OPEN_EVENT } from "@/lib/quickLogV2OpenIntent";
import {
  PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY,
  serializePublicQuickLogStarterDraft,
  type PublicQuickLogStarterDraft,
} from "@/lib/publicQuickLogStarterRules";

const draft: PublicQuickLogStarterDraft = {
  v: 1,
  id: "draft-water",
  createdAt: "2026-09-25T21:00:00.000Z",
  updatedAt: "2026-09-25T21:00:00.000Z",
  plantNickname: "Test Plant",
  stage: "",
  logType: "watering",
  note: "Starter water",
  wateringVolumeMl: 250,
  attribution: {},
};
const prefill: QuickLogPrefill = {
  plantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  plantName: "Test Plant",
  growId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  tentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  eventType: "watering",
  note: "Starter water",
  wateringVolumeMl: 250,
  suggestSnapshot: false,
  source: "public-starter",
  publicStarterDraftId: draft.id,
  publicStarterDraftUpdatedAt: draft.updatedAt,
};

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function seed() {
  setLocalStorageItemForTest(
    PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY,
    serializePublicQuickLogStarterDraft(draft),
  );
}

const originalLocks = Object.getOwnPropertyDescriptor(window.navigator, "locks");
beforeEach(() => {
  clearLocalStorageForTest();
  window.sessionStorage.clear();
  let tail: Promise<unknown> = Promise.resolve();
  Object.defineProperty(window.navigator, "locks", {
    configurable: true,
    value: {
      request: (_name: string, _options: unknown, callback: () => unknown) => {
        const turn = tail.then(callback);
        tail = turn.then(
          () => undefined,
          () => undefined,
        );
        return turn;
      },
    },
  });
  saveMock.mockReset();
  trackSuccessMock.mockReset();
  vi.restoreAllMocks();
});
afterEach(() => {
  if (originalLocks) Object.defineProperty(window.navigator, "locks", originalLocks);
  else Reflect.deleteProperty(window.navigator, "locks");
});

describe("legacy public-starter Water uncertain receipt", () => {
  it("shows typed-Water recovery and sends no starter RPC while another tab owns Water", async () => {
    const occurredAt = "2026-09-26T08:00:00.000Z";
    const typed: PendingQuickLogWatering = {
      version: 1,
      ownerId: "user-1",
      createdAt: occurredAt,
      payload: {
        idempotency_key: "typed-water-key",
        grow_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        tent_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        plant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        occurred_at: occurredAt,
        volume_ml: 250,
      },
      resolved: {
        ok: true,
        targetType: "plant",
        targetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        plantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        tentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        growId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
      attachments: { photo: false, video: false },
    };
    expect((await claimPendingQuickLogWatering(typed)).status).toBe("claimed");
    seed();
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={prefill} />);
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-save-error")).toHaveTextContent(
        TYPED_WATER_RECOVERY_PENDING,
      ),
    );
    expect(saveMock).not.toHaveBeenCalled();
    expect(readPendingQuickLogWatering("user-1")).toEqual({ status: "pending", record: typed });
  });

  it("locks edits and replays the exact stored payload after close and reopen", async () => {
    seed();
    saveMock
      .mockResolvedValueOnce({ ok: false, reason: "receipt_unverified" })
      .mockResolvedValueOnce({
        ok: true,
        reused: true,
        growEventId: "11111111-1111-4111-8111-111111111111",
      });
    const view = renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={prefill} />);
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    await screen.findByTestId("quick-log-starter-water-recovery");
    const original = structuredClone(saveMock.mock.calls[0][0]);
    expect(original.p_action).toBe("water");
    expect(original.p_volume_ml).toBe(250);
    expect(original.p_idempotency_key).toEqual(expect.any(String));
    const pending = readPendingStarterWater("user-1");
    expect(pending.status).toBe("pending");
    if (pending.status !== "pending") throw new Error("expected pending Watering");
    expect(original.p_occurred_at).toBeNull();
    expect(pending.record.payload.p_occurred_at).toBeNull();
    expect(Number.isFinite(Date.parse(pending.record.createdAt))).toBe(true);
    expect(screen.getByTestId("quicklog-note")).toBeDisabled();
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
    expect(readPendingStarterWater("user-1")).toMatchObject({ status: "pending" });
    expect(trackSuccessMock).not.toHaveBeenCalled();

    view.unmount();
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={prefill} />);
    expect(screen.getByTestId("quick-log-starter-water-original")).toHaveTextContent("250 ml");
    fireEvent.click(screen.getByTestId("quick-log-starter-water-retry"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(saveMock.mock.calls[1][0]).toEqual(original);
    await screen.findByTestId("quick-log-post-save");
    expect(readPendingStarterWater("user-1")).toEqual({ status: "empty" });
    expect(trackSuccessMock).toHaveBeenCalledTimes(1);
    expect(trackSuccessMock).toHaveBeenCalledWith("water");
    expect(getLocalStorageItemForTest(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY)).toBeNull();
  });

  it("treats a matching cross-tab clear as resolved without a second telemetry count", async () => {
    seed();
    saveMock
      .mockResolvedValueOnce({ ok: false, reason: "receipt_unverified" })
      .mockImplementationOnce(async () => {
        const current = readPendingStarterWater("user-1");
        if (current.status !== "pending") throw new Error("expected pending Watering");
        expect(await clearPendingStarterWater(current.record)).toBe(true);
        return {
          ok: true,
          reused: true,
          growEventId: "11111111-1111-4111-8111-111111111111",
        };
      });
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={prefill} />);
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await screen.findByTestId("quick-log-starter-water-recovery");
    fireEvent.click(screen.getByTestId("quick-log-starter-water-retry"));
    await screen.findByTestId("quick-log-post-save");
    expect(readPendingStarterWater("user-1")).toEqual({ status: "empty" });
    expect(trackSuccessMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/recovery could not be cleared/i)).not.toBeInTheDocument();
  });

  it("rechecks shared recovery before opening structured Water from an older tab", async () => {
    seed();
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={prefill} />);
    const record: PendingStarterWater = {
      version: 1,
      ownerId: "user-1",
      createdAt: "2026-09-26T04:00:00.000Z",
      payload: {
        p_target_type: "plant",
        p_target_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        p_action: "water",
        p_volume_ml: 250,
        p_note: "Starter water",
        p_temperature_c: null,
        p_humidity_pct: null,
        p_vpd_kpa: null,
        p_occurred_at: null,
        p_idempotency_key: "original-water-key",
      },
      target: {
        plantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        growId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        tentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      },
      plantName: "Test Plant",
      tentName: "Test Tent",
      growName: "Test Grow",
      stageWasUserTouched: false,
      reviewedDraftId: null,
      reviewedDraftUpdatedAt: null,
    };
    expect(await claimPendingStarterWater(record)).toMatchObject({ status: "claimed" });
    const v2Open = vi.fn();
    window.addEventListener(QUICK_LOG_V2_OPEN_EVENT, v2Open);
    try {
      fireEvent.click(screen.getByTestId("quick-log-dialog-all-activities-picker-watering"));
      expect(v2Open).not.toHaveBeenCalled();
      expect(
        screen.getByTestId("quick-log-dialog-all-activities-structured-water-error"),
      ).toHaveTextContent("An earlier Watering may already be saved");
    } finally {
      window.removeEventListener(QUICK_LOG_V2_OPEN_EVENT, v2Open);
    }
  });

  it("releases the first key after a definitive recovery rejection", async () => {
    seed();
    saveMock
      .mockResolvedValueOnce({ ok: false, reason: "receipt_unverified" })
      .mockResolvedValueOnce({ ok: false, reason: "target_not_owned", definitiveRejected: true });
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={prefill} />);
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await screen.findByTestId("quick-log-starter-water-recovery");
    const original = structuredClone(saveMock.mock.calls[0][0]);
    fireEvent.click(screen.getByTestId("quick-log-starter-water-retry"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(saveMock.mock.calls[1][0]).toEqual(original);
    await waitFor(() => expect(readPendingStarterWater("user-1")).toEqual({ status: "empty" }));
    expect(screen.getByTestId("quick-log-save")).not.toBeDisabled();
    expect(
      screen.getByText(/re-select a valid grow, tent, and plant before saving again/i),
    ).toBeInTheDocument();
    expect(trackSuccessMock).not.toHaveBeenCalled();
  });

  it("clears an exact saved-then-retracted replay without counting an active Watering", async () => {
    seed();
    saveMock
      .mockResolvedValueOnce({ ok: false, reason: "receipt_unverified" })
      .mockResolvedValueOnce({
        ok: false,
        reason: "saved_then_retracted",
        savedThenRetracted: true,
      });
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={prefill} />);
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await screen.findByTestId("quick-log-starter-water-recovery");
    const original = structuredClone(saveMock.mock.calls[0][0]);
    fireEvent.click(screen.getByTestId("quick-log-starter-water-retry"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(saveMock.mock.calls[1][0]).toEqual(original);
    await waitFor(() => expect(readPendingStarterWater("user-1")).toEqual({ status: "empty" }));
    expect(screen.getByText(/This Watering was saved and later retracted/i)).toBeInTheDocument();
    expect(screen.queryByTestId("quick-log-post-save")).not.toBeInTheDocument();
    expect(trackSuccessMock).not.toHaveBeenCalled();
  });

  it("keeps the claim and locks for history review on an unverified retracted key", async () => {
    seed();
    saveMock.mockResolvedValueOnce({ ok: false, reason: "idempotency_key_retracted" });
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={prefill} />);
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    await screen.findByText(/The original log was retracted\. Check Timeline/i);
    expect(readPendingStarterWater("user-1")).toMatchObject({ status: "pending" });
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
    expect(screen.queryByText(/This Watering was saved and later retracted/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "I checked Timeline; discard draft" }));
    await waitFor(() => expect(readPendingStarterWater("user-1")).toEqual({ status: "empty" }));
    await waitFor(() =>
      expect(screen.queryByTestId("quick-log-starter-water-recovery")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("I checked Timeline; discard draft")).toBeNull();
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(trackSuccessMock).not.toHaveBeenCalled();
  });

  it("keeps a recovery claim pending with history-check copy on an unverified retracted key", async () => {
    seed();
    saveMock
      .mockResolvedValueOnce({ ok: false, reason: "receipt_unverified" })
      .mockResolvedValueOnce({ ok: false, reason: "idempotency_key_retracted" });
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={prefill} />);
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await screen.findByTestId("quick-log-starter-water-recovery");
    fireEvent.click(screen.getByTestId("quick-log-starter-water-retry"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    await screen.findByText(/The original log was retracted\. Check Timeline/i);
    expect(readPendingStarterWater("user-1")).toMatchObject({ status: "pending" });
    expect(screen.queryByText(/This Watering was saved and later retracted/i)).toBeNull();
    expect(screen.getByTestId("quick-log-starter-water-retry")).toBeDisabled();
    expect(screen.getByRole("link", { name: "Open Timeline in a new tab" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "I checked Timeline; discard draft" }));
    await waitFor(() => expect(readPendingStarterWater("user-1")).toEqual({ status: "empty" }));
    await waitFor(() =>
      expect(screen.queryByTestId("quick-log-starter-water-recovery")).not.toBeInTheDocument(),
    );
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(trackSuccessMock).not.toHaveBeenCalled();
  });

  it("keeps the history lock and Water claim when the discard cannot clear storage", async () => {
    seed();
    saveMock
      .mockResolvedValueOnce({ ok: false, reason: "receipt_unverified" })
      .mockResolvedValueOnce({ ok: false, reason: "idempotency_key_retracted" });
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={prefill} />);
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await screen.findByTestId("quick-log-starter-water-recovery");
    fireEvent.click(screen.getByTestId("quick-log-starter-water-retry"));
    await screen.findByText(/The original log was retracted\. Check Timeline/i);
    const remove = Storage.prototype.removeItem;
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (
        this === window.sessionStorage &&
        key.startsWith("verdant:quick-log:pending-starter-water:")
      )
        throw new Error("storage unavailable");
      remove.call(this, key);
    });
    fireEvent.click(screen.getByRole("button", { name: "I checked Timeline; discard draft" }));
    await screen.findByText(/This draft could not be removed from this tab/i);
    expect(readPendingStarterWater("user-1")).toMatchObject({ status: "pending" });
    expect(
      screen.getByRole("button", { name: "I checked Timeline; discard draft" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("quick-log-starter-water-retry")).toBeDisabled();
    expect(trackSuccessMock).not.toHaveBeenCalled();
  });

  it("keeps a retracted claim pending with honest copy when storage clearance fails", async () => {
    seed();
    saveMock
      .mockResolvedValueOnce({ ok: false, reason: "receipt_unverified" })
      .mockResolvedValueOnce({
        ok: false,
        reason: "saved_then_retracted",
        savedThenRetracted: true,
      });
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={prefill} />);
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await screen.findByTestId("quick-log-starter-water-recovery");
    const remove = Storage.prototype.removeItem;
    const blocked = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (
        this === window.sessionStorage &&
        key.startsWith("verdant:quick-log:pending-starter-water:")
      )
        throw new Error("storage unavailable");
      remove.call(this, key);
    });
    fireEvent.click(screen.getByTestId("quick-log-starter-water-retry"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(readPendingStarterWater("user-1")).toMatchObject({ status: "pending" });
    expect(
      screen.getByText(/saved and later retracted, but recovery could not be cleared/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("quick-log-post-save")).not.toBeInTheDocument();
    expect(trackSuccessMock).not.toHaveBeenCalled();
    blocked.mockRestore();
  });

  it("shows the verified saved location when the plant moved before retry committed", async () => {
    seed();
    const movedGrowId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const movedTentId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    saveMock
      .mockResolvedValueOnce({ ok: false, reason: "receipt_unverified" })
      .mockResolvedValueOnce({
        ok: true,
        growEventId: "11111111-1111-4111-8111-111111111111",
        reused: false,
        savedWaterTarget: {
          plantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          growId: movedGrowId,
          tentId: movedTentId,
        },
        waterContextChanged: true,
      });
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={prefill} />);
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await screen.findByTestId("quick-log-starter-water-recovery");
    fireEvent.click(screen.getByTestId("quick-log-starter-water-retry"));
    await screen.findByTestId("quick-log-post-save");
    expect(screen.getByTestId("quick-log-water-context-changed")).toHaveTextContent(
      /saved after this plant changed tents or grows/i,
    );
    expect(screen.getByTestId("quick-log-post-save-description")).not.toHaveTextContent(
      "Test Tent",
    );
    expect(screen.getByTestId("quick-log-view-target-plant")).toHaveAttribute(
      "data-target-grow-id",
      movedGrowId,
    );
    expect(readPendingStarterWater("user-1")).toEqual({ status: "empty" });
    expect(trackSuccessMock).toHaveBeenCalledTimes(1);
  });

  it("counts a first confirmed Watering once after recovery is cleared", async () => {
    seed();
    saveMock.mockResolvedValue({
      ok: true,
      reused: false,
      growEventId: "11111111-1111-4111-8111-111111111111",
    });
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={prefill} />);
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await screen.findByTestId("quick-log-post-save");
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock.mock.calls[0][1]).toEqual({
      expectedWaterTarget: {
        plantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        growId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        tentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      },
    });
    expect(readPendingStarterWater("user-1")).toEqual({ status: "empty" });
    expect(trackSuccessMock).toHaveBeenCalledTimes(1);
    expect(trackSuccessMock).toHaveBeenCalledWith("water");
  });

  it("does not count a confirmed Watering until a failed clear is recovered", async () => {
    seed();
    saveMock
      .mockResolvedValueOnce({
        ok: true,
        reused: false,
        growEventId: "11111111-1111-4111-8111-111111111111",
      })
      .mockResolvedValueOnce({
        ok: true,
        reused: true,
        growEventId: "11111111-1111-4111-8111-111111111111",
      });
    const removeItem = Storage.prototype.removeItem;
    let denyFirstClear = true;
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (denyFirstClear && key.startsWith("verdant:quick-log:pending-starter-water:")) {
        denyFirstClear = false;
        throw new Error("storage unavailable");
      }
      return removeItem.call(this, key);
    });

    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={prefill} />);
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await screen.findByTestId("quick-log-post-save");
    expect(readPendingStarterWater("user-1")).toMatchObject({ status: "pending" });
    expect(trackSuccessMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("quick-log-starter-water-retry"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(readPendingStarterWater("user-1")).toEqual({ status: "empty" }));
    expect(saveMock.mock.calls[1][0]).toEqual(saveMock.mock.calls[0][0]);
    expect(trackSuccessMock).toHaveBeenCalledTimes(1);
  });

  it("clears a definitive pre-write rejection so the grower may edit and resubmit", async () => {
    seed();
    saveMock
      .mockResolvedValueOnce({ ok: false, reason: "target_not_owned", definitiveRejected: true })
      .mockResolvedValueOnce({ ok: true, growEventId: "11111111-1111-4111-8111-111111111111" });
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={prefill} />);
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(readPendingStarterWater("user-1")).toEqual({ status: "empty" }));
    fireEvent.change(screen.getByTestId("quicklog-note"), {
      target: { value: "Edited after definitive rejection" },
    });
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(saveMock.mock.calls[1][0].p_note).toContain("Edited after definitive rejection");
    expect(saveMock.mock.calls[1][0].p_idempotency_key).not.toBe(
      saveMock.mock.calls[0][0].p_idempotency_key,
    );
    await screen.findByTestId("quick-log-post-save");
    expect(trackSuccessMock).toHaveBeenCalledTimes(1);
  });

  it("refuses to dispatch Watering if its recovery record cannot be persisted", async () => {
    seed();
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={prefill} />);
    const blockedStorage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage denied");
    });
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await screen.findByTestId("quick-log-starter-water-recovery");
    expect(saveMock).not.toHaveBeenCalled();
    expect(trackSuccessMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("quick-log-save")).not.toBeDisabled();
    expect(getLocalStorageItemForTest(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY)).not.toBeNull();

    const v2Open = vi.fn();
    window.addEventListener(QUICK_LOG_V2_OPEN_EVENT, v2Open);
    try {
      fireEvent.click(screen.getByTestId("quick-log-dialog-all-activities-picker-watering"));
      expect(
        screen.getByTestId("quick-log-dialog-all-activities-structured-water-error"),
      ).toHaveTextContent("Watering recovery storage cannot be verified");
      expect(v2Open).not.toHaveBeenCalled();
      blockedStorage.mockRestore();
      fireEvent.click(screen.getByTestId("quick-log-dialog-all-activities-picker-watering"));
      await waitFor(() => expect(v2Open).toHaveBeenCalledTimes(1));
    } finally {
      window.removeEventListener(QUICK_LOG_V2_OPEN_EVENT, v2Open);
    }
  });

  it("keeps non-Water notes available when Water recovery storage is denied", async () => {
    saveMock.mockResolvedValue({
      ok: true,
      growEventId: "11111111-1111-4111-8111-111111111111",
    });
    renderWithClient(
      <QuickLog
        open
        onOpenChange={vi.fn()}
        prefill={{
          ...prefill,
          eventType: "observation",
          note: "Observation while Water storage is unavailable",
          wateringVolumeMl: null,
        }}
      />,
    );
    const originalGetItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (this === window.localStorage) throw new Error("Water storage denied");
      return originalGetItem.call(this, key);
    });
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0][0].p_action).toBe("note");
  });
});
