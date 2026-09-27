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
vi.mock("sonner", () => ({ toast: { success: mock.success, error: mock.error } }));

import PendingCheckpointBanner from "@/components/PendingCheckpointBanner";

const checkpointNote = "Observation: clear\nNext checkpoint: Check leaves tomorrow";

function showCheckpoint(details: Record<string, unknown>) {
  mock.rows = [
    {
      id: "entry-1",
      note: checkpointNote,
      entry_at: "2026-09-27T10:00:00Z",
      details,
    },
  ];
  render(<PendingCheckpointBanner plantId="plant-1" />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.rows = [];
  mock.invalidate.mockResolvedValue(undefined);
  mock.correct.mockResolvedValue({
    ok: true,
    growEventId: "event-1",
    diaryEntryIds: ["entry-1"],
  });
  mock.select.mockResolvedValue({ data: [{ id: "entry-1" }], error: null });
  mock.update.mockReturnValue({ eq: () => ({ select: mock.select }) });
});

afterEach(cleanup);

describe("checkpoint clearing with the linked diary write fence", () => {
  it("corrects a linked Quick Log through its canonical revision RPC", async () => {
    showCheckpoint({ linked_grow_event_id: "event-1" });
    fireEvent.click(screen.getByTestId("pending-checkpoint-banner-done"));
    await waitFor(() => expect(mock.success).toHaveBeenCalledWith("Checkpoint marked done."));
    expect(mock.correct).toHaveBeenCalledWith(
      { diaryEntryId: "entry-1" },
      "other",
      { note: `${checkpointNote}\nCheckpoint status: done` },
      "Checkpoint done",
      expect.any(String),
    );
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.invalidate).toHaveBeenCalledWith({ queryKey: ["grow_events"] });
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
  });
});
