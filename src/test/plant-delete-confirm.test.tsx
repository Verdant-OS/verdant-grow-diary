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
  eqs: [] as string[],
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

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: () => ({ eq: async () => ({ error: null }) }),
      delete: () => ({
        eq: (column: string, value: string) => {
          mocks.eqs.push(`${column}:${value}`);
          return {
            eq: (column2: string, value2: string) => {
              mocks.eqs.push(`${column2}:${value2}`);
              return { select: () => mocks.deleteResult() };
            },
          };
        },
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
import { PlantLifecycleWriteRules } from "@/lib/plantLifecycleWriteRules";
import { useLocation } from "@/lib/react-router-compat";

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-path">{location.pathname}</span>;
}

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
      <MemoryRouter initialEntries={["/plants/plant-1"]}>
        <LocationProbe />
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
    mocks.eqs.length = 0;
  });

  it("confirms before deleting and toasts when the plant is removed", async () => {
    mocks.deleteResult.mockResolvedValue({ data: [{ id: "plant-1" }], error: null });
    const user = userEvent.setup();
    renderMenu();
    expect(screen.queryByTestId("confirm-delete-plant")).toBeNull();
    await user.click(screen.getByTestId("plant-detail-delete-plant"));
    const dialog = await screen.findByTestId("confirm-delete-plant");
    expect(dialog).toHaveTextContent(PlantLifecycleWriteRules.DELETE_CONFIRM_COPY);
    expect(mocks.deleteResult).not.toHaveBeenCalled();
    await user.click(within(dialog).getByTestId("confirm-delete-plant-submit"));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Plant deleted"));
    expect(mocks.eqs).toEqual(["id:plant-1", "user_id:user-1"]);
    await waitFor(() => expect(screen.getByTestId("location-path")).toHaveTextContent("/plants"));
  });

  it("treats a zero-row delete as a failure and stays on the plant page", async () => {
    mocks.deleteResult.mockResolvedValue({ data: [], error: null });
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByTestId("plant-detail-delete-plant"));
    const dialog = await screen.findByTestId("confirm-delete-plant");
    await user.click(within(dialog).getByTestId("confirm-delete-plant-submit"));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Plant was not deleted. Linked records may still reference it.",
      ),
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByTestId("location-path")).toHaveTextContent("/plants/plant-1");
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
