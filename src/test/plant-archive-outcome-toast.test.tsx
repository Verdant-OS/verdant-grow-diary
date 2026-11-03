/**
 * Grower bug report 2026-11-03, item 8: Archive Plant gave no success toast.
 * Archive must say what happened: a success toast only when the database
 * confirms a row changed, and an error (never a silent close) otherwise.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
  updateResult: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  updates: [] as unknown[],
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

// The update chain resolves both when awaited directly (`.eq()`) and through
// `.eq().select()`, so the test describes the outcome, not the call shape.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (payload: unknown) => {
        mocks.updates.push(payload);
        const eq = () => {
          const result = Promise.resolve().then(() => mocks.updateResult());
          return Object.assign(result, {
            eq,
            select: () => Promise.resolve().then(() => mocks.updateResult()),
          });
        };
        return { eq };
      },
    }),
  },
}));
vi.mock("@tanstack/react-query", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return { ...actual, useQueryClient: () => ({ invalidateQueries: vi.fn() }) };
});

import PlantCardActionsMenu from "@/components/PlantCardActionsMenu";

const plant = {
  id: "plant-1",
  name: "Dolce di Pledge #1",
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

function renderRow() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/plants/plant-1"]}>
        <PlantCardActionsMenu plant={plant} variant="row" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function archiveFromRow() {
  const user = userEvent.setup();
  renderRow();
  await user.click(screen.getByTestId("plant-detail-archive-plant"));
  await user.click(await screen.findByTestId("confirm-archive-plant-submit"));
}

describe("Archive Plant outcome", () => {
  beforeEach(() => {
    mocks.updateResult.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.updates.length = 0;
  });

  it("shows a success toast when the archive is confirmed by the database", async () => {
    mocks.updateResult.mockReturnValue({ data: [{ id: "plant-1" }], error: null });
    await archiveFromRow();
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Plant archived"));
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.updates).toEqual([{ is_archived: true }]);
  });

  it("does not claim success when no row was archived", async () => {
    mocks.updateResult.mockReturnValue({ data: [], error: null });
    await archiveFromRow();
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("shows the database error when the archive is refused", async () => {
    mocks.updateResult.mockReturnValue({ data: null, error: { message: "permission denied" } });
    await archiveFromRow();
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    expect(String(mocks.toastError.mock.calls[0][0])).toContain("permission denied");
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});

describe("Restore Plant outcome", () => {
  beforeEach(() => {
    mocks.updateResult.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.updates.length = 0;
  });

  async function restoreFromRow() {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/plants/plant-1"]}>
          <PlantCardActionsMenu plant={{ ...plant, isArchived: true }} variant="row" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await user.click(screen.getByTestId("plant-detail-restore-plant"));
    await user.click(await screen.findByTestId("confirm-restore-plant-submit"));
  }

  it("shows a success toast when the restore is confirmed by the database", async () => {
    mocks.updateResult.mockReturnValue({ data: [{ id: "plant-1" }], error: null });
    await restoreFromRow();
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Plant restored"));
    expect(mocks.updates).toEqual([{ is_archived: false }]);
  });

  it("does not claim success when no row was restored", async () => {
    mocks.updateResult.mockReturnValue({ data: [], error: null });
    await restoreFromRow();
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});
