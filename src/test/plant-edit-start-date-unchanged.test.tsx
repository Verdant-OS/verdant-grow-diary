import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EditPlantDialog from "@/components/EditPlantDialog";
import { PLANT_START_DATE_FUTURE_MESSAGE } from "@/lib/plantStartDateRules";

const backend = vi.hoisted(() => ({
  updates: [] as Array<{ id: string; payload: Record<string, unknown> }>,
  error: null as { message: string; code?: string } | null,
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

/**
 * CodeRabbit review on #1683: Edit Plant validated and rewrote the prefilled
 * start date on every save. A plant already stored with a future start date
 * (the BUG-005 data) could then not be renamed or re-noted until the grower
 * changed the date. The date is validated and written only when it changes.
 */
function plant(startedAt: string | null) {
  return {
    id: "plant-a",
    name: "Plant A",
    strain: "Recorded strain",
    stage: "veg",
    health: "healthy",
    tentId: "tent-a",
    growId: "grow-a",
    lastNote: "Existing note",
    plantType: "photoperiod",
    startedAt,
  };
}

function renderEditor(startedAt: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = render(
    <QueryClientProvider client={client}>
      <EditPlantDialog plant={plant(startedAt)} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByTestId("edit-plant-trigger"));
  return rendered;
}

const dateInput = () =>
  screen.getByTestId("edit-plant-dialog").querySelector('input[type="date"]') as HTMLInputElement;

beforeEach(() => {
  backend.updates.length = 0;
  backend.error = null;
  vi.clearAllMocks();
});

describe("Edit Plant start date is validated and written only when changed", () => {
  it("saves an unrelated edit on a plant stored with a future start date", async () => {
    renderEditor("2027-12-31T00:00:00.000Z");
    expect(dateInput().value).toBe("2027-12-31");
    // The unchanged stored value must not trip the input's own "today" limit.
    expect(dateInput().max).toBe("");
    fireEvent.change(screen.getByTestId("edit-plant-notes"), { target: { value: "Topped" } });
    fireEvent.click(screen.getByTestId("edit-plant-submit"));
    await waitFor(() => expect(backend.updates).toHaveLength(1));
    expect(toast.error).not.toHaveBeenCalledWith(PLANT_START_DATE_FUTURE_MESSAGE);
    expect(backend.updates[0].payload).not.toHaveProperty("started_at");
    expect(backend.updates[0].payload.last_note).toBe("Topped");
  });

  it("does not rewrite an unchanged start date", async () => {
    renderEditor("2026-07-01T00:00:00+00:00");
    fireEvent.change(screen.getByTestId("edit-plant-notes"), { target: { value: "Topped" } });
    fireEvent.click(screen.getByTestId("edit-plant-submit"));
    await waitFor(() => expect(backend.updates).toHaveLength(1));
    expect(backend.updates[0].payload).not.toHaveProperty("started_at");
  });

  it("still rejects a start date changed to the future, and saves a changed past date", async () => {
    renderEditor("2026-07-01T00:00:00+00:00");
    fireEvent.change(dateInput(), { target: { value: "2099-01-01" } });
    // A changed date keeps the "today" limit on the input.
    expect(dateInput().max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    fireEvent.click(screen.getByTestId("edit-plant-submit"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(backend.updates).toHaveLength(0);

    fireEvent.change(dateInput(), { target: { value: "2026-06-15" } });
    fireEvent.click(screen.getByTestId("edit-plant-submit"));
    await waitFor(() => expect(backend.updates).toHaveLength(1));
    expect(backend.updates[0].payload.started_at).toBe("2026-06-15T00:00:00.000Z");
  });
});
