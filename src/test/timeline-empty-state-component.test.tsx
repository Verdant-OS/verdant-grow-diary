import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TimelineEmptyState from "@/components/TimelineEmptyState";
import {
  resolveTimelineEmptyState,
  TIMELINE_EMPTY_NO_ENTRIES_TITLE,
} from "@/lib/timelineEmptyStateRules";
import { FAST_ADD_NO_CONTEXT_COPY } from "@/lib/fastAddActionRules";

const withPlant = { plantId: "plant-1", tentId: null, growId: "grow-1" };

function renderView(input: Parameters<typeof resolveTimelineEmptyState>[0], props = {}) {
  const view = resolveTimelineEmptyState(input);
  if (!view) throw new Error("expected an empty-state view");
  return render(
    <MemoryRouter>
      <TimelineEmptyState view={view} context={input.context ?? null} {...props} />
    </MemoryRouter>,
  );
}

const emptyBase = {
  totalEntryCount: 0,
  filteredEntryCount: 0,
  evidenceFilterActive: false,
  otherFiltersActive: false,
};

describe("TimelineEmptyState", () => {
  it("renders the no-entries state with all three fast-add actions", () => {
    renderView({ ...emptyBase, context: withPlant });
    expect(screen.getByTestId("timeline-empty-state")).toHaveAttribute(
      "data-empty-kind",
      "no_entries",
    );
    expect(screen.getByText(TIMELINE_EMPTY_NO_ENTRIES_TITLE)).toBeInTheDocument();
    expect(screen.getByTestId("timeline-empty-state-action-photo")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-empty-state-action-diary_note")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-empty-state-action-watering")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-empty-lighting-guide")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /measure before changing the light/i }),
    ).toHaveAttribute("href", "/guides/cannabis-grow-light-distance-and-schedule");
  });

  it("hands a photo log off to Quick Log without writing anything itself", () => {
    const onDispatchEvent = vi.fn();
    renderView({ ...emptyBase, context: withPlant }, { onDispatchEvent });
    fireEvent.click(screen.getByTestId("timeline-empty-state-action-photo"));
    expect(onDispatchEvent).toHaveBeenCalledTimes(1);
    const [eventName, detail] = onDispatchEvent.mock.calls[0];
    expect(typeof eventName).toBe("string");
    expect(detail).toBeTruthy();
  });

  it("shows the calm context message and picker CTAs when nothing is selected", () => {
    const onDispatchEvent = vi.fn();
    renderView({ ...emptyBase, context: null }, { onDispatchEvent });
    fireEvent.click(screen.getByTestId("timeline-empty-state-action-diary_note"));
    expect(onDispatchEvent).not.toHaveBeenCalled();
    expect(screen.getByTestId("timeline-empty-state-needs-context")).toHaveTextContent(
      FAST_ADD_NO_CONTEXT_COPY,
    );
    expect(screen.getByTestId("timeline-empty-state-cta-choose_plant")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-empty-state-cta-choose_tent")).toBeInTheDocument();
  });

  it("offers clear filters instead of logging when filters excluded everything", () => {
    const onClearFilters = vi.fn();
    renderView(
      { ...emptyBase, totalEntryCount: 6, otherFiltersActive: true, context: withPlant },
      { onClearFilters },
    );
    expect(screen.queryByTestId("timeline-empty-state-actions")).not.toBeInTheDocument();
    expect(screen.queryByTestId("timeline-empty-lighting-guide")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("timeline-empty-state-clear-filters"));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("keeps every action at a thumb-friendly minimum height", () => {
    renderView({ ...emptyBase, context: withPlant });
    for (const id of ["photo", "diary_note", "watering"]) {
      expect(screen.getByTestId(`timeline-empty-state-action-${id}`).className).toContain(
        "min-h-11",
      );
    }
  });
});
