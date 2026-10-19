/**
 * Post-submit return actions after #2085: a sole in-scope plant may prefill
 * the form, but implicit default must not add View Plant. An explicit ?plantId=
 * on the route still gets View Plant when several plants exist.
 */
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

const mockPlantsRef = vi.hoisted(() => ({
  plants: [
    {
      id: "p1",
      name: "Sour D",
      strain: "Sour Diesel",
      grow_id: "g1",
      tent_id: "t1",
      is_archived: false,
    },
  ] as Array<{
    id: string;
    name: string;
    strain: string | null;
    grow_id: string;
    tent_id: string;
    is_archived: boolean;
  }>,
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "t1", name: "Tent A", grow_id: "g1" }],
    isLoading: false,
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: mockPlantsRef.plants, isLoading: false }),
}));
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: undefined,
  }),
}));
vi.mock("@/components/ManualSensorReadingCard", () => ({
  default: () => <div data-testid="mock-manual-card" />,
}));
vi.mock("@/components/QuickLog", () => ({
  default: () => <div data-testid="mock-quicklog" />,
}));
vi.mock("@/components/PlantStatusStrip", () => ({
  default: () => <div />,
}));
vi.mock("@/components/PlantAssignedTentAlertsPanel", () => ({
  default: () => <div />,
}));
vi.mock("@/components/PlantAssignedTentActionsPanel", () => ({
  default: () => <div />,
}));
vi.mock("@/components/DailyGrowCheckOnboardingCard", () => ({
  default: () => <div />,
}));

import DailyCheck from "@/pages/DailyCheck";

function dispatchQuickLogSuccess() {
  act(() => {
    window.dispatchEvent(new CustomEvent("verdant:entry-created"));
  });
}

function renderDailyCheck(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <DailyCheck />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Daily Check post-submit · implicit sole plant (#2085)", () => {
  beforeEach(() => {
    mockPlantsRef.plants = [
      {
        id: "p1",
        name: "Sour D",
        strain: "Sour Diesel",
        grow_id: "g1",
        tent_id: "t1",
        is_archived: false,
      },
    ];
  });

  it("prefills the sole plant but does not offer View Plant after submit", async () => {
    renderDailyCheck("/daily-check");
    const select = await screen.findByTestId("daily-grow-check-plant-select");
    expect(select).toHaveTextContent("Sour D");

    dispatchQuickLogSuccess();
    expect(screen.getByTestId("daily-grow-check-post-submit-dashboard")).toBeInTheDocument();
    expect(screen.queryByTestId("daily-grow-check-post-submit-plant")).not.toBeInTheDocument();
  });

  it("offers View Plant when the URL names a valid plant among several", async () => {
    mockPlantsRef.plants = [
      {
        id: "p1",
        name: "Sour D",
        strain: null,
        grow_id: "g1",
        tent_id: "t1",
        is_archived: false,
      },
      {
        id: "p2",
        name: "Other",
        strain: null,
        grow_id: "g1",
        tent_id: "t1",
        is_archived: false,
      },
    ];
    renderDailyCheck("/daily-check?plantId=p2");

    dispatchQuickLogSuccess();
    const plant = screen.getByTestId("daily-grow-check-post-submit-plant");
    const link = plant.tagName === "A" ? plant : (plant.querySelector("a") as HTMLAnchorElement);
    expect(link.getAttribute("href")).toBe("/plants/p2");
  });
});
