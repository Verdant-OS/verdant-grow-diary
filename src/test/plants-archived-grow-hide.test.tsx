/**
 * A plant whose grow is archived stays off the Plants list until Show archived.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

const ARCHIVED_NAME = "Hidden In Archived Grow";

vi.mock("@/hooks/useGrowData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useGrowData")>();
  return {
    ...actual,
    useGrowPlants: () => ({
      data: [
        {
          id: "p-arch",
          name: ARCHIVED_NAME,
          strain: "Sour D",
          stage: "veg",
          health: "healthy",
          tentId: "t1",
          growId: "g-arch",
          isArchived: false,
          photo: null,
          startedAt: null,
          lastNote: "",
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useGrowTents: () => ({
      data: [{ id: "t1", name: "Tent A" }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useDiaryEntries: () => ({ data: [], isLoading: false, isError: false }),
  };
});

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [] }),
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: "/",
  }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g-live", name: "Live" }],
    archivedGrows: [{ id: "g-arch", name: "Old grow" }],
  }),
}));

vi.mock("@/components/CreatePlantDialog", () => ({ default: () => null }));
vi.mock("@/components/PlantCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/PlantPhoto", () => ({ default: () => null }));
vi.mock("@/components/GrowDataSourceDisclosure", () => ({ default: () => null }));

import Plants from "@/pages/Plants";

describe("Plants page archived-grow visibility", () => {
  it("hides the plant until the show-archived toggle is on", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/plants"]}>
          <Plants />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByText(ARCHIVED_NAME)).toBeNull();
    await user.click(screen.getByTestId("plants-show-archived-toggle"));
    expect(screen.getByText(ARCHIVED_NAME)).toBeInTheDocument();
  });
});
