import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

const useRecentMock = vi.fn();
vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: (id: string | null | undefined) => useRecentMock(id),
}));

import PlantDetailRecentActivityRecap from "@/components/PlantDetailRecentActivityRecap";

const HOUR = 60 * 60 * 1000;
function iso(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * HOUR).toISOString();
}

describe("Plant Detail Outcome Follow-up card", () => {
  beforeEach(() => {
    useRecentMock.mockReset();
  });

  it("renders follow-up prompt after an action is old enough to observe", () => {
    const openQuickLog = vi.fn();
    useRecentMock.mockReturnValue({
      data: [
        {
          id: "watered",
          plant_id: "p1",
          entry_type: "watering",
          entry_at: iso(24),
          note: "Watered 1L",
        },
      ],
      isLoading: false,
    });

    render(<PlantDetailRecentActivityRecap plantId="p1" onAddQuickCheck={openQuickLog} />);

    expect(screen.getByTestId("plant-detail-outcome-follow-up")).toHaveAttribute(
      "data-reason",
      "needs_follow_up",
    );
    expect(screen.getByText("Follow up on the last change.")).toBeInTheDocument();
    expect(screen.getByText("How did the plant respond: Better, Same, or Worse?")).toBeInTheDocument();
    expect(screen.getByText("Last change: Watered 1L")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add a better same or worse follow-up check/i }));
    expect(openQuickLog).toHaveBeenCalledTimes(1);
  });

  it("does not render follow-up prompt when a later quick check exists", () => {
    const openQuickLog = vi.fn();
    useRecentMock.mockReturnValue({
      data: [
        {
          id: "check",
          plant_id: "p1",
          entry_type: "quick_log",
          entry_at: iso(8),
          note: "Quick check: Better.",
        },
        {
          id: "watered",
          plant_id: "p1",
          entry_type: "watering",
          entry_at: iso(24),
          note: "Watered 1L",
        },
      ],
      isLoading: false,
    });

    render(<PlantDetailRecentActivityRecap plantId="p1" onAddQuickCheck={openQuickLog} />);

    expect(screen.queryByTestId("plant-detail-outcome-follow-up")).toBeNull();
    expect(screen.getByTestId("plant-detail-recent-activity-recap-list")).toBeInTheDocument();
  });

  it("keeps follow-up copy calm and non-automated", () => {
    const openQuickLog = vi.fn();
    useRecentMock.mockReturnValue({
      data: [
        {
          id: "fed",
          plant_id: "p1",
          entry_type: "feeding",
          entry_at: iso(18),
          note: "Fed",
        },
      ],
      isLoading: false,
    });

    const { container } = render(
      <PlantDetailRecentActivityRecap plantId="p1" onAddQuickCheck={openQuickLog} />,
    );
    const text = container.textContent ?? "";

    expect(screen.getByTestId("plant-detail-outcome-follow-up")).toBeInTheDocument();
    expect(text).not.toMatch(/urgent|required|must|alert|action queue|automate|turn on|turn off/i);
  });
});
