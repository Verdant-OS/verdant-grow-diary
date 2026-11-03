/**
 * Tent delete removes the tent first. Archived and legacy-merged plants are
 * unassigned only after that delete matches a row.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { TentDeleteWriteRules } from "@/lib/tentManagementRules";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

type Write = { table: string; op: string; filters: string[] };

const mocks = vi.hoisted(() => ({
  writes: [] as Write[],
  tentDelete: { data: [{ id: "tent-1" }] as unknown, error: null as { message: string } | null },
  plantUpdate: { data: [{ id: "plant-a" }] as unknown, error: null as { message: string } | null },
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock("@/components/EditTentDialog", () => ({
  default: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      update: () => {
        const filters: string[] = [];
        const chain = {
          eq: (column: string, value: string) => {
            filters.push(`${column}:${value}`);
            return chain;
          },
          or: (filter: string) => {
            filters.push(`or:${filter}`);
            return chain;
          },
          select: () => {
            mocks.writes.push({ table, op: "update", filters: [...filters] });
            return Promise.resolve(mocks.plantUpdate);
          },
        };
        return chain;
      },
      delete: () => ({
        eq: (column: string, value: string) => ({
          select: () => {
            mocks.writes.push({ table, op: "delete", filters: [`${column}:${value}`] });
            return Promise.resolve(mocks.tentDelete);
          },
        }),
      }),
    }),
  },
}));

import TentCardActionsMenu from "@/components/TentCardActionsMenu";

const tent = { id: "tent-1", name: "Flower", stage: "flower" };

function renderMenu(archivedAssignedPlantCount: number, assignedPlantCount = 1) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TentCardActionsMenu
          tent={tent}
          variant="row"
          assignedPlantCount={assignedPlantCount}
          archivedAssignedPlantCount={archivedAssignedPlantCount}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function confirmDelete(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("tent-detail-delete-tent"));
  const dialog = await screen.findByTestId("confirm-delete-tent");
  await user.click(within(dialog).getByTestId("confirm-delete-tent-submit"));
}

describe("Tent delete order", () => {
  beforeEach(() => {
    mocks.writes.length = 0;
    mocks.tentDelete = { data: [{ id: "tent-1" }], error: null };
    mocks.plantUpdate = { data: [{ id: "plant-a" }], error: null };
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  it("deletes the tent, then unassigns only archived or legacy-merged plants", async () => {
    const user = userEvent.setup();
    renderMenu(1);
    await confirmDelete(user);
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(mocks.writes.map((write) => `${write.table}:${write.op}`)).toEqual([
      "tents:delete",
      "plants:update",
    ]);
    expect(mocks.writes[1].filters).toEqual([
      "tent_id:tent-1",
      `or:${TentDeleteWriteRules.UNASSIGN_OR_FILTER}`,
    ]);
    expect(mocks.writes[1].filters.join(" ")).not.toContain("is_archived.eq.false");
  });

  it("changes nothing when the tent delete errors", async () => {
    mocks.tentDelete = { data: null, error: { message: "permission denied" } };
    const user = userEvent.setup();
    renderMenu(1);
    await confirmDelete(user);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("permission denied"));
    expect(mocks.writes).toEqual([{ table: "tents", op: "delete", filters: ["id:tent-1"] }]);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("changes nothing when the tent delete matches zero rows", async () => {
    mocks.tentDelete = { data: [], error: null };
    const user = userEvent.setup();
    renderMenu(1);
    await confirmDelete(user);
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Tent was not deleted. It may no longer be yours.",
      ),
    );
    expect(mocks.writes).toEqual([{ table: "tents", op: "delete", filters: ["id:tent-1"] }]);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("keeps delete disabled while an active plant is still assigned", () => {
    renderMenu(0, 1);
    expect(screen.getByTestId("tent-detail-delete-tent")).toBeDisabled();
    expect(mocks.writes).toEqual([]);
  });
});
