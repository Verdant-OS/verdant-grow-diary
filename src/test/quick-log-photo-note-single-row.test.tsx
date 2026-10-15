/**
 * Production QA 2026-10-14 (HIGH): a Quick Log note with a photo produced two
 * Timeline entries, the RPC's diary mirror and a second companion insert
 * made after the upload. The photo now travels inside `p_details.photo_url`
 * of the single `quicklog_save_manual` write; the sheet only normalizes the
 * mirror row's top-level `photo_url` column afterwards (the fence-permitted
 * update `PlantQuickLog` already uses) and never inserts a second row.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import type { QuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";

vi.setConfig({ testTimeout: 15_000 });
const rpcMock = vi.fn();
const readbackMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();
const updateMock = vi.fn();
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
  plants: [
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
  tents: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      name: "Tent 1",
      grow_id: "66666666-6666-4666-8666-666666666666",
    },
  ],
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
    data: context.plants,
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: context.tents,
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
  grow_id: string;
  plant_id: string | null;
  tent_id: string | null;
  event_type: "observation";
  source: "manual";
  is_deleted: boolean;
};
function storedNote(payload: QuickLogV2SavePayload): StoredNote {
  return {
    id: confirmedEventId,
    note: payload.p_note,
    grow_id: "66666666-6666-4666-8666-666666666666",
    plant_id: payload.p_target_type === "plant" ? payload.p_target_id : null,
    tent_id: "55555555-5555-4555-8555-555555555555",
    event_type: "observation",
    source: "manual",
    is_deleted: false,
  };
}
let committed: Map<string, StoredNote>;
const confirmedEventId = "77777777-7777-4777-8777-000000000001";

function modelCommittedReply() {
  rpcMock.mockImplementation(async (fn: string, payload: QuickLogV2SavePayload) => {
    expect(fn).toBe("quicklog_save_manual");
    const existing = committed.get(payload.p_idempotency_key);
    if (existing)
      return { data: { ok: true, reused: true, grow_event_id: existing.id }, error: null };
    committed.set(payload.p_idempotency_key, storedNote(payload));
    return { data: { ok: true, reused: false, grow_event_id: confirmedEventId }, error: null };
  });
}

function modelLostThenCommittedReply() {
  let attempt = 0;
  rpcMock.mockImplementation(async (_fn: string, payload: QuickLogV2SavePayload) => {
    attempt += 1;
    committed.set(payload.p_idempotency_key, storedNote(payload));
    if (attempt === 1) return { data: null, error: { message: "Failed to fetch" } };
    return { data: { ok: true, reused: true, grow_event_id: confirmedEventId }, error: null };
  });
}

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet
        open
        onOpenChange={vi.fn()}
        defaultTargetKey="plant:33333333-3333-4333-8333-333333333333"
        defaultAction="note"
      />
    </QueryClientProvider>,
  );
}

function typeNote(value = originalNote) {
  fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value } });
}
function attachPhoto() {
  fireEvent.change(screen.getByTestId("qlv2-photo-library-input"), {
    target: { files: [new File(["photo"], "leaf.jpg", { type: "image/jpeg" })] },
  });
}
function save() {
  fireEvent.click(screen.getByTestId("qlv2-save"));
}
async function expectPostSave() {
  await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeInTheDocument());
}
function uploadedPath(): string {
  const upload = storageOps.calls.find((c) => c.op === "upload");
  expect(upload, "photo upload").toBeTruthy();
  return upload!.args[0] as string;
}
function pendingKey(): string {
  return `verdant:quick-log:pending-note:v1:${context.userId}`;
}
function journalPayload(): QuickLogV2SavePayload {
  const raw = window.sessionStorage.getItem(pendingKey());
  expect(raw, "pending-note journal").toBeTruthy();
  return (JSON.parse(raw!) as { payload: QuickLogV2SavePayload }).payload;
}

beforeEach(() => {
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
  committed = new Map();
  readbackMock.mockReset().mockImplementation(async () => ({
    data: [...committed.values()][0] ?? null,
    error: null,
  }));
  updateMock.mockReset();
  // diary_entries: the one permitted companion update (photo_url fill);
  // grow_events: the receipt readback the retry path performs.
  fromMock.mockImplementation((table: string) => ({
    select: selectMock,
    update: (patch: Record<string, unknown>) => ({
      filter: (column: string, op: string, value: string) => ({
        select: async () => {
          updateMock(table, patch, [column, op, value]);
          return { data: [{ id: "diary-1" }], error: null };
        },
      }),
    }),
  }));
  selectMock.mockImplementation(() => ({ eq: eqMock }));
  eqMock.mockImplementation(() => ({
    maybeSingle: readbackMock,
    abortSignal() {
      return this;
    },
  }));
});

describe("Quick Log note with a photo saves one diary row", () => {
  it("carries the photo path in the single RPC write and never inserts a companion row", async () => {
    modelCommittedReply();
    renderSheet();
    typeNote();
    attachPhoto();
    save();
    await expectPostSave();

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const payload = rpcMock.mock.calls[0][1] as QuickLogV2SavePayload;
    expect(payload.p_details?.photo_url).toBe(uploadedPath());
    expect(photoEntryMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0]).toEqual([
      "diary_entries",
      { photo_url: uploadedPath() },
      ["details->>linked_grow_event_id", "eq", confirmedEventId],
    ]);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("keeps the upload across a lost reply so the exact retry replays the same photo path", async () => {
    modelLostThenCommittedReply();
    renderSheet();
    typeNote();
    attachPhoto();
    save();
    await waitFor(() => expect(screen.getByTestId("qlv2-save-retry")).toBeEnabled());
    expect(removeMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await expectPostSave();

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledTimes(2);
    const first = rpcMock.mock.calls[0][1] as QuickLogV2SavePayload;
    const second = rpcMock.mock.calls[1][1] as QuickLogV2SavePayload;
    expect(first.p_details?.photo_url).toBe(uploadedPath());
    expect(second).toEqual(first);
    expect(photoEntryMock).not.toHaveBeenCalled();
  });

  it("writes the photo path into the pending-note journal before the RPC so a reload retries the same payload", async () => {
    modelLostThenCommittedReply();
    renderSheet();
    typeNote();
    attachPhoto();
    save();
    await waitFor(() => expect(screen.getByTestId("qlv2-save-retry")).toBeEnabled());

    // quicklog_save_manual hashes p_details into its replay lock, so the
    // journal a reload restores must carry the same photo_url the RPC saw.
    const journal = journalPayload();
    expect(journal.p_details?.photo_url).toBe(uploadedPath());
    expect(journal).toEqual(rpcMock.mock.calls[0][1]);
  });

  it("replays the identical photo-bearing payload after a remount and fills photo_url without a second upload", async () => {
    modelLostThenCommittedReply();
    renderSheet();
    typeNote();
    attachPhoto();
    save();
    await waitFor(() => expect(screen.getByTestId("qlv2-save-retry")).toBeEnabled());
    const first = rpcMock.mock.calls[0][1] as QuickLogV2SavePayload;
    // The tab reloads: the File is gone, the journal is not.
    cleanup();

    renderSheet();
    fireEvent.click(await screen.findByTestId("qlv2-save-retry"));
    await expectPostSave();

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls[1][1]).toEqual(first);
    expect(updateMock).toHaveBeenCalledWith("diary_entries", { photo_url: uploadedPath() }, [
      "details->>linked_grow_event_id",
      "eq",
      confirmedEventId,
    ]);
    expect(photoEntryMock).not.toHaveBeenCalled();
  });
});
