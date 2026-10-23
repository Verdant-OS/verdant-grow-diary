/**
 * Filming bug #12 (2026-10-22): after a plant moved to Veg, the tent header,
 * grow badge and Alerts ("Using Seedling targets") stayed on Seedling because
 * plant, tent and grow each store their own stage. Edit Plant now offers to
 * bring a lagging tent/grow along; the grower decides.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildPlantStageFollowUp } from "@/lib/plantStageFollowUpRules";

const backend = vi.hoisted(() => ({
  updates: [] as Array<{ table: string; id: string; payload: Record<string, unknown> }>,
  /** Tables whose stage update matches zero rows (RLS or a deleted row). */
  zeroRowTables: [] as string[],
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), message: vi.fn() }));
const store = vi.hoisted(() => ({
  grows: [{ id: "grow-a", name: "Grow A", stage: "seedling" }] as Array<Record<string, unknown>>,
  refresh: vi.fn(async () => undefined),
}));
const tents = vi.hoisted(() => [
  { id: "tent-a", name: "Tent A", grow_id: "grow-a", stage: "seedling" },
]);

vi.mock("sonner", () => ({ toast }));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-a" } }) }));
vi.mock("@/store/grows", () => ({ useGrows: () => store }));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => ({ data: tents }) }));
vi.mock("@/components/PlantPhoto", () => ({ default: () => <span>Profile photo</span> }));
vi.mock("@/hooks/usePlantProfilePhotoPreview", () => ({
  usePlantProfilePhotoPreview: () => ({ preview: { status: "none" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => ({
        eq: (_column: string, id: string) => {
          backend.updates.push({ table, id, payload: { ...payload } });
          const rows = backend.zeroRowTables.includes(table) ? [] : [{ id }];
          return Object.assign(Promise.resolve({ error: null }), {
            select: async () => ({ data: rows, error: null }),
          });
        },
      }),
    }),
  },
}));

import EditPlantDialog from "@/components/EditPlantDialog";

function renderEditor(stage: string, growId: string | null = "grow-a") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EditPlantDialog
        plant={{
          id: "plant-a",
          name: "AF-01",
          strain: "Auto",
          stage,
          health: "healthy",
          tentId: "tent-a",
          growId,
          lastNote: "",
          plantType: "autoflower",
        }}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByTestId("edit-plant-trigger"));
}

async function chooseStage(label: string) {
  const stageLabel = screen.getByText("Stage", { selector: "label" });
  const select = within(stageLabel.parentElement as HTMLElement).getByRole("combobox");
  fireEvent.keyDown(select, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: label }));
}

beforeEach(() => {
  backend.updates.length = 0;
  backend.zeroRowTables.length = 0;
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Edit Plant offers to move a lagging tent and grow", () => {
  it("prompts after Seedling → Veg and updates both only when the grower accepts", async () => {
    renderEditor("seedling");
    await chooseStage("Vegetative");
    fireEvent.click(screen.getByTestId("edit-plant-submit"));
    await waitFor(() => expect(toast.message).toHaveBeenCalled());
    expect(backend.updates.map((u) => u.table)).toEqual(["plants"]);

    const [message, options] = toast.message.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe(
      "AF-01 is now Vegetative. Tent A and Grow A are still on an earlier stage. Move them to Vegetative too?",
    );
    expect(options.action.label).toBe("Update tent and grow");

    options.action.onClick();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Stage updated."));
    expect(backend.updates.slice(1)).toEqual([
      { table: "tents", id: "tent-a", payload: { stage: "veg" } },
      { table: "grows", id: "grow-a", payload: { stage: "veg" } },
    ]);
    expect(store.refresh).toHaveBeenCalled();
  });

  // Review of #2363 at b1289ce: a write RLS filters to zero rows is not a success.
  it("reports a failure when the tent update matches no row", async () => {
    backend.zeroRowTables.push("tents");
    renderEditor("seedling");
    await chooseStage("Vegetative");
    fireEvent.click(screen.getByTestId("edit-plant-submit"));
    await waitFor(() => expect(toast.message).toHaveBeenCalled());
    const [, options] = toast.message.mock.calls[0] as [
      string,
      { action: { onClick: () => void } },
    ];
    options.action.onClick();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't update the stage. Edit the tent or grow to change it.",
      ),
    );
    expect(toast.success).not.toHaveBeenCalledWith("Stage updated.");
  });

  // Review of #2363 at b1289ce: the prompt names the grow this save moves the plant into.
  it("pairs the tent with the grow the save assigns, not the plant's old grow", async () => {
    renderEditor("seedling", null);
    await chooseStage("Vegetative");
    fireEvent.click(screen.getByTestId("edit-plant-submit"));
    await waitFor(() => expect(toast.message).toHaveBeenCalled());
    expect(backend.updates[0]).toMatchObject({ table: "plants", payload: { grow_id: "grow-a" } });
    expect(toast.message.mock.calls[0][0]).toBe(
      "AF-01 is now Vegetative. Tent A and Grow A are still on an earlier stage. Move them to Vegetative too?",
    );
  });

  it("does not prompt when the stage did not change", async () => {
    renderEditor("seedling");
    fireEvent.change(screen.getByTestId("edit-plant-notes"), { target: { value: "note" } });
    fireEvent.click(screen.getByTestId("edit-plant-submit"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Plant updated"));
    expect(toast.message).not.toHaveBeenCalled();
  });

  it("offers grow-only when the tent already matches the new stage", async () => {
    tents[0] = { ...tents[0], stage: "veg" };
    renderEditor("seedling");
    await chooseStage("Vegetative");
    fireEvent.click(screen.getByTestId("edit-plant-submit"));
    await waitFor(() => expect(toast.message).toHaveBeenCalled());
    const [message, options] = toast.message.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe(
      "AF-01 is now Vegetative. Grow A is still on an earlier stage. Move it to Vegetative too?",
    );
    expect(options.action.label).toBe("Update grow");
    options.action.onClick();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Stage updated."));
    expect(backend.updates.slice(1)).toEqual([
      { table: "grows", id: "grow-a", payload: { stage: "veg" } },
    ]);
    tents[0] = { id: "tent-a", name: "Tent A", grow_id: "grow-a", stage: "seedling" };
  });

  it("reports failure when the grow update matches no row", async () => {
    backend.zeroRowTables.push("grows");
    renderEditor("seedling");
    await chooseStage("Vegetative");
    fireEvent.click(screen.getByTestId("edit-plant-submit"));
    await waitFor(() => expect(toast.message).toHaveBeenCalled());
    const [, options] = toast.message.mock.calls[0] as [
      string,
      { action: { onClick: () => void } },
    ];
    options.action.onClick();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't update the stage. Edit the tent or grow to change it.",
      ),
    );
  });
});

describe("buildPlantStageFollowUp", () => {
  const tent = { id: "t", name: "Tent A", stage: "seedling" };
  const grow = { id: "g", name: "Grow A", stage: "flower" };

  it("offers only holders behind the new stage", () => {
    const f = buildPlantStageFollowUp({
      plantName: "AF-01",
      previousStage: "seedling",
      newStage: "veg",
      tent,
      grow,
    });
    expect(f?.tent?.id).toBe("t");
    expect(f?.grow).toBeNull();
    expect(f?.actionLabel).toBe("Update tent");
  });

  it("never offers a move backwards, a harvest close-out, or an unchanged stage", () => {
    const base = { plantName: "AF-01", tent, grow: { ...grow, stage: "seedling" } };
    expect(
      buildPlantStageFollowUp({
        ...base,
        previousStage: "veg",
        newStage: "seedling",
        tent: { ...tent, stage: "veg" },
        grow: { ...grow, stage: "veg" },
      }),
    ).toBeNull();
    expect(
      buildPlantStageFollowUp({ ...base, previousStage: "flower", newStage: "harvest" }),
    ).toBeNull();
    expect(buildPlantStageFollowUp({ ...base, previousStage: "veg", newStage: "veg" })).toBeNull();
    expect(
      buildPlantStageFollowUp({ ...base, previousStage: "seedling", newStage: null }),
    ).toBeNull();
  });
});
