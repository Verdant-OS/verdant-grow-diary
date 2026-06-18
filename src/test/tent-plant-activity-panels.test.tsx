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

  it("renders Harvest Watch help text + caution near the public state", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    const help = screen.getByTestId(
      "tent-plant-activity-panel-p1-harvest-watch-help",
    );
    expect(help).toHaveTextContent(/Start checking direct harvest evidence/i);
    expect(help).toHaveTextContent(/Harvest Watch is evidence-only\./);
  });

  it("renders fallback Harvest Watch help text when state is missing", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    const help = screen.getByTestId(
      "tent-plant-activity-panel-p2-harvest-watch-help",
    );
    expect(help).toHaveTextContent(
      /Not enough context to determine a review state\./,
    );
    expect(help).toHaveTextContent(/Harvest Watch is evidence-only\./);
  });

  it("renders loading skeletons while activity data is hydrating", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} isLoading />);
    const region = screen.getByTestId("tent-plant-activity-panels-loading");
    expect(region).toBeInTheDocument();
    expect(region.getAttribute("aria-busy")).toBe("true");
    expect(
      screen.getByTestId("tent-plant-activity-panels-skeleton-list"),
    ).toBeInTheDocument();
    // No real panels render while loading
    expect(screen.queryByTestId("tent-plant-activity-panel-p1")).toBeNull();
    expect(screen.queryByTestId("tent-plant-activity-panel-p2")).toBeNull();
  });

  it("skeleton does not leak any plant name, strain, or sensor value", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} isLoading />);
    const region = screen.getByTestId("tent-plant-activity-panels-loading");
    const text = region.textContent ?? "";
    expect(text).not.toMatch(/Blue Dream/);
    expect(text).not.toMatch(/Plant B/);
    expect(text).not.toMatch(/Hybrid/);
    expect(text).not.toMatch(/Watered/);
    expect(text).not.toMatch(/observation window/i);
    expect(text).not.toMatch(/°|kPa|ppm/);
  });

  it("skeletons are replaced by real panels once loading completes", () => {
    const { rerender } = wrap(
      <TentPlantActivityPanels viewModel={vm()} isLoading />,
    );
    expect(
      screen.getByTestId("tent-plant-activity-panels-loading"),
    ).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <TentPlantActivityPanels viewModel={vm()} isLoading={false} />
      </MemoryRouter>,
    );
    expect(
      screen.queryByTestId("tent-plant-activity-panels-loading"),
    ).toBeNull();
    expect(
      screen.getByTestId("tent-plant-activity-panel-p1"),
    ).toBeInTheDocument();
  });

  it("skeleton count matches visible plant count when no override is provided", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} isLoading />);
    const list = screen.getByTestId("tent-plant-activity-panels-skeleton-list");
    expect(list.getAttribute("data-skeleton-count")).toBe("2");
    expect(screen.getByTestId("tent-plant-activity-panels-skeleton-0")).toBeInTheDocument();
    expect(screen.getByTestId("tent-plant-activity-panels-skeleton-1")).toBeInTheDocument();
    expect(screen.queryByTestId("tent-plant-activity-panels-skeleton-2")).toBeNull();
  });

  it("skeleton count is 1 when a single plant tab is selected", () => {
    wrap(
      <TentPlantActivityPanels
        viewModel={vm({ selectedPlantId: "p2" })}
        isLoading
      />,
    );
    const list = screen.getByTestId("tent-plant-activity-panels-skeleton-list");
    expect(list.getAttribute("data-skeleton-count")).toBe("1");
    expect(screen.queryByTestId("tent-plant-activity-panels-skeleton-1")).toBeNull();
  });

  it("archived hidden excludes archived plants from skeleton count", () => {
    const plants = [
      ...PLANTS,
      { id: "p3", name: "Archived", isArchived: true },
    ];
    wrap(
      <TentPlantActivityPanels
        viewModel={vm({ plants, includeArchived: false })}
        isLoading
      />,
    );
    expect(
      screen.getByTestId("tent-plant-activity-panels-skeleton-list").getAttribute("data-skeleton-count"),
    ).toBe("2");
  });

  it("archived shown includes archived plants in skeleton count", () => {
    const plants = [
      ...PLANTS,
      { id: "p3", name: "Archived", isArchived: true },
    ];
    wrap(
      <TentPlantActivityPanels
        viewModel={vm({ plants, includeArchived: true })}
        isLoading
      />,
    );
    expect(
      screen.getByTestId("tent-plant-activity-panels-skeleton-list").getAttribute("data-skeleton-count"),
    ).toBe("3");
  });

  it("no visible plants renders a single compact placeholder, never fake plant cards", () => {
    wrap(
      <TentPlantActivityPanels
        viewModel={vm({ plants: [], activityByPlantId: {} })}
        isLoading
      />,
    );
    const list = screen.getByTestId("tent-plant-activity-panels-skeleton-list");
    expect(list.getAttribute("data-skeleton-count")).toBe("1");
    expect(list.getAttribute("data-has-visible-plants")).toBe("false");
    expect(screen.getByTestId("tent-plant-activity-panels-skeleton-0")).toBeInTheDocument();
    expect(screen.queryByTestId("tent-plant-activity-panels-skeleton-1")).toBeNull();
    const text = list.textContent ?? "";
    expect(text).not.toMatch(/Blue Dream|Plant B/);
  });

  it("skeleton cards mirror real panel layout landmarks (rounded card with border)", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} isLoading />);
    const skel = screen.getByTestId("tent-plant-activity-panels-skeleton-0");
    expect(skel.className).toMatch(/rounded-xl/);
    expect(skel.className).toMatch(/border/);
    expect(skel.className).toMatch(/min-h-/);
  });

  it("empty diary state renders 'Add first Quick Log' CTA copy", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    const cta = screen.getByTestId("tent-plant-activity-panel-p2-add-quicklog");
    expect(cta).toHaveTextContent("Add first Quick Log");
    expect(cta.getAttribute("aria-label")).toBe("Add first Quick Log for Plant B");
    expect(cta.getAttribute("data-is-first-quicklog")).toBe("true");
  });

  it("plants with existing diary keep the regular 'Add Quick Log' CTA copy", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    const cta = screen.getByTestId("tent-plant-activity-panel-p1-add-quicklog");
    expect(cta).toHaveTextContent("Add Quick Log");
    expect(cta).not.toHaveTextContent("first");
    expect(cta.getAttribute("data-is-first-quicklog")).toBe("false");
  });

  it("empty-state CTA dispatches Quick Log handoff with full prefill", () => {
    const received: Array<Record<string, unknown>> = [];
    const listener = (ev: Event) =>
      received.push((ev as CustomEvent).detail as Record<string, unknown>);
    window.addEventListener("verdant:open-quicklog", listener as EventListener);
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    (
      screen.getByTestId("tent-plant-activity-panel-p2-add-quicklog") as HTMLButtonElement
    ).click();
    window.removeEventListener("verdant:open-quicklog", listener as EventListener);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      plantId: "p2",
      plantName: "Plant B",
      tentId: "t1",
      tentName: "Tent A",
      growId: "g1",
      eventType: "observation",
      suggestSnapshot: true,
    });
  });

  it("empty-state CTA disables when required context is missing", () => {
    wrap(
      <TentPlantActivityPanels
        viewModel={vm({ tentId: null, growId: null })}
      />,
    );
    const cta = screen.getByTestId(
      "tent-plant-activity-panel-p2-add-quicklog",
    ) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(cta.textContent).toMatch(/Add first Quick Log/);
  });
});
