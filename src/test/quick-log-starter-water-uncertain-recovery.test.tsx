import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import {
  setLocalStorageItemForTest,
  clearLocalStorageForTest,
} from "./helpers/localStorageTestHelper";

const saveMock = vi.fn();
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
    grows: [{ id: "grow-1", name: "Test Grow", stage: "veg" }],
    activeGrow: { id: "grow-1", name: "Test Grow", stage: "veg" },
    activeGrowId: "grow-1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Test Plant", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-1", name: "Test Tent", grow_id: "grow-1" }] }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));

import QuickLog, { type QuickLogPrefill } from "@/components/QuickLog";
import { readPendingStarterWater } from "@/lib/quickLogPendingStarterWaterStore";
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
  plantId: "plant-1",
  plantName: "Test Plant",
  growId: "grow-1",
  tentId: "tent-1",
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

beforeEach(() => {
  clearLocalStorageForTest();
  window.sessionStorage.clear();
  saveMock.mockReset();
  vi.restoreAllMocks();
});

describe("legacy public-starter Water uncertain receipt", () => {
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
    expect(screen.getByTestId("quicklog-note")).toBeDisabled();
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
    expect(readPendingStarterWater("user-1")).toMatchObject({ status: "pending" });

    view.unmount();
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={prefill} />);
    expect(screen.getByTestId("quick-log-starter-water-original")).toHaveTextContent("250 ml");
    fireEvent.click(screen.getByTestId("quick-log-starter-water-retry"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(saveMock.mock.calls[1][0]).toEqual(original);
    await screen.findByTestId("quick-log-post-save");
    expect(readPendingStarterWater("user-1")).toEqual({ status: "empty" });
    expect(window.localStorage.getItem(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY)).toBeNull();
  });

  it("retains the first key even if the recovery call reports a later rejection", async () => {
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
    expect(readPendingStarterWater("user-1")).toMatchObject({
      status: "pending",
      record: { payload: original },
    });
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
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
  });

  it("refuses to dispatch Watering if its recovery record cannot be persisted", async () => {
    seed();
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={prefill} />);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage denied");
    });
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await screen.findByTestId("quick-log-starter-water-recovery");
    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("quick-log-save")).not.toBeDisabled();
    expect(window.localStorage.getItem(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY)).not.toBeNull();

    const v2Open = vi.fn();
    window.addEventListener(QUICK_LOG_V2_OPEN_EVENT, v2Open);
    try {
      fireEvent.click(screen.getByTestId("quick-log-dialog-all-activities-picker-watering"));
      expect(
        screen.getByTestId("quick-log-dialog-all-activities-structured-water-error"),
      ).toHaveTextContent("Watering recovery storage cannot be verified");
      expect(v2Open).not.toHaveBeenCalled();
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
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage denied");
    });
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0][0].p_action).toBe("note");
  });
});
