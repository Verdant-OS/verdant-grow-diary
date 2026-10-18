/**
 * Daily Check guided-flow navigation: Review can go back, and the sticky
 * Start bar does not cover the inline activity forms.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
  default: () => <div data-testid="mock-quicklog" />,
}));
vi.mock("@/components/PlantStatusStrip", () => ({
  default: () => <div data-testid="mock-status-strip" />,
}));
vi.mock("@/components/PlantAssignedTentAlertsPanel", () => ({
  default: () => <div data-testid="mock-alerts" />,
}));
vi.mock("@/components/PlantAssignedTentActionsPanel", () => ({
  default: () => <div data-testid="mock-actions" />,
}));
vi.mock("@/components/DailyGrowCheckOnboardingCard", () => ({
  default: () => <div />,
}));
vi.mock("@/components/QuickLogAllActivitiesSection", () => ({
  default: () => <div data-testid="daily-check-all-activities" />,
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

function renderCheck() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/daily-check"]}>
        <DailyCheck />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Daily Check navigation gaps", () => {
  it("gives Review a Back control beside Finish", () => {
    renderCheck();
    fireEvent.click(screen.getByTestId("daily-grow-check-start"));
    fireEvent.click(screen.getByTestId("daily-grow-check-next"));
    fireEvent.click(screen.getByTestId("daily-grow-check-next"));
    fireEvent.click(screen.getByTestId("daily-grow-check-next"));
    fireEvent.click(screen.getByTestId("daily-grow-check-next"));

    expect(screen.getByTestId("daily-grow-check-finish")).toBeInTheDocument();
    const back = screen.getByTestId("daily-grow-check-review-back");
    expect(back).toHaveAccessibleName(/back/i);
    fireEvent.click(back);
    expect(screen.getByText("Step 5 · Handheld Readings")).toBeInTheDocument();
  });

  it("pads the select step so the sticky Start bar does not cover inline forms", () => {
    renderCheck();
    const activities = screen.getByTestId("daily-check-all-activities");
    expect(activities.parentElement).toHaveClass("pb-16");
  });
});
