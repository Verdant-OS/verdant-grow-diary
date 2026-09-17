import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EditPlantDialog from "@/components/EditPlantDialog";

const backend = vi.hoisted(() => ({
  updates: [] as Array<{ id: string; payload: Record<string, unknown> }>,
  error: null as { message: string } | null,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), message: vi.fn() }));
const tents = vi.hoisted(() => [{ id: "tent-a", name: "Tent A", grow_id: "grow-a" }]);

vi.mock("sonner", () => ({ toast }));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-a" } }) }));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => ({ data: tents }) }));
vi.mock("@/components/PlantPhoto", () => ({ default: () => <span>Profile photo</span> }));
vi.mock("@/hooks/usePlantProfilePhotoPreview", () => ({
  usePlantProfilePhotoPreview: () => ({ preview: { status: "none" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "plants") throw new Error(`Unexpected table: ${table}`);
      return {
        update: (payload: Record<string, unknown>) => ({
          eq: async (column: string, id: string) => {
            if (column !== "id") throw new Error(`Unexpected selector: ${column}`);
            backend.updates.push({ id, payload: { ...payload } });
            return { error: backend.error };
          },
        }),
      };
    },
  },
}));

function plant(health: unknown, id = "plant-a") {
  return {
    id,
    name: "Plant A",
    strain: "Recorded strain",
    stage: "veg",
    health: health as string,
    tentId: "tent-a",
    growId: "grow-a",
    lastNote: "Existing note",
    plantType: "photoperiod",
  };
}

function renderEditor(health: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const editor = (nextHealth: unknown, id = "plant-a") => (
    <QueryClientProvider client={client}>
      <EditPlantDialog plant={plant(nextHealth, id)} />
    </QueryClientProvider>
  );
  const rendered = render(editor(health));
  fireEvent.click(screen.getByTestId("edit-plant-trigger"));
  return {
    ...rendered,
    changePlant: (nextHealth: unknown, id: string) => rendered.rerender(editor(nextHealth, id)),
  };
}

function healthSelect() {
  const label = screen.getByText("Health", { selector: "label" });
  if (!label.parentElement) throw new Error("Missing health control container");
  return within(label.parentElement).getByRole("combobox");
}

async function chooseHealth(label: string) {
  fireEvent.keyDown(healthSelect(), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: label }));
  await waitFor(() => expect(healthSelect()).toHaveTextContent(label));
}

const originalScrollIntoView = Element.prototype.scrollIntoView;

beforeEach(() => {
  backend.updates.length = 0;
  backend.error = null;
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

describe("Edit Plant preserves unknown health", () => {
  it.each([null, undefined, "unknown", "invalid"])(
    "does not add a health write to a name-only edit with %j health",
    async (health) => {
      renderEditor(health);
      fireEvent.change(screen.getByTestId("edit-plant-name"), {
        target: { value: "Renamed plant" },
      });
      fireEvent.click(screen.getByTestId("edit-plant-submit"));
      await waitFor(() => expect(backend.updates).toHaveLength(1));
      expect(backend.updates[0]).toMatchObject({
        id: "plant-a",
        payload: { name: "Renamed plant", tent_id: "tent-a", stage: "veg" },
      });
      expect(backend.updates[0].payload).not.toHaveProperty("health");
      expect(backend.updates[0].payload).not.toHaveProperty("grow_id");
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Plant updated"));
    },
  );

  it("shows Unknown without choosing Healthy for an unrecognized profile value", () => {
    renderEditor("unknown");
    expect(healthSelect()).toHaveTextContent("Unknown");
    expect(healthSelect()).not.toHaveTextContent("Healthy");
  });

  it.each(["healthy", "watch", "issue"])(
    "preserves an existing supported health value %s on an unrelated edit",
    async (health) => {
      renderEditor(health);
      fireEvent.change(screen.getByTestId("edit-plant-notes"), {
        target: { value: "Updated note" },
      });
      fireEvent.click(screen.getByTestId("edit-plant-submit"));
      await waitFor(() => expect(backend.updates).toHaveLength(1));
      expect(backend.updates[0].payload).toMatchObject({ health, last_note: "Updated note" });
    },
  );

  it.each([
    ["Healthy", "healthy"],
    ["Watch", "watch"],
    ["Issue", "issue"],
  ])("writes an explicit %s choice from unknown", async (label, value) => {
    renderEditor("unknown");
    await chooseHealth(label);
    fireEvent.click(screen.getByTestId("edit-plant-submit"));
    await waitFor(() => expect(backend.updates).toHaveLength(1));
    expect(backend.updates[0].payload).toMatchObject({ health: value, tent_id: "tent-a" });
    expect(backend.updates[0].payload).not.toHaveProperty("grow_id");
  });

  it("offers only supported database health values", async () => {
    renderEditor("unknown");
    fireEvent.keyDown(healthSelect(), { key: "ArrowDown" });
    await screen.findByRole("option", { name: "Healthy" });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Healthy",
      "Watch",
      "Issue",
    ]);
    expect(screen.queryByRole("option", { name: "Unknown" })).not.toBeInTheDocument();
  });

  it("resets a previous plant's chosen health when the target changes", async () => {
    const editor = renderEditor("healthy");
    await chooseHealth("Watch");
    editor.changePlant("unknown", "plant-b");
    await waitFor(() => expect(healthSelect()).toHaveTextContent("Unknown"));
    fireEvent.click(screen.getByTestId("edit-plant-submit"));
    await waitFor(() => expect(backend.updates).toHaveLength(1));
    expect(backend.updates[0].id).toBe("plant-b");
    expect(backend.updates[0].payload).not.toHaveProperty("health");
  });

  it("discards an unsaved health choice on close and reopen", async () => {
    renderEditor("unknown");
    await chooseHealth("Healthy");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByTestId("edit-plant-trigger"));
    await waitFor(() => expect(healthSelect()).toHaveTextContent("Unknown"));
    expect(backend.updates).toEqual([]);
  });

  it("keeps a rejected unknown-health edit open and shows the actual error", async () => {
    backend.error = { message: "Profile update rejected by the existing constraint" };
    renderEditor(null);
    fireEvent.click(screen.getByTestId("edit-plant-submit"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(backend.error!.message));
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByTestId("edit-plant-dialog")).toBeVisible();
    expect(screen.getByTestId("edit-plant-submit")).toBeEnabled();
    expect(backend.updates[0].payload).not.toHaveProperty("health");
  });
});
