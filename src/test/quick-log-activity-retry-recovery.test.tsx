import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";
import type { QuickLogAllActivitiesSaveSuccess } from "@/components/QuickLogAllActivitiesSection";
import type { QuickLogActivityId } from "@/constants/quickLogActivityTypes";

type Payload = Record<string, unknown>;
const backend = vi.hoisted(() => ({
  posts: [] as Payload[],
  rows: new Map<string, Payload>(),
  loseFirstReply: true,
  rejectFirstWrite: false,
  malformedFirstReply: false,
  serverRejectOnPost: 0,
  serverRejectReason: "invalid_typed_payload",
  failAfterHeldPost: 0,
  holdPost: 0,
  heldReply: null as Promise<void> | null,
}));
const telemetry = vi.hoisted(() => vi.fn());
vi.mock("@/lib/quickLogSuccessTelemetry", () => ({ trackQuickLogSuccess: telemetry }));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-a" }, loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (_name: string, input: Payload) => {
      const payload = structuredClone(input);
      backend.posts.push(payload);
      if (backend.posts.length === 1 && backend.rejectFirstWrite) {
        return { data: null, error: { message: "Write rejected before commit" } };
      }
      if (backend.posts.length === backend.serverRejectOnPost) {
        return { data: { ok: false, reason: backend.serverRejectReason }, error: null };
      }
      const key = String(payload.p_idempotency_key);
      const existing = backend.rows.get(key);
      if (!existing) backend.rows.set(key, payload);
      if (backend.posts.length === 1 && backend.malformedFirstReply) {
        return { data: { ok: "false", grow_event_id: {} }, error: null };
      }
      if (backend.posts.length === 1 && backend.loseFirstReply) {
        return { data: null, error: { message: "Reply unavailable" } };
      }
      if (backend.posts.length === backend.holdPost && backend.heldReply) {
        await backend.heldReply;
      }
      if (backend.posts.length === backend.failAfterHeldPost) {
        return { data: null, error: { message: "Reply unavailable after commit" } };
      }
      return {
        data: {
          ok: true,
          grow_event_id:
            "77777777-7777-4777-8777-" +
            String([...backend.rows.keys()].indexOf(key) + 1).padStart(12, "0"),
          reused: !!existing,
        },
        error: null,
      };
    },
  },
}));

function mount(
  plantId = "plant-a",
  initialStage: unknown = "flower",
  onSaveSuccess?: (result: QuickLogAllActivitiesSaveSuccess) => void,
) {
  let stage = initialStage;
  const renderTree = (id: string, requestedActivityId: QuickLogActivityId | null = null) => (
    <MemoryRouter>
      <QuickLogAllActivitiesSection
        growId="grow-a"
        tentId="tent-a"
        plantId={id}
        plantStage={stage}
        requestedActivityId={requestedActivityId}
        onSaveSuccess={onSaveSuccess}
      />
    </MemoryRouter>
  );
  const view = render(renderTree(plantId));
  return {
    ...view,
    changeTarget: (id: string, requestedActivityId: QuickLogActivityId | null = null) =>
      view.rerender(renderTree(id, requestedActivityId)),
    changeStage: (nextStage: unknown) => {
      stage = nextStage;
      view.rerender(renderTree(plantId));
    },
  };
}

function selectActivity(id: string) {
  if (!screen.queryByTestId("quick-log-all-activities-picker-" + id)) {
    fireEvent.click(screen.getByRole("button", { name: "More activity types" }));
  }
  fireEvent.click(screen.getByTestId("quick-log-all-activities-picker-" + id));
}

function enterNote(note = "My observed activity") {
  fireEvent.change(screen.getByTestId("quick-log-all-activities-note"), {
    target: { value: note },
  });
}

function save() {
  fireEvent.click(
    screen.queryByTestId("quick-log-all-activities-retry-original") ??
      screen.getByTestId("quick-log-all-activities-save"),
  );
}

async function loseReply(activity = "training") {
  selectActivity(activity);
  enterNote();
  save();
  await screen.findByTestId("quick-log-all-activities-error");
  await waitFor(() =>
    expect(screen.getByTestId("quick-log-all-activities-retry-original")).toBeEnabled(),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  backend.posts = [];
  backend.rows = new Map();
  backend.loseFirstReply = true;
  backend.rejectFirstWrite = false;
  backend.malformedFirstReply = false;
  backend.serverRejectOnPost = 0;
  backend.serverRejectReason = "invalid_typed_payload";
  backend.failAfterHeldPost = 0;
  backend.holdPost = 0;
  backend.heldReply = null;
  telemetry.mockReset();
  window.sessionStorage.clear();
});

describe("All activity types retry confirmation", () => {
  it("blocks an unresolved Harvest retry while the current stage is ineligible or unknown", async () => {
    const view = mount();
    selectActivity("harvest");
    save();
    await waitFor(() => expect(backend.posts).toHaveLength(1));
    await screen.findByTestId("quick-log-all-activities-pending-activity");
    await act(async () => view.changeStage("veg"));
    expect(screen.getByTestId("quick-log-all-activities-retry-original")).toBeDisabled();
    expect(screen.getByTestId("quick-log-all-activities-pending-activity")).toHaveTextContent(
      /Flower, Flush, or Harvest stages/,
    );
    expect(backend.posts).toHaveLength(1);
    view.unmount();
    const remounted = mount("plant-a", null);
    expect(screen.getByTestId("quick-log-all-activities-retry-original")).toBeDisabled();
    expect(backend.posts).toHaveLength(1);
    await act(async () => remounted.changeStage("flower"));
    expect(screen.getByTestId("quick-log-all-activities-retry-original")).toBeEnabled();
    save();
    await screen.findByTestId("quick-log-all-activities-saved-item");
    expect(backend.posts).toHaveLength(2);
    expect(backend.posts[1]).toEqual(backend.posts[0]);
    expect(backend.rows.size).toBe(1);
  });

  it("retries only storage cleanup after a confirmed activity cannot clear its recovery record", async () => {
    const onSaveSuccess = vi.fn();
    const view = mount("plant-a", "flower", onSaveSuccess);
    await loseReply();
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => undefined);
    save();
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-all-activities-pending-activity")).toHaveTextContent(
        /activity was saved, but its recovery record could not be cleared/i,
      ),
    );
    expect(backend.posts).toHaveLength(2);
    expect(backend.rows.size).toBe(1);
    expect(telemetry).toHaveBeenCalledTimes(1);
    expect(onSaveSuccess).not.toHaveBeenCalled();
    save();
    expect(backend.posts).toHaveLength(2);
    expect(telemetry).toHaveBeenCalledTimes(1);
    view.unmount();
    mount("plant-a", "flower", onSaveSuccess);
    expect(screen.getByTestId("quick-log-all-activities-retry-original")).toHaveTextContent(
      "Clear saved recovery record",
    );
    save();
    expect(backend.posts).toHaveLength(2);
    remove.mockRestore();
    save();
    await screen.findByTestId("quick-log-all-activities-saved-item");
    expect(
      screen.queryByTestId("quick-log-all-activities-pending-activity"),
    ).not.toBeInTheDocument();
    expect(backend.posts).toHaveLength(2);
    expect(telemetry).toHaveBeenCalledTimes(1);
    expect(onSaveSuccess).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId("quick-log-all-activities-saved-item")).toHaveLength(1);
  });

  it("does not replay a first confirmed write when cleanup fails", async () => {
    backend.loseFirstReply = false;
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => undefined);
    const onSaveSuccess = vi.fn();
    mount("plant-a", "flower", onSaveSuccess);
    selectActivity("training");
    enterNote();
    save();
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-all-activities-retry-original")).toHaveTextContent(
        "Clear saved recovery record",
      ),
    );
    expect(backend.posts).toHaveLength(1);
    save();
    expect(backend.posts).toHaveLength(1);
    remove.mockRestore();
    save();
    await screen.findByTestId("quick-log-all-activities-saved-item");
    expect(backend.posts).toHaveLength(1);
    expect(backend.rows.size).toBe(1);
    expect(onSaveSuccess).toHaveBeenCalledTimes(1);
  });

  it("cleans up a definitive first rejection without replaying it or claiming a save", async () => {
    backend.serverRejectOnPost = 1;
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => undefined);
    const view = mount();
    selectActivity("training");
    enterNote();
    save();
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-all-activities-retry-original")).toHaveTextContent(
        "Clear rejected recovery record",
      ),
    );
    expect(screen.getByTestId("quick-log-all-activities-pending-activity")).toHaveTextContent(
      /server refused this activity, but its recovery record could not be cleared/i,
    );
    expect(backend.posts).toHaveLength(1);
    expect(backend.rows.size).toBe(0);
    expect(screen.queryByTestId("quick-log-all-activities-saved-item")).not.toBeInTheDocument();
    expect(telemetry).not.toHaveBeenCalled();
    save();
    expect(backend.posts).toHaveLength(1);
    view.unmount();
    mount();
    expect(screen.getByTestId("quick-log-all-activities-retry-original")).toHaveTextContent(
      "Clear rejected recovery record",
    );
    remove.mockRestore();
    save();
    expect(
      screen.queryByTestId("quick-log-all-activities-pending-activity"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-log-all-activities-note")).toBeEnabled();
    expect(backend.posts).toHaveLength(1);
    enterNote("Corrected after rejection");
    save();
    await screen.findByTestId("quick-log-all-activities-saved-item");
    expect(backend.posts).toHaveLength(2);
    expect(backend.posts[1].p_idempotency_key).not.toBe(backend.posts[0].p_idempotency_key);
    expect(backend.rows.size).toBe(1);
  });

  it("blocks an over-500-character note before claiming or sending a request", async () => {
    mount();
    selectActivity("training");
    enterNote("a".repeat(501));
    save();
    expect(screen.getByTestId("quick-log-all-activities-error")).toHaveTextContent(
      /500 characters or fewer/,
    );
    expect(backend.posts).toHaveLength(0);
    expect(screen.getByTestId("quick-log-all-activities-note")).toBeEnabled();
    enterNote("a".repeat(500));
    save();
    await waitFor(() => expect(backend.posts).toHaveLength(1));
  });

  it("releases a first structured server rejection so the grower can correct the draft", async () => {
    backend.serverRejectOnPost = 1;
    mount();
    selectActivity("training");
    enterNote();
    save();
    await screen.findByTestId("quick-log-all-activities-error");
    expect(screen.getByTestId("quick-log-all-activities-error")).toHaveTextContent(
      /server refused this activity/i,
    );
    expect(screen.getByTestId("quick-log-all-activities-note")).toBeEnabled();
    expect(
      screen.queryByTestId("quick-log-all-activities-pending-activity"),
    ).not.toBeInTheDocument();
    expect(window.sessionStorage.length).toBe(0);
    backend.serverRejectOnPost = 0;
    enterNote("Corrected training note");
    save();
    await screen.findByTestId("quick-log-all-activities-saved-item");
    expect(backend.rows.size).toBe(1);
    expect(backend.posts[1].p_idempotency_key).not.toBe(backend.posts[0].p_idempotency_key);
  });

  it("retains an ambiguous earlier attempt when its exact retry is rejected", async () => {
    const view = mount();
    await loseReply();
    backend.serverRejectOnPost = 2;
    save();
    await waitFor(() => expect(backend.posts).toHaveLength(2));
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-all-activities-error")).toHaveTextContent(
        /earlier save may have succeeded/i,
      ),
    );
    expect(screen.getByTestId("quick-log-all-activities-pending-activity")).toBeInTheDocument();
    expect(backend.posts[1]).toEqual(backend.posts[0]);
    expect(backend.rows.size).toBe(1);
    view.unmount();
    mount();
    expect(screen.getByTestId("quick-log-all-activities-pending-activity")).toBeInTheDocument();
  });

  it("does not show plant A's late failed save as plant B's error", async () => {
    backend.loseFirstReply = false;
    backend.holdPost = 1;
    backend.failAfterHeldPost = 1;
    let release!: () => void;
    backend.heldReply = new Promise<void>((resolve) => {
      release = resolve;
    });
    const view = mount();
    selectActivity("training");
    enterNote("Plant A activity");
    save();
    await waitFor(() => expect(backend.posts).toHaveLength(1));
    await act(async () => view.changeTarget("plant-b", "training"));
    expect(screen.getByTestId("quick-log-all-activities-note")).toBeInTheDocument();
    await act(async () => release());
    expect(screen.queryByTestId("quick-log-all-activities-error")).not.toBeInTheDocument();
    await act(async () => view.changeTarget("plant-a"));
    expect(screen.getByTestId("quick-log-all-activities-pending-activity")).toHaveTextContent(
      "Plant A activity",
    );
  });
  it.each(["training", "note", "environment_check"])(
    "keeps the %s draft and original submission after a malformed success reply",
    async (activity) => {
      backend.malformedFirstReply = true;
      mount();
      await loseReply(activity);
      expect(screen.getByTestId("quick-log-all-activities-error")).toHaveTextContent(
        /save is unconfirmed/i,
      );
      expect(screen.getByTestId("quick-log-all-activities-pending-activity")).toHaveTextContent(
        "My observed activity",
      );
      expect(screen.queryByTestId("quick-log-all-activities-saved")).not.toBeInTheDocument();
      expect(telemetry).not.toHaveBeenCalled();
      save();
      await screen.findByTestId("quick-log-all-activities-saved");
      expect(backend.posts).toHaveLength(2);
      expect(backend.posts[1]).toEqual(backend.posts[0]);
      expect(backend.rows.size).toBe(1);
      expect(telemetry).toHaveBeenCalledTimes(1);
      expect(telemetry).toHaveBeenCalledWith(activity, { reused: true });
    },
  );
  for (const activity of ["training", "note", "environment_check"]) {
    it(`keeps the logical ${activity} key after an accepted write loses its reply`, async () => {
      mount();
      await loseReply(activity);
      expect(backend.rows.size).toBe(1);
      expect(screen.queryByTestId("quick-log-all-activities-saved")).not.toBeInTheDocument();
      expect(telemetry).not.toHaveBeenCalled();
      save();
      await screen.findByTestId("quick-log-all-activities-saved");
      expect(backend.posts).toHaveLength(2);
      expect(backend.posts[1]).toEqual(backend.posts[0]);
      expect(backend.rows.size).toBe(1);
      expect(telemetry).toHaveBeenCalledWith(activity, { reused: true });
    });
  }

  it("keeps the draft and uses unconfirmed copy instead of asserting that nothing saved", async () => {
    mount();
    await loseReply();
    expect(screen.getByTestId("quick-log-all-activities-error")).toHaveTextContent(
      /save is unconfirmed/i,
    );
    expect(screen.getByTestId("quick-log-all-activities-error")).not.toHaveTextContent(
      /nothing was saved/i,
    );
    expect(screen.getByTestId("quick-log-all-activities-pending-activity")).toHaveTextContent(
      "My observed activity",
    );
  });

  it("does not permit an edited retry to duplicate an accepted activity", async () => {
    mount();
    await loseReply();
    expect(screen.queryByTestId("quick-log-all-activities-note")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("quick-log-all-activities-detail-technique"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("quick-log-all-activities-cancel")).not.toBeInTheDocument();
    save();
    await screen.findByTestId("quick-log-all-activities-saved");
    expect(backend.posts[1]).toEqual(backend.posts[0]);
    expect(backend.rows.size).toBe(1);
  });

  it("retains structured details unchanged while checking a lost reply", async () => {
    mount();
    selectActivity("training");
    enterNote();
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-technique"), {
      target: { value: "topping" },
    });
    save();
    await screen.findByTestId("quick-log-all-activities-retry-original");
    expect(screen.getByTestId("quick-log-all-activities-pending-activity")).toHaveTextContent(
      "topping",
    );
    save();
    await screen.findByTestId("quick-log-all-activities-saved");
    expect(backend.posts[1]).toEqual(backend.posts[0]);
    expect(backend.rows.size).toBe(1);
  });

  it("can save once on retry when the first attempt did not commit", async () => {
    backend.rejectFirstWrite = true;
    mount();
    await loseReply();
    expect(backend.rows.size).toBe(0);
    save();
    await screen.findByTestId("quick-log-all-activities-saved");
    expect(backend.posts[1]).toEqual(backend.posts[0]);
    expect(backend.rows.size).toBe(1);
    expect(telemetry).toHaveBeenCalledWith("training", { reused: false });
  });

  it("gives a fresh key to an identical new activity after confirmed success", async () => {
    backend.loseFirstReply = false;
    mount();
    selectActivity("training");
    enterNote();
    save();
    await screen.findByTestId("quick-log-all-activities-saved");
    selectActivity("training");
    enterNote();
    save();
    await waitFor(() => expect(backend.posts).toHaveLength(2));
    await waitFor(() =>
      expect(screen.getAllByTestId("quick-log-all-activities-saved-item")).toHaveLength(2),
    );
    expect(backend.posts[1].p_idempotency_key).not.toBe(backend.posts[0].p_idempotency_key);
    expect(backend.rows.size).toBe(2);
  });

  it("gives a new target its own draft and save identity", async () => {
    const view = mount();
    await loseReply();
    await act(async () => view.changeTarget("plant-b"));
    selectActivity("training");
    enterNote();
    save();
    await screen.findByTestId("quick-log-all-activities-saved");
    expect(backend.posts[1].p_plant_id).toBe("plant-b");
    expect(backend.posts[1].p_idempotency_key).not.toBe(backend.posts[0].p_idempotency_key);
    expect(backend.rows.size).toBe(2);
    await act(async () => view.changeTarget("plant-a"));
    expect(screen.getByTestId("quick-log-all-activities-pending-activity")).toHaveTextContent(
      "My observed activity",
    );
    save();
    await waitFor(() => expect(backend.posts).toHaveLength(3));
    expect(backend.posts[2]).toEqual(backend.posts[0]);
    expect(backend.rows.size).toBe(2);
  });

  it("restores the unresolved exact attempt after a remount", async () => {
    const view = mount();
    await loseReply();
    const originalOccurredAt = backend.posts[0].p_occurred_at;
    expect(originalOccurredAt).toEqual(expect.any(String));
    view.unmount();
    mount();
    expect(screen.getByTestId("quick-log-all-activities-pending-activity")).toHaveTextContent(
      "My observed activity",
    );
    save();
    await screen.findByTestId("quick-log-all-activities-saved");
    expect(backend.posts[1]).toEqual(backend.posts[0]);
    expect(backend.posts[1].p_occurred_at).toBe(originalOccurredAt);
    expect(backend.rows.size).toBe(1);
  });

  it("does not show a late confirmed plant A retry as a plant B receipt", async () => {
    const view = mount();
    await loseReply();
    let release!: () => void;
    backend.holdPost = 2;
    backend.heldReply = new Promise<void>((resolve) => {
      release = resolve;
    });
    save();
    await waitFor(() => expect(backend.posts).toHaveLength(2));
    await act(async () => view.changeTarget("plant-b"));
    await act(async () => release());
    expect(screen.queryByTestId("quick-log-all-activities-saved-item")).not.toBeInTheDocument();
    selectActivity("training");
    enterNote("Plant B activity");
    save();
    await screen.findByTestId("quick-log-all-activities-saved-item");
    expect(backend.posts[2].p_plant_id).toBe("plant-b");
    expect(backend.rows.size).toBe(2);
  });

  it("does not dispatch when recovery storage silently drops a claim", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => undefined);
    mount();
    selectActivity("training");
    enterNote();
    save();
    await screen.findByTestId("quick-log-all-activities-activity-recovery-blocked");
    expect(backend.posts).toHaveLength(0);
    expect(screen.queryByTestId("quick-log-all-activities-saved")).not.toBeInTheDocument();
  });
});
