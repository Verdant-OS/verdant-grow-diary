/**
 * Legacy QuickLog dialog — failed-save idempotency retry contract.
 *
 * PlantQuickLog routes through resolveQuickLogSaveKey (tested in
 * quick-log-save-key-policy.test.ts). The legacy QuickLog dialog still
 * carries inline signature comparison on lastFailedSaveSigRef — these tests
 * pin that behavior so a refactor cannot silently diverge from the shared
 * policy without review.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
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

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

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
  useTents: () => ({ data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }] }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  },
}));

Element.prototype.scrollIntoView ??= () => undefined;

function renderQuickLog(onOpenChange = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const ui = (
    <QuickLog
      open
      onOpenChange={onOpenChange}
      prefill={{ plantId: "plant-1", growId: "grow-1", eventType: "observation" }}
    />
  );
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function payloadKey(callIndex: number): string {
  const payload = saveMock.mock.calls[callIndex]?.[0] as { p_idempotency_key?: string };
  expect(typeof payload?.p_idempotency_key).toBe("string");
  return payload.p_idempotency_key as string;
}

async function typeNote(text: string) {
  const dialog = screen.getByRole("dialog");
  fireEvent.change(dialog.querySelector("textarea") as HTMLTextAreaElement, {
    target: { value: text },
  });
}

async function clickSave() {
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: /save log/i }));
}

beforeEach(() => {
  saveMock.mockReset();
});

afterEach(cleanup);

describe("QuickLog legacy failed-save idempotency", () => {
  it.each([
    "idempotency_key_unverified",
    "idempotency_receipt_missing",
    "idempotency_key_retracted",
    "idempotency_key_conflict",
  ])("does not rotate or resubmit a history-review draft after %s", async (reason) => {
    saveMock.mockResolvedValue({ ok: false, reason });
    renderQuickLog();
    await typeNote("Possibly saved original.");
    await clickSave();
    await screen.findByTestId("quick-log-save-error");
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
    expect(screen.queryByText("Saving…")).not.toBeInTheDocument();
    await typeNote("Edited duplicate attempt.");
    await clickSave();
    expect(screen.getByRole("dialog").querySelector("textarea")).toHaveValue(
      "Possibly saved original.",
    );
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it("requires explicit history review to discard the draft before starting a fresh key", async () => {
    saveMock
      .mockResolvedValueOnce({ ok: false, reason: "idempotency_key_unverified" })
      .mockResolvedValueOnce({ ok: true, growEventId: "event-after-review" });
    renderQuickLog();
    await typeNote("Possibly saved original.");
    await clickSave();
    await screen.findByTestId("quick-log-save-error");
    const refusedKey = payloadKey(0);
    fireEvent.click(screen.getByRole("button", { name: "I checked Timeline; discard draft" }));
    expect(screen.getByRole("dialog").querySelector("textarea")).toHaveValue("");
    expect(saveMock).toHaveBeenCalledTimes(1);
    await typeNote("Deliberately new entry after review.");
    await clickSave();
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(payloadKey(1)).not.toBe(refusedKey);
  });

  it("cannot abandon an unreviewed historical refusal by pressing Escape", async () => {
    saveMock.mockResolvedValue({ ok: false, reason: "idempotency_receipt_missing" });
    const onOpenChange = vi.fn();
    renderQuickLog(onOpenChange);
    await typeNote("Possibly saved original.");
    await clickSave();
    await screen.findByTestId("quick-log-save-error");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it("reuses the idempotency key on an unedited retry after save_failed", async () => {
    saveMock
      .mockResolvedValueOnce({ ok: false, reason: "save_failed" })
      .mockResolvedValueOnce({ ok: true, growEventId: "event-1" });

    renderQuickLog();
    await typeNote("Leaf tips curling slightly.");
    await clickSave();
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));

    const firstKey = payloadKey(0);

    await clickSave();
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(payloadKey(1)).toBe(firstKey);
  });

  it("rotates the idempotency key when the grower edits the note before retrying", async () => {
    saveMock
      .mockResolvedValueOnce({ ok: false, reason: "save_failed" })
      .mockResolvedValueOnce({ ok: true, growEventId: "event-2" });

    renderQuickLog();
    await typeNote("Dry canopy.");
    await clickSave();
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const failedKey = payloadKey(0);

    await typeNote("Dry canopy with slight curl.");
    await clickSave();
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(payloadKey(1)).not.toBe(failedKey);
  });

  it("does not treat a re-stamped occurred_at as an edit on pure retry", async () => {
    saveMock.mockImplementation(async (payload: { p_occurred_at?: string }) => {
      payload.p_occurred_at = new Date().toISOString();
      return { ok: false, reason: "save_failed" };
    });

    renderQuickLog();
    await typeNote("Stable note across retries.");
    await clickSave();
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const firstKey = payloadKey(0);

    await clickSave();
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(payloadKey(1)).toBe(firstKey);
  });

  it("mints a fresh key for the next submission after a confirmed save", async () => {
    saveMock
      .mockResolvedValueOnce({ ok: true, growEventId: "event-3" })
      .mockResolvedValueOnce({ ok: true, growEventId: "event-4" });

    renderQuickLog();
    await typeNote("First confirmed save.");
    await clickSave();
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const firstSaveKey = payloadKey(0);

    await screen.findByTestId("quick-log-post-save");
    fireEvent.click(screen.getByTestId("quick-log-post-save-another"));

    await typeNote("Second confirmed save.");
    await clickSave();
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(payloadKey(1)).not.toBe(firstSaveKey);
  });
});
