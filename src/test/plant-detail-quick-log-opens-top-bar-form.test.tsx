/**
 * FA-20261119-M1 item 5: the plant page Quick Log button opens the same form
 * as the header Quick Log (QuickLogV2Sheet), aimed at this plant.
 *
 * Matthew picked the top-bar form on 2026-11-19. Before this change the
 * button opened PlantQuickLog, a different form, and a first-time grower
 * backtracked between the two.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/components/QuickLogV2Sheet", () => ({
  default: ({
    open,
    defaultTargetKey,
  }: {
    open: boolean;
    defaultTargetKey?: string | null;
  }) =>
    open ? (
      <div data-testid="top-bar-quick-log-form" data-target={defaultTargetKey ?? ""} />
    ) : null,
}));

import PlantDetailQuickLogButton from "@/components/PlantDetailQuickLogButton";

describe("Plant Detail Quick Log button", () => {
  it("opens the top-bar Quick Log form aimed at this plant", () => {
    render(<PlantDetailQuickLogButton plantId="plant-123" testId="plant-detail-quick-log-open" />);

    expect(screen.queryByTestId("top-bar-quick-log-form")).toBeNull();
    fireEvent.click(screen.getByTestId("plant-detail-quick-log-open"));

    const form = screen.getByTestId("top-bar-quick-log-form");
    expect(form).toHaveAttribute("data-target", "plant:plant-123");
  });

  it("keeps the visible Quick Log label", () => {
    render(<PlantDetailQuickLogButton plantId="plant-123" testId="plant-detail-quick-log-open" />);
    expect(screen.getByTestId("plant-detail-quick-log-open")).toHaveTextContent("Quick Log");
  });
});
