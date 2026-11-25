/**
 * The same note on the same plant is blocked for 10 minutes after Quick Log
 * closes, because the guard reads saved diary rows rather than panel state.
 */
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";
import { QUICK_LOG_NOTE_ALREADY_SAVED_COPY } from "@/lib/quickLogNoteSaveRules";

const harness = vi.hoisted(() => ({
  plants: [] as Array<Record<string, unknown>>,
  tents: [] as Array<Record<string, unknown>>,
  diary: [] as Array<Record<string, unknown>>,
  rpc: vi.fn(),
}));

function diaryQuery() {
  const chain = {
    select: () => chain,
    is: () => chain,
    order: () => Promise.resolve({ data: harness.diary, error: null }),
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => harness.rpc(...args),
    from: () => diaryQuery(),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "Grow One", stage: "veg" }],
    activeGrow: { id: "g1", name: "Grow One", stage: "veg" },
    activeGrowId: "g1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: harness.plants, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: harness.tents, isLoading: false, isError: false }),
}));
vi.mock("@/lib/sensor", () => ({
  useLatestTentSensorSnapshot: () => ({
    status: "empty",
    snapshot: { status: "empty", source: null, captured_at: null, metrics: {} },
  }),
}));
vi.mock("@/hooks/usePhenoEvidenceCaptureContext", () => ({
  usePhenoEvidenceCaptureContext: () => ({ status: "disabled", context: null }),
}));
vi.mock("@/components/QuickLogSensorSnapshotStrip", () => ({ default: () => null }));
vi.mock("@/lib/quickLogPhotoDiaryEntry", () => ({
  createQuickLogPhotoDiaryEntry: vi.fn(),
  hasConfirmedQuickLogPhotoDiaryEntryForOwner: vi.fn().mockResolvedValue(false),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

import QuickLog from "@/components/QuickLog";
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

const prefix = "quick-log-dialog-all-activities";
const prototype = Element.prototype as Element & { scrollIntoView?: () => void };
prototype.scrollIntoView ??= () => {};

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

function Host({ plantId = "p1" }: { plantId?: string }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        reopen
      </button>
      <QuickLog
        open={open}
        onOpenChange={setOpen}
        prefill={{ plantId, growId: "g1", tentId: "t1" }}
      />
    </>
  );
}

function renderHost(plantId = "p1") {
  const queryClient = client();
  render(
    <QueryClientProvider client={queryClient}>
      <Host plantId={plantId} />
    </QueryClientProvider>,
  );
  return queryClient;
}

async function savePanelNote(text: string) {
  await waitFor(() =>
    expect(screen.getByTestId("quick-log-target-card")).toHaveAttribute(
      "data-target-plant-id",
      "p1",
    ),
  );
  const pickerId = `${prefix}-picker-note`;
  if (!screen.queryByTestId(pickerId)) {
    fireEvent.click(screen.getByRole("button", { name: "More activity types" }));
  }
  fireEvent.click(screen.getByTestId(pickerId));
  await screen.findByTestId(`${prefix}-form`);
  fireEvent.change(screen.getByTestId(`${prefix}-note`), { target: { value: text } });
  fireEvent.click(screen.getByTestId(`${prefix}-save`));
}

beforeEach(() => {
  clearLocalStorageForTest();
  window.sessionStorage.clear();
  vi.clearAllMocks();
  harness.diary = [];
  harness.plants = [
    { id: "p1", name: "Plant One", grow_id: "g1", tent_id: "t1", stage: "veg" },
    { id: "p2", name: "Plant Two", grow_id: "g1", tent_id: "t1", stage: "veg" },
  ];
  harness.tents = [{ id: "t1", name: "Tent One", grow_id: "g1" }];
  harness.rpc.mockImplementation(async () => {
    harness.diary = [
      ...harness.diary,
      {
        plant_id: "p1",
        note: "Leaf tips curling",
        entry_at: new Date().toISOString(),
        details: { event_type: "note" },
      },
    ];
    return {
      data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000001" },
      error: null,
    };
  });
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("plant Quick Log blocks a reopened duplicate note", () => {
  it("blocks the same text after close and reopen and does not call the RPC again", async () => {
    renderHost();
    await savePanelNote("Leaf tips curling");
    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId(`${prefix}-save`)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "reopen" }));
    await savePanelNote("Leaf tips curling");
    expect(await screen.findByText(QUICK_LOG_NOTE_ALREADY_SAVED_COPY)).toBeInTheDocument();
    expect(harness.rpc).toHaveBeenCalledTimes(1);
  });

  it("saves a different note after reopen", async () => {
    renderHost();
    await savePanelNote("Leaf tips curling");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "reopen" }));
    await savePanelNote("New growth");
    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(2));
  });

  it("allows the same text on another plant", async () => {
    harness.diary = [
      {
        plant_id: "p1",
        note: "Leaf tips curling",
        entry_at: new Date().toISOString(),
        details: { event_type: "note" },
      },
    ];
    const queryClient = client();
    render(
      <QueryClientProvider client={queryClient}>
        <QuickLog
          open
          onOpenChange={() => {}}
          prefill={{ plantId: "p2", growId: "g1", tentId: "t1" }}
        />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-target-card")).toHaveAttribute(
        "data-target-plant-id",
        "p2",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "More activity types" }));
    fireEvent.click(screen.getByTestId(`${prefix}-picker-note`));
    fireEvent.change(await screen.findByTestId(`${prefix}-note`), {
      target: { value: "Leaf tips curling" },
    });
    fireEvent.click(screen.getByTestId(`${prefix}-save`));
    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
  });

  it("allows the same text after 10 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T12:00:00.000Z"));
    harness.diary = [
      {
        plant_id: "p1",
        note: "Leaf tips curling",
        entry_at: "2026-11-25T11:49:00.000Z",
        details: { event_type: "note" },
      },
    ];
    render(
      <QueryClientProvider client={client()}>
        <QuickLog
          open
          onOpenChange={() => {}}
          prefill={{ plantId: "p1", growId: "g1", tentId: "t1" }}
        />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-target-card")).toHaveAttribute(
        "data-target-plant-id",
        "p1",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "More activity types" }));
    fireEvent.click(screen.getByTestId(`${prefix}-picker-note`));
    fireEvent.change(await screen.findByTestId(`${prefix}-note`), {
      target: { value: "Leaf tips curling" },
    });
    fireEvent.click(screen.getByTestId(`${prefix}-save`));
    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
  });

  it("allows a retry after the earlier save failed", async () => {
    harness.rpc.mockResolvedValueOnce({ data: null, error: { message: "save_failed" } });
    render(
      <QueryClientProvider client={client()}>
        <QuickLog
          open
          onOpenChange={() => {}}
          prefill={{ plantId: "p1", growId: "g1", tentId: "t1" }}
        />
      </QueryClientProvider>,
    );
    await savePanelNote("Leaf tips curling");
    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByTestId(`${prefix}-retry-original`));
    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(2));
  });
});

function V2Host() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        reopen v2
      </button>
      <QuickLogV2Sheet open={open} onOpenChange={setOpen} defaultTargetKey="plant:p1" />
    </>
  );
}

async function saveV2(text: string) {
  const note = await screen.findByTestId("qlv2-note");
  fireEvent.change(note, { target: { value: text } });
  const save = screen.getByTestId("qlv2-save");
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
}

describe("header Quick Log blocks a reopened duplicate note", () => {
  it("blocks the same text after close and reopen and does not call the RPC again", async () => {
    render(
      <QueryClientProvider client={client()}>
        <V2Host />
      </QueryClientProvider>,
    );
    await saveV2("Leaf tips curling");
    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "reopen v2" }));
    await saveV2("Leaf tips curling");
    expect(await screen.findByTestId("qlv2-error")).toHaveTextContent(
      QUICK_LOG_NOTE_ALREADY_SAVED_COPY,
    );
    expect(harness.rpc).toHaveBeenCalledTimes(1);
  });

  it("saves a different note after reopen", async () => {
    render(
      <QueryClientProvider client={client()}>
        <V2Host />
      </QueryClientProvider>,
    );
    await saveV2("Leaf tips curling");
    await waitFor(() => expect(harness.rpc).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "reopen v2" }));
    await saveV2("New growth");
    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(2));
  });

  it("allows the same text on another plant and after 10 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T12:00:00.000Z"));
    harness.diary = [
      {
        plant_id: "p1",
        note: "Leaf tips curling",
        entry_at: "2026-11-25T11:49:00.000Z",
        details: { event_type: "note" },
      },
    ];
    render(
      <QueryClientProvider client={client()}>
        <QuickLogV2Sheet open onOpenChange={() => {}} defaultTargetKey="plant:p2" />
      </QueryClientProvider>,
    );
    await saveV2("Leaf tips curling");
    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
  });

  it("allows a retry after the earlier save failed", async () => {
    harness.rpc.mockResolvedValueOnce({ data: null, error: { message: "nope" } });
    render(
      <QueryClientProvider client={client()}>
        <QuickLogV2Sheet open onOpenChange={() => {}} defaultTargetKey="plant:p1" />
      </QueryClientProvider>,
    );
    await saveV2("Leaf tips curling");
    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
    const retry = await screen.findByTestId("qlv2-save-retry");
    fireEvent.click(retry);
    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(2));
  });
});
