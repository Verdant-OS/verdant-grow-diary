import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import PlantDetailDisclosureSection from "@/components/PlantDetailDisclosureSection";

function StatefulChild() {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount((value) => value + 1)}>
      Child count {count}
    </button>
  );
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <PlantDetailDisclosureSection
      group="history"
      title="History"
      summary="Full plant activity and timeline history."
      open={open}
      onOpenChange={setOpen}
    >
      <StatefulChild />
    </PlantDetailDisclosureSection>
  );
}

describe("PlantDetailDisclosureSection", () => {
  it("is controlled, closed by default, and exposes stable ARIA wiring", () => {
    render(<Harness />);
    const trigger = screen.getByTestId("plant-detail-disclosure-history-trigger");
    const content = screen.getByTestId("plant-detail-disclosure-history-content");

    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-controls", "plant-detail-disclosure-history-content");
    expect(trigger.className).toMatch(/min-h-11/);
    expect(trigger.className).toMatch(/min-w-0/);
    expect(trigger.className).toMatch(/whitespace-normal/);
    expect(trigger.className).toMatch(/focus-visible:ring-2/);
    expect(content).toHaveAttribute("hidden");
    expect(content.className).toMatch(/min-w-0/);
    expect(content.offsetHeight).toBe(0);
  });

  it("uses native button keyboard semantics and preserves child state", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByTestId("plant-detail-disclosure-history-trigger");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("plant-detail-disclosure-history-content")).not.toHaveAttribute(
      "hidden",
    );

    fireEvent.click(screen.getByRole("button", { name: "Child count 0" }));
    expect(screen.getByRole("button", { name: "Child count 1" })).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByTestId("plant-detail-disclosure-history-content")).toHaveAttribute("hidden");
    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Child count 1" })).toBeInTheDocument();

    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.keyboard(" ");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});
