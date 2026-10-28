/**
 * Legacy QuickLog dialog — history-review refusals survive a reload/remount.
 *
 * Before this fence existed the review lock lived only in React state. A
 * refresh remounted the dialog unlocked with a fresh idempotency key, so the
 * grower could re-enter the same log and save it as a new record without
 * checking Timeline. Only the explicit discard may release the stored fence.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import QuickLog from "@/components/QuickLog";

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
    from: () => ({
      insert: vi.fn(),
      update: () => ({ eq: vi.fn() }),
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
  },
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "66666666-6666-4666-8666-666666666666", name: "Test Grow", stage: "veg" }],
    activeGrow: { id: "66666666-6666-4666-8666-666666666666", name: "Test Grow", stage: "veg" },
    activeGrowId: "66666666-6666-4666-8666-666666666666",
    setActiveGrowId: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Test Plant",
        tent_id: "55555555-5555-4555-8555-555555555555",
        grow_id: "66666666-6666-4666-8666-666666666666",
      },
    ],
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        name: "Tent 1",
        grow_id: "66666666-6666-4666-8666-666666666666",
      },
    ],
  }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));

Element.prototype.scrollIntoView ??= () => undefined;

const plantId = "33333333-3333-4333-8333-333333333333";
const growId = "66666666-6666-4666-8666-666666666666";
const movedGrowId = "66666666-6666-4666-8666-6666666666bb";
const movedPlantId = "33333333-3333-4333-8333-3333333333bb";
const movedTentId = "55555555-5555-4555-8555-5555555555bb";
const fenceKey = "verdant:quick-log:legacy-history-fence:v1:user-1";
const discardName = "I checked Timeline; discard draft";

function renderQuickLog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickLog
        open
        onOpenChange={vi.fn()}
        prefill={{ plantId, growId, eventType: "observation" }}
      />
    </QueryClientProvider>,
  );
}

function typeNote(text: string) {
  fireEvent.change(screen.getByRole("dialog").querySelector("textarea") as HTMLTextAreaElement, {
    target: { value: text },
  });
}

function clickSave() {
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /save log/i }));
}

async function refuseThenReload(response: Record<string, unknown>) {
  saveMock.mockResolvedValueOnce(response);
  const first = renderQuickLog();
  typeNote("Possibly saved original.");
  clickSave();
  await screen.findByRole("button", { name: discardName });
  first.unmount();
  renderQuickLog();
}

beforeEach(() => {
  saveMock.mockReset();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("legacy QuickLog history-review fence across reload", () => {
  it.each([
    "idempotency_key_unverified",
    "idempotency_receipt_missing",
    "idempotency_key_retracted",
    "idempotency_key_conflict",
  ])("stays locked after a reload following %s and sends no new save", async (reason) => {
    await refuseThenReload({ ok: false, reason });
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
    expect(screen.getByRole("button", { name: discardName })).toBeEnabled();
    const link = screen.getByRole("link", { name: "Open Timeline in a new tab" });
    expect(link.getAttribute("href")).toContain(`plantId=${plantId}`);
    typeNote("Re-entered duplicate after reload.");
    clickSave();
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the moved receipt's verified destination for review after a reload", async () => {
    await refuseThenReload({
      ok: false,
      reason: "receipt_target_moved",
      persistedGrowId: movedGrowId,
      persistedTentId: movedTentId,
      persistedPlantId: movedPlantId,
    });
    const href = screen
      .getByRole("link", { name: "Open Timeline in a new tab" })
      .getAttribute("href")!;
    expect(href).toContain(movedGrowId);
    expect(href).toContain(`plantId=${movedPlantId}`);
    expect(href).not.toContain(plantId);
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
  });

  it("releases the stored fence only through the explicit discard, then saves with a fresh key", async () => {
    await refuseThenReload({ ok: false, reason: "idempotency_key_unverified" });
    const refusedKey = (saveMock.mock.calls[0]?.[0] as { p_idempotency_key: string })
      .p_idempotency_key;
    fireEvent.click(screen.getByRole("button", { name: discardName }));
    expect(window.sessionStorage.getItem(fenceKey)).toBeNull();
    expect(screen.queryByRole("button", { name: discardName })).toBeNull();
    saveMock.mockResolvedValueOnce({ ok: true, growEventId: "event-after-review" });
    typeNote("Deliberately new entry after review.");
    clickSave();
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    const nextKey = (saveMock.mock.calls[1]?.[0] as { p_idempotency_key: string })
      .p_idempotency_key;
    expect(nextKey).not.toBe(refusedKey);
  });

  it("keeps the lock when the stored fence cannot be cleared", async () => {
    await refuseThenReload({ ok: false, reason: "idempotency_key_conflict" });
    const remove = Storage.prototype.removeItem;
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (this === window.sessionStorage && key === fenceKey) throw new Error("unavailable");
      remove.call(this, key);
    });
    fireEvent.click(screen.getByRole("button", { name: discardName }));
    await screen.findByText(/This draft could not be removed from this tab/i);
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
    expect(window.sessionStorage.getItem(fenceKey)).not.toBeNull();
  });

  it("fails closed on an unreadable stored fence until the grower discards it", () => {
    window.sessionStorage.setItem(fenceKey, "{not json");
    renderQuickLog();
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Open Timeline in a new tab" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: discardName }));
    expect(window.sessionStorage.getItem(fenceKey)).toBeNull();
    expect(screen.queryByRole("button", { name: discardName })).toBeNull();
    expect(saveMock).not.toHaveBeenCalled();
  });
});
