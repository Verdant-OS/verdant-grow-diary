/**
 * #2784 Delete Plant confirms, then removes the plant or shows the error.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

const mocks = vi.hoisted(() => ({
  deleteResult: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock("@/components/EditPlantDialog", () => ({
  default: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));
vi.mock("@/components/AssignTentDialog", () => ({ default: () => null }));
vi.mock("@/components/PlantMergeDialog", () => ({
  default: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: () => ({ eq: async () => ({ error: null }) }),
      delete: () => ({
        eq: () => ({ select: () => mocks.deleteResult() }),
      }),
    }),
  },
}));

vi.mock("@tanstack/react-query", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

import PlantCardActionsMenu from "@/components/PlantCardActionsMenu";

const plant = {
  id: "plant-1",
  name: "Plant A",
  strain: null,
  stage: "veg",
  health: "good",
  startedAt: null,
  tentId: "tent-1",
  growId: "grow-1",
  lastNote: null,
  photo: null,
  isArchived: false,
};

function renderMenu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlantCardActionsMenu plant={plant} variant="row" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Delete Plant", () => {
  beforeEach(() => {
    mocks.deleteResult.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  it("confirms before deleting and toasts when the plant is removed", async () => {
    mocks.deleteResult.mockResolvedValue({ data: [{ id: "plant-1" }], error: null });
    const user = userEvent.setup();
    renderMenu();
    expect(screen.queryByTestId("confirm-delete-plant")).toBeNull();
    await user.click(screen.getByTestId("plant-detail-delete-plant"));
    const dialog = await screen.findByTestId("confirm-delete-plant");
    expect(mocks.deleteResult).not.toHaveBeenCalled();
    await user.click(within(dialog).getByTestId("confirm-delete-plant-submit"));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Plant deleted"));
  });

  it("shows the database error when delete is refused", async () => {
    mocks.deleteResult.mockResolvedValue({
      data: null,
      error: { message: "update or delete on table plants violates foreign key constraint" },
    });
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByTestId("plant-detail-delete-plant"));
    const dialog = await screen.findByTestId("confirm-delete-plant");
    await user.click(within(dialog).getByTestId("confirm-delete-plant-submit"));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "update or delete on table plants violates foreign key constraint",
      ),
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});
