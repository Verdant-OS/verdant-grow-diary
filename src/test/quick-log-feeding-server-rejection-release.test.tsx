/**
 * A Feed save the server explicitly rejects during validation
 * (`{ ok: false, reason: "invalid_typed_payload" }`) lets a first attempt be
 * corrected. A later rejection after an ambiguous earlier attempt cannot
 * disprove that earlier commit because validation precedes idempotency lookup,
 * so that draft keeps its key and goes to Timeline review with an explicit
 * discard instead of an endlessly refused same-key Retry (BUG-002).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import type { QuickLogFeedingEventRpcArgs } from "@/lib/writeFeedingTypedEvent";
import { FEEDING_REJECTED_HISTORY_REVIEW } from "@/lib/quickLogFeedingRejectionRules";
import { QUICK_LOG_HISTORY_DISCARD_LABEL } from "@/lib/quickLogSaveErrorMessage";

const owner = vi.hoisted(() => ({ id: "owner-a" }));
const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: owner.id } }) }));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-a", name: "Plant A", grow_id: "grow-a", tent_id: "tent-a" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-a", name: "Tent A", grow_id: "grow-a" }] }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-a", name: "Grow A" }] }),
}));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));
vi.mock("@/hooks/useRecentWateringsForVolumeDefaults", () => ({
  useRecentWateringsForVolumeDefaults: () => ({ data: [] }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

const storageKey = `verdant:quick-log:pending-feeding:v1:owner-a`;
const historyStorageKey = `verdant:quick-log:pending-feeding-history:v1:owner-a`;

function sheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open onOpenChange={vi.fn()} defaultTargetKey="plant:plant-a" />
    </QueryClientProvider>,
  );
}

function fill(ph: string) {
  fireEvent.click(screen.getByRole("button", { name: /^Feed$/ }));
  fireEvent.change(screen.getByLabelText("Nutrient line"), { target: { value: "QA-line" } });
  fireEvent.change(screen.getByLabelText("Product 1 name"), {
    target: { value: "QA Product A" },
  });
  fireEvent.change(screen.getByLabelText("Product 1 amount"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Applied volume (ml)"), { target: { value: "750" } });
  fireEvent.change(screen.getByLabelText("pH"), { target: { value: ph } });
}

/** Leave a pending Feed in sessionStorage exactly as a pre-fix build would have. */
async function seedPendingFeedWithPh(ph: number) {
  rpc.mockResolvedValueOnce({ data: null, error: new Error("reply lost") });
  const first = sheet();
  fill("6.2");
  fireEvent.click(screen.getByTestId("qlv2-save"));
  await waitFor(() => expect(screen.getByTestId("qlv2-exact-retry-lock")).toBeVisible());
  const stored = JSON.parse(window.sessionStorage.getItem(storageKey)!);
  stored.payload.ph = ph;
  window.sessionStorage.setItem(storageKey, JSON.stringify(stored));
  first.unmount();
  rpc.mockReset();
  return stored.payload.idempotency_key as string;
}

beforeEach(() => {
  owner.id = "owner-a";
  window.sessionStorage.clear();
  rpc.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("Feed save rejected by server validation", () => {
  it("names an out-of-range pH before any RPC and keeps the form editable", async () => {
    sheet();
    fill("15");
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-error")).toHaveTextContent(
        "Feed pH must be between 0 and 14.",
      ),
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.queryByTestId("qlv2-exact-retry-lock")).toBeNull();
    expect(screen.getByLabelText("pH")).not.toBeDisabled();
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  });

  it("releases a first invalid-payload Feed for correction with a new key", async () => {
    rpc.mockResolvedValueOnce({
      data: { ok: false, reason: "invalid_typed_payload" },
      error: null,
    });
    sheet();
    fill("6.2");
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-error")).toHaveTextContent(
        "Verdant did not save this feeding because a value is outside the accepted range.",
      ),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect((rpc.mock.calls[0][1] as QuickLogFeedingEventRpcArgs).p_feed).toMatchObject({ ph: 6.2 });
    expect(screen.queryByTestId("qlv2-exact-retry-lock")).toBeNull();
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
    const phInput = screen.getByLabelText("pH");
    expect(phInput).not.toBeDisabled();
    expect(phInput).toHaveValue("6.2");
    const rejectedKey = (rpc.mock.calls[0][1] as QuickLogFeedingEventRpcArgs).p_idempotency_key;

    // Correct the value: the new save is a new logical submission.
    rpc.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "0f0c5a0e-7b5c-4b3a-9d55-0d3c4b1e2a11", reused: false },
      error: null,
    });
    fireEvent.change(phInput, { target: { value: "6.4" } });
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeVisible());
    expect(rpc).toHaveBeenCalledTimes(2);
    const corrected = rpc.mock.calls[1][1] as QuickLogFeedingEventRpcArgs;
    expect(corrected.p_feed).toMatchObject({ ph: 6.4 });
    expect(corrected.p_idempotency_key).not.toBe(rejectedKey);
  });

  it("routes a restored Feed rejected as invalid to Timeline review, discard, and a new key", async () => {
    const pendingKey = await seedPendingFeedWithPh(15);
    rpc.mockResolvedValueOnce({
      data: { ok: false, reason: "invalid_typed_payload" },
      error: null,
    });
    sheet();
    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-error")).toHaveTextContent(FEEDING_REJECTED_HISTORY_REVIEW),
    );
    // The original key stays attached: no new key is minted on the restored path.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect((rpc.mock.calls[0][1] as QuickLogFeedingEventRpcArgs).p_idempotency_key).toBe(
      pendingKey,
    );
    expect(screen.getByTestId("qlv2-exact-retry-lock")).toBeVisible();
    expect(screen.getByTestId("qlv2-history-review-link")).toBeVisible();
    expect(screen.queryByTestId("qlv2-save-retry")).toBeNull();
    const stored = JSON.parse(window.sessionStorage.getItem(storageKey)!);
    expect(stored.payload.idempotency_key).toBe(pendingKey);
    expect(stored.historyCheckReason).toBe("rpc:invalid_typed_payload");

    // Discard clears only the local draft and makes no second server call.
    fireEvent.click(screen.getByRole("button", { name: QUICK_LOG_HISTORY_DISCARD_LABEL }));
    await waitFor(() => expect(window.sessionStorage.getItem(storageKey)).toBeNull());
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("qlv2-exact-retry-lock")).toBeNull();

    // A corrected Feed is a new logical submission with a new key.
    rpc.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "0f0c5a0e-7b5c-4b3a-9d55-0d3c4b1e2a11", reused: false },
      error: null,
    });
    fill("6.4");
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeVisible());
    expect(rpc).toHaveBeenCalledTimes(2);
    const corrected = rpc.mock.calls[1][1] as QuickLogFeedingEventRpcArgs;
    expect(corrected.p_feed).toMatchObject({ ph: 6.4 });
    expect(corrected.p_idempotency_key).not.toBe(pendingKey);
  });

  it("restores a Feed already marked for review after reload with Discard, not Retry", async () => {
    const pendingKey = await seedPendingFeedWithPh(15);
    rpc.mockResolvedValueOnce({
      data: { ok: false, reason: "invalid_typed_payload" },
      error: null,
    });
    const second = sheet();
    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() => expect(screen.getByTestId("qlv2-history-review-link")).toBeVisible());
    second.unmount();

    sheet();
    expect(screen.getByTestId("qlv2-error")).toHaveTextContent(FEEDING_REJECTED_HISTORY_REVIEW);
    expect(screen.getByTestId("qlv2-history-review-link")).toBeVisible();
    expect(screen.getByRole("button", { name: QUICK_LOG_HISTORY_DISCARD_LABEL })).toBeVisible();
    expect(screen.queryByTestId("qlv2-save-retry")).toBeNull();
    expect(JSON.parse(window.sessionStorage.getItem(storageKey)!).payload.idempotency_key).toBe(
      pendingKey,
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("restores review after reload when only the full marked record could not be stored", async () => {
    const pendingKey = await seedPendingFeedWithPh(15);
    rpc.mockResolvedValueOnce({
      data: { ok: false, reason: "invalid_typed_payload" },
      error: null,
    });
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      name: string,
      value: string,
    ) {
      if (name === storageKey && value.includes("historyCheckReason"))
        throw new Error("QuotaExceededError");
      setItem.call(this, name, value);
    });
    const second = sheet();
    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() => expect(screen.getByTestId("qlv2-history-review-link")).toBeVisible());
    second.unmount();
    vi.restoreAllMocks();
    expect(
      JSON.parse(window.sessionStorage.getItem(storageKey)!).historyCheckReason,
    ).toBeUndefined();

    sheet();
    expect(screen.getByTestId("qlv2-error")).toHaveTextContent(FEEDING_REJECTED_HISTORY_REVIEW);
    expect(screen.getByTestId("qlv2-history-review-link")).toBeVisible();
    expect(screen.queryByTestId("qlv2-save-retry")).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.sessionStorage.getItem(storageKey)!).payload.idempotency_key).toBe(
      pendingKey,
    );
    fireEvent.click(screen.getByRole("button", { name: QUICK_LOG_HISTORY_DISCARD_LABEL }));
    await waitFor(() => expect(window.sessionStorage.getItem(storageKey)).toBeNull());
    expect(window.sessionStorage.getItem(historyStorageKey)).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("keeps the exact-retry lock for rejections that are not definitive", async () => {
    await seedPendingFeedWithPh(6.2);
    rpc.mockResolvedValueOnce({
      data: { ok: false, reason: "idempotency_key_conflict" },
      error: null,
    });
    sheet();
    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("qlv2-exact-retry-lock")).toBeVisible());
    expect(screen.getByLabelText("pH")).toBeDisabled();
    expect(window.sessionStorage.getItem(storageKey)).not.toBeNull();
  });
});
