import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, within } from "@testing-library/react";

const useRecentMock = vi.fn();
vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: (id: string | null | undefined) => useRecentMock(id),
}));

import PlantDetailRecentActivityRecap from "@/components/PlantDetailRecentActivityRecap";

const HOUR = 60 * 60 * 1000;
function iso(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * HOUR).toISOString();
}

describe("Plant Detail Action → Response pairing card", () => {
  beforeEach(() => {
    useRecentMock.mockReset();
  });

  it("renders a paired action and later response check", () => {
    useRecentMock.mockReturnValue({
      data: [
        {
          id: "response",
          plant_id: "p1",
          entry_type: "quick_log",
          entry_at: iso(6),
          note: "Response check: Better.",
        },
        {
          id: "action",
          plant_id: "p1",
          entry_type: "quick_log",
          entry_at: iso(24),
          note: "Watered.",
        },
      ],
      isLoading: false,
    });

    render(<PlantDetailRecentActivityRecap plantId="p1" onAddQuickCheck={() => {}} />);

    const card = screen.getByTestId("plant-detail-action-response-pair");
    expect(card).toHaveAttribute("data-reason", "paired");
    expect(card).toHaveAttribute("data-response-status", "Better");
    expect(screen.getByText("Action → response captured")).toBeInTheDocument();
    const inCard = within(card);
    expect(inCard.getByText(/What changed:/)).toBeInTheDocument();
    expect(inCard.getByText(/Watered\./)).toBeInTheDocument();
    expect(inCard.getByText(/Response:/)).toBeInTheDocument();
    expect(inCard.getByText(/Response check: Better\./)).toBeInTheDocument();
    expect(inCard.getByText(/plant memory/i)).toBeInTheDocument();
  });

  it("renders awaiting response when the latest action has no later response check", () => {
    useRecentMock.mockReturnValue({
      data: [
        {
          id: "action",
          plant_id: "p1",
          entry_type: "quick_log",
          entry_at: iso(18),
          note: "Fed.",
        },
      ],
      isLoading: false,
    });

    render(<PlantDetailRecentActivityRecap plantId="p1" onAddQuickCheck={() => {}} />);

    const card = screen.getByTestId("plant-detail-action-response-pair");
    expect(card).toHaveAttribute("data-reason", "awaiting_response");
    expect(card).toHaveAttribute("data-response-status", "pending");
    expect(screen.getByText("Waiting on plant response")).toBeInTheDocument();
    expect(screen.getByText(/What changed:/)).toBeInTheDocument();
    expect(screen.getByText(/Fed\./)).toBeInTheDocument();
    expect(screen.getByText(/No response check yet/)).toBeInTheDocument();
  });

  it("does not render when there is only a response check and no action", () => {
    useRecentMock.mockReturnValue({
      data: [
        {
          id: "response-only",
          plant_id: "p1",
          entry_type: "quick_log",
          entry_at: iso(4),
          note: "Response check: Worse.",
        },
      ],
      isLoading: false,
    });

    render(<PlantDetailRecentActivityRecap plantId="p1" onAddQuickCheck={() => {}} />);

    expect(screen.queryByTestId("plant-detail-action-response-pair")).toBeNull();
  });

  it("keeps card copy calm and non-automated", () => {
    useRecentMock.mockReturnValue({
      data: [
        {
          id: "action",
          plant_id: "p1",
          entry_type: "quick_log",
          entry_at: iso(18),
          note: "Watered.",
        },
      ],
      isLoading: false,
    });

    const { container } = render(
      <PlantDetailRecentActivityRecap plantId="p1" onAddQuickCheck={() => {}} />,
    );
    const text = container.textContent ?? "";
    expect(screen.getByTestId("plant-detail-action-response-pair")).toBeInTheDocument();
    expect(text).not.toMatch(/must|required|alert|action queue|automate|turn on|turn off|guaranteed/i);
  });
});
