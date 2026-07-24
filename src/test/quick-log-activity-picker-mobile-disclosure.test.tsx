import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import QuickLogActivityPicker from "@/components/QuickLogActivityPicker";

const PRIMARY_IDS = [
  "note",
  "photo",
  "watering",
  "feeding",
  "environment_check",
  "issue_observation",
] as const;

const ADDITIONAL_IDS = ["training", "defoliation", "manual_sensor_snapshot", "harvest"] as const;

function disclosure() {
  return screen.getByRole("button", { name: "More activity types" });
}

describe("QuickLogActivityPicker mobile progressive disclosure", () => {
  it("shows six primary activities by default and reveals additional activities accessibly", () => {
    render(<QuickLogActivityPicker plantStage="flower" onSelect={vi.fn()} />);

    for (const id of PRIMARY_IDS) {
      expect(screen.getByTestId(`quick-log-activity-${id}`)).toBeInTheDocument();
    }
    for (const id of ADDITIONAL_IDS) {
      expect(screen.queryByTestId(`quick-log-activity-${id}`)).toBeNull();
    }

    expect(disclosure()).toHaveAttribute("aria-expanded", "false");
    expect(disclosure()).toHaveAttribute("aria-controls", "quick-log-activity-additional");

    fireEvent.click(disclosure());

    expect(disclosure()).toHaveAttribute("aria-expanded", "true");
    for (const id of ADDITIONAL_IDS) {
      expect(screen.getByTestId(`quick-log-activity-${id}`)).toBeInTheDocument();
    }
  });

  it("uses a one-column mobile baseline, 44px controls, and wrapping labels", () => {
    render(<QuickLogActivityPicker plantStage="flower" onSelect={vi.fn()} />);

    expect(screen.getByTestId("quick-log-activity-primary")).toHaveClass("grid-cols-1");
    for (const id of PRIMARY_IDS) {
      const button = screen.getByTestId(`quick-log-activity-${id}`);
      expect(button).toHaveClass("min-h-11");
      expect(button).toHaveClass("whitespace-normal");
      expect(button.className).not.toContain("truncate");
    }
  });

  it("keeps the disclosure open when an additional activity is selected", () => {
    render(<QuickLogActivityPicker plantStage="flower" selectedId="training" onSelect={vi.fn()} />);

    expect(disclosure()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("quick-log-activity-training")).toBeInTheDocument();
  });

  it("keeps ineligible harvest discoverable with calm stage guidance", () => {
    const onSelect = vi.fn();
    render(<QuickLogActivityPicker plantStage="cure" onSelect={onSelect} />);
    fireEvent.click(disclosure());

    const harvest = screen.getByTestId("quick-log-activity-harvest");
    expect(harvest).toBeDisabled();
    expect(harvest).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("quick-log-activity-harvest-disabled-reason")).toHaveTextContent(
      "Harvest logging becomes available in Flower, Flush, or Harvest stages.",
    );
    fireEvent.click(harvest);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("allows harvest selection for eligible normalized stages", () => {
    const onSelect = vi.fn();
    render(<QuickLogActivityPicker plantStage="Flowering" onSelect={onSelect} />);
    fireEvent.click(disclosure());

    const harvest = screen.getByTestId("quick-log-activity-harvest");
    expect(harvest).not.toBeDisabled();
    fireEvent.click(harvest);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe("harvest");
  });
});
