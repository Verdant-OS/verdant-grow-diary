/**
 * #2085 follow-up: an explicit plant choice must still be selectable when the
 * post-submit links and the plant-detail redirect are built. If a plant-list
 * refresh removes the chosen plant (archived or deleted elsewhere), saves are
 * no longer scoped to it, so the confirmation must not link or redirect to it.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDailyCheckPostSubmitPlantId } from "@/lib/dailyCheckPlantSelectionRules";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";

type Plant = {
  id: string;
  name: string;
  strain: string | null;
  grow_id: string;
  tent_id: string;
  is_archived: boolean;
};

const plantsRef = vi.hoisted(() => ({ plants: [] as Plant[] }));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "t1", name: "Tent A", grow_id: "g1" }],
    isLoading: false,
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: plantsRef.plants, isLoading: false }),
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
  default: () => <div />,
}));
vi.mock("@/components/QuickLog", () => ({
  default: ({ onCreated }: { onCreated?: () => void }) => (
    <button type="button" data-testid="mock-quicklog-save" onClick={() => onCreated?.()}>
      save
    </button>
  ),
}));
vi.mock("@/components/QuickLogAllActivitiesSection", () => ({
  default: () => <div data-testid="daily-check-all-activities" />,
}));
vi.mock("@/components/PlantStatusStrip", () => ({ default: () => <div /> }));
vi.mock("@/components/PlantAssignedTentAlertsPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/PlantAssignedTentActionsPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/DailyGrowCheckOnboardingCard", () => ({ default: () => <div /> }));

import DailyCheck from "@/pages/DailyCheck";

const p1: Plant = {
  id: "p1",
  name: "Sour D",
  strain: null,
  grow_id: "g1",
  tent_id: "t1",
  is_archived: false,
};
const p2: Plant = {
  id: "p2",
  name: "Other",
  strain: null,
  grow_id: "g1",
  tent_id: "t1",
  is_archived: false,
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="daily-check-location">{location.pathname}</div>;
}

function renderCheck(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        <DailyCheck />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree());
  return { ...view, refresh: () => view.rerender(tree()) };
}

async function choosePlant(name: RegExp) {
  const trigger = screen.getByTestId("daily-grow-check-plant-select");
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole("option", { name }));
}

function plantHref(): string | null {
  const plant = screen.queryByTestId("daily-grow-check-post-submit-plant");
  if (!plant) return null;
  const link = plant.tagName === "A" ? plant : plant.querySelector("a");
  return link?.getAttribute("href") ?? null;
}

describe("Daily Check post-submit plant after the chosen plant leaves the list", () => {
  beforeEach(() => {
    plantsRef.plants = [p1, p2];
    const proto = window.HTMLElement.prototype;
    proto.scrollIntoView = () => {};
    proto.hasPointerCapture = () => false;
    proto.releasePointerCapture = () => {};
    proto.setPointerCapture = () => {};
  });

  it("does not link or redirect to an explicitly chosen plant that a refresh removed", async () => {
    const { refresh } = renderCheck("/daily-check?plantId=p1&from=plant-detail");
    await choosePlant(/Other/);
    plantsRef.plants = [p1];
    refresh();
    act(() => {
      window.dispatchEvent(new CustomEvent("verdant:entry-created"));
    });
    expect(plantHref()).not.toBe("/plants/p2");
    fireEvent.click(screen.getByTestId("mock-quicklog-save"));
    expect(screen.getByTestId("daily-check-location")).not.toHaveTextContent("/plants/p2");
  });

  it("still links to an explicitly chosen plant that stays selectable", async () => {
    const { refresh } = renderCheck("/daily-check?plantId=p1&from=plant-detail");
    await choosePlant(/Other/);
    refresh();
    act(() => {
      window.dispatchEvent(new CustomEvent("verdant:entry-created"));
    });
    expect(plantHref()).toBe("/plants/p2");
  });
});

describe("resolveDailyCheckPostSubmitPlantId with the current selectable list", () => {
  it("drops an explicit choice that is no longer selectable", () => {
    expect(
      resolveDailyCheckPostSubmitPlantId({
        plantChoice: "explicit",
        renderedPlantId: "p2",
        resolutionStatus: "valid",
        routePlantId: "p1",
        selectablePlantIds: ["p1"],
      }),
    ).toBeNull();
  });

  it("keeps an explicit choice that is still selectable", () => {
    expect(
      resolveDailyCheckPostSubmitPlantId({
        plantChoice: "explicit",
        renderedPlantId: "p2",
        resolutionStatus: "valid",
        routePlantId: "p1",
        selectablePlantIds: ["p1", "p2"],
      }),
    ).toBe("p2");
  });

  it("returns null for an explicit choice when nothing is selectable", () => {
    expect(
      resolveDailyCheckPostSubmitPlantId({
        plantChoice: "explicit",
        renderedPlantId: "p2",
        resolutionStatus: "missing",
        routePlantId: "",
        selectablePlantIds: [],
      }),
    ).toBeNull();
  });

  it("is deterministic for the same input", () => {
    const input = {
      plantChoice: "explicit" as const,
      renderedPlantId: "p2",
      resolutionStatus: "valid" as const,
      routePlantId: "p1",
      selectablePlantIds: ["p1"],
    };
    expect(resolveDailyCheckPostSubmitPlantId(input)).toBe(
      resolveDailyCheckPostSubmitPlantId(input),
    );
  });
});
