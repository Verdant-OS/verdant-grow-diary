import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import type { QuickLogFeedingEventRpcArgs } from "@/lib/writeFeedingTypedEvent";

const owner = vi.hoisted(() => ({ id: "owner-a" }));
const rpc = vi.fn();
const toastSuccess = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
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
      : { data: { ok: true, grow_event_id: "feed-event-a", reused }, error: null };
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
      resolve({ data: { ok: true, grow_event_id: "feed-event-a" }, error: null }),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(storageKey())).not.toBeNull();
    expect(window.sessionStorage.getItem(storageKey("owner-b"))).toBeNull();
    owner.id = "owner-a";
    view.rerender(view.element());
    expect(screen.getByTestId("qlv2-exact-retry-lock")).toBeVisible();
    rpc.mockResolvedValue({
      data: { ok: true, grow_event_id: "feed-event-a", reused: true },
      error: null,
    });
    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeVisible());
    expect(rpc.mock.calls[1][1]).toEqual(original);
  });

  it("keeps confirmed cleanup failure honest and retries cleanup without another RPC", async () => {
    rpc.mockResolvedValue({
      data: { ok: true, grow_event_id: "feed-event-a", reused: false },
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
        data: { ok: true, grow_event_id: "feed-event-a", reused: false },
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
