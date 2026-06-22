import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OneTentLoopNextStepCard from "@/components/OneTentLoopNextStepCard";

function renderCard(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("OneTentLoopNextStepCard", () => {
  it("renders disabled calm copy when required ids are missing", () => {
    renderCard(<OneTentLoopNextStepCard current="tent" />);
    expect(
      screen.getByTestId("one-tent-loop-next-step-card-disabled"),
    ).toHaveTextContent(/Next step unavailable until this record is selected\./);
  });

  it("renders the safe CTA label and a link when ids are present", () => {
    renderCard(
      <OneTentLoopNextStepCard current="tent" ids={{ tentId: "t1" }} />,
    );
    const cta = screen.getByTestId("one-tent-loop-next-step-card-cta");
    expect(cta).toHaveTextContent("Open plant");
    expect(cta.querySelector("a")?.getAttribute("href")).toBe("/tents/t1");
  });

  it("uses approval-required wording when on the action-queue step CTA", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="action-queue"
        ids={{ actionId: "x1" }}
      />,
    );
    const cta = screen.getByTestId("one-tent-loop-next-step-card-cta");
    expect(cta).toHaveTextContent(/approval-required/i);
  });

  it("does not render any internal IDs as visible copy", () => {
    const { container } = renderCard(
      <OneTentLoopNextStepCard
        current="plant"
        ids={{ plantId: "secret-plant-id-12345" }}
      />,
    );
    expect(container.textContent ?? "").not.toContain("secret-plant-id-12345");
  });
});
