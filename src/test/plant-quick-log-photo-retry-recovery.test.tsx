import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlantQuickLog from "@/components/PlantQuickLog";

const state = vi.hoisted(() => ({
  owner: "11111111-1111-4111-8111-111111111111",
  mode: "lost-once" as "lost-once" | "reject" | "success",
  now: 1_789_560_000_000,
  objects: new Map<string, File>(),
  events: new Map<string, Record<string, unknown>>(),
  diary: new Map<string, Record<string, unknown>>(),
  requests: [] as Array<Record<string, unknown>>,
  uploads: [] as string[],
  removes: [] as string[],
  uploadWait: null as Promise<void> | null,
  replyWait: null as Promise<void> | null,
  readFailure: false,
  telemetry: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: state.owner } }) }));
vi.mock("@/hooks/usePlantManualSensorHistory", () => ({
  usePlantManualSensorLogs: () => ({ data: [] }),
}));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => ({ preference: "fahrenheit" }),
}));
vi.mock("@/lib/quickLogSuccessTelemetry", () => ({ trackQuickLogSuccess: state.telemetry }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: async (path: string, file: File) => {
          state.uploads.push(path);
          state.objects.set(path, file);
          if (state.uploadWait) await state.uploadWait;
          return { data: { path }, error: null };
        },
        remove: async (paths: string[]) => {
          state.removes.push(...paths);
          paths.forEach((path) => state.objects.delete(path));
          return { data: [], error: null };
        },
      }),
    },
    rpc: async (_name: string, payload: Record<string, unknown>) => {
      state.requests.push(structuredClone(payload));
      if (state.mode === "reject")
        return { data: { ok: false, reason: "target_not_owned" }, error: null };
      const key = String(payload.p_idempotency_key);
      const reused = state.events.has(key);
      if (!reused) {
        const id = "22222222-2222-4222-8222-" + String(state.events.size + 1).padStart(12, "0");
        state.events.set(key, {
          id,
          note: payload.p_note,
          plant_id: payload.p_target_id,
          tent_id: "tent-1",
          occurred_at: payload.p_occurred_at,
        });
        state.diary.set(id, {
          id: "diary-" + id,
          details: structuredClone(payload.p_details),
          photo_url: null,
        });
      }
      if (state.replyWait) await state.replyWait;
      if (state.mode === "lost-once" && state.requests.length === 1) {
        return { data: null, error: { name: "TypeError", message: "Failed to fetch" } };
      }
      return { data: { ok: true, grow_event_id: state.events.get(key)!.id, reused }, error: null };
    },
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          maybeSingle: async () => ({
            data: state.readFailure
              ? null
              : ([...state.events.values()].find((event) => event.id === id) ?? null),
            error: state.readFailure ? new Error("Read temporarily unavailable") : null,
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        filter: (_column: string, _operator: string, id: string) => ({
          select: async () => {
            if (table !== "diary_entries") throw new Error("Unexpected update table");
            const row = state.diary.get(id);
            if (row) Object.assign(row, patch);
            return { data: row ? [{ id: row.id }] : [], error: null };
          },
        }),
      }),
    }),
  },
}));

beforeEach(() => {
  vi.restoreAllMocks();
  state.mode = "lost-once";
  state.owner = "11111111-1111-4111-8111-111111111111";
  state.uploadWait = null;
  state.replyWait = null;
  state.readFailure = false;
  state.now = 1_789_560_000_000;
  state.objects.clear();
  state.events.clear();
  state.diary.clear();
  state.requests.length = 0;
  state.uploads.length = 0;
  state.removes.length = 0;
  state.success.mockReset();
  state.telemetry.mockReset();
  vi.spyOn(Date, "now").mockImplementation(() => state.now);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:isolated-test-photo"),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  Element.prototype.scrollIntoView ??= () => undefined;
});

function mount(onSaved?: () => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const element = (
    overrides: Partial<{ open: boolean; plantId: string; growId: string; tentId: string }> = {},
  ) => (
    <QueryClientProvider client={client}>
      <PlantQuickLog
        open
        onOpenChange={() => undefined}
        plantId="plant-1"
        plantName="Test Plant"
        growId="grow-1"
        tentId="tent-1"
        onSaved={onSaved}
        {...overrides}
      />
    </QueryClientProvider>
  );
  const view = render(element());
  return {
    ...view,
    changeScope: (overrides: Parameters<typeof element>[0] = {}) =>
      view.rerender(element(overrides)),
  };
}

function choosePhotoAndNote() {
  fireEvent.change(screen.getByTestId("plant-quick-log-note"), {
    target: { value: "New leaf photo" },
  });
  fireEvent.change(screen.getByTestId("plant-quick-log-photo-library-input"), {
    target: {
      files: [
        new File([new Uint8Array([1, 2, 3])], "leaf.png", { type: "image/png", lastModified: 123 }),
      ],
    },
  });
}

async function firstUnconfirmedSave() {
  choosePhotoAndNote();
  fireEvent.click(screen.getByTestId("plant-quick-log-save"));
  await screen.findByTestId("plant-quick-log-error");
  await waitFor(() => expect(screen.getByTestId("plant-quick-log-save")).toBeEnabled());
  expect(state.events.size).toBe(1);
  expect(state.diary.size).toBe(1);
  expect(state.success).not.toHaveBeenCalled();
}

describe("Plant Quick Log photo persistence through uncertain saves", () => {
  it("retains a photo that was committed before its reply was lost and reports uncertainty", async () => {
    mount();
    await firstUnconfirmedSave();
    expect.soft(state.removes).toEqual([]);
    expect.soft(state.objects.has(state.uploads[0])).toBe(true);
    expect.soft(screen.getByTestId("plant-quick-log-error")).toHaveTextContent(/unconfirmed/i);
    expect(screen.getByTestId("plant-quick-log-note")).toHaveValue("New leaf photo");
  });

  it("retries the original payload and uploaded object without rewriting a persisted photo reference", async () => {
    mount();
    await firstUnconfirmedSave();
    state.now += 1000;
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(state.success).toHaveBeenCalledTimes(1));
    expect.soft(state.uploads).toHaveLength(1);
    expect.soft(state.requests[1]).toEqual(state.requests[0]);
    expect.soft(state.objects.has(state.uploads[0])).toBe(true);
    expect.soft([...state.diary.values()][0].photo_url).toBe(state.uploads[0]);
    expect(state.events.size).toBe(1);
    expect(state.diary.size).toBe(1);
  });

  it("can remove an upload after a definitive rejection before any event commit", async () => {
    state.mode = "reject";
    mount();
    choosePhotoAndNote();
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await screen.findByTestId("plant-quick-log-error");
    expect(state.events.size).toBe(0);
    expect(state.diary.size).toBe(0);
    expect(state.removes).toEqual(state.uploads);
    expect(state.objects.size).toBe(0);
    expect(state.success).not.toHaveBeenCalled();
  });

  it("keeps the original photo when a later rejection cannot disprove the earlier uncertain commit", async () => {
    mount();
    await firstUnconfirmedSave();
    state.now += 1000;
    state.mode = "reject";
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(state.requests).toHaveLength(2));
    await waitFor(() => expect(screen.getByTestId("plant-quick-log-save")).toBeEnabled());
    expect(state.objects.has(state.uploads[0])).toBe(true);
    expect(state.removes).toEqual([]);
    expect(screen.getByTestId("plant-quick-log-error")).toHaveTextContent(/unconfirmed/i);
    state.mode = "success";
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(state.success).toHaveBeenCalledTimes(1));
    expect(state.uploads).toHaveLength(1);
    expect(state.events.size).toBe(1);
    expect(state.diary.size).toBe(1);
  });

  it("treats a newly selected file with identical metadata as a new choice without deleting the first photo", async () => {
    mount();
    await firstUnconfirmedSave();
    state.now += 1000;
    state.mode = "success";
    fireEvent.change(screen.getByTestId("plant-quick-log-photo-library-input"), {
      target: {
        files: [
          new File([new Uint8Array([4, 5, 6])], "leaf.png", {
            type: "image/png",
            lastModified: 123,
          }),
        ],
      },
    });
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(state.success).toHaveBeenCalledTimes(1));
    expect(state.requests[1].p_idempotency_key).not.toBe(state.requests[0].p_idempotency_key);
    expect(state.uploads).toHaveLength(2);
    expect(state.objects.size).toBe(2);
    expect(state.removes).toEqual([]);
    expect(state.events.size).toBe(2);
    expect(state.diary.size).toBe(2);
  });

  it("starts a distinct edited note while preserving the photo belonging to the earlier uncertain save", async () => {
    mount();
    await firstUnconfirmedSave();
    state.now += 1000;
    state.mode = "success";
    fireEvent.change(screen.getByTestId("plant-quick-log-note"), {
      target: { value: "Another observation" },
    });
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(state.success).toHaveBeenCalledTimes(1));
    expect(state.requests[1].p_idempotency_key).not.toBe(state.requests[0].p_idempotency_key);
    expect([...state.events.values()].map((event) => event.note)).toEqual([
      "New leaf photo",
      "Another observation",
    ]);
    expect(state.objects.size).toBe(2);
    expect(state.removes).toEqual([]);
  });

  it("does not delete a confirmed photo when a post-save callback throws", async () => {
    state.mode = "success";
    mount(() => {
      throw new Error("Parent refresh failed");
    });
    choosePhotoAndNote();
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(state.success).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("plant-quick-log-save")).not.toHaveTextContent("Saving"),
    );
    expect(state.events.size).toBe(1);
    expect.soft(state.removes).toEqual([]);
    expect.soft(state.objects.has(state.uploads[0])).toBe(true);
  });

  it("retains the same upload while a reused receipt cannot yet be verified", async () => {
    mount();
    await firstUnconfirmedSave();
    state.readFailure = true;
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(state.requests).toHaveLength(2));
    await waitFor(() => expect(screen.getByTestId("plant-quick-log-save")).toBeEnabled());
    expect(state.success).not.toHaveBeenCalled();
    expect(state.uploads).toHaveLength(1);
    expect(state.objects.size).toBe(1);
    expect(state.removes).toEqual([]);
    state.readFailure = false;
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(state.success).toHaveBeenCalledTimes(1));
    expect(state.uploads).toHaveLength(1);
    expect(state.events.size).toBe(1);
  });

  it.each(["owner", "target"] as const)(
    "stops a delayed upload from saving into a changed %s context",
    async (kind) => {
      let release!: () => void;
      state.uploadWait = new Promise<void>((resolve) => {
        release = resolve;
      });
      const view = mount();
      choosePhotoAndNote();
      fireEvent.click(screen.getByTestId("plant-quick-log-save"));
      await waitFor(() => expect(state.uploads).toHaveLength(1));
      if (kind === "owner") state.owner = "33333333-3333-4333-8333-333333333333";
      view.changeScope(kind === "target" ? { plantId: "plant-2", tentId: "tent-2" } : {});
      await act(async () => {
        release();
        await state.uploadWait;
      });
      expect.soft(state.requests).toHaveLength(0);
      expect.soft(state.success).not.toHaveBeenCalled();
      expect.soft(screen.getByTestId("plant-quick-log-note")).toHaveValue("");
      expect.soft(screen.queryByTestId("plant-quick-log-photo-preview")).not.toBeInTheDocument();
      expect.soft(screen.queryByTestId("plant-quick-log-error")).not.toBeInTheDocument();
      expect(state.removes).toEqual([]);
    },
  );

  it.each(["unmount", "owner-return"] as const)(
    "ignores a delayed committed reply after %s",
    async (kind) => {
      let release!: () => void;
      state.replyWait = new Promise<void>((resolve) => {
        release = resolve;
      });
      state.mode = "success";
      const view = mount();
      choosePhotoAndNote();
      fireEvent.click(screen.getByTestId("plant-quick-log-save"));
      await waitFor(() => expect(state.events.size).toBe(1));
      if (kind === "unmount") view.unmount();
      else {
        const originalOwner = state.owner;
        state.owner = "33333333-3333-4333-8333-333333333333";
        view.changeScope();
        state.owner = originalOwner;
        view.changeScope();
        fireEvent.change(screen.getByTestId("plant-quick-log-note"), {
          target: { value: "New session draft" },
        });
      }
      await act(async () => {
        release();
        await state.replyWait;
      });
      expect(state.success).not.toHaveBeenCalled();
      expect(state.telemetry).not.toHaveBeenCalled();
      expect(state.removes).toEqual([]);
      expect(state.objects.size).toBe(1);
      expect([...state.diary.values()][0].photo_url).toBeNull();
      if (kind === "owner-return") {
        expect(screen.getByTestId("plant-quick-log-note")).toHaveValue("New session draft");
        expect(screen.queryByTestId("plant-quick-log-error")).not.toBeInTheDocument();
      }
    },
  );

  it("starts only one upload for two save clicks in the same event turn", async () => {
    state.mode = "success";
    mount();
    choosePhotoAndNote();
    const button = screen.getByTestId("plant-quick-log-save");
    act(() => {
      button.click();
      button.click();
    });
    await waitFor(() => expect(state.success).toHaveBeenCalledTimes(1));
    expect(state.uploads).toHaveLength(1);
    expect(state.requests).toHaveLength(1);
    expect(state.events.size).toBe(1);
  });
});
