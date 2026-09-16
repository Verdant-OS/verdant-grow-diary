import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import PlantDetailWhatsMissing from "@/components/PlantDetailWhatsMissing";

const activity = vi.hoisted(() => ({
  data: [] as unknown[],
  isLoading: false,
  isError: false,
}));

vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: () => activity,
}));

const plantA = "33333333-3333-4333-8333-333333333333";
const plantB = "55555555-5555-4555-8555-555555555555";
const growId = "11111111-1111-4111-8111-111111111111";
const prompts = ["no_timeline", "no_recent_watering_or_feed"] as const;

function panel(plantId: string | null) {
  return (
    <MemoryRouter>
      <PlantDetailWhatsMissing plantId={plantId} growId={growId} stage="veg" hasPlantPhoto />
    </MemoryRouter>
  );
}

let captured: unknown[];
const onOpen = (event: Event) => captured.push((event as CustomEvent).detail);

beforeEach(() => {
  activity.data = [];
  activity.isLoading = false;
  activity.isError = false;
  captured = [];
  window.addEventListener("verdant:open-quicklog", onOpen);
});

afterEach(() => {
  window.removeEventListener("verdant:open-quicklog", onOpen);
  cleanup();
});

describe("Plant Detail missing-context Quick Log targets", () => {
  it.each(prompts)("carries the displayed plant and grow from %s", (kind) => {
    render(panel(plantB));

    fireEvent.click(screen.getByTestId(`plant-detail-whats-missing-cta-${kind}`));

    expect(captured).toEqual([{ plantId: plantB, growId }]);
  });

  it.each(prompts)("keeps a known plant without inventing a grow for %s", (kind) => {
    render(
      <MemoryRouter>
        <PlantDetailWhatsMissing plantId={plantB} stage="veg" hasPlantPhoto />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId(`plant-detail-whats-missing-cta-${kind}`));

    expect(captured).toEqual([{ plantId: plantB, growId: null }]);
  });

  it.each(prompts)("replaces the previous plant handoff when %s is reopened", (kind) => {
    const { rerender } = render(panel(plantA));
    fireEvent.click(screen.getByTestId(`plant-detail-whats-missing-cta-${kind}`));

    rerender(panel(plantB));
    fireEvent.click(screen.getByTestId(`plant-detail-whats-missing-cta-${kind}`));

    expect(captured).toEqual([
      { plantId: plantA, growId },
      { plantId: plantB, growId },
    ]);
  });

  it("does not offer a generic Quick Log handoff without a plant", () => {
    render(panel(null));

    expect(screen.queryByRole("button", { name: "Add Quick Log" })).not.toBeInTheDocument();
    expect(captured).toEqual([]);
  });

  it("keeps failed reads from offering missing-context Quick Log prompts", () => {
    activity.isError = true;
    render(panel(plantB));

    expect(screen.getByTestId("plant-detail-whats-missing-unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Quick Log" })).not.toBeInTheDocument();
    expect(captured).toEqual([]);
  });

  it("keeps loading from offering missing-context Quick Log prompts", () => {
    activity.isLoading = true;
    activity.data = [] as unknown[];
    render(panel(plantB));

    expect(screen.getByTestId("plant-detail-whats-missing-loading")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Quick Log" })).not.toBeInTheDocument();
    expect(captured).toEqual([]);
  });

  it("does not force photo mode in generic Quick Log handoffs", () => {
    render(panel(plantB));

    fireEvent.click(screen.getByTestId("plant-detail-whats-missing-cta-no_timeline"));

    expect(captured[0]).toEqual({ plantId: plantB, growId });
    expect(captured[0]).not.toHaveProperty("activityId");
  });
});
