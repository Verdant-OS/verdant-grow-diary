import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";

const { from, toastError } = vi.hoisted(() => ({ from: vi.fn(), toastError: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));
// The stress section performs its own unrelated database reads.
vi.mock("@/components/DiaryStressObservationsSection", () => ({ default: () => null }));

import EntryEditDialog from "@/components/EntryEditDialog";

type Entry = NonNullable<ComponentProps<typeof EntryEditDialog>["entry"]>;
type Patch = Partial<Entry>;

const elementPrototype = Element.prototype as Element & {
  hasPointerCapture?: () => boolean;
  setPointerCapture?: () => void;
  releasePointerCapture?: () => void;
  scrollIntoView?: () => void;
};
elementPrototype.hasPointerCapture ??= () => false;
elementPrototype.setPointerCapture ??= () => {};
elementPrototype.releasePointerCapture ??= () => {};
elementPrototype.scrollIntoView ??= () => {};

function fixture(stage: string | null = null): Entry {
  return {
    id: "synthetic-entry-285",
    note: "Original observation",
    photo_url: null,
    stage,
    details: { event_type: "observation" },
    entry_at: "2026-10-20T12:00:00.000Z",
    plant_id: "synthetic-plant-285",
  };
}

// Model the external JSON update boundary. Readback comes from this store,
// independently of the editor's onSaved/optimistic callback. No network or DB.
function persistence(initial: Entry) {
  let stored = structuredClone(initial);
  const updates: Patch[] = [];
  from.mockImplementation((table: string) => {
    expect(table).toBe("diary_entries");
    return {
      update(patch: Patch) {
        const serialized = JSON.parse(JSON.stringify(patch)) as Patch;
        updates.push(serialized);
        return {
          eq(column: string, id: string) {
            expect([column, id]).toEqual(["id", initial.id]);
            return {
              select(columns: string) {
                expect(columns).toBe("id");
                return {
                  async maybeSingle() {
                    stored = { ...stored, ...serialized };
                    return { data: { id: stored.id }, error: null };
                  },
                };
              },
            };
          },
        };
      },
    };
  });
  return { updates, read: () => structuredClone(stored) };
}

function editor(entry: Entry) {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  const props = { entry, open: true, onSaved, onOpenChange };
  return { ...render(<EntryEditDialog {...props} />), props, onSaved, onOpenChange };
}

function stageTrigger() {
  return screen.getAllByRole("combobox")[0];
}

async function selectStage(label: string) {
  fireEvent.keyDown(stageTrigger(), { key: "ArrowDown", code: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: label }));
}

async function saveNote(onSaved: ReturnType<typeof vi.fn>, note = "Edited observation") {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: note } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
}

beforeEach(() => {
  from.mockReset();
  toastError.mockReset();
});

describe("Timeline editor historical stage preservation (VER-285)", () => {
  it.each([null, "", "unknown", "  "])(
    "shows an unrecorded stage for %j without inventing Vegetative",
    (stage) => {
      editor(fixture(stage));
      expect(stageTrigger()).toHaveTextContent("Stage not recorded");
      expect(stageTrigger()).not.toHaveTextContent("Vegetative");
    },
  );

  it.each([
    { stage: null, label: "Stage not recorded" },
    { stage: "", label: "Stage not recorded" },
    { stage: "unknown", label: "Stage not recorded" },
    { stage: "  ", label: "Stage not recorded" },
    { stage: "seedling", label: "Seedling" },
    { stage: "veg", label: "Vegetative" },
    { stage: "flower", label: "Flowering" },
    { stage: "legacy-stage", label: "legacy-stage" },
  ])(
    "omits stage on a note-only save and preserves $stage after persisted readback",
    async ({ stage, label }) => {
      const store = persistence(fixture(stage));
      const view = editor(store.read());
      await saveNote(view.onSaved);
      expect(store.updates).toEqual([
        { note: "Edited observation", details: { event_type: "observation" } },
      ]);
      expect(view.onSaved.mock.calls[0][0]).not.toHaveProperty("stage");
      expect(store.read()).toMatchObject({ note: "Edited observation", stage });
      view.unmount();
      editor(store.read());
      expect(screen.getByRole("textbox")).toHaveValue("Edited observation");
      expect(stageTrigger()).toHaveTextContent(label);
    },
  );

  it("preserves an omitted legacy field rather than adding a stage key", async () => {
    const entry = fixture();
    Reflect.deleteProperty(entry, "stage");
    const store = persistence(entry);
    const view = editor(store.read());
    await saveNote(view.onSaved);
    expect(store.updates[0]).not.toHaveProperty("stage");
    expect(store.read()).not.toHaveProperty("stage");
  });

  it.each([
    { original: null, label: "Vegetative", expected: "veg" },
    { original: "seedling", label: "Flowering", expected: "flower" },
    { original: "veg", label: "Stage not recorded", expected: null },
  ])(
    "persists a deliberate change from $original to $expected",
    async ({ original, label, expected }) => {
      const store = persistence(fixture(original));
      const view = editor(store.read());
      await selectStage(label);
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(view.onSaved).toHaveBeenCalledTimes(1));
      expect(store.updates[0]).toMatchObject({ stage: expected, note: "Original observation" });
      expect(view.onSaved.mock.calls[0][0]).toMatchObject({ stage: expected });
      view.unmount();
      editor(store.read());
      expect(stageTrigger()).toHaveTextContent(label);
    },
  );

  it("resets an unsaved stage change when another entry is opened", async () => {
    const view = editor(fixture("flower"));
    await selectStage("Vegetative");
    const next = { ...fixture(), id: "synthetic-entry-other" };
    const store = persistence(next);
    view.rerender(<EntryEditDialog {...view.props} entry={store.read()} />);
    await saveNote(view.onSaved);
    expect(store.updates[0]).not.toHaveProperty("stage");
    expect(store.read().stage).toBeNull();
  });

  it("discards a canceled stage change when the same entry object reopens", async () => {
    const entry = fixture();
    const store = persistence(entry);
    const view = editor(entry);
    await selectStage("Flowering");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(store.updates).toHaveLength(0);
    view.rerender(<EntryEditDialog {...view.props} open={false} />);
    view.rerender(<EntryEditDialog {...view.props} open />);
    expect(stageTrigger()).toHaveTextContent("Stage not recorded");
    await saveNote(view.onSaved);
    expect(store.updates[0]).not.toHaveProperty("stage");
  });

  it("does not overwrite a newer persisted stage during an unrelated edit", async () => {
    const staleEntry = fixture();
    const store = persistence(fixture("flower"));
    const view = editor(staleEntry);
    await saveNote(view.onSaved);
    expect(store.updates[0]).not.toHaveProperty("stage");
    expect(store.read().stage).toBe("flower");
  });
});
