import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import type { QuickLogFeedingEventRpcArgs } from "@/lib/writeFeedingTypedEvent";
import { claimPendingQuickLogNote } from "@/lib/quickLogPendingNoteStore";

const owner = vi.hoisted(() => ({ id: "owner-a" }));
const rpc = vi.fn();
const toastSuccess = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (table: string) => {
      if (table !== "grow_events" && table !== "feeding_events")
        throw new Error(`Unexpected table ${table}`);
      return {
        select: () => ({
          eq: (_column: string, id: string) => ({
            maybeSingle: async () => {
              const args = rpc.mock.calls.at(-1)?.[1] as QuickLogFeedingEventRpcArgs | undefined;
              return {
                data: args
                  ? table === "grow_events"
                    ? {
                        id,
                        event_type: args.p_event_type,
                        source: "manual",
                        is_deleted: false,
                        grow_id: args.p_grow_id,
                        tent_id: args.p_tent_id,
                        plant_id: args.p_plant_id,
                      }
                    : {
                        event_id: id,
                        volume_ml: args.p_feed.volume_ml,
                        line_id: args.p_feed.line_id,
                      }
                  : null,
                error: null,
              };
            },
          }),
        }),
      };
    },
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: owner.id } }) }));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      { id: "plant-a", name: "Plant A", grow_id: "grow-a", tent_id: "tent-a" },
      { id: "plant-b", name: "Plant B", grow_id: "grow-b", tent_id: "tent-b" },
    ],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [
      { id: "tent-a", name: "Tent A", grow_id: "grow-a" },
      { id: "tent-b", name: "Tent B", grow_id: "grow-b" },
    ],
  }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [
      { id: "grow-a", name: "Grow A" },
      { id: "grow-b", name: "Grow B" },
    ],
  }),
}));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));
vi.mock("@/hooks/useRecentWateringsForVolumeDefaults", () => ({
  useRecentWateringsForVolumeDefaults: () => ({ data: [] }),
}));
vi.mock("sonner", () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn(), message: vi.fn() },
}));

function sheet(target = "plant:plant-a") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const onOpenChange = vi.fn();
  const element = (open = true, key = target) => (
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={open} onOpenChange={onOpenChange} defaultTargetKey={key} />
    </QueryClientProvider>
  );
  const view = render(element());
  return { ...view, element, onOpenChange };
}
function fill() {
  fireEvent.click(screen.getByRole("button", { name: /^Feed$/ }));
  fireEvent.change(screen.getByLabelText("Nutrient line"), { target: { value: "veg-week-3" } });
  fireEvent.change(screen.getByLabelText("Product 1 name"), { target: { value: "Base A" } });
  fireEvent.change(screen.getByLabelText("Product 1 amount"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Applied volume (ml)"), { target: { value: "750" } });
}
async function uncertain() {
  fireEvent.click(screen.getByTestId("qlv2-save"));
  await waitFor(() => expect(screen.getByTestId("qlv2-exact-retry-lock")).toBeVisible());
}
const storageKey = (id = "owner-a") => `verdant:quick-log:pending-feeding:v1:${id}`;
function acceptedThenLost() {
  const ledger = new Map<string, QuickLogFeedingEventRpcArgs>();
  rpc.mockImplementation(async (fn: string, args: QuickLogFeedingEventRpcArgs) => {
    expect(fn).toBe("quicklog_save_event");
    const reused = ledger.has(args.p_idempotency_key);
    if (!reused) ledger.set(args.p_idempotency_key, args);
    return rpc.mock.calls.length === 1
      ? { data: null, error: new Error("reply lost after acceptance") }
      : {
          data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000001", reused },
          error: null,
        };
  });
  return ledger;
}
beforeEach(() => {
  owner.id = "owner-a";
  window.sessionStorage.clear();
  rpc.mockReset();
  toastSuccess.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("Feed permanent replay refusal recovery", () => {
  const permanentReasons = [
    "idempotency_key_unverified",
    "idempotency_receipt_missing",
    "idempotency_key_retracted",
    "idempotency_key_conflict",
  ];
  async function refused(reason = "idempotency_key_retracted") {
    rpc.mockResolvedValue({ data: { ok: false, reason }, error: null });
    const view = sheet();
    fill();
    await uncertain();
    return view;
  }
  function assertHistoryReview() {
    expect(screen.getByTestId("qlv2-exact-retry-lock")).toHaveTextContent(
      /Check Timeline in another tab/,
    );
    expect(screen.queryByTestId("qlv2-save-retry")).toBeNull();
    expect(screen.getByTestId("qlv2-save")).toBeDisabled();
    expect(screen.getByLabelText("Product 1 name")).toBeDisabled();
    expect(screen.getByTestId("qlv2-history-review-link")).toHaveAttribute(
      "href",
      expect.stringContaining("grow-a"),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  }

  it.each(permanentReasons)("preserves %s and never offers same-key Retry", async (reason) => {
    await refused(reason);
    assertHistoryReview();
    const pending = JSON.parse(window.sessionStorage.getItem(storageKey())!);
    expect(pending.historyCheckReason).toBe(reason);
    expect(pending.payload.idempotency_key).toBe(rpc.mock.calls[0][1].p_idempotency_key);
    expect(pending.payload).toMatchObject({
      grow_id: "grow-a",
      tent_id: "tent-a",
      plant_id: "plant-a",
      volume_ml: 750,
      products: [{ name: "Base A", amount: 2, unit: "ml_per_l" }],
    });
    fireEvent.click(screen.getByTestId("qlv2-save"));
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("restores the refusal on another target and discards locally only after explicit review", async () => {
    const first = await refused();
    const original = rpc.mock.calls[0][1];
    first.unmount();
    sheet("plant:plant-b");
    assertHistoryReview();
    expect(screen.getByLabelText("Applied volume (ml)")).toHaveValue("750");
    expect(rpc).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "I checked Timeline; discard draft" }));
    expect(window.sessionStorage.getItem(storageKey())).toBeNull();
    expect(screen.queryByTestId("qlv2-exact-retry-lock")).toBeNull();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    rpc.mockResolvedValue({
      data: { ok: true, grow_event_id: "aaaaaaaa-1111-4111-8111-111111111111" },
      error: null,
    });
    fill();
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeVisible());
    expect(rpc.mock.calls[1][1].p_idempotency_key).not.toBe(original.p_idempotency_key);
  });

  it.each(["none", "Note", "Feed"])(
    "resolves refused journals separately when %s clearance is blocked",
    async (blockedDraft) => {
      const first = await refused();
      const originalFeed = rpc.mock.calls[0][1];
      const rawFeed = window.sessionStorage.getItem(storageKey());
      first.unmount();
      expect(
        claimPendingQuickLogNote({
          version: 1,
          ownerId: owner.id,
          createdAt: "2026-09-01T12:00:00.000Z",
          historyCheckReason: "idempotency_key_retracted",
          attachments: { photo: false, video: false },
          payload: {
            p_target_type: "plant",
            p_target_id: "plant-b",
            p_action: "note",
            p_volume_ml: null,
            p_note: "Refused Note for the other grow",
            p_temperature_c: null,
            p_humidity_pct: null,
            p_vpd_kpa: null,
            p_occurred_at: "2026-09-01T12:00:00.000Z",
            p_details: { source: "manual" },
            p_stage: null,
            p_idempotency_key: "refused-note-other-grow-key",
          },
          resolved: {
            ok: true,
            targetType: "plant",
            targetId: "plant-b",
            plantId: "plant-b",
            tentId: "tent-b",
            growId: "grow-b",
          },
        }).status,
      ).toBe("claimed");
      sheet();
      const discard = () =>
        screen.getByRole("button", { name: "I checked Timeline; discard draft" });
      expect(screen.getByTestId("qlv2-history-review-link")).toHaveAttribute(
        "href",
        expect.stringContaining("grow-b"),
      );
      expect(discard()).toBeEnabled();
      const noteKey = `verdant:quick-log:pending-note:v1:${owner.id}`;
      const rawNote = window.sessionStorage.getItem(noteKey);
      const blockClearance = (key: string) => {
        const original = Storage.prototype.removeItem;
        return vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (
          this: Storage,
          removedKey,
        ) {
          if (removedKey === key) throw new Error("Storage temporarily unavailable");
          original.call(this, removedKey);
        });
      };
      if (blockedDraft === "Note") {
        const blocked = blockClearance(noteKey);
        fireEvent.click(discard());
        expect(screen.getByTestId("qlv2-error")).toHaveTextContent(/draft could not be removed/);
        expect(window.sessionStorage.getItem(noteKey)).toBe(rawNote);
        expect(window.sessionStorage.getItem(storageKey())).toBe(rawFeed);
        expect(screen.getByTestId("qlv2-save")).toBeDisabled();
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(toastSuccess).not.toHaveBeenCalled();
        blocked.mockRestore();
      }
      fireEvent.click(discard());
      expect(window.sessionStorage.getItem(noteKey)).toBeNull();
      expect(window.sessionStorage.getItem(storageKey())).toBe(rawFeed);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(toastSuccess).not.toHaveBeenCalled();

      // A deliberate Feed action discovers the remaining exact journal before
      // dispatching any new request, and restores its own original Timeline.
      fill();
      fireEvent.click(screen.getByTestId("qlv2-save"));
      await waitFor(() => assertHistoryReview());
      await waitFor(() => expect(discard()).toBeEnabled());
      expect(window.sessionStorage.getItem(storageKey())).toBe(rawFeed);
      expect(rpc).toHaveBeenCalledTimes(1);
      if (blockedDraft === "Feed") {
        const blocked = blockClearance(storageKey());
        fireEvent.click(discard());
        expect(screen.getByTestId("qlv2-error")).toHaveTextContent(/draft could not be removed/);
        expect(window.sessionStorage.getItem(noteKey)).toBeNull();
        expect(window.sessionStorage.getItem(storageKey())).toBe(rawFeed);
        assertHistoryReview();
        expect(rpc).toHaveBeenCalledTimes(1);
        blocked.mockRestore();
      }
      fireEvent.click(discard());
      expect(window.sessionStorage.getItem(storageKey())).toBeNull();
      expect(screen.queryByTestId("qlv2-exact-retry-lock")).toBeNull();
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(toastSuccess).not.toHaveBeenCalled();

      rpc.mockResolvedValue({
        data: { ok: true, grow_event_id: "aaaaaaaa-4444-4444-8444-444444444444" },
        error: null,
      });
      fill();
      fireEvent.click(screen.getByTestId("qlv2-save"));
      await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeVisible());
      expect(rpc.mock.calls[1][1].p_idempotency_key).not.toBe(originalFeed.p_idempotency_key);
    },
  );

  it("restores an already refused claim discovered at Save without dispatching the newer draft", async () => {
    const first = await refused();
    const raw = window.sessionStorage.getItem(storageKey())!;
    first.unmount();
    window.sessionStorage.removeItem(storageKey());
    sheet("plant:plant-b");
    fill();
    window.sessionStorage.setItem(storageKey(), raw);
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => assertHistoryReview());
    expect(window.sessionStorage.getItem(storageKey())).toBe(raw);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("isolates a refused Feed through owner A to B to A without resubmitting it", async () => {
    const view = await refused();
    const raw = window.sessionStorage.getItem(storageKey());
    owner.id = "owner-b";
    view.rerender(view.element());
    expect(screen.queryByTestId("qlv2-exact-retry-lock")).toBeNull();
    expect(window.sessionStorage.getItem(storageKey("owner-b"))).toBeNull();
    owner.id = "owner-a";
    view.rerender(view.element());
    assertHistoryReview();
    expect(window.sessionStorage.getItem(storageKey())).toBe(raw);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("keeps an unknown server rejection retryable using the exact original key and payload", async () => {
    rpc.mockResolvedValueOnce({ data: { ok: false, reason: "unknown_refusal" }, error: null });
    sheet();
    fill();
    await uncertain();
    const original = rpc.mock.calls[0][1];
    expect(screen.getByTestId("qlv2-save-retry")).toBeEnabled();
    expect(screen.queryByTestId("qlv2-history-review-link")).toBeNull();
    expect(
      JSON.parse(window.sessionStorage.getItem(storageKey())!).historyCheckReason,
    ).toBeUndefined();
    rpc.mockResolvedValue({
      data: { ok: true, grow_event_id: "aaaaaaaa-2222-4222-8222-222222222222" },
      error: null,
    });
    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeVisible());
    expect(rpc.mock.calls[1][1]).toEqual(original);
  });

  it.each(["throws", "silently ignores"])("stays locked when discard %s", async (failure) => {
    await refused();
    assertHistoryReview();
    const raw = window.sessionStorage.getItem(storageKey());
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      if (failure === "throws") throw new Error("storage blocked");
    });
    fireEvent.click(screen.getByRole("button", { name: "I checked Timeline; discard draft" }));
    expect(screen.getByTestId("qlv2-error")).toHaveTextContent(/draft could not be removed/);
    assertHistoryReview();
    expect(window.sessionStorage.getItem(storageKey())).toBe(raw);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("never clears a replacement journal when the grower discards the older refused draft", async () => {
    await refused();
    assertHistoryReview();
    const replacement = JSON.parse(window.sessionStorage.getItem(storageKey())!);
    replacement.payload.idempotency_key = "replacement-feed-save-key";
    const raw = JSON.stringify(replacement);
    window.sessionStorage.setItem(storageKey(), raw);
    fireEvent.click(screen.getByRole("button", { name: "I checked Timeline; discard draft" }));
    expect(window.sessionStorage.getItem(storageKey())).toBe(raw);
    assertHistoryReview();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each(["throws", "silently ignores"])(
    "keeps the mounted refusal locked when marker storage %s",
    async (failure) => {
      const setItem = Storage.prototype.setItem;
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
        this: Storage,
        key,
        value,
      ) {
        if (!JSON.parse(value).historyCheckReason) setItem.call(this, key, value);
        else if (failure === "throws") throw new Error("marker storage blocked");
      });
      await refused();
      assertHistoryReview();
      expect(
        screen.getByRole("button", { name: "I checked Timeline; discard draft" }),
      ).toBeEnabled();
      expect(
        JSON.parse(window.sessionStorage.getItem(storageKey())!).historyCheckReason,
      ).toBeUndefined();
      fireEvent.click(screen.getByTestId("qlv2-save"));
      expect(rpc).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "I checked Timeline; discard draft" }));
      expect(window.sessionStorage.getItem(storageKey())).toBeNull();
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );
});

describe("Feed exact recovery through the actual typed writer", () => {
  it("restores after remount on another plant and reuses one accepted RPC record", async () => {
    const ledger = acceptedThenLost();
    const first = sheet();
    fill();
    await uncertain();
    const original = rpc.mock.calls[0][1];
    expect(window.sessionStorage.getItem(storageKey())).not.toBeNull();
    first.unmount();
    sheet("plant:plant-b");
    expect(screen.getByLabelText("Nutrient line")).toHaveValue("veg-week-3");
    expect(screen.getByLabelText("Applied volume (ml)")).toHaveValue("750");
    expect(screen.getByLabelText("Product 1 name")).toBeDisabled();
    expect(screen.getByTestId("qlv2-exact-retry-lock")).toBeVisible();
    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeVisible());
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toEqual(original);
    expect(original).toMatchObject({
      p_grow_id: "grow-a",
      p_tent_id: "tent-a",
      p_plant_id: "plant-a",
      p_event_type: "feeding",
      p_feed: { volume_ml: 750, products: [{ name: "Base A", amount: 2, unit: "ml_per_l" }] },
    });
    expect(Number.isFinite(Date.parse(original.p_occurred_at))).toBe(true);
    expect(ledger.size).toBe(1);
    expect(window.sessionStorage.getItem(storageKey())).toBeNull();
  });

  it("keeps a same-mount close/reopen and changed parent target on the original feeding", async () => {
    acceptedThenLost();
    const view = sheet();
    fill();
    await uncertain();
    const original = rpc.mock.calls[0][1];
    view.rerender(view.element(false));
    view.rerender(view.element(true, "plant:plant-b"));
    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeVisible());
    expect(rpc.mock.calls[1][1]).toEqual(original);
  });

  it("restores an earlier claim discovered at Save without dispatching the newer draft", async () => {
    const ledger = acceptedThenLost();
    const first = sheet();
    fill();
    await uncertain();
    const original = rpc.mock.calls[0][1];
    const pending = window.sessionStorage.getItem(storageKey())!;
    first.unmount();
    window.sessionStorage.removeItem(storageKey());
    sheet("plant:plant-b");
    fill();
    fireEvent.change(screen.getByLabelText("Applied volume (ml)"), {
      target: { value: "900" },
    });
    // Another mounted surface claimed the original save after this form opened.
    window.sessionStorage.setItem(storageKey(), pending);
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => expect(screen.getByTestId("qlv2-exact-retry-lock")).toBeVisible());
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Applied volume (ml)")).toHaveValue("750");
    expect(window.sessionStorage.getItem(storageKey())).toBe(pending);
    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeVisible());
    expect(rpc.mock.calls[1][1]).toEqual(original);
    expect(ledger.size).toBe(1);
  });

  it("blocks dispatch when recovery storage cannot be written", async () => {
    sheet();
    fill();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-error")).toHaveTextContent(/recovery storage.*unavailable/i),
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nutrient line")).toBeEnabled();
  });

  it("does not replace a corrupt pending record or send a new Feed", async () => {
    window.sessionStorage.setItem(storageKey(), "invalid-json");
    sheet();
    fill();
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-error")).toHaveTextContent(/recovery storage.*unavailable/i),
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(storageKey())).toBe("invalid-json");
  });

  it("isolates A to B to A recovery and ignores a late owner-A receipt", async () => {
    let resolve!: (value: unknown) => void;
    rpc.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const view = sheet();
    fill();
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const original = rpc.mock.calls[0][1];
    owner.id = "owner-b";
    view.rerender(view.element());
    expect(screen.queryByTestId("qlv2-exact-retry-lock")).toBeNull();
    await act(async () =>
      resolve({
        data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000001" },
        error: null,
      }),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(storageKey())).not.toBeNull();
    expect(window.sessionStorage.getItem(storageKey("owner-b"))).toBeNull();
    owner.id = "owner-a";
    view.rerender(view.element());
    expect(screen.getByTestId("qlv2-exact-retry-lock")).toBeVisible();
    rpc.mockResolvedValue({
      data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000001", reused: true },
      error: null,
    });
    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeVisible());
    expect(rpc.mock.calls[1][1]).toEqual(original);
  });

  it("keeps confirmed cleanup failure honest and retries cleanup without another RPC", async () => {
    rpc.mockResolvedValue({
      data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000001", reused: false },
      error: null,
    });
    sheet();
    fill();
    const removal = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeVisible());
    expect(screen.getByTestId("quick-log-post-save-another")).toBeDisabled();
    expect(screen.getByTestId("qlv2-error")).toHaveTextContent(/Feeding is saved/);
    removal.mockRestore();
    fireEvent.click(screen.getByTestId("qlv2-note-storage-recheck"));
    await waitFor(() => expect(screen.getByTestId("quick-log-post-save-another")).toBeEnabled());
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(storageKey())).toBeNull();
  });

  it("never clears a different pending save when the original confirmation arrives", async () => {
    let resolve!: (value: unknown) => void;
    rpc.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    sheet();
    fill();
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const replacement = JSON.parse(window.sessionStorage.getItem(storageKey())!);
    replacement.payload.idempotency_key = "different-pending-feed";
    const raw = JSON.stringify(replacement);
    window.sessionStorage.setItem(storageKey(), raw);
    await act(async () =>
      resolve({
        data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000001", reused: false },
        error: null,
      }),
    );
    expect(screen.getByTestId("qlv2-post-save")).toBeVisible();
    expect(screen.getByTestId("qlv2-error")).toHaveTextContent(/Feeding is saved/);
    fireEvent.click(screen.getByTestId("qlv2-note-storage-recheck"));
    expect(screen.getByTestId("quick-log-post-save-another")).toBeDisabled();
    expect(window.sessionStorage.getItem(storageKey())).toBe(raw);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

it("keeps a malformed receipt unresolved across a target-changing remount and retries exactly", async () => {
  rpc
    .mockResolvedValueOnce({ data: { ok: true, grow_event_id: "not-an-event" }, error: null })
    .mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000001", reused: true },
      error: null,
    });
  const first = sheet();
  fill();
  await uncertain();
  const original = rpc.mock.calls[0][1];
  expect(toastSuccess).not.toHaveBeenCalled();
  expect(window.sessionStorage.getItem(storageKey())).not.toBeNull();
  first.unmount();
  sheet("plant:plant-b");
  fireEvent.click(screen.getByTestId("qlv2-save-retry"));
  await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeVisible());
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(rpc.mock.calls[1][1]).toEqual(original);
  expect(original).toMatchObject({ p_plant_id: "plant-a", p_grow_id: "grow-a" });
  expect(window.sessionStorage.getItem(storageKey())).toBeNull();
});
