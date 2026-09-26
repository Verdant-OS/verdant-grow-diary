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
const uploadMock = vi.fn();
const removeMock = vi.fn();
const photoEntryMock = vi.fn();
const videoEntryMock = vi.fn();
const context = vi.hoisted(() => ({
  isError: false,
  userId: "11111111-1111-4111-8111-111111111111",
}));
const storageOps = vi.hoisted(() => ({
  calls: [] as Array<{ bucket: string; op: "upload" | "remove"; args: unknown[] }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    storage: {
      from: (bucket: string) => ({
        upload: (...args: unknown[]) => {
          storageOps.calls.push({ bucket, op: "upload", args });
          return uploadMock(...args);
        },
        remove: (...args: unknown[]) => {
          storageOps.calls.push({ bucket, op: "remove", args });
          return removeMock(...args);
        },
      }),
    },
    from: (...args: unknown[]) => fromMock(...args),
  },
}));
vi.mock("@/lib/quickLogPhotoDiaryEntry", () => ({
  createQuickLogPhotoDiaryEntry: (...args: unknown[]) => photoEntryMock(...args),
}));
vi.mock("@/lib/quickLogVideoDiaryEntry", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/quickLogVideoDiaryEntry")>()),
  createQuickLogVideoDiaryEntry: (...args: unknown[]) => videoEntryMock(...args),
}));
vi.mock("@/lib/videoAttachmentRules", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/videoAttachmentRules")>()),
  createBrowserVideoDurationProber: () => async () => ({ ok: true, durationS: 5 }),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: context.userId ? { id: context.userId } : null }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    isError: context.isError,
    data: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Plant 1",
        tent_id: "55555555-5555-4555-8555-555555555555",
        grow_id: "66666666-6666-4666-8666-666666666666",
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Plant 2",
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
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "66666666-6666-4666-8666-666666666666", name: "Grow 1" }] }),
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
      id: `77777777-7777-4777-8777-${String(committed.size + 1).padStart(12, "0")}`,
      note: payload.p_note,
      plant_id: payload.p_target_type === "plant" ? payload.p_target_id : null,
      tent_id: "55555555-5555-4555-8555-555555555555",
    });
    return { data: null, error: { message: "Failed to fetch" } };
  });
}

function renderSheet(
  initialTarget = "plant:33333333-3333-4333-8333-333333333333",
  initialAction: "note" | "feed" = "note",
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const onOpenChange = vi.fn();
  const tree = (
    open = true,
    target = "plant:33333333-3333-4333-8333-333333333333",
    action: "note" | "feed" = "note",
  ) => (
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet
        open={open}
        onOpenChange={onOpenChange}
        defaultTargetKey={target}
        defaultAction={action}
      />
    </QueryClientProvider>
  );
  const view = render(tree(true, initialTarget, initialAction));
  return {
    onOpenChange,
    unmount: view.unmount,
    rerender: (
      open = true,
      target = "plant:33333333-3333-4333-8333-333333333333",
      action: "note" | "feed" = "note",
    ) => view.rerender(tree(open, target, action)),
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
  vi.restoreAllMocks();
  vi.clearAllMocks();
  window.sessionStorage.clear();
  context.userId = "11111111-1111-4111-8111-111111111111";
  rpcMock.mockReset();
  storageOps.calls = [];
  uploadMock.mockReset().mockResolvedValue({ error: null });
  removeMock.mockReset().mockResolvedValue({ error: null });
  photoEntryMock.mockReset().mockResolvedValue({ ok: true });
  videoEntryMock.mockReset().mockResolvedValue({ ok: true });
  URL.createObjectURL = vi.fn(() => "blob:test-photo");
  URL.revokeObjectURL = vi.fn();
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
    view.rerender(true, "plant:44444444-4444-4444-8444-444444444444", "feed");
    retry();
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeInTheDocument());
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls[1][1]).toEqual(first);
    expect([...committed.values()].map((row) => row.note)).toEqual([originalNote]);
    expect(fromMock).toHaveBeenCalledWith("grow_events");
    expect(eqMock).toHaveBeenCalledWith("id", "77777777-7777-4777-8777-000000000001");
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
    view.rerender(true, "plant:44444444-4444-4444-8444-444444444444");
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
    {
      note: "Different stored note",
      plant_id: "33333333-3333-4333-8333-333333333333",
      tent_id: "55555555-5555-4555-8555-555555555555",
    },
    {
      note: originalNote,
      plant_id: "44444444-4444-4444-8444-444444444444",
      tent_id: "55555555-5555-4555-8555-555555555555",
    },
  ])("does not claim success for a mismatched persisted note or target (%j)", async (mismatch) => {
    modelLostNoteReply();
    readbackMock.mockResolvedValue({
      data: { id: "77777777-7777-4777-8777-000000000001", ...mismatch },
      error: null,
    });
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
        p_target_id: "33333333-3333-4333-8333-333333333333",
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
    expect(navigationMock.mock.calls[0][0].href).toContain("77777777-7777-4777-8777-000000000001");
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
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000002" },
      error: null,
    });
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
      return {
        data: { ok: true, reused: true, grow_event_id: "77777777-7777-4777-8777-000000000003" },
        error: null,
      };
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

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const pendingKey = (owner = ownerA) => `verdant:quick-log:pending-note:v1:${owner}`;
const confirmedEventId = "77777777-7777-4777-8777-000000000001";

function storageRemoves(bucket: string) {
  return storageOps.calls.filter((call) => call.bucket === bucket && call.op === "remove");
}

function seedOwnerBPending() {
  const record = JSON.stringify(
    storedPending({
      ownerId: ownerB,
      payload: {
        ...storedPending().payload,
        p_note: "Owner B independent note",
        p_idempotency_key: "owner-b-independent-key",
      },
    }),
  );
  window.sessionStorage.setItem(pendingKey(ownerB), record);
  return record;
}

function attachPhoto() {
  fireEvent.change(screen.getByTestId("qlv2-photo-library-input"), {
    target: { files: [new File(["photo"], "leaf.jpg", { type: "image/jpeg" })] },
  });
}

async function attachVideo() {
  await act(async () => {
    fireEvent.change(screen.getByTestId("qlv2-video-input"), {
      target: { files: [new File(["video"], "plant.mp4", { type: "video/mp4" })] },
    });
  });
  await waitFor(() => expect(screen.getByTestId("qlv2-video-preview")).toBeInTheDocument());
}

function storedPending(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    ownerId: ownerA,
    createdAt: "2020-01-01T00:00:00.000Z",
    payload: {
      p_target_type: "plant",
      p_target_id: "33333333-3333-4333-8333-333333333333",
      p_action: "note",
      p_volume_ml: null,
      p_note: originalNote,
      p_temperature_c: 25,
      p_humidity_pct: 60,
      p_vpd_kpa: 1.2,
      p_occurred_at: "2020-01-01T00:00:00.000Z",
      p_details: { source: "manual", observation: "unchanged" },
      p_stage: "flower",
      p_idempotency_key: "durable-original-note-key",
    },
    resolved: {
      ok: true,
      targetType: "plant",
      targetId: "33333333-3333-4333-8333-333333333333",
      plantId: "33333333-3333-4333-8333-333333333333",
      tentId: "55555555-5555-4555-8555-555555555555",
      growId: "66666666-6666-4666-8666-666666666666",
    },
    attachments: { photo: false, video: false },
    ...overrides,
  };
}

describe("durable unresolved Note recovery", () => {
  it("persists before dispatch and restores after a true unmount without automatically resubmitting", async () => {
    modelLostNoteReply();
    const server = rpcMock.getMockImplementation()!;
    const dispatchRecords: Array<string | null> = [];
    rpcMock.mockImplementation(async (...args: unknown[]) => {
      dispatchRecords.push(window.sessionStorage.getItem(pendingKey()));
      return server(...args);
    });
    const first = renderSheet();
    typeNote();
    save();
    await expectRetry();
    const payload = structuredClone(rpcMock.mock.calls[0][1]);
    first.unmount();

    renderSheet("plant:44444444-4444-4444-8444-444444444444", "feed");
    await expectRetry();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(dispatchRecords[0]!)).toMatchObject({ ownerId: ownerA, payload });
    expect(committed.size).toBe(1);
    expect(screen.getByLabelText("Note (optional)")).toHaveValue(originalNote);
    expect(screen.getByLabelText("Note (optional)")).toBeDisabled();
    retry();
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeInTheDocument());
    expect(rpcMock.mock.calls[1][1]).toEqual(payload);
    expect(committed.size).toBe(1);
    expect(window.sessionStorage.getItem(pendingKey())).toBeNull();
  });

  it("restores an old operation from storage without expiring or rebuilding its canonical payload", async () => {
    const record = storedPending();
    window.sessionStorage.setItem(pendingKey(), JSON.stringify(record));
    modelLostNoteReply();
    committed.set(record.payload.p_idempotency_key, {
      id: confirmedEventId,
      note: originalNote,
      plant_id: record.payload.p_target_id,
      tent_id: record.resolved.tentId,
    });
    renderSheet();
    await expectRetry();
    expect(rpcMock).not.toHaveBeenCalled();
    retry();
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeInTheDocument());
    expect(rpcMock.mock.calls[0][1]).toEqual(record.payload);
    expect(committed.size).toBe(1);
  });

  it("isolates another account and restores the original account's unresolved Note on return", async () => {
    modelLostNoteReply();
    const view = renderSheet();
    typeNote();
    save();
    await expectRetry();
    const pending = window.sessionStorage.getItem(pendingKey());
    context.userId = ownerB;
    view.rerender();
    expect(screen.getByLabelText("Note (optional)")).toHaveValue("");
    expect(screen.queryByTestId("qlv2-exact-retry-lock")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(pendingKey())).toBe(pending);
    expect(window.sessionStorage.getItem(pendingKey(ownerB))).toBeNull();
    context.userId = ownerA;
    view.rerender();
    await expectRetry();
    expect(screen.getByLabelText("Note (optional)")).toHaveValue(originalNote);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("does not publish the previous account's late successful reply into the new account", async () => {
    let finish!: (value: unknown) => void;
    rpcMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = renderSheet();
    typeNote();
    save();
    context.userId = ownerB;
    view.rerender();
    await act(async () =>
      finish({ data: { ok: true, grow_event_id: confirmedEventId }, error: null }),
    );
    expect(screen.queryByTestId("qlv2-post-save")).not.toBeInTheDocument();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(telemetryMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Note (optional)")).toHaveValue("");
    expect(window.sessionStorage.getItem(pendingKey())).not.toBeNull();
  });

  it.each(["getItem", "setItem"] as const)(
    "blocks a new Note honestly when sessionStorage.%s is unavailable",
    async (method) => {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error("Storage unavailable");
      });
      renderSheet();
      typeNote();
      save();
      // The error renders before handleSave's finally releases the editor lock.
      await waitFor(() => {
        expect(screen.getByTestId("qlv2-error")).toHaveTextContent(/recovery|storage/i);
        expect(screen.getByLabelText("Note (optional)")).toBeEnabled();
      });
      expect(rpcMock).not.toHaveBeenCalled();
      expect(toastSuccess).not.toHaveBeenCalled();
    },
  );

  it.each([
    "not-json",
    JSON.stringify({ ...storedPending(), version: 9 }),
    JSON.stringify({ ...storedPending(), ownerId: ownerB }),
    JSON.stringify({ ...storedPending(), payload: { p_action: "note" } }),
  ])(
    "keeps a malformed or unsupported record fenced instead of treating it as empty: %s",
    async (raw) => {
      window.sessionStorage.setItem(pendingKey(), raw);
      renderSheet();
      typeNote("A replacement must not be dispatched");
      save();
      await waitFor(() => {
        expect(screen.getByTestId("qlv2-error")).toHaveTextContent(/recovery|storage/i);
        expect(screen.getByLabelText("Note (optional)")).toBeEnabled();
      });
      expect(rpcMock).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem(pendingKey())).toBe(raw);
    },
  );

  it("does not overwrite a different pending Note claimed after this sheet mounted", async () => {
    renderSheet();
    typeNote("New local draft");
    const record = storedPending();
    window.sessionStorage.setItem(pendingKey(), JSON.stringify(record));
    save();
    await expectRetry();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(JSON.parse(window.sessionStorage.getItem(pendingKey())!).payload).toEqual(
      record.payload,
    );
    expect(screen.getByLabelText("Note (optional)")).toHaveValue(originalNote);
  });

  it.each(["pending", "already cleared"] as const)(
    "keeps a confirmed Note saved while resolving recovery (%s)",
    async (storageState) => {
      modelLostNoteReply();
      renderSheet();
      typeNote();
      save();
      await expectRetry();
      vi.spyOn(Storage.prototype, "removeItem").mockImplementationOnce(() => {
        throw new Error("Storage unavailable");
      });
      retry();
      await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeInTheDocument());
      expect(screen.getByTestId("qlv2-error")).toHaveTextContent(/Your Note is saved/i);
      expect(screen.getByTestId("quick-log-post-save-another")).toBeDisabled();
      expect(window.sessionStorage.getItem(pendingKey())).not.toBeNull();
      expect(committed.size).toBe(1);
      expect(rpcMock).toHaveBeenCalledTimes(2);
      // Another mounted sheet may have already cleared this same confirmed operation.
      if (storageState === "already cleared") window.sessionStorage.removeItem(pendingKey());
      fireEvent.click(screen.getByTestId("qlv2-note-storage-recheck"));
      await waitFor(() => expect(screen.getByTestId("quick-log-post-save-another")).toBeEnabled());
      expect(window.sessionStorage.getItem(pendingKey())).toBeNull();
      expect(rpcMock).toHaveBeenCalledTimes(2);
      const originalKey = rpcMock.mock.calls[0][1].p_idempotency_key;
      fireEvent.click(screen.getByTestId("quick-log-post-save-another"));
      typeNote("A deliberate new Note after recovery");
      save();
      await expectRetry();
      expect(rpcMock.mock.calls[2][1].p_idempotency_key).not.toBe(originalKey);
      expect(committed.size).toBe(2);
    },
  );

  it("clears a definitive first rejection but retains a restored operation after the same rejection", async () => {
    rpcMock.mockResolvedValue({ data: { ok: false, reason: "target_not_owned" }, error: null });
    const first = renderSheet();
    typeNote();
    save();
    await expectRetry();
    expect(window.sessionStorage.getItem(pendingKey())).toBeNull();
    first.unmount();
    const record = storedPending();
    window.sessionStorage.setItem(pendingKey(), JSON.stringify(record));
    renderSheet();
    await expectRetry();
    retry();
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    await expectRetry();
    expect(JSON.parse(window.sessionStorage.getItem(pendingKey())!).payload).toEqual(
      record.payload,
    );
    expect(screen.getByLabelText("Note (optional)")).toBeDisabled();
  });

  it("retains visible unresolved attachment intent after reload without claiming files were saved", async () => {
    const record = storedPending({ attachments: { photo: true, video: true } });
    window.sessionStorage.setItem(pendingKey(), JSON.stringify(record));
    modelLostNoteReply();
    committed.set(record.payload.p_idempotency_key, {
      id: confirmedEventId,
      note: originalNote,
      plant_id: record.payload.p_target_id,
      tent_id: record.resolved.tentId,
    });
    const view = renderSheet();
    await expectRetry();
    expect(screen.getByTestId("qlv2-pending-note-media")).toHaveTextContent(
      /attachment.*(unavailable|unresolved)|cannot.*restore/i,
    );
    retry();
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeInTheDocument());
    expect(screen.getByTestId("qlv2-pending-note-media")).toHaveTextContent(/attachment/i);
    expect(screen.getByTestId("qlv2-post-save")).not.toHaveTextContent(/photo saved|video saved/i);
    fireEvent.click(screen.getByTestId("quick-log-post-save-close"));
    expect(view.onOpenChange).toHaveBeenCalledWith(false);
    view.rerender(false);
    view.rerender(true);
    expect(screen.queryByTestId("qlv2-pending-note-media")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Note (optional)")).toHaveValue("");
  });

  it("captures an actual selected photo before dispatch and preserves its unavailable intent after remount", async () => {
    modelLostNoteReply();
    const first = renderSheet();
    typeNote();
    fireEvent.change(screen.getByTestId("qlv2-photo-library-input"), {
      target: { files: [new File(["photo"], "leaf.jpg", { type: "image/jpeg" })] },
    });
    save();
    await expectRetry();
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.sessionStorage.getItem(pendingKey())!).attachments).toEqual({
      photo: true,
      video: false,
    });
    first.unmount();
    renderSheet("plant:44444444-4444-4444-8444-444444444444", "feed");
    await expectRetry();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    retry();
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeInTheDocument());
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("qlv2-pending-note-media")).toHaveTextContent(/attachment/i);
    expect(screen.getByTestId("qlv2-post-save")).not.toHaveTextContent(/photo saved/i);
    expect(committed.size).toBe(1);
  });

  it("retains the captured operation but never dispatches after the account changes during photo upload", async () => {
    let finish!: (value: unknown) => void;
    uploadMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const ownerBPending = seedOwnerBPending();
    const view = renderSheet();
    typeNote();
    attachPhoto();
    save();
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    const pending = window.sessionStorage.getItem(pendingKey());
    const uploadedPath = uploadMock.mock.calls[0][0] as string;
    context.userId = ownerB;
    view.rerender();
    await act(async () => finish({ error: null }));
    await waitFor(() => expect(removeMock).toHaveBeenCalledTimes(1));
    expect(uploadedPath.startsWith(`${ownerA}/`)).toBe(true);
    expect(removeMock.mock.calls[0][0]).toEqual([uploadedPath]);
    expect(storageRemoves("diary-photos")).toHaveLength(1);
    expect(storageRemoves("diary-videos")).toHaveLength(0);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(photoEntryMock).not.toHaveBeenCalled();
    expect(videoEntryMock).not.toHaveBeenCalled();
    expect(telemetryMock).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.queryByTestId("qlv2-post-save")).not.toBeInTheDocument();
    expect(pending).not.toBeNull();
    expect(window.sessionStorage.getItem(pendingKey())).toBe(pending);
    expect(window.sessionStorage.getItem(pendingKey(ownerB))).toBe(ownerBPending);
    context.userId = ownerA;
    view.rerender();
    await expectRetry();
    expect(screen.getByTestId("qlv2-pending-note-media")).toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("does not confirm or clear an old owner's operation after a deferred receipt lookup", async () => {
    modelLostNoteReply();
    const view = renderSheet();
    typeNote();
    save();
    await expectRetry();
    let finish!: (value: unknown) => void;
    readbackMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    retry();
    await waitFor(() => expect(readbackMock).toHaveBeenCalledTimes(1));
    const pending = window.sessionStorage.getItem(pendingKey());
    context.userId = ownerB;
    view.rerender();
    await act(async () => finish({ data: [...committed.values()][0], error: null }));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(telemetryMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("qlv2-post-save")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(pendingKey())).toBe(pending);
  });

  it("never starts video upload after account change during failed-photo cleanup", async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, grow_event_id: confirmedEventId }, error: null });
    photoEntryMock.mockResolvedValue({ ok: false, message: "Photo entry rejected" });
    let finish!: (value: unknown) => void;
    removeMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = renderSheet();
    typeNote();
    fireEvent.change(screen.getByTestId("qlv2-photo-library-input"), {
      target: { files: [new File(["photo"], "leaf.jpg", { type: "image/jpeg" })] },
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId("qlv2-video-input"), {
        target: { files: [new File(["video"], "plant.mp4", { type: "video/mp4" })] },
      });
    });
    save();
    await waitFor(() => expect(removeMock).toHaveBeenCalledTimes(1));
    const pending = window.sessionStorage.getItem(pendingKey());
    expect(JSON.parse(pending!).attachments).toEqual({ photo: true, video: true });
    context.userId = ownerB;
    view.rerender();
    await act(async () => finish({ error: null }));
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.queryByTestId("qlv2-post-save")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(pendingKey())).toBe(pending);
  });
});

describe("late successful media upload cleanup attempts", () => {
  it("attempts diary-videos cleanup for a deferred video after Note success without dispatching the companion", async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, grow_event_id: confirmedEventId }, error: null });
    let finish!: (value: unknown) => void;
    uploadMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = renderSheet();
    typeNote();
    await attachVideo();
    save();
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(telemetryMock).toHaveBeenCalledTimes(1);
    const pending = window.sessionStorage.getItem(pendingKey());
    const uploadedPath = uploadMock.mock.calls[0][0] as string;
    context.userId = ownerB;
    view.rerender();
    await act(async () => finish({ error: null }));
    await waitFor(() => expect(removeMock).toHaveBeenCalledTimes(1));
    expect(uploadedPath.startsWith(`${ownerA}/`)).toBe(true);
    expect(removeMock.mock.calls[0][0]).toEqual([uploadedPath]);
    expect(storageRemoves("diary-videos")).toHaveLength(1);
    expect(storageRemoves("diary-photos")).toHaveLength(0);
    expect(videoEntryMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(telemetryMock).toHaveBeenCalledTimes(1);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.queryByTestId("qlv2-post-save")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(pendingKey())).toBe(pending);
  });

  it.each([
    { kind: "sign-out" as const, media: "photo" as const },
    { kind: "unmount" as const, media: "video" as const },
    { kind: "a-b-a" as const, media: "photo" as const },
    { kind: "a-b-a" as const, media: "video" as const },
  ])(
    "abandons a successful $media upload after $kind without reviving the continuation",
    async ({ kind, media }) => {
      if (media === "video") {
        rpcMock.mockResolvedValue({
          data: { ok: true, grow_event_id: confirmedEventId },
          error: null,
        });
      }
      let finish!: (value: unknown) => void;
      uploadMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const view = renderSheet();
      typeNote();
      if (media === "photo") attachPhoto();
      else await attachVideo();
      save();
      await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
      const pending = window.sessionStorage.getItem(pendingKey());
      const rpcBefore = rpcMock.mock.calls.length;
      const telemetryBefore = telemetryMock.mock.calls.length;
      if (kind === "sign-out") {
        context.userId = "";
        view.rerender();
      } else if (kind === "unmount") {
        view.unmount();
      } else {
        context.userId = ownerB;
        view.rerender();
        context.userId = ownerA;
        view.rerender();
      }
      await act(async () => finish({ error: null }));
      await waitFor(() => expect(removeMock).toHaveBeenCalledTimes(1));
      const bucket = media === "photo" ? "diary-photos" : "diary-videos";
      expect(storageRemoves(bucket)).toHaveLength(1);
      expect(photoEntryMock).not.toHaveBeenCalled();
      expect(videoEntryMock).not.toHaveBeenCalled();
      expect(rpcMock).toHaveBeenCalledTimes(rpcBefore);
      expect(telemetryMock).toHaveBeenCalledTimes(telemetryBefore);
      expect(toastSuccess).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem(pendingKey())).toBe(pending);
      if (kind !== "unmount") {
        expect(screen.queryByTestId("qlv2-post-save")).not.toBeInTheDocument();
      }
      if (kind === "a-b-a") {
        await expectRetry();
        expect(screen.getByTestId("qlv2-pending-note-media")).toBeInTheDocument();
        expect(rpcMock).toHaveBeenCalledTimes(rpcBefore);
      }
    },
  );

  it.each([
    { media: "photo" as const, mode: "error-result" as const },
    { media: "video" as const, mode: "reject" as const },
  ])(
    "does not attempt cleanup when a deferred $media upload fails after lifetime invalidation",
    async ({ media, mode }) => {
      if (media === "video") {
        rpcMock.mockResolvedValue({
          data: { ok: true, grow_event_id: confirmedEventId },
          error: null,
        });
      }
      let resolveUpload!: (value: unknown) => void;
      let rejectUpload!: (reason?: unknown) => void;
      uploadMock.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            resolveUpload = resolve;
            rejectUpload = reject;
          }),
      );
      const view = renderSheet();
      typeNote();
      if (media === "photo") attachPhoto();
      else await attachVideo();
      save();
      await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
      const pending = window.sessionStorage.getItem(pendingKey());
      const rpcBefore = rpcMock.mock.calls.length;
      context.userId = ownerB;
      view.rerender();
      if (mode === "error-result") {
        await act(async () => resolveUpload({ error: { message: "upload denied" } }));
      } else {
        await act(async () => rejectUpload(new Error("upload exploded")));
      }
      expect(removeMock).not.toHaveBeenCalled();
      expect(storageOps.calls.filter((call) => call.op === "remove")).toHaveLength(0);
      expect(photoEntryMock).not.toHaveBeenCalled();
      expect(videoEntryMock).not.toHaveBeenCalled();
      expect(rpcMock).toHaveBeenCalledTimes(rpcBefore);
      expect(toastSuccess).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem(pendingKey())).toBe(pending);
    },
  );

  it.each([
    { label: "rejected cleanup", settle: () => Promise.reject(new Error("remove denied")) },
    {
      label: "resolved storage error",
      settle: () => ({ data: null, error: { message: "policy" } }),
    },
    { label: "empty successful data", settle: () => ({ data: [], error: null }) },
  ])("stays aborted when late photo cleanup is $label", async ({ settle }) => {
    let finishUpload!: (value: unknown) => void;
    uploadMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishUpload = resolve;
        }),
    );
    removeMock.mockImplementationOnce(() => settle());
    const view = renderSheet();
    typeNote();
    attachPhoto();
    save();
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    const pending = window.sessionStorage.getItem(pendingKey());
    context.userId = ownerB;
    view.rerender();
    await act(async () => finishUpload({ error: null }));
    await waitFor(() => expect(removeMock).toHaveBeenCalledTimes(1));
    expect(rpcMock).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.queryByTestId("qlv2-post-save")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(pendingKey())).toBe(pending);
  });

  it("does not revive an abandoned photo continuation when returning to A during deferred cleanup", async () => {
    let finishUpload!: (value: unknown) => void;
    let finishRemove!: (value: unknown) => void;
    uploadMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishUpload = resolve;
        }),
    );
    removeMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRemove = resolve;
        }),
    );
    const view = renderSheet();
    typeNote();
    attachPhoto();
    save();
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    const pending = window.sessionStorage.getItem(pendingKey());
    context.userId = ownerB;
    view.rerender();
    await act(async () => finishUpload({ error: null }));
    await waitFor(() => expect(removeMock).toHaveBeenCalledTimes(1));
    context.userId = ownerA;
    view.rerender();
    await expectRetry();
    expect(screen.getByTestId("qlv2-pending-note-media")).toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
    await act(async () => finishRemove({ error: null }));
    expect(rpcMock).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.queryByTestId("qlv2-post-save")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(pendingKey())).toBe(pending);
    expect(photoEntryMock).not.toHaveBeenCalled();
  });

  it("does not clean up storage when the active owner saves a photo and a video", async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, grow_event_id: confirmedEventId }, error: null });
    renderSheet();
    typeNote();
    attachPhoto();
    await attachVideo();
    save();
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeInTheDocument());
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(photoEntryMock).toHaveBeenCalledTimes(1);
    expect(videoEntryMock).toHaveBeenCalledTimes(1);
    expect(removeMock).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("does not add post-upload cleanup after an already-dispatched photo companion becomes ambiguous", async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, grow_event_id: confirmedEventId }, error: null });
    let finish!: (value: unknown) => void;
    photoEntryMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = renderSheet();
    typeNote();
    attachPhoto();
    save();
    await waitFor(() => expect(photoEntryMock).toHaveBeenCalledTimes(1));
    const pending = window.sessionStorage.getItem(pendingKey());
    context.userId = ownerB;
    view.rerender();
    await act(async () => finish({ ok: false, message: "insert response lost", ambiguous: true }));
    expect(removeMock).not.toHaveBeenCalled();
    expect(storageOps.calls.filter((call) => call.op === "remove")).toHaveLength(0);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.queryByTestId("qlv2-post-save")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(pendingKey())).toBe(pending);
  });

  it("does not clean up video storage after its companion has already been dispatched", async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, grow_event_id: confirmedEventId }, error: null });
    let finish!: (value: unknown) => void;
    videoEntryMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = renderSheet();
    typeNote();
    await attachVideo();
    save();
    await waitFor(() => expect(videoEntryMock).toHaveBeenCalledTimes(1));
    const pending = window.sessionStorage.getItem(pendingKey());
    context.userId = ownerB;
    view.rerender();
    await act(async () => finish({ ok: false, message: "video insert rejected" }));
    expect(removeMock).not.toHaveBeenCalled();
    expect(storageOps.calls.filter((call) => call.op === "remove")).toHaveLength(0);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(telemetryMock).toHaveBeenCalledTimes(1);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(pendingKey())).toBe(pending);
  });
});

describe("fresh Note acknowledgement integrity", () => {
  it.each([undefined, null, "", "   ", 3, false, {}, [], "event-not-a-uuid"])(
    "does not confirm a fresh acknowledgement with invalid event ID %j",
    async (grow_event_id) => {
      rpcMock.mockResolvedValue({ data: { ok: true, grow_event_id }, error: null });
      renderSheet();
      typeNote();
      save();
      await expectRetry();
      expect(toastSuccess).not.toHaveBeenCalled();
      expect(telemetryMock).not.toHaveBeenCalled();
      expect(screen.queryByTestId("qlv2-persisted-note")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Note (optional)")).toBeDisabled();
    },
  );

  it.each(["true", 1, {}])("does not accept malformed ok=%j as a successful Note", async (ok) => {
    rpcMock.mockResolvedValue({ data: { ok, grow_event_id: confirmedEventId }, error: null });
    renderSheet();
    typeNote();
    save();
    await expectRetry();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(telemetryMock).not.toHaveBeenCalled();
  });
});
