import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";

type Payload = Record<string, unknown>;
const backend = vi.hoisted(() => ({
  posts: [] as Payload[],
  rows: new Map<string, Payload>(),
  loseFirstReply: true,
  rejectFirstWrite: false,
  malformedFirstReply: false,
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
      const key = String(payload.p_idempotency_key);
      const existing = backend.rows.get(key);
      if (!existing) backend.rows.set(key, payload);
      if (backend.posts.length === 1 && backend.malformedFirstReply) {
        return { data: { ok: "false", grow_event_id: {} }, error: null };
      }
      if (backend.posts.length === 1 && backend.loseFirstReply) {
        return { data: null, error: { message: "Reply unavailable" } };
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

function mount(plantId = "plant-a") {
  const renderTree = (id: string) => (
    <MemoryRouter>
      <QuickLogAllActivitiesSection
        growId="grow-a"
        tentId="tent-a"
        plantId={id}
        plantStage="flower"
      />
    </MemoryRouter>
  );
  const view = render(renderTree(plantId));
  return { ...view, changeTarget: (id: string) => view.rerender(renderTree(id)) };
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
  fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
}

async function loseReply(activity = "training") {
  selectActivity(activity);
  enterNote();
  save();
  await screen.findByTestId("quick-log-all-activities-error");
  await waitFor(() => expect(screen.getByTestId("quick-log-all-activities-save")).toBeEnabled());
}

beforeEach(() => {
  backend.posts = [];
  backend.rows = new Map();
  backend.loseFirstReply = true;
  backend.rejectFirstWrite = false;
  backend.malformedFirstReply = false;
  telemetry.mockReset();
  window.sessionStorage.clear();
});

describe("All activity types retry confirmation", () => {
  it.each(["training", "note", "environment_check"])(
    "keeps the %s draft and original submission after a malformed success reply",
    async (activity) => {
      backend.malformedFirstReply = true;
      mount();
      await loseReply(activity);
      expect(screen.getByTestId("quick-log-all-activities-error")).toHaveTextContent(
        /save is unconfirmed/i,
      );
      expect(screen.getByTestId("quick-log-all-activities-note")).toHaveValue(
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
    expect(screen.getByTestId("quick-log-all-activities-note")).toHaveValue("My observed activity");
  });

  it("rotates for edited notes and structured details", async () => {
    mount();
    await loseReply();
    enterNote("A different observation");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-technique"), {
      target: { value: "topping" },
    });
    save();
    await screen.findByTestId("quick-log-all-activities-saved");
    expect(backend.posts[1].p_idempotency_key).not.toBe(backend.posts[0].p_idempotency_key);
    expect(backend.posts[1]).toMatchObject({
      p_note: "A different observation",
      p_details: { technique: "topping" },
    });
    expect(backend.rows.size).toBe(2);
  });

  it("rotates for a structured-detail edit even when the note stays identical", async () => {
    mount();
    await loseReply();
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-technique"), {
      target: { value: "topping" },
    });
    save();
    await screen.findByTestId("quick-log-all-activities-saved");
    expect(backend.posts[1].p_note).toBe(backend.posts[0].p_note);
    expect(backend.posts[1].p_idempotency_key).not.toBe(backend.posts[0].p_idempotency_key);
    expect(backend.posts[1].p_details).toMatchObject({ technique: "topping" });
    expect(backend.rows.size).toBe(2);
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
  });

  it("does not reuse a cancelled draft when the same activity is selected again", async () => {
    mount();
    await loseReply();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-cancel"));
    selectActivity("training");
    enterNote();
    save();
    await screen.findByTestId("quick-log-all-activities-saved");
    expect(backend.posts[1].p_idempotency_key).not.toBe(backend.posts[0].p_idempotency_key);
  });
});
