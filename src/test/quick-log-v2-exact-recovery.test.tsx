/** ASTRA-001: real sheet + save hook, modeled atomic RPC and lost replies. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import { useQuickLogV2Save } from "@/hooks/useQuickLogV2Save";
import type { QuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";

vi.setConfig({ testTimeout: 15_000 });
const rpcMock = vi.fn();
const readbackMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();
const fromMock = vi.fn();
const toastSuccess = vi.fn();
const telemetryMock = vi.fn();
const navigationMock = vi.fn();
const context = vi.hoisted(() => ({ isError: false }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    isError: context.isError,
    data: [
      { id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" },
      { id: "plant-2", name: "Plant 2", tent_id: "tent-1", grow_id: "grow-1" },
    ],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }] }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "Grow 1" }] }),
}));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));
vi.mock("@/hooks/useRecentWateringsForVolumeDefaults", () => ({
  useRecentWateringsForVolumeDefaults: () => ({ data: [] }),
}));
vi.mock("@/lib/quickLogSuccessTelemetry", () => ({
  trackQuickLogSuccess: (...args: unknown[]) => telemetryMock(...args),
}));
vi.mock("@/lib/timelineAnchorNavigation", () => ({
  navigateToTimelineAnchor: (...args: unknown[]) => navigationMock(...args),
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

const originalNote = "Original note";
type StoredNote = {
  id: string;
  note: string | null;
  plant_id: string | null;
  tent_id: string | null;
};
let committed: Map<string, StoredNote>;

function modelLostNoteReply() {
  rpcMock.mockImplementation(async (fn: string, payload: QuickLogV2SavePayload) => {
    expect(fn).toBe("quicklog_save_manual");
    const existing = committed.get(payload.p_idempotency_key);
    if (existing) {
      return { data: { ok: true, reused: true, grow_event_id: existing.id }, error: null };
    }
    committed.set(payload.p_idempotency_key, {
      id: `event-${committed.size + 1}`,
      note: payload.p_note,
      plant_id: payload.p_target_type === "plant" ? payload.p_target_id : null,
      tent_id: "tent-1",
    });
    return { data: null, error: { message: "Failed to fetch" } };
  });
}

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const onOpenChange = vi.fn();
  const tree = (open = true, target = "plant:plant-1", action: "note" | "feed" = "note") => (
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet
        open={open}
        onOpenChange={onOpenChange}
        defaultTargetKey={target}
        defaultAction={action}
      />
    </QueryClientProvider>
  );
  const view = render(tree());
  return {
    onOpenChange,
    rerender: (open = true, target = "plant:plant-1", action: "note" | "feed" = "note") =>
      view.rerender(tree(open, target, action)),
  };
}

function typeNote(value = originalNote) {
  fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value } });
}
function save() {
  fireEvent.click(screen.getByTestId("qlv2-save"));
}
function retry() {
  fireEvent.click(screen.getByTestId("qlv2-save-retry"));
}
async function expectRetry() {
  await waitFor(() => expect(screen.getByTestId("qlv2-save-retry")).toBeEnabled());
  expect(screen.queryByTestId("qlv2-post-save")).not.toBeInTheDocument();
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcMock.mockReset();
  readbackMock.mockReset();
  committed = new Map();
  context.isError = false;
  fromMock.mockImplementation(() => ({ select: selectMock }));
  selectMock.mockImplementation(() => ({ eq: eqMock }));
  eqMock.mockImplementation(() => ({ maybeSingle: readbackMock }));
  readbackMock.mockImplementation(async () => ({
    data: [...committed.values()][0] ?? null,
    error: null,
  }));
});

describe("ASTRA-001 exact Note recovery", () => {
  it("keeps a definitively rejected first submission editable and closable", async () => {
    rpcMock.mockResolvedValue({ data: { ok: false, reason: "target_not_owned" }, error: null });
    const view = renderSheet();
    typeNote();
    save();
    await expectRetry();
    expect(screen.getByLabelText("Note (optional)")).toBeEnabled();
    expect(screen.getByLabelText("Choose plant or tent for this Quick Log")).toBeEnabled();
    expect(screen.queryByTestId("qlv2-exact-retry-lock")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(view.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("retains the original uncertain operation if a later retry is rejected", async () => {
    modelLostNoteReply();
    renderSheet();
    typeNote();
    save();
    await expectRetry();
    rpcMock.mockResolvedValueOnce({ data: { ok: false, reason: "target_not_owned" }, error: null });
    retry();
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    await expectRetry();
    expect(screen.getByLabelText("Note (optional)")).toBeDisabled();
    expect(screen.getByTestId("qlv2-exact-retry-lock")).toBeInTheDocument();
    expect(rpcMock.mock.calls[1][1]).toEqual(rpcMock.mock.calls[0][1]);
    expect(committed.size).toBe(1);
  });

  it("retries the committed original text and target, then shows its persisted receipt", async () => {
    modelLostNoteReply();
    const view = renderSheet();
    typeNote();
    save();
    await expectRetry();
    const first = structuredClone(rpcMock.mock.calls[0][1]);
    expect(screen.getByLabelText("Note (optional)")).toBeDisabled();
    expect(screen.getByLabelText("Choose plant or tent for this Quick Log")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Feed" })).toBeDisabled();
    typeNote("Edited before resolution");
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    // A parent refresh must not replace the unresolved operation either.
    view.rerender(true, "plant:plant-2", "feed");
    retry();
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeInTheDocument());
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls[1][1]).toEqual(first);
    expect([...committed.values()].map((row) => row.note)).toEqual([originalNote]);
    expect(fromMock).toHaveBeenCalledWith("grow_events");
    expect(eqMock).toHaveBeenCalledWith("id", "event-1");
    expect(screen.getByTestId("qlv2-persisted-note")).toHaveTextContent(originalNote);
    expect(screen.getByTestId("qlv2-post-save")).not.toHaveTextContent("Edited before resolution");
  });

  it("locks the first in-flight attempt and suppresses same-tick double submission", async () => {
    let resolveFirst!: (value: unknown) => void;
    rpcMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    renderSheet();
    typeNote();
    act(() => {
      save();
      typeNote("Same-tick edit");
      save();
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][1].p_note).toBe(originalNote);
    expect(screen.getByLabelText("Note (optional)")).toBeDisabled();
    await act(async () => resolveFirst({ data: null, error: { message: "Failed to fetch" } }));
    await expectRetry();
    expect(screen.getByLabelText("Note (optional)")).toHaveValue(originalNote);
  });

  it("keeps the retry through close/reopen and a failed target refresh", async () => {
    modelLostNoteReply();
    const view = renderSheet();
    typeNote();
    save();
    await expectRetry();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(view.onOpenChange).not.toHaveBeenCalledWith(false);
    view.rerender(false);
    context.isError = true;
    view.rerender(true, "plant:plant-2");
    expect(screen.getByTestId("qlv2-save-retry")).toBeEnabled();
    retry();
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeInTheDocument());
    expect(rpcMock.mock.calls[1][1]).toEqual(rpcMock.mock.calls[0][1]);
  });

  it("requires Log another before an edited note can create a fresh logical submission", async () => {
    modelLostNoteReply();
    renderSheet();
    typeNote();
    save();
    await expectRetry();
    retry();
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeInTheDocument());
    const firstKey = rpcMock.mock.calls[0][1].p_idempotency_key;
    expect(rpcMock).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId("quick-log-post-save-another"));
    typeNote("Deliberate new observation");
    save();
    await expectRetry();
    expect(rpcMock.mock.calls[2][1].p_idempotency_key).not.toBe(firstKey);
    expect([...committed.values()].map((row) => row.note)).toEqual([
      originalNote,
      "Deliberate new observation",
    ]);
  });

  it("keeps the original payload locked if receipt lookup fails and retries verification safely", async () => {
    modelLostNoteReply();
    readbackMock.mockResolvedValueOnce({ data: null, error: { message: "read unavailable" } });
    renderSheet();
    typeNote();
    save();
    await expectRetry();
    retry();
    await waitFor(() => expect(readbackMock).toHaveBeenCalledTimes(1));
    await expectRetry();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(telemetryMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Note (optional)")).toBeDisabled();
    retry();
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeInTheDocument());
    expect(rpcMock).toHaveBeenCalledTimes(3);
    expect(rpcMock.mock.calls[2][1]).toEqual(rpcMock.mock.calls[0][1]);
    expect(committed.size).toBe(1);
  });

  it.each([
    { note: "Different stored note", plant_id: "plant-1", tent_id: "tent-1" },
    { note: originalNote, plant_id: "plant-2", tent_id: "tent-1" },
  ])("does not claim success for a mismatched persisted note or target (%j)", async (mismatch) => {
    modelLostNoteReply();
    readbackMock.mockResolvedValue({ data: { id: "event-1", ...mismatch }, error: null });
    renderSheet();
    typeNote();
    save();
    await expectRetry();
    retry();
    await waitFor(() => expect(readbackMock).toHaveBeenCalledTimes(1));
    await expectRetry();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(telemetryMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("qlv2-persisted-note")).not.toBeInTheDocument();
  });

  it("does not accept a reused success response without a persisted event id", async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, reused: true }, error: null });
    const { result } = renderHook(() => useQuickLogV2Save());
    let receipt: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      receipt = await result.current.save({
        p_target_type: "plant",
        p_target_id: "plant-1",
        p_action: "note",
        p_volume_ml: null,
        p_note: originalNote,
        p_temperature_c: null,
        p_humidity_pct: null,
        p_vpd_kpa: null,
        p_occurred_at: null,
        p_idempotency_key: "exact-note-retry-key",
      });
    });
    expect(receipt?.ok).toBe(false);
    expect(telemetryMock).not.toHaveBeenCalled();
  });

  it("lets the grower inspect a verified but subsequently edited saved note without false success", async () => {
    modelLostNoteReply();
    const view = renderSheet();
    typeNote();
    save();
    await expectRetry();
    const firstKey = rpcMock.mock.calls[0][1].p_idempotency_key;
    // Another Timeline tab legitimately updates the already committed note.
    committed.get(firstKey)!.note = "Updated from Timeline";
    retry();
    await waitFor(() => expect(screen.getByTestId("qlv2-review-saved-entry")).toBeEnabled());
    expect(screen.getByTestId("qlv2-mismatched-note")).toHaveTextContent("Updated from Timeline");
    expect(screen.queryByTestId("qlv2-post-save")).not.toBeInTheDocument();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(telemetryMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("qlv2-review-saved-entry"));
    expect(view.onOpenChange).toHaveBeenCalledWith(false);
    expect(navigationMock).toHaveBeenCalledTimes(1);
    expect(navigationMock.mock.calls[0][0].href).toContain("event-1");
    expect(rpcMock).toHaveBeenCalledTimes(2);
    view.rerender(false);
    view.rerender(true);
    typeNote("A deliberate new entry after reviewing history");
    expect(screen.getByLabelText("Note (optional)")).toBeEnabled();
    save();
    await expectRetry();
    expect(rpcMock.mock.calls[2][1].p_idempotency_key).not.toBe(firstKey);
  });
});

describe("ASTRA-001 related Feed recovery", () => {
  it("leaves a locally rejected feeding editable because no RPC was sent", async () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    for (const [label, value] of [
      ["Nutrient line", "veg-week-3"],
      ["Product 1 name", "token"],
      ["Product 1 amount", "2"],
      ["Applied volume (ml)", "750"],
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    save();
    await waitFor(() => expect(screen.getByTestId("qlv2-error")).toBeInTheDocument());
    expect(rpcMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Product 1 name")).toBeEnabled();
    expect(screen.queryByTestId("qlv2-exact-retry-lock")).not.toBeInTheDocument();
    rpcMock.mockResolvedValue({ data: { ok: true, grow_event_id: "feed-corrected" }, error: null });
    fireEvent.change(screen.getByLabelText("Product 1 name"), { target: { value: "Base A" } });
    save();
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeInTheDocument());
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("freezes a committed 750ml submission and avoids the changed-volume conflict loop", async () => {
    let stored: unknown;
    rpcMock.mockImplementation(async (fn: string, payload: unknown) => {
      expect(fn).toBe("quicklog_save_event");
      if (!stored) {
        stored = structuredClone(payload);
        return { data: null, error: { message: "Failed to fetch" } };
      }
      if (JSON.stringify(payload) !== JSON.stringify(stored)) {
        return { data: { ok: false, reason: "idempotency_key_conflict" }, error: null };
      }
      return { data: { ok: true, reused: true, grow_event_id: "feed-1" }, error: null };
    });
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    for (const [label, value] of [
      ["Nutrient line", "veg-week-3"],
      ["Product 1 name", "Base A"],
      ["Product 1 amount", "2"],
      ["Applied volume (ml)", "750"],
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    save();
    await expectRetry();
    expect(screen.getByLabelText("Applied volume (ml)")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Applied volume (ml)"), { target: { value: "1000" } });
    retry();
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeInTheDocument());
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls[1][1]).toEqual(rpcMock.mock.calls[0][1]);
    expect(rpcMock.mock.calls[1][1].p_feed.volume_ml).toBe(750);
  });
});
