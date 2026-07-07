/**
 * Renders the QuickLogTargetPanel presenter and asserts the four
 * labeled fields display correctly for both plant and tent scope,
 * and that mobile-compact rendering keeps every label present.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import QuickLogTargetPanel from "@/components/QuickLogTargetPanel";
import { buildQuickLogTargetPanel } from "@/lib/quickLogTargetPanelViewModel";

const plants = [
  { id: "p1", name: "Auto #1", strain: "Bruce Banner", tent_id: "t1", grow_id: "g1" },
  { id: "p2", name: "Photo #2", strain: null, tent_id: null, grow_id: "g1" },
];
const tents = [{ id: "t1", name: "Tent A", grow_id: "g1" }];
const grows = [{ id: "g1", name: "Summer Run 2026" }];

describe("<QuickLogTargetPanel />", () => {
  it("renders Grow / Tent / Plant / Strain rows for a plant-scoped log", () => {
    const panel = buildQuickLogTargetPanel({
      resolved: {
        ok: true, targetType: "plant", targetId: "p1",
        plantId: "p1", tentId: "t1", growId: "g1",
      },
      plants, tents, grows,
    });
    render(<QuickLogTargetPanel panel={panel} />);
    expect(screen.getByTestId("qlv2-target-panel")).toBeInTheDocument();
    expect(screen.getByTestId("qlv2-target-panel-grow-label")).toHaveTextContent("Grow");
    expect(screen.getByTestId("qlv2-target-panel-grow-value")).toHaveTextContent("Summer Run 2026");
    expect(screen.getByTestId("qlv2-target-panel-tent-value")).toHaveTextContent("Tent A");
    expect(screen.getByTestId("qlv2-target-panel-plant-value")).toHaveTextContent("Auto #1");
    expect(screen.getByTestId("qlv2-target-panel-strain-value")).toHaveTextContent("Bruce Banner");
  });

  it("renders 'No tent assigned' warning row when plant has no tent", () => {
    const panel = buildQuickLogTargetPanel({
      resolved: {
        ok: true, targetType: "plant", targetId: "p2",
        plantId: "p2", tentId: null, growId: "g1",
      },
      plants, tents, grows,
    });
    render(<QuickLogTargetPanel panel={panel} />);
    const tentValue = screen.getByTestId("qlv2-target-panel-tent-value");
    expect(tentValue).toHaveTextContent("No tent assigned");
    expect(tentValue.getAttribute("data-present")).toBe("false");
  });

  it("renders nothing when panel is hidden", () => {
    const { container } = render(
      <QuickLogTargetPanel panel={{ visible: false, scope: "none", fields: [] }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders all four labels for tent scope (mobile-friendly compact)", () => {
    const panel = buildQuickLogTargetPanel({
      resolved: {
        ok: true, targetType: "tent", targetId: "t1",
        plantId: null, tentId: "t1", growId: "g1",
      },
      plants, tents, grows,
    });
    render(<QuickLogTargetPanel panel={panel} />);
    for (const label of ["Grow", "Tent", "Plant", "Strain"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
