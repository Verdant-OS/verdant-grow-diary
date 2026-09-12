/**
 * Plant card overflow menu — Archive vs Restore by archived state.
 *
 * Pins the measured bug: archived plants must offer Restore Plant, never
 * Archive Plant again. Active plants keep Archive. Restore write fails closed
 * (toast error, no success toast, no cache invalidate).
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
  updateEq: vi.fn(async () => ({ error: null as { message: string } | null })),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock("@/components/EditPlantDialog", () => ({
  default: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));
vi.mock("@/components/AssignTentDialog", () => ({
  default: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));
vi.mock("@/components/PlantMergeDialog", () => ({
  default: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: mocks.updateEq,
      })),
    })),
  },
}));

vi.mock("@tanstack/react-query", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mocks.invalidateQueries,
    }),
  };
});

import PlantCardActionsMenu from "@/components/PlantCardActionsMenu";

const basePlant = {
  id: "plant-sg-03",
  name: "SG-03",
  strain: null,
  stage: "veg",
  health: "good",
  startedAt: null,
  tentId: "tent-1",
  growId: "grow-1",
  lastNote: null,
  photo: null,
};

function renderMenu(isArchived: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlantCardActionsMenu plant={{ ...basePlant, isArchived }} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PlantCardActionsMenu · archived vs active archive action", () => {
  beforeEach(() => {
    mocks.updateEq.mockReset();
    mocks.updateEq.mockResolvedValue({ error: null });
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.invalidateQueries.mockReset();
  });

  it("archived plant menu shows Restore Plant and not Archive Plant", async () => {
    const user = userEvent.setup();
    renderMenu(true);
    await user.click(screen.getByTestId("plant-card-actions-trigger"));
    const menu = await screen.findByTestId("plant-card-actions-menu");
    expect(within(menu).getByTestId("plant-card-action-restore")).toHaveTextContent(
      "Restore Plant",
    );
    expect(within(menu).queryByTestId("plant-card-action-archive")).toBeNull();
    expect(within(menu).queryByText("Archive Plant")).toBeNull();
  });

  it("active plant menu shows Archive Plant and not Restore Plant", async () => {
    const user = userEvent.setup();
    renderMenu(false);
    await user.click(screen.getByTestId("plant-card-actions-trigger"));
    const menu = await screen.findByTestId("plant-card-actions-menu");
    expect(within(menu).getByTestId("plant-card-action-archive")).toHaveTextContent(
      "Archive Plant",
    );
    expect(within(menu).queryByTestId("plant-card-action-restore")).toBeNull();
    expect(within(menu).queryByText("Restore Plant")).toBeNull();
  });

  it("restore fails closed when the plants update errors", async () => {
    mocks.updateEq.mockResolvedValue({ error: { message: "permission denied" } });
    const user = userEvent.setup();
    renderMenu(true);
    await user.click(screen.getByTestId("plant-card-actions-trigger"));
    await user.click(await screen.findByTestId("plant-card-action-restore"));
    const dialog = await screen.findByTestId("confirm-restore-plant");
    await user.click(within(dialog).getByTestId("confirm-restore-plant-submit"));
    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith("permission denied");
    });
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
  });
});
