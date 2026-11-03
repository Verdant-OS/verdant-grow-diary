/**
 * While merge confirm is open, outside click and Escape must leave the dialog up.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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
    rpc: vi.fn(),
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

async function openConfirm(user: ReturnType<typeof userEvent.setup>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlantMergeDialog source={source} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await user.click(screen.getByTestId("merge-duplicate-trigger"));
  await user.click(await screen.findByTestId("plant-merge-target-select"));
  await user.click(await screen.findByTestId("plant-merge-target-option-same_grow"));
  await user.click(screen.getByTestId("plant-merge-execute"));
  await screen.findByTestId("confirm-merge-execute");
}

describe("Merge dialog stays open while confirm is pending", () => {
  it("ignores the dialog close control while confirm is pending", async () => {
    const user = userEvent.setup();
    await openConfirm(user);
    const dialog = screen.getByTestId("plant-merge-dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close", hidden: true }));
    expect(screen.getByTestId("plant-merge-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-merge-execute")).toBeInTheDocument();
  });

  it("ignores Escape on the merge dialog while confirm is pending", async () => {
    const user = userEvent.setup();
    await openConfirm(user);
    fireEvent.keyDown(document, { key: "Escape", code: "Escape", bubbles: true });
    expect(screen.getByTestId("plant-merge-dialog")).toBeInTheDocument();
  });

  it("ignores a pointer down outside the merge dialog while confirm is pending", async () => {
    const user = userEvent.setup();
    await openConfirm(user);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.pointerDown(document.body, { button: 0, bubbles: true, pointerId: 1 });
    fireEvent.click(document.body);
    expect(screen.getByTestId("plant-merge-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-merge-execute")).toBeInTheDocument();
  });
});
