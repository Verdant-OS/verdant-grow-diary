import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EditPlantDialog from "@/components/EditPlantDialog";

const backend = vi.hoisted(() => ({
  data: [{ id: "plant-a" }] as Array<{ id: string }> | null | undefined,
  error: null as { message: string } | null,
  tables: [] as string[],
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), message: vi.fn() }));
const refresh = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast }));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-a" } }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-a", name: "Grow A", stage: "seedling" }], refresh }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-a", name: "Tent A", grow_id: "grow-a", stage: "seedling" }],
  }),
}));
vi.mock("@/components/PlantPhoto", () => ({ default: () => <span>Profile photo</span> }));
vi.mock("@/hooks/usePlantProfilePhotoPreview", () => ({
  usePlantProfilePhotoPreview: () => ({ preview: { status: "none" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      update: () => {
        backend.tables.push(table);
        const response = () => ({ data: backend.data, error: backend.error });
        const builder = {
          eq: () => builder,
          select: async () => response(),
          then: (resolve: (value: ReturnType<typeof response>) => unknown) => resolve(response()),
        };
        return builder;
      },
    }),
  },
}));

async function saveStageChange() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
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
  const label = screen.getByText("Stage", { selector: "label" });
  const select = within(label.parentElement as HTMLElement).getByRole("combobox");
  fireEvent.keyDown(select, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "Vegetative" }));
  await act(async () => {
    fireEvent.click(screen.getByTestId("edit-plant-submit"));
  });
  return { invalidate };
}

beforeEach(() => {
  backend.data = [{ id: "plant-a" }];
  backend.error = null;
  backend.tables.length = 0;
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Edit Plant requires an updated-row receipt", () => {
  it.each([
    { kind: "zero rows", data: [] },
    { kind: "null data", data: null },
    { kind: "missing data", data: undefined },
    { kind: "a different plant id", data: [{ id: "another-plant" }] },
  ])("fails closed for $kind", async ({ data }) => {
    // A deleted or RLS-filtered row can return no error and no updated plant.
    backend.data = data;
    const { invalidate } = await saveStageChange();
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith("Could not save changes. Please try again.");
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.message).not.toHaveBeenCalled();
    expect(backend.tables).toEqual(["plants"]);
    expect(refresh).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("edit-plant-submit")).toBeEnabled();
    const label = screen.getByText("Stage", { selector: "label" });
    expect(within(label.parentElement as HTMLElement).getByRole("combobox")).toHaveTextContent(
      "Vegetative",
    );
  });

  it("offers the follow-up only after the plant update returns its id", async () => {
    await saveStageChange();
    await waitFor(() => expect(toast.message).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith("Plant updated");
    expect(toast.error).not.toHaveBeenCalled();
    expect(backend.tables).toEqual(["plants"]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("preserves the existing backend-error path", async () => {
    backend.error = { message: "Plant update denied" };
    await saveStageChange();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Plant update denied"));
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.message).not.toHaveBeenCalled();
    expect(backend.tables).toEqual(["plants"]);
  });
});
