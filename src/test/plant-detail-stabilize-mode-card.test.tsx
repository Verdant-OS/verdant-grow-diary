import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, within } from "@testing-library/react";

const useRecentMock = vi.fn();
vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: (id: string | null | undefined) => useRecentMock(id),
}));

import PlantDetailRecentActivityRecap from "@/components/PlantDetailRecentActivityRecap";

const recentIso = () => new Date().toISOString();

describe("Plant Detail Stabilize Mode card", () => {
  beforeEach(() => {
    useRecentMock.mockReset();
  });

  it("renders read-only stabilize guidance when recent changes are stacked", () => {
    useRecentMock.mockReturnValue({
      data: [
        {
          id: "a",
          plant_id: "p1",
          entry_type: "quick_log",
          entry_at: recentIso(),
          note: "Watered",
        },
        {
          id: "b",
          plant_id: "p1",
          entry_type: "quick_log",
          entry_at: recentIso(),
          note: "Fed",
        },
        {
          id: "c",
          plant_id: "p1",
          entry_type: "quick_log",
          entry_at: recentIso(),
          note: "Raised light",
        },
      ],
      isLoading: false,
    });

    render(<PlantDetailRecentActivityRecap plantId="p1" />);

    const card = screen.getByTestId("plant-detail-stabilize-mode");
    expect(card).toHaveAttribute("data-level", "stabilize");
    const inCard = within(card);
    expect(inCard.getByText(/Stabilize mode/i)).toBeInTheDocument();
    expect(inCard.getAllByText(/last 48 hours/i).length).toBeGreaterThan(0);
    expect(inCard.getByText(/Do not change equipment setpoints/i)).toBeInTheDocument();
    expect(inCard.getByText(/better, same, or worse/i)).toBeInTheDocument();
  });

  it("does not render stabilize guidance for one calm recent check", () => {
    useRecentMock.mockReturnValue({
      data: [
        {
          id: "a",
          plant_id: "p1",
          entry_type: "quick_log",
          entry_at: recentIso(),
          note: "Quick check: Same.",
        },
      ],
      isLoading: false,
    });

    render(<PlantDetailRecentActivityRecap plantId="p1" />);

    expect(screen.queryByTestId("plant-detail-stabilize-mode")).toBeNull();
    expect(screen.getByTestId("plant-detail-recent-activity-recap-list")).toBeInTheDocument();
  });

  it("keeps card copy advisory and non-automated", () => {
    useRecentMock.mockReturnValue({
      data: [
        {
          id: "a",
          plant_id: "p1",
          entry_type: "training",
          entry_at: recentIso(),
          note: "Pruned lower growth",
        },
        {
          id: "b",
          plant_id: "p1",
          entry_type: "environment_change",
          entry_at: recentIso(),
          note: "Changed light height",
        },
      ],
      isLoading: false,
    });

    const { container } = render(<PlantDetailRecentActivityRecap plantId="p1" />);
    const text = container.textContent ?? "";

    expect(screen.getByTestId("plant-detail-stabilize-mode")).toBeInTheDocument();
    expect(text).not.toMatch(/definitely|guaranteed|auto[- ]?run|execute|action queue|turn on|turn off/i);
  });
});
