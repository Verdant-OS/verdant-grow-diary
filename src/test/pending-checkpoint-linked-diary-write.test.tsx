import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  update: vi.fn(),
  select: vi.fn(),
  correct: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: () => ({ data: mock.rows, isLoading: false }),
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ invalidateQueries: mock.invalidate }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ update: mock.update }),
  },
}));
vi.mock("@/lib/quickLogRevisionService", () => ({ correctQuickLogEntry: mock.correct }));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }),
}));
vi.mock("sonner", () => ({ toast: { success: mock.success, error: mock.error } }));

import PendingCheckpointBanner from "@/components/PendingCheckpointBanner";

const checkpointNote = "Observation: clear\nNext checkpoint: Check leaves tomorrow";
const diaryEntryId = "11111111-1111-4111-8111-111111111111";

function showCheckpoint(details: Record<string, unknown>) {
  mock.rows = [
    {
      id: diaryEntryId,
      note: checkpointNote,
      entry_at: "2026-09-27T10:00:00Z",
      details,
    },
  ];
  render(<PendingCheckpointBanner plantId="plant-1" />);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  mock.rows = [];
  mock.invalidate.mockResolvedValue(undefined);
  mock.correct.mockResolvedValue({
    ok: true,
    growEventId: "event-1",
    diaryEntryIds: [diaryEntryId],
  });
  mock.select.mockResolvedValue({ data: [{ id: diaryEntryId }], error: null });
  mock.update.mockReturnValue({ eq: () => ({ select: mock.select }) });
});

afterEach(cleanup);

describe("checkpoint clearing with the linked diary write fence", () => {
  it("corrects a linked Quick Log through its canonical revision RPC", async () => {
    showCheckpoint({ linked_grow_event_id: "event-1" });
    fireEvent.click(screen.getByTestId("pending-checkpoint-banner-done"));
    await waitFor(() => expect(mock.success).toHaveBeenCalledWith("Checkpoint marked done."));
    expect(mock.correct).toHaveBeenCalledWith(
      { diaryEntryId },
      "other",
      { note: `${checkpointNote}\nCheckpoint status: done` },
      "Checkpoint done",
      expect.any(String),
    );
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.invalidate).toHaveBeenCalledWith({ queryKey: ["grow_events"] });
    expect(window.sessionStorage.length).toBe(0);
  });

  it("keeps ordinary diary updates on their existing path", async () => {
    showCheckpoint({});
    fireEvent.click(screen.getByTestId("pending-checkpoint-banner-dismiss"));
    await waitFor(() => expect(mock.success).toHaveBeenCalledWith("Checkpoint dismissed."));
    expect(mock.update).toHaveBeenCalledWith({
      note: `${checkpointNote}\nCheckpoint status: dismissed`,
    });
    expect(mock.correct).not.toHaveBeenCalled();
  });

  it("does not claim success when an ordinary update affects zero rows", async () => {
    mock.select.mockResolvedValue({ data: [], error: null });
    showCheckpoint({});
    fireEvent.click(screen.getByTestId("pending-checkpoint-banner-done"));
    await waitFor(() => expect(mock.error).toHaveBeenCalled());
    expect(mock.success).not.toHaveBeenCalled();
    expect(screen.getByTestId("pending-checkpoint-banner")).toBeTruthy();
  });

  it("does not claim success when the revision RPC rejects a linked row", async () => {
    mock.correct.mockResolvedValue({ ok: false, reason: "not_found_or_not_owned" });
    showCheckpoint({ grow_event_id: "event-legacy" });
    fireEvent.click(screen.getByTestId("pending-checkpoint-banner-done"));
    await waitFor(() => expect(mock.error).toHaveBeenCalled());
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.success).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(0);
  });

  it("does not send a conflicting checkpoint decision after an uncertain correction", async () => {
    mock.correct.mockResolvedValue({ ok: false, reason: "rpc_error" });
    showCheckpoint({ linked_grow_event_id: "event-1" });
    fireEvent.click(screen.getByTestId("pending-checkpoint-banner-done"));
    await waitFor(() => expect(mock.error).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId("pending-checkpoint-banner-dismiss"));
    await waitFor(() => expect(mock.error).toHaveBeenCalledTimes(2));
    expect(mock.correct).toHaveBeenCalledTimes(1);
    expect(mock.success).not.toHaveBeenCalled();
  });

  it("reuses the exact correction key after remount when the first reply was lost", async () => {
    mock.correct.mockResolvedValue({ ok: false, reason: "rpc_error" });
    mock.rows = [
      {
        id: diaryEntryId,
        note: checkpointNote,
        entry_at: "2026-09-27T10:00:00Z",
        details: { linked_grow_event_id: "event-1" },
      },
    ];
    const first = render(<PendingCheckpointBanner plantId="plant-1" />);
    fireEvent.click(screen.getByTestId("pending-checkpoint-banner-done"));
    await waitFor(() => expect(mock.correct).toHaveBeenCalledTimes(1));
    const originalKey = mock.correct.mock.calls[0][4];

    first.unmount();
    render(<PendingCheckpointBanner plantId="plant-1" />);
    fireEvent.click(screen.getByTestId("pending-checkpoint-banner-dismiss"));
    await waitFor(() => expect(mock.error).toHaveBeenCalledTimes(2));
    expect(mock.correct).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("pending-checkpoint-banner-done"));
    await waitFor(() => expect(mock.correct).toHaveBeenCalledTimes(2));
    expect(mock.correct.mock.calls[1][4]).toBe(originalKey);
    expect(mock.success).not.toHaveBeenCalled();
  });

  it("does not send a linked correction when its retry key cannot be preserved", async () => {
    const storageWrite = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    try {
      showCheckpoint({ linked_grow_event_id: "event-1" });
      fireEvent.click(screen.getByTestId("pending-checkpoint-banner-done"));
      await waitFor(() => expect(mock.error).toHaveBeenCalledTimes(1));
      expect(mock.correct).not.toHaveBeenCalled();
      expect(mock.success).not.toHaveBeenCalled();
    } finally {
      storageWrite.mockRestore();
    }
  });
});
