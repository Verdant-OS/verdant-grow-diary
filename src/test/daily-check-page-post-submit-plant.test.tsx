/**
 * Page-level post-submit plant choice. Renders Daily Check and asserts the
 * confirmation link and the plant-detail redirect.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        <DailyCheck />
      </MemoryRouter>
    </QueryClientProvider>,
  );
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

describe("Daily Check page post-submit plant choice", () => {
  beforeEach(() => {
    plantsRef.plants = [p1, p2];
    const proto = window.HTMLElement.prototype;
    proto.scrollIntoView = () => {};
    proto.hasPointerCapture = () => false;
    proto.releasePointerCapture = () => {};
    proto.setPointerCapture = () => {};
  });

  it("links and redirects to the plant the grower switched to", async () => {
    renderCheck("/daily-check?plantId=p1&from=plant-detail");
    await choosePlant(/Other/);
    act(() => {
      window.dispatchEvent(new CustomEvent("verdant:entry-created"));
    });
    expect(plantHref()).toBe("/plants/p2");
    fireEvent.click(screen.getByTestId("mock-quicklog-save"));
    expect(screen.getByTestId("daily-check-location")).toHaveTextContent("/plants/p2");
  });

  it("does not keep the route plant after the grower clears the picker", async () => {
    renderCheck("/daily-check?plantId=p1&from=plant-detail");
    await choosePlant(/No specific plant/);
    act(() => {
      window.dispatchEvent(new CustomEvent("verdant:entry-created"));
    });
    expect(plantHref()).toBeNull();
  });

  it("offers View Plant when the grower explicitly selects the sole plant", async () => {
    plantsRef.plants = [p1];
    renderCheck("/daily-check");
    await choosePlant(/No specific plant/);
    await choosePlant(/Sour D/);
    act(() => {
      window.dispatchEvent(new CustomEvent("verdant:entry-created"));
    });
    expect(plantHref()).toBe("/plants/p1");
  });
});
