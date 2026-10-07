/** V2 Note stage tag: mounted sheet, modeled RPC and lost replies. Synthetic fixtures only. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import * as quickLogSaveHook from "@/hooks/useQuickLogV2Save";
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

const OWNER = "11111111-1111-4111-8111-111111111111";
const GROW = "66666666-6666-4666-8666-666666666666";
const TENT = "55555555-5555-4555-8555-555555555555";
const PLANT_VEG = "33333333-3333-4333-8333-333333333333";
const PLANT_NO_STAGE = "44444444-4444-4444-8444-444444444444";
const NOTE = "Synthetic V2 note fixture";

const context = vi.hoisted(() => ({
  isError: false,
  userId: "11111111-1111-4111-8111-111111111111",
  plants: [] as Array<{
    id: string;
    name: string;
    tent_id: string;
    grow_id: string;
    stage: string | null;
  }>,
  tents: [] as Array<{ id: string; name: string; grow_id: string; stage?: string | null }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => uploadMock(...args),
        remove: (...args: unknown[]) => removeMock(...args),
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
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: context.userId ? { id: context.userId } : null }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ isError: context.isError, data: context.plants }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: context.tents }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "66666666-6666-4666-8666-666666666666", name: "Grow A" }] }),
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

type StoredNote = {
  id: string;
  note: string | null;
  grow_id: string;
  plant_id: string | null;
  tent_id: string;
};
let committed: Map<string, StoredNote>;
const EVENT_ID = "77777777-7777-4777-8777-000000000001";

function modelOkReply() {
  rpcMock.mockImplementation(async (fn: string, payload: QuickLogV2SavePayload) => {
    expect(fn).toBe("quicklog_save_manual");
    committed.set(payload.p_idempotency_key, {
      id: EVENT_ID,
      note: payload.p_note,
      grow_id: GROW,
      plant_id: payload.p_target_type === "plant" ? payload.p_target_id : null,
      tent_id: TENT,
    });
    return { data: { ok: true, grow_event_id: EVENT_ID, reused: false }, error: null };
  });
}
function modelLostReplyThenReuse() {
  rpcMock.mockImplementation(async (fn: string, payload: QuickLogV2SavePayload) => {
    expect(fn).toBe("quicklog_save_manual");
    const existing = committed.get(payload.p_idempotency_key);
    if (existing)
      return { data: { ok: true, reused: true, grow_event_id: existing.id }, error: null };
    committed.set(payload.p_idempotency_key, {
      id: EVENT_ID,
      note: payload.p_note,
      grow_id: GROW,
      plant_id: payload.p_target_type === "plant" ? payload.p_target_id : null,
      tent_id: TENT,
    });
    return { data: null, error: { message: "Failed to fetch" } };
  });
}

function renderSheet(target = `plant:${PLANT_VEG}`) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open onOpenChange={vi.fn()} defaultTargetKey={target} defaultAction="note" />
    </QueryClientProvider>,
  );
  return view;
}
const typeNote = () =>
  fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: NOTE } });
const save = () => fireEvent.click(screen.getByTestId("qlv2-save"));
const retry = () => fireEvent.click(screen.getByTestId("qlv2-save-retry"));
async function expectRetry() {
  await waitFor(() => expect(screen.getByTestId("qlv2-save-retry")).toBeEnabled());
  expect(screen.queryByTestId("qlv2-post-save")).not.toBeInTheDocument();
}
async function expectSaved() {
  await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeInTheDocument());
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  window.sessionStorage.clear();
  context.userId = OWNER;
  context.isError = false;
  context.plants = [
    { id: PLANT_VEG, name: "Plant A", tent_id: TENT, grow_id: GROW, stage: "veg" },
    { id: PLANT_NO_STAGE, name: "Plant B", tent_id: TENT, grow_id: GROW, stage: "unknown" },
  ];
  context.tents = [{ id: TENT, name: "Tent A", grow_id: GROW, stage: "flower" }];
  rpcMock.mockReset();
  uploadMock.mockReset().mockResolvedValue({ error: null });
  removeMock.mockReset().mockResolvedValue({ error: null });
  photoEntryMock.mockReset().mockResolvedValue({ ok: true });
  videoEntryMock.mockReset().mockResolvedValue({ ok: true });
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  committed = new Map();
  fromMock.mockImplementation(() => ({ select: selectMock }));
  selectMock.mockImplementation(() => ({ eq: eqMock }));
  eqMock.mockImplementation(() => ({ maybeSingle: readbackMock }));
  readbackMock
    .mockReset()
    .mockImplementation(async () => ({ data: [...committed.values()][0] ?? null, error: null }));
});

describe("V2 Note stage tag (mounted sheet)", () => {
  it("sends the selected plant's stage as p_stage on a new Note submission", async () => {
    modelOkReply();
    renderSheet(`plant:${PLANT_VEG}`);
    typeNote();
    save();
    await expectSaved();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const payload = rpcMock.mock.calls[0][1] as QuickLogV2SavePayload;
    expect(payload.p_target_type).toBe("plant");
    expect(payload.p_target_id).toBe(PLANT_VEG);
    expect(payload.p_action).toBe("note");
    expect(payload.p_stage).toBe("veg");
  });

  it("leaves p_stage unset when the selected plant's stage is unknown (never invents a stage, never falls back to the tent)", async () => {
    modelOkReply();
    renderSheet(`plant:${PLANT_NO_STAGE}`);
    typeNote();
    save();
    await expectSaved();
    const payload = rpcMock.mock.calls[0][1] as QuickLogV2SavePayload;
    expect(payload.p_target_id).toBe(PLANT_NO_STAGE);
    expect(payload).not.toHaveProperty("p_stage");
    expect(payload.p_stage).toBeUndefined();
  });

  it("lost-reply retry after a stage change and remount replays the original stage, target, timestamp and idempotency key", async () => {
    modelLostReplyThenReuse();
    const first = renderSheet(`plant:${PLANT_VEG}`);
    typeNote();
    save();
    await expectRetry();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const original = structuredClone(rpcMock.mock.calls[0][1]) as QuickLogV2SavePayload;
    expect(original.p_stage).toBe("veg");
    expect(typeof original.p_occurred_at).toBe("string");
    expect(typeof original.p_idempotency_key).toBe("string");

    // Stage changes server-side and the sheet is remounted on a different target.
    context.plants = context.plants.map((p) =>
      p.id === PLANT_VEG ? { ...p, stage: "flower" } : p,
    );
    first.unmount();
    await new Promise((r) => setTimeout(r, 5));
    renderSheet(`plant:${PLANT_NO_STAGE}`);
    await expectRetry();
    expect(rpcMock).toHaveBeenCalledTimes(1);

    retry();
    await expectSaved();
    expect(rpcMock).toHaveBeenCalledTimes(2);
    const replayed = rpcMock.mock.calls[1][1] as QuickLogV2SavePayload;
    expect(replayed).toEqual(original);
    expect(replayed.p_stage).toBe("veg");
    expect(replayed.p_target_id).toBe(PLANT_VEG);
    expect(replayed.p_occurred_at).toBe(original.p_occurred_at);
    expect(replayed.p_idempotency_key).toBe(original.p_idempotency_key);
    expect(committed.size).toBe(1);
  });
});
