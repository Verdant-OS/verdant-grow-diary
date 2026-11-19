/**
 * Cheek's phone pass (2026-11-19): the Note panel's Save already saved a log,
 * but Quick Log still said "Add a quick note before saving". He typed the note
 * again, pressed Save log, and got two entries. The confirmation also never
 * showed the note text.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";
import { QUICK_LOG_NOTE_ALREADY_SAVED_COPY } from "@/lib/quickLogNoteSaveRules";

const harness = vi.hoisted(() => ({
  plants: [] as Array<Record<string, unknown>>,
  tents: [] as Array<Record<string, unknown>>,
  rpc: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => harness.rpc(...args),
    from: () => ({ update: () => ({ eq: harness.update }) }),
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
vi.mock("@/hooks/use-plants", () => ({ usePlants: () => ({ data: harness.plants }) }));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => ({ data: harness.tents }) }));
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
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import QuickLog, { type QuickLogPrefill } from "@/components/QuickLog";

const prefix = "quick-log-dialog-all-activities";
const prototype = Element.prototype as Element & { scrollIntoView?: () => void };
prototype.scrollIntoView ??= () => {};

function renderQuickLog(prefill: QuickLogPrefill = { plantId: "p1", growId: "g1" }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickLog open onOpenChange={() => {}} prefill={prefill} />
    </QueryClientProvider>,
  );
}

async function saveNoteInPanel(text: string) {
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
  await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
  await screen.findByTestId(`${prefix}-saved-item`);
}

beforeEach(() => {
  clearLocalStorageForTest();
  window.sessionStorage.clear();
  vi.clearAllMocks();
  harness.plants = [{ id: "p1", name: "Plant One", grow_id: "g1", tent_id: "t1", stage: "veg" }];
  harness.tents = [{ id: "t1", name: "Tent One", grow_id: "g1" }];
  harness.rpc.mockResolvedValue({
    data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000001" },
    error: null,
  });
  harness.update.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("Quick Log Note panel saves once", () => {
  it("stops asking for a note after the Note panel saved one, and names it", async () => {
    renderQuickLog();
    expect(await screen.findByTestId("quicklog-preview-note:missing")).toBeInTheDocument();
    await saveNoteInPanel("Leaf tips curling");
    await waitFor(() => expect(screen.queryByTestId("quicklog-preview-note:missing")).toBeNull());
    expect(screen.getByTestId("quicklog-preview-note:saved-in-panel")).toHaveTextContent(
      "Leaf tips curling",
    );
  });

  it("shows the saved note text in the panel's confirmation", async () => {
    renderQuickLog();
    await saveNoteInPanel("Leaf tips curling");
    expect(screen.getByTestId(`${prefix}-saved-note`)).toHaveTextContent("Leaf tips curling");
  });

  it("does not save the same note a second time from Save log", async () => {
    renderQuickLog();
    await saveNoteInPanel("Leaf tips curling");
    fireEvent.change(screen.getByTestId("quicklog-note"), {
      target: { value: "  Leaf tips curling " },
    });
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await waitFor(() =>
      expect(toast.message).toHaveBeenCalledWith(QUICK_LOG_NOTE_ALREADY_SAVED_COPY),
    );
    expect(harness.rpc).toHaveBeenCalledTimes(1);
    // A repeat tap is still blocked.
    fireEvent.click(screen.getByTestId("quick-log-save"));
    expect(harness.rpc).toHaveBeenCalledTimes(1);
  });

  it("still saves a different note from Save log", async () => {
    renderQuickLog();
    await saveNoteInPanel("Leaf tips curling");
    fireEvent.change(screen.getByTestId("quicklog-note"), { target: { value: "Watered lightly" } });
    const save = screen.getByTestId("quick-log-save");
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(2));
  });
});

describe("Save log confirmation shows the note", () => {
  it("shows the saved note text after Save log", async () => {
    renderQuickLog({ plantId: "p1", growId: "g1", eventType: "observation", note: "New growth" });
    const save = screen.getByTestId("quick-log-save");
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    expect(await screen.findByTestId("quick-log-post-save-note")).toHaveTextContent("New growth");
  });
});
