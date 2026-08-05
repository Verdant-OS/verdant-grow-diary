import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BreedingEventForm } from "@/components/genetics/BreedingEventForm";

describe("BreedingEventForm Action Queue opt-in", () => {
  it("starts unchecked and clearly states that suggestions are optional and non-executing", async () => {
    render(
      <BreedingEventForm
        plants={[{ id: "plant-1", name: "Mother", tent_id: "tent-1" }]}
        busy={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const optIn = screen.getByRole("checkbox", {
      name: "Create approval-required follow-up suggestions",
    });
    expect(optIn).toHaveAttribute("data-testid", "breeding-action-queue-opt-in");
    expect(optIn).not.toBeChecked();
    expect(screen.getByText(/Optional\. Adds pending items/i)).toBeInTheDocument();
    expect(screen.getByText(/will not execute equipment changes/i)).toBeInTheDocument();

    await userEvent.click(optIn);
    expect(optIn).toBeChecked();
  });
});
