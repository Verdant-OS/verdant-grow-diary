import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TentPlantActivityPanels from "@/components/TentPlantActivityPanels";
import { buildTentPlantActivityPanelsViewModel } from "@/lib/tentPlantActivityPanelsViewModel";

function wrap(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const PLANTS = [
  { id: "p1", name: "Blue Dream", strain: "Hybrid", stage: "veg", isArchived: false },
  { id: "p2", name: "Plant B", isArchived: false },
];
const ACTIVITY = {
  p1: {
    latestLogAt: "2026-06-10T12:00:00Z",
    latestLogSummary: "Watered 0.5L",
    hasRecentPhoto: true,
    harvestWatchPublicState: "watch_window",
  },
  p2: {
    latestLogAt: null,
    hasRecentPhoto: false,
    harvestWatchPublicState: null,
  },
};

function vm(overrides: Partial<Parameters<typeof buildTentPlantActivityPanelsViewModel>[0]> = {}) {
  return buildTentPlantActivityPanelsViewModel({
    plants: PLANTS,
    activityByPlantId: ACTIVITY,
    includeArchived: false,
    selectedPlantId: null,
    tentId: "t1",
    tentName: "Tent A",
    growId: "g1",
    ...overrides,
  });
}

describe("TentPlantActivityPanels", () => {
  it("renders one panel per visible plant with name + strain + stage", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    expect(screen.getByTestId("tent-plant-activity-panel-p1-name")).toHaveTextContent("Blue Dream");
    expect(screen.getByTestId("tent-plant-activity-panel-p1-strain")).toHaveTextContent("Hybrid");
    expect(screen.getByTestId("tent-plant-activity-panel-p1-stage")).toHaveTextContent("veg");
    expect(screen.getByTestId("tent-plant-activity-panel-p2-name")).toHaveTextContent("Plant B");
  });

  it("renders latest diary date and summary on the correct panel", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    expect(screen.getByTestId("tent-plant-activity-panel-p1-latest-log")).toHaveTextContent(
      /Watered 0\.5L/,
    );
    expect(screen.queryByTestId("tent-plant-activity-panel-p1-no-diary")).toBeNull();
    expect(screen.getByTestId("tent-plant-activity-panel-p2-no-diary")).toHaveTextContent(
      "No recent diary activity for this plant.",
    );
  });

  it("renders photo state per plant", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    expect(screen.getByTestId("tent-plant-activity-panel-p1-recent-photo")).toBeInTheDocument();
    expect(screen.getByTestId("tent-plant-activity-panel-p2-no-photo")).toHaveTextContent(
      "No recent photos for this plant.",
    );
  });

  it("renders Harvest Watch public state when available and the fallback otherwise", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    expect(screen.getByTestId("tent-plant-activity-panel-p1-harvest-watch")).toHaveTextContent(
      /observation window/i,
    );
    expect(screen.getByTestId("tent-plant-activity-panel-p2-harvest-watch")).toHaveTextContent(
      "Harvest Watch available on Plant Detail.",
    );
  });

  it("Add Quick Log CTA dispatches verdant:open-quicklog with the prefill", () => {
    const received: Array<Record<string, unknown>> = [];
    const listener = (ev: Event) =>
      received.push((ev as CustomEvent).detail as Record<string, unknown>);
    window.addEventListener("verdant:open-quicklog", listener as EventListener);
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    (
      screen.getByTestId("tent-plant-activity-panel-p1-add-quicklog") as HTMLButtonElement
    ).click();
    window.removeEventListener("verdant:open-quicklog", listener as EventListener);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      plantId: "p1",
      plantName: "Blue Dream",
      tentId: "t1",
      tentName: "Tent A",
      growId: "g1",
      eventType: "observation",
      suggestSnapshot: true,
    });
  });

  it("Add Quick Log CTA exposes accessible label with plant name", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    const cta = screen.getByTestId("tent-plant-activity-panel-p1-add-quicklog");
    expect(cta.tagName.toLowerCase()).toBe("button");
    expect(cta.getAttribute("aria-label")).toBe("Add Quick Log for Blue Dream");
  });

  it("Diary/photos links carry accessible labels including plant name", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    const diary = screen.getByTestId("tent-plant-activity-panel-p1-diary-link");
    expect(diary.getAttribute("aria-label")).toBe("Open Blue Dream diary on Plant Detail");
    expect(diary.getAttribute("href")).toBe("/plants/p1#plant-relative-timeline");
    const photos = screen.getByTestId("tent-plant-activity-panel-p1-photos-link");
    expect(photos.getAttribute("aria-label")).toBe("Open Blue Dream photos on Plant Detail");
    expect(photos.getAttribute("href")).toBe("/plants/p1#plant-photos");
    expect(photos.getAttribute("data-anchor-blocked")).toBeNull();
  });

  it("renders the shared environment reminder copy", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    expect(
      screen.getByTestId("tent-plant-activity-panels-shared-env-reminder"),
    ).toHaveTextContent("Tent environment is shared. Plant response is tracked per plant.");
  });

  it("renders empty copy when there are no plants", () => {
    wrap(
      <TentPlantActivityPanels
        viewModel={vm({ plants: [], activityByPlantId: {} })}
      />,
    );
    expect(screen.getByTestId("tent-plant-activity-panels-empty")).toHaveTextContent(
      "No plants assigned to this tent yet.",
    );
  });

  it("Selected plant mode renders only that plant's panel", () => {
    wrap(<TentPlantActivityPanels viewModel={vm({ selectedPlantId: "p2" })} />);
    expect(screen.queryByTestId("tent-plant-activity-panel-p1")).toBeNull();
    expect(screen.getByTestId("tent-plant-activity-panel-p2")).toBeInTheDocument();
  });

  it("Add Quick Log button is disabled when prefill is incomplete", () => {
    wrap(
      <TentPlantActivityPanels
        viewModel={vm({ tentId: null, growId: null })}
      />,
    );
    const cta = screen.getByTestId("tent-plant-activity-panel-p1-add-quicklog") as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });
});
