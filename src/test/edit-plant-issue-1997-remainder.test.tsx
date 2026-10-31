/**
 * Remaining #1997 Edit Plant checks: earliest start date, name length and
 * wrapping, linked labels, and Cancel. Edit Tent stays on PR #2032.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
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

describe("Edit Plant remainder of #1997", () => {
  it("rejects 1900-01-01 before any update", () => {
    renderEditor();
    const started = screen.getByLabelText("Started at");
    fireEvent.change(started, { target: { value: "1900-01-01" } });
    fireEvent.submit(started.closest("form")!);

    expect(backend.updates).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith("Start date can't be before January 1, 2000.");
    expect(started).toHaveAttribute("min", "2000-01-01");
  });

  it("caps Name and wraps the profile-photo label", () => {
    renderEditor();
    const name = screen.getByLabelText("Name");
    expect(name).toHaveAttribute("maxLength", "80");
    expect(name).toHaveAttribute("id", "edit-plant-name");
    const photoLabel = screen.getByText(/Profile photo for/);
    expect(photoLabel.className).toContain("break-words");
    expect(photoLabel.className).toContain("min-w-0");
  });

  it("disables Save for a whitespace name and Cancel closes the dialog", () => {
    renderEditor();
    const name = screen.getByLabelText("Name");
    fireEvent.change(name, { target: { value: "   " } });
    expect(screen.getByTestId("edit-plant-submit")).toBeDisabled();

    fireEvent.click(screen.getByTestId("edit-plant-cancel"));
    expect(screen.queryByTestId("edit-plant-dialog")).not.toBeInTheDocument();
    expect(backend.updates).toHaveLength(0);
  });
});
