/**
 * #2790 Merge Duplicate surfaces a real error, and a confirmed merge toasts.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlants: () => ({
    data: [
      {
        id: "target-1",
        name: "Dolce di Pledge #1",
        strain: "Pledge",
        growId: "grow-1",
        tentId: "tent-1",
        isArchived: false,
        lastNote: "",
      },
    ],
    isFetched: true,
    isSuccess: true,
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mocks.rpc(...args),
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ count: 2, error: null }),
      }),
    }),
  },
}));

import PlantMergeDialog from "@/components/PlantMergeDialog";

const source = {
  id: "source-1",
  name: "Ducle De Pledge",
  strain: "Pledge",
  grow_id: "grow-1",
  tent_id: "tent-1",
  started_at: null,
  is_archived: false,
};

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlantMergeDialog source={source} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("merge-duplicate-trigger"));
  await user.click(await screen.findByTestId("plant-merge-target-select"));
  await user.click(await screen.findByTestId("plant-merge-target-option-same_grow"));
  await user.click(screen.getByTestId("plant-merge-execute"));
}

describe("Merge Duplicate toasts", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  it("shows an error when the merge RPC fails and does not claim success", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "source plant not found or not owned by caller" },
    });
    const user = userEvent.setup();
    renderDialog();
    await openConfirm(user);
    await user.click(await screen.findByTestId("confirm-merge-execute-submit"));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Plant could not be merged. Check that both plants still exist and belong to this grow.",
      ),
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByTestId("plant-merge-dialog")).toBeInTheDocument();
  });

  it("merges and toasts when the RPC confirms the move", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        source_plant_id: "source-1",
        target_plant_id: "target-1",
        moved: { grow_events: 2, diary_entries: 2, alerts: 0, action_queue: 0 },
        source_status: "archived_as_merged",
      },
      error: null,
    });
    const user = userEvent.setup();
    renderDialog();
    await openConfirm(user);
    await user.click(await screen.findByTestId("confirm-merge-execute-submit"));
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Merged into "Dolce di Pledge #1".'),
    );
    expect(mocks.rpc).toHaveBeenCalledWith("merge_duplicate_plant", {
      source_plant_id: "source-1",
      target_plant_id: "target-1",
    });
    expect(
      within(screen.getByTestId("plant-merge-dialog")).getByTestId("plant-merge-success"),
    ).toBeInTheDocument();
  });
});
