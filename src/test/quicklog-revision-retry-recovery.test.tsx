import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  owner: "owner-a" as string | null,
  success: vi.fn(),
  error: vi.fn(),
  plants: [{ id: "plant-a", name: "Plant A" }],
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: mocks.owner ? { id: mocks.owner } : null }),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: async () => ({ data: mocks.plants, error: null }),
      };
      return query;
    },
  },
}));

import QuickLogEntryIntegrityControls from "@/components/QuickLogEntryIntegrityControls";

const receipt = {
  data: {
    ok: true,
    revision_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    revision_no: 1,
    grow_event_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    diary_entry_ids: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
  },
  error: null,
};
const uncertain = { data: null, error: { code: "", message: "Failed to fetch" } };

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const changed = vi.fn();
  const props = {
    handle: { growEventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    currentNote: "Original",
    currentPlantId: "plant-a",
    onChanged: changed,
  };
  const ui = () => (
    <QueryClientProvider client={client}>
      <QuickLogEntryIntegrityControls {...props} />
    </QueryClientProvider>
  );
  const result = render(ui());
  return { ...result, changed, refresh: () => result.rerender(ui()) };
}

function correction() {
  fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
  fireEvent.click(screen.getByTestId("quicklog-correct-reason-typo"));
  fireEvent.change(screen.getByTestId("quicklog-correct-note-input"), {
    target: { value: "Corrected" },
  });
  fireEvent.click(screen.getByTestId("quicklog-correct-save"));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockReset();
  mocks.owner = "owner-a";
  mocks.plants = [{ id: "plant-a", name: "Plant A" }];
});
afterEach(cleanup);

describe("revision confirmation recovery", () => {
  it("does not reuse the previous owner's cached correction targets", async () => {
    const view = mount();
    fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
    await screen.findByRole("option", { name: "Plant A" });
    mocks.owner = "owner-b";
    mocks.plants = [{ id: "plant-b", name: "Plant B" }];
    view.refresh();
    fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
    await screen.findByRole("option", { name: "Plant B" });
    expect(screen.queryByRole("option", { name: "Plant A" })).not.toBeInTheDocument();
  });
  it("retries a correction with the exact operation key and refreshes only after a receipt", async () => {
    mocks.rpc.mockResolvedValueOnce(uncertain).mockResolvedValueOnce(receipt);
    const view = mount();
    correction();
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.error.mock.calls[0][0]).toMatch(/could not confirm/i);
    expect(view.changed).not.toHaveBeenCalled();
    expect(screen.getByTestId("quicklog-correct-note-input")).toBeDisabled();
    const first = mocks.rpc.mock.calls[0][1];
    expect(first.p_idempotency_key).toEqual(expect.any(String));
    fireEvent.click(screen.getByTestId("quicklog-correct-save"));
    await waitFor(() => expect(view.changed).toHaveBeenCalledOnce());
    expect(mocks.rpc.mock.calls[1][1]).toEqual(first);
    expect(screen.queryByTestId("quicklog-entry-correct-dialog")).not.toBeInTheDocument();
  });

  it("retains an uncertain correction when the dialog is closed and reopened", async () => {
    mocks.rpc.mockResolvedValueOnce(uncertain).mockResolvedValueOnce(receipt);
    mount();
    correction();
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    const first = mocks.rpc.mock.calls[0][1];
    fireEvent.click(screen.getByTestId("quicklog-correct-cancel"));
    fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
    expect(screen.getByTestId("quicklog-correct-note-input")).toHaveValue("Corrected");
    fireEvent.click(screen.getByTestId("quicklog-correct-save"));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledOnce());
    expect(mocks.rpc.mock.calls[1][1]).toEqual(first);
  });

  it("replays retraction confirmation without sending a new logical operation", async () => {
    mocks.rpc.mockResolvedValueOnce(uncertain).mockResolvedValueOnce(receipt);
    const view = mount();
    fireEvent.click(screen.getByTestId("quicklog-entry-retract-button"));
    fireEvent.click(screen.getByTestId("quicklog-retract-reason-accidental"));
    fireEvent.click(screen.getByTestId("quicklog-retract-confirm"));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.error.mock.calls[0][0]).toMatch(/could not confirm/i);
    const first = mocks.rpc.mock.calls[0][1];
    expect(first.p_idempotency_key).toEqual(expect.any(String));
    fireEvent.click(screen.getByTestId("quicklog-retract-confirm"));
    await waitFor(() => expect(view.changed).toHaveBeenCalledOnce());
    expect(mocks.rpc.mock.calls[1][1]).toEqual(first);
    expect(screen.queryByTestId("quicklog-entry-retract-dialog")).not.toBeInTheDocument();
  });

  it("ignores an old owner's delayed receipt", async () => {
    let finish!: (value: typeof receipt) => void;
    mocks.rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = mount();
    correction();
    mocks.owner = "owner-b";
    view.refresh();
    await act(async () => finish(receipt));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(view.changed).not.toHaveBeenCalled();
  });

  it("keeps an uncertain operation frozen after a later rejection", async () => {
    mocks.rpc
      .mockResolvedValueOnce(uncertain)
      .mockResolvedValueOnce({ data: { ok: false, reason: "forbidden" }, error: null });
    mount();
    correction();
    await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId("quicklog-correct-save"));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(2));
    expect(mocks.error.mock.calls[1][0]).toMatch(/could not confirm/i);
    expect(screen.getByTestId("quicklog-correct-note-input")).toBeDisabled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it.each([
    "thrown response",
    "malformed receipt",
    "invalid revision ID",
    "invalid affected entry ID",
  ])("retains the key after a %s", async (failure) => {
    if (failure === "thrown response") mocks.rpc.mockRejectedValueOnce(new Error("Lost reply"));
    else if (failure === "invalid revision ID") {
      mocks.rpc.mockResolvedValueOnce({
        data: { ...receipt.data, revision_id: "revision-a" },
        error: null,
      });
    } else if (failure === "invalid affected entry ID") {
      mocks.rpc.mockResolvedValueOnce({
        data: { ...receipt.data, diary_entry_ids: ["diary-a"] },
        error: null,
      });
    } else mocks.rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    mocks.rpc.mockResolvedValueOnce(receipt);
    const view = mount();
    correction();
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.error.mock.calls[0][0]).toMatch(/could not confirm/i);
    const first = mocks.rpc.mock.calls[0][1];
    fireEvent.click(screen.getByTestId("quicklog-correct-save"));
    await waitFor(() => expect(view.changed).toHaveBeenCalledOnce());
    expect(mocks.rpc.mock.calls[1][1]).toEqual(first);
  });

  it("accepts a genuinely new correction with a new operation key", async () => {
    mocks.rpc.mockResolvedValue(receipt);
    const view = mount();
    correction();
    await waitFor(() => expect(view.changed).toHaveBeenCalledOnce());
    const first = mocks.rpc.mock.calls[0][1];
    fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
    fireEvent.click(screen.getByTestId("quicklog-correct-reason-typo"));
    fireEvent.change(screen.getByTestId("quicklog-correct-note-input"), {
      target: { value: "Another correction" },
    });
    fireEvent.click(screen.getByTestId("quicklog-correct-save"));
    await waitFor(() => expect(view.changed).toHaveBeenCalledTimes(2));
    expect(mocks.rpc.mock.calls[1][1].p_idempotency_key).not.toBe(first.p_idempotency_key);
    expect(mocks.rpc.mock.calls[1][1].p_changes).toEqual({ note: "Another correction" });
  });

  it("allows editing after an explicit pre-commit rejection", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { ok: false, reason: "invalid_changes" }, error: null })
      .mockResolvedValueOnce(receipt);
    const view = mount();
    correction();
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(screen.getByTestId("quicklog-correct-note-input")).toBeEnabled();
    fireEvent.change(screen.getByTestId("quicklog-correct-note-input"), {
      target: { value: "Valid change" },
    });
    fireEvent.click(screen.getByTestId("quicklog-correct-save"));
    await waitFor(() => expect(view.changed).toHaveBeenCalledOnce());
    expect(mocks.rpc.mock.calls[1][1].p_changes).toEqual({ note: "Valid change" });
  });

  it("ignores a receipt after unmount", async () => {
    let finish!: (value: typeof receipt) => void;
    mocks.rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = mount();
    correction();
    view.unmount();
    await act(async () => finish(receipt));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(view.changed).not.toHaveBeenCalled();
  });

  it("coalesces two clicks before React rerenders", async () => {
    let finish!: (value: typeof receipt) => void;
    mocks.rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = mount();
    fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
    fireEvent.click(screen.getByTestId("quicklog-correct-reason-typo"));
    fireEvent.change(screen.getByTestId("quicklog-correct-note-input"), {
      target: { value: "Corrected" },
    });
    const save = screen.getByTestId("quicklog-correct-save");
    act(() => {
      save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    await act(async () => finish(receipt));
    expect(view.changed).toHaveBeenCalledOnce();
  });
});
