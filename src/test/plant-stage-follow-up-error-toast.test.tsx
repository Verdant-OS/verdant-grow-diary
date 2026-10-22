/**
 * Regression: grower accepts the stage follow-up but RLS/update fails — UI must not
 * claim success.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const backend = vi.hoisted(() => ({
  updates: [] as Array<{ table: string; id: string; payload: Record<string, unknown> }>,
  tentUpdateFails: false,
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
        eq: async (_column: string, id: string) => {
          backend.updates.push({ table, id, payload: { ...payload } });
          if (table === "tents" && backend.tentUpdateFails) {
            return { error: { message: "denied" } };
          }
          return { error: null };
        },
      }),
    }),
  },
}));

import EditPlantDialog from "@/components/EditPlantDialog";

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EditPlantDialog
        plant={{
          id: "plant-a",
          name: "AF-01",
          strain: "Auto",
          stage: "seedling",
          health: "healthy",
          tentId: "tent-a",
          growId: "grow-a",
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
  backend.tentUpdateFails = false;
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Edit Plant stage follow-up failure handling", () => {
  it("shows an error toast when the grower accepts but a holder update fails", async () => {
    backend.tentUpdateFails = true;
    renderEditor();
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
});
