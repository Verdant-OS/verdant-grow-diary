import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";
import { QUICK_LOG_V2_OPEN_EVENT } from "@/lib/quickLogV2OpenIntent";

const harness = vi.hoisted(() => ({
  plants: [] as Array<Record<string, unknown>>,
  tents: [] as Array<Record<string, unknown>>,
  rpc: vi.fn(),
  photo: vi.fn(),
  upload: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => harness.rpc(...args),
    from: () => ({ update: () => ({ eq: harness.update }) }),
    storage: { from: () => ({ upload: harness.upload, remove: vi.fn() }) },
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
  createQuickLogPhotoDiaryEntry: (...args: unknown[]) => harness.photo(...args),
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

async function chooseActivity(id: string) {
  await waitFor(() =>
    expect(screen.getByTestId("quick-log-target-card")).toHaveAttribute(
      "data-target-plant-id",
      "p1",
    ),
  );
  const pickerId = `${prefix}-picker-${id}`;
  if (!screen.queryByTestId(pickerId)) {
    fireEvent.click(screen.getByRole("button", { name: "More activity types" }));
  }
  fireEvent.click(screen.getByTestId(pickerId));
  return screen.findByTestId(`${prefix}-form`);
}

beforeEach(() => {
  clearLocalStorageForTest();
  vi.clearAllMocks();
  harness.plants = [{ id: "p1", name: "Plant One", grow_id: "g1", tent_id: null, stage: "veg" }];
  harness.tents = [{ id: "t1", name: "Tent One", grow_id: "g1" }];
  harness.rpc.mockResolvedValue({
    data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000001" },
    error: null,
  });
  harness.photo.mockResolvedValue({ ok: true });
  harness.upload.mockResolvedValue({ error: null });
  harness.update.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("Quick Log tentless in-grow plant saves", () => {
  it("saves the Dashboard legacy Note through the existing manual RPC", async () => {
    renderQuickLog({ plantId: "p1", growId: "g1", eventType: "observation", note: "New growth" });
    const save = screen.getByTestId("quick-log-save");
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() =>
      expect(harness.rpc).toHaveBeenCalledWith(
        "quicklog_save_manual",
        expect.objectContaining({
          p_target_type: "plant",
          p_target_id: "p1",
          p_action: "note",
          p_note: "New growth",
        }),
      ),
    );
    expect(await screen.findByTestId("quick-log-post-save-another")).toBeInTheDocument();
  });

  it.each(["note", "issue_observation"])(
    "saves %s from the real shared activity section with plant and grow",
    async (id) => {
      renderQuickLog();
      await chooseActivity(id);
      fireEvent.change(screen.getByTestId(`${prefix}-note`), {
        target: { value: "Leaf observation" },
      });
      const save = screen.getByTestId(`${prefix}-save`);
      expect(save).toBeEnabled();
      fireEvent.click(save);
      await waitFor(() => expect(harness.rpc).toHaveBeenCalled());
      if (id === "note") {
        expect(harness.rpc).toHaveBeenCalledWith(
          "quicklog_save_manual",
          expect.objectContaining({ p_target_type: "plant", p_target_id: "p1", p_action: "note" }),
        );
      } else {
        expect(harness.rpc).toHaveBeenCalledWith(
          "quicklog_save_event",
          expect.objectContaining({
            p_grow_id: "g1",
            p_plant_id: "p1",
            p_tent_id: null,
            p_event_type: "observation",
          }),
        );
      }
    },
  );

  it("saves Photo with a real file and explicitly null tent lineage", async () => {
    renderQuickLog();
    await chooseActivity("photo");
    fireEvent.change(screen.getByTestId(`${prefix}-photo-file`), {
      target: { files: [new File(["photo"], "plant.jpg", { type: "image/jpeg" })] },
    });
    const save = screen.getByTestId(`${prefix}-save`);
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(harness.photo).toHaveBeenCalledWith(
        expect.objectContaining({ growId: "g1", plantId: "p1", tentId: null }),
      ),
    );
    expect(harness.upload).toHaveBeenCalledTimes(1);
    expect(harness.rpc).not.toHaveBeenCalled();
  });

  it("blocks Water with tent-only copy and does not open the structured writer", async () => {
    const opened = vi.fn();
    window.addEventListener(QUICK_LOG_V2_OPEN_EVENT, opened);
    try {
      renderQuickLog();
      await waitFor(() =>
        expect(screen.getByTestId("quick-log-target-card")).toHaveAttribute(
          "data-target-plant-id",
          "p1",
        ),
      );
      fireEvent.click(screen.getByTestId(`${prefix}-picker-watering`));
      expect(opened).not.toHaveBeenCalled();
      expect(await screen.findByTestId(`${prefix}-structured-water-error`)).toHaveTextContent(
        "Assign this plant to a tent before saving.",
      );
      expect(opened).not.toHaveBeenCalled();
      expect(harness.rpc).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(QUICK_LOG_V2_OPEN_EVENT, opened);
    }
  });

  it.each(["feeding", "environment_check"])("keeps %s blocked with tent-only copy", async (id) => {
    renderQuickLog();
    await chooseActivity(id);
    fireEvent.change(screen.getByTestId(`${prefix}-note`), {
      target: { value: "Valid activity observation" },
    });
    expect(screen.getByTestId(`${prefix}-save`)).toBeDisabled();
    expect(screen.getByTestId(`${prefix}-persistence-block`)).toHaveTextContent(
      "Assign this plant to a tent before saving.",
    );
    expect(harness.rpc).not.toHaveBeenCalled();
  });

  it.each(["training", "defoliation", "harvest"] as const)(
    "blocks %s for a tentless plant before any write",
    async (id) => {
      if (id === "harvest") harness.plants[0].stage = "flower";
      renderQuickLog();
      await chooseActivity(id);
      fireEvent.change(screen.getByTestId(`${prefix}-note`), {
        target: { value: "Activity observation" },
      });
      expect(screen.getByTestId(`${prefix}-save`)).toBeDisabled();
      expect(screen.getByTestId(`${prefix}-persistence-block`)).toHaveTextContent(
        "Assign this plant to a tent before saving.",
      );
      expect(harness.rpc).not.toHaveBeenCalled();
      expect(harness.photo).not.toHaveBeenCalled();
    },
  );

  it("blocks the main Environment entry before its existing writer", async () => {
    renderQuickLog({
      plantId: "p1",
      growId: "g1",
      eventType: "environment",
      note: "Environment observation",
    });
    expect(await screen.findByTestId("quick-log-target-error")).toHaveTextContent(
      "Assign this plant to a tent before saving.",
    );
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
    fireEvent.submit(screen.getByTestId("quick-log-save").closest("form")!);
    expect(harness.rpc).not.toHaveBeenCalled();
  });

  it("preserves the no-grow copy and blocks all persistence", async () => {
    harness.plants[0].grow_id = null;
    renderQuickLog({ plantId: "p1" });
    expect(await screen.findByTestId("quick-log-target-error")).toHaveTextContent(
      "Assign this plant to a grow and tent before saving.",
    );
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
    expect(harness.rpc).not.toHaveBeenCalled();
    expect(harness.photo).not.toHaveBeenCalled();
  });

  it("preserves a tented Note save", async () => {
    harness.plants[0].tent_id = "t1";
    renderQuickLog({ plantId: "p1", growId: "g1", tentId: "t1", note: "Tented note" });
    await waitFor(() => expect(screen.getByTestId("quick-log-save")).toBeEnabled());
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await waitFor(() => expect(harness.rpc).toHaveBeenCalled());
  });

  it("preserves the tent/grow mismatch fence for every save surface", async () => {
    harness.plants[0].tent_id = "t1";
    harness.tents[0].grow_id = "g2";
    renderQuickLog({ plantId: "p1", growId: "g1", tentId: "t1" });
    expect(await screen.findByTestId("quick-log-target-error")).toHaveTextContent(
      "The selected tent belongs to another grow.",
    );
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
    expect(screen.getByTestId(`${prefix}-persistence-block`)).toHaveTextContent(
      "The selected tent belongs to another grow.",
    );
    expect(harness.rpc).not.toHaveBeenCalled();
    expect(harness.photo).not.toHaveBeenCalled();
  });
});
