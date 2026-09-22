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

function renderQuickLog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const ui = (
    <QuickLog
      open
      onOpenChange={vi.fn()}
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
