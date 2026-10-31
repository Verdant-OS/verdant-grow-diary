/**
 * Edit Plant Save stays fail-closed when Name is empty or whitespace-only.
 * Refs #1997 (name slice). A whitespace name must not reach plants.update.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EditPlantDialog from "@/components/EditPlantDialog";

const backend = vi.hoisted(() => ({
  updates: [] as Array<{ id: string; payload: Record<string, unknown> }>,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-a" } }) }));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-a", name: "Tent A", grow_id: "grow-a" }] }),
}));
vi.mock("@/components/PlantPhoto", () => ({ default: () => <span>Profile photo</span> }));
vi.mock("@/hooks/usePlantProfilePhotoPreview", () => ({
  usePlantProfilePhotoPreview: () => ({ preview: { status: "none" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (payload: Record<string, unknown>) => ({
        eq: async (_column: string, id: string) => {
          backend.updates.push({ id, payload: { ...payload } });
          return { error: null };
        },
      }),
    }),
  },
}));

const plant = {
  id: "plant-a",
  name: "QA Plant",
  strain: "Blue Dream",
  stage: "veg",
  health: "healthy",
  tentId: "tent-a",
  growId: "grow-a",
  lastNote: "",
  startedAt: "2026-07-01T00:00:00+00:00",
  plantType: "photoperiod",
};

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EditPlantDialog plant={plant} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByTestId("edit-plant-trigger"));
}

beforeEach(() => {
  backend.updates.length = 0;
  vi.clearAllMocks();
});

describe("EditPlantDialog identity fail-closed", () => {
  it("blocks a whitespace-only name before any update and shows an inline error", () => {
    renderEditor();
    const name = screen.getByTestId("edit-plant-name");
    fireEvent.change(name, { target: { value: "   " } });
    fireEvent.submit(name.closest("form")!);

    expect(backend.updates).toHaveLength(0);
    const error = screen.getByTestId("edit-plant-name-error");
    expect(error).toHaveTextContent("A name is required.");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAttribute("aria-describedby", error.id);
  });

  it("clears the name error and saves a trimmed name", async () => {
    renderEditor();
    const name = screen.getByTestId("edit-plant-name");
    fireEvent.change(name, { target: { value: "   " } });
    fireEvent.submit(name.closest("form")!);
    expect(screen.getByTestId("edit-plant-name-error")).toBeInTheDocument();

    fireEvent.change(name, { target: { value: "  Trimmed Name  " } });
    expect(screen.queryByTestId("edit-plant-name-error")).not.toBeInTheDocument();
    expect(name).not.toHaveAttribute("aria-invalid", "true");

    fireEvent.submit(name.closest("form")!);
    await waitFor(() => expect(backend.updates).toHaveLength(1));
    expect(backend.updates[0].payload).toMatchObject({ name: "Trimmed Name" });
  });
});
