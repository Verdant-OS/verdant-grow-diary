/**
 * Operator Mode empty-state next-action navigation tests.
 *
 * Verifies the next-action buttons that appear in the Reports / Grow
 * Learning Hub onboarding section (empty data path) and the Global Fast
 * Add gated state navigate to the intended destinations. Carries the
 * operator dataset's growId through and asserts the prefilled scope is
 * preserved.
 *
 * No Supabase, no model calls, no automation.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ReportsHubOnboardingSection from "@/components/ReportsHubOnboardingSection";
import GlobalFastAddButton from "@/components/GlobalFastAddButton";
import { buildReportsHubOnboarding } from "@/lib/reportsHubOnboarding";
import { OPERATOR_DIARY_DATASET } from "./fixtures/operatorDiaryDataset";

afterEach(() => cleanup());

describe("Reports onboarding — next-action buttons", () => {
  const onboarding = buildReportsHubOnboarding({
    growId: OPERATOR_DIARY_DATASET.grow.id,
    diaryEntriesTotal: 0,
    recentSensorReadingCount: 0,
    latestSensorCapturedAt: null,
    outcomeTotal: 0,
    alertsOpen: 0,
  });

  it("renders all 3 onboarding cards with destination hrefs scoped to the operator grow", () => {
    render(
      <MemoryRouter>
        <ReportsHubOnboardingSection cards={onboarding.cards} />
      </MemoryRouter>,
    );
    const addPlant = screen.getByTestId("reports-onboarding-link-add_plant");
    const addSensor = screen.getByTestId(
      "reports-onboarding-link-add_sensor_snapshot",
    );
    const reviewOutcome = screen.getByTestId(
      "reports-onboarding-link-review_action_outcome",
    );

    expect(addPlant.getAttribute("href")).toBe(
      `/plants?growId=${OPERATOR_DIARY_DATASET.grow.id}`,
    );
    expect(addSensor.getAttribute("href")).toBe("/sensors");
    expect(reviewOutcome.getAttribute("href")).toBe(
      `/actions?growId=${OPERATOR_DIARY_DATASET.grow.id}`,
    );
  });

  it("hides the onboarding section entirely when there is no card data", () => {
    const { container } = render(
      <MemoryRouter>
        <ReportsHubOnboardingSection cards={[]} />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-testid="reports-onboarding"]')).toBeNull();
  });
});

describe("Global Quick Log — gated empty-state CTA navigation", () => {
  it("each picker CTA invokes navigate with the expected destination", () => {
    const navigate = vi.fn<(to: string) => void>();
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <GlobalFastAddButton context={null} onNavigate={navigate} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    fireEvent.click(screen.getByTestId("global-fast-add-action-watering"));

    fireEvent.click(screen.getByTestId("global-fast-add-cta-choose_plant"));
    expect(navigate).toHaveBeenCalledWith("/plants");

    // Re-open + re-trigger needs-context to surface the second CTA.
    navigate.mockClear();
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    fireEvent.click(screen.getByTestId("global-fast-add-action-feeding"));
    fireEvent.click(screen.getByTestId("global-fast-add-cta-choose_tent"));
    expect(navigate).toHaveBeenCalledWith("/tents");
  });

  it("with a plant in context, Quick Log dispatches a Quick Log event carrying the operator scope", () => {
    const onDispatch = vi.fn<(eventName: string, detail: unknown) => void>();
    const plant = OPERATOR_DIARY_DATASET.plants[0];
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <GlobalFastAddButton
          context={{
            plantId: plant.id,
            plantName: plant.name,
            tentId: OPERATOR_DIARY_DATASET.tent.id,
            tentName: OPERATOR_DIARY_DATASET.tent.name,
            growId: OPERATOR_DIARY_DATASET.grow.id,
          }}
          onDispatchEvent={onDispatch}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    fireEvent.click(screen.getByTestId("global-fast-add-action-watering"));
    expect(onDispatch).toHaveBeenCalledTimes(1);
    const [eventName, detail] = onDispatch.mock.calls[0];
    expect(eventName).toBe("verdant:open-quicklog");
    expect(detail).toMatchObject({
      plantId: plant.id,
      plantName: plant.name,
      tentId: OPERATOR_DIARY_DATASET.tent.id,
      tentName: OPERATOR_DIARY_DATASET.tent.name,
      growId: OPERATOR_DIARY_DATASET.grow.id,
      eventType: "watering",
    });
  });
});
