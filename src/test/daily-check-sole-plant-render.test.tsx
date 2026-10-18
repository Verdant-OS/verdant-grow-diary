/**
 * /daily-check with exactly one in-scope plant selects that plant.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "t1", name: "QA Tent", grow_id: "g1" }],
    isLoading: false,
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      {
        id: "plant-only",
        name: "QA Test",
        strain: null,
        grow_id: "g1",
        tent_id: "t1",
        is_archived: false,
      },
    ],
    isLoading: false,
  }),
}));
vi.mock("@/components/ManualSensorReadingCard", () => ({
  default: () => <div data-testid="mock-manual-card" />,
}));
vi.mock("@/components/QuickLog", () => ({
  default: ({ prefill }: { prefill?: { plantId: string | null } }) => (
    <div data-testid="mock-quicklog" data-prefill-plant-id={prefill?.plantId ?? ""} />
  ),
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
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: undefined,
  }),
}));

import DailyCheck from "@/pages/DailyCheck";

describe("Daily Check sole plant", () => {
  it("preselects the only plant instead of No specific plant", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/daily-check"]}>
          <DailyCheck />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const select = await screen.findByTestId("daily-grow-check-plant-select");
    expect(select).toHaveTextContent("QA Test");
    expect(select).not.toHaveTextContent("No specific plant");
    const quickLog = await screen.findByTestId("mock-quicklog");
    expect(quickLog.getAttribute("data-prefill-plant-id")).toBe("plant-only");
  });
});
