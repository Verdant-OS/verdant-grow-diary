/**
 * Post-submit follows the grower's current plant, and an implicit sole-plant
 * default follows the selectable list until the grower chooses.
 */
import { useState } from "react";
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

const plantsRef = vi.hoisted(() => ({
  plants: [] as Plant[],
}));

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
  default: () => <div data-testid="mock-manual-card" />,
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

function RefreshableCheck() {
  const [, setTick] = useState(0);
  return (
    <>
      <button type="button" data-testid="refresh-plants" onClick={() => setTick((n) => n + 1)}>
        refresh
      </button>
      <DailyCheck />
    </>
  );
}

function renderCheck(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        <RefreshableCheck />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function choosePlant(name: RegExp | string) {
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

describe("Daily Check current plant after a grower change", () => {
  beforeEach(() => {
    plantsRef.plants = [p1, p2];
    const proto = window.HTMLElement.prototype;
    proto.scrollIntoView = () => {};
    proto.hasPointerCapture = () => false;
    proto.releasePointerCapture = () => {};
    proto.setPointerCapture = () => {};
  });

  it("points the confirmation and the plant-detail redirect at the plant the grower switched to", async () => {
    renderCheck("/daily-check?plantId=p1&from=plant-detail");
    await choosePlant(/Other/);
    act(() => {
      window.dispatchEvent(new CustomEvent("verdant:entry-created"));
    });
    expect(plantHref()).toBe("/plants/p2");

    fireEvent.click(screen.getByTestId("mock-quicklog-save"));
    expect(screen.getByTestId("daily-check-location")).toHaveTextContent("/plants/p2");
  });

  it("drops the original plant when the grower clears the selector", async () => {
    renderCheck("/daily-check?plantId=p1&from=plant-detail");
    await choosePlant(/No specific plant/);
    act(() => {
      window.dispatchEvent(new CustomEvent("verdant:entry-created"));
    });
    expect(plantHref()).toBeNull();
    fireEvent.click(screen.getByTestId("mock-quicklog-save"));
    expect(screen.getByTestId("daily-check-location").textContent).not.toContain("/plants/p1");
  });

  it("offers View Plant after the grower explicitly selects the implicit sole plant", async () => {
    plantsRef.plants = [p1];
    renderCheck("/daily-check");
    await choosePlant(/No specific plant/);
    await choosePlant(/Sour D/);
    act(() => {
      window.dispatchEvent(new CustomEvent("verdant:entry-created"));
    });
    expect(plantHref()).toBe("/plants/p1");
  });

  it("updates an implicit selection when the plant list gains or loses a sole plant", async () => {
    plantsRef.plants = [p1];
    renderCheck("/daily-check");
    expect(screen.getByTestId("daily-grow-check-plant-select")).toHaveTextContent("Sour D");

    plantsRef.plants = [p1, p2];
    fireEvent.click(screen.getByTestId("refresh-plants"));
    expect(screen.getByTestId("daily-grow-check-plant-select")).toHaveTextContent(
      "No specific plant",
    );

    plantsRef.plants = [p2];
    fireEvent.click(screen.getByTestId("refresh-plants"));
    expect(screen.getByTestId("daily-grow-check-plant-select")).toHaveTextContent("Other");
  });
});
