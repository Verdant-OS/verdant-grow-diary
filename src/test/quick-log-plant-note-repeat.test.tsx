/**
 * PlantQuickLog blocks the same plain note on the same plant for 10 minutes,
 * like the other Quick Logs. The block reads saved diary rows, so it holds on
 * a fresh mount and for a note another device saved. A failed or uncertain
 * save never blocks its own retry. A photo with the same caption is covered by
 * plant-quick-log-photo-source-picker.integration.test.tsx.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PlantQuickLog from "@/components/PlantQuickLog";
import { QUICK_LOG_NOTE_ALREADY_SAVED_COPY } from "@/lib/quickLogNoteSaveRules";

const saveMock = vi.fn();
const diary = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  reads: 0,
}));

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: saveMock, saving: false, error: null }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/hooks/usePlantManualSensorHistory", () => ({
  usePlantManualSensorLogs: () => ({ data: [] }),
}));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => ({ preference: "celsius" }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ data: { path: "p" }, error: null }),
        remove: vi.fn().mockResolvedValue({}),
      }),
    },
    from: () => {
      const chain = {
        select: () => chain,
        is: () => chain,
        order: () => {
          diary.reads += 1;
          return Promise.resolve({ data: [...diary.rows], error: null });
        },
        update: () => ({ filter: vi.fn().mockResolvedValue({ error: null }) }),
      };
      return chain;
    },
  },
}));

function savedRow(note: string, details: Record<string, unknown> = {}) {
  const at = new Date().toISOString();
  return { plant_id: "plant-1", note, entry_at: at, created_at: at, details };
}

async function renderSheet() {
  const readsBefore = diary.reads;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <PlantQuickLog
        open
        onOpenChange={() => undefined}
        plantId="plant-1"
        plantName="Test Plant"
        growId="grow-1"
        tentId="tent-1"
      />
    </QueryClientProvider>,
  );
  // Let the saved-rows read land before the grower saves.
  await waitFor(() => expect(diary.reads).toBeGreaterThan(readsBefore));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { view, client };
}

function typeAndSave(note: string) {
  fireEvent.change(screen.getByTestId("plant-quick-log-note"), { target: { value: note } });
  fireEvent.click(screen.getByTestId("plant-quick-log-save"));
}

beforeEach(() => {
  diary.rows = [];
  diary.reads = 0;
  saveMock.mockReset();
  saveMock.mockImplementation(async (payload: { p_note?: string }) => {
    diary.rows = [savedRow(String(payload.p_note ?? "")), ...diary.rows];
    return { ok: true, growEventId: "event-1" };
  });
  Element.prototype.scrollIntoView ??= () => undefined;
});

describe("PlantQuickLog note repeat block", () => {
  it("blocks the same note after a confirmed save on a fresh mount", async () => {
    const first = await renderSheet();
    typeAndSave("leaf tips yellowing");
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    first.view.unmount();

    await renderSheet();
    typeAndSave("leaf tips yellowing");
    expect(await screen.findByText(QUICK_LOG_NOTE_ALREADY_SAVED_COPY)).toBeTruthy();
    expect(saveMock).toHaveBeenCalledTimes(1);

    typeAndSave("new growth looks even");
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
  });

  it("blocks a note another device saved in the last 10 minutes", async () => {
    diary.rows = [savedRow("leaf tips yellowing", { quick_log_activity: "note" })];
    await renderSheet();
    typeAndSave("leaf tips yellowing");
    expect(await screen.findByText(QUICK_LOG_NOTE_ALREADY_SAVED_COPY)).toBeTruthy();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("allows the same note again after the save failed", async () => {
    saveMock.mockResolvedValueOnce({ ok: false, reason: "save_failed", definitiveRejected: true });
    await renderSheet();
    typeAndSave("leaf tips yellowing");
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    typeAndSave("leaf tips yellowing");
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
  });

  it("never blocks the retry of an uncertain save that did reach the diary", async () => {
    saveMock.mockImplementationOnce(async (payload: { p_note?: string }) => {
      // The row was written, but the response was lost.
      diary.rows = [savedRow(String(payload.p_note ?? "")), ...diary.rows];
      return { ok: false, reason: "network", definitiveRejected: false };
    });
    const { client } = await renderSheet();
    typeAndSave("leaf tips yellowing");
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    // The saved row reaches this sheet's diary read before the retry.
    const readsBefore = diary.reads;
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["diary_entries"] });
    });
    await waitFor(() => expect(diary.reads).toBeGreaterThan(readsBefore));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    const keys = saveMock.mock.calls.map(
      (call) => (call[0] as { p_idempotency_key?: string }).p_idempotency_key,
    );
    expect(keys[1]).toBe(keys[0]);
  });
});
