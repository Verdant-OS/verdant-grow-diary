/**
 * Targeted test for the One-Tent Loop next-step card wiring in
 * Tent Detail. Pure presenter assertions — no Supabase, AI, or
 * device-control surfaces are exercised.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OneTentLoopNextStepCard from "@/components/OneTentLoopNextStepCard";

const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockImplementation((() => {
  throw new Error("fetch should not be called by the next-step card");
}) as never);

function renderCard(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("TentDetail One-Tent Loop next-step card wiring", () => {
  it("renders the card with current step Tent", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="tent"
        ids={{ growId: "g1" }}
        testId="tent-detail-one-tent-loop-next-step-card"
      />,
    );
    const card = screen.getByTestId("tent-detail-one-tent-loop-next-step-card");
    expect(card).toBeInTheDocument();
    expect(card.getAttribute("data-current-step")).toBe("tent");
    expect(card.textContent ?? "").toMatch(/Tent/);
  });

  it("announces the next step as Plant", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="tent"
        ids={{ growId: "g1" }}
        testId="tent-detail-one-tent-loop-next-step-card"
      />,
    );
    const card = screen.getByTestId("tent-detail-one-tent-loop-next-step-card");
    expect(card.getAttribute("data-next-step")).toBe("plant");
    expect(card.textContent ?? "").toMatch(/Plant/);
  });

  it("renders the safe disabled state when no plant is selected", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="tent"
        ids={{ growId: "g1" }}
        testId="tent-detail-one-tent-loop-next-step-card"
      />,
    );
    expect(
      screen.getByTestId("tent-detail-one-tent-loop-next-step-card-disabled"),
    ).toHaveTextContent(/Next step unavailable until this record is selected\./);
  });

  it("shows the Open plant CTA when a tentId is available", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="tent"
        ids={{ tentId: "t1" }}
        testId="tent-detail-one-tent-loop-next-step-card"
      />,
    );
    const cta = screen.getByTestId(
      "tent-detail-one-tent-loop-next-step-card-cta",
    );
    expect(cta).toHaveTextContent(/Open plant/i);
  });

  it("does not render UUID-looking internal IDs in visible text", () => {
    const uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const { container } = renderCard(
      <OneTentLoopNextStepCard
        current="tent"
        ids={{ tentId: uuid, growId: uuid }}
        testId="tent-detail-one-tent-loop-next-step-card"
      />,
    );
    expect(container.textContent ?? "").not.toContain(uuid);
  });

  it("does not call fetch when rendered", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="tent"
        ids={{ growId: "g1" }}
        testId="tent-detail-one-tent-loop-next-step-card"
      />,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not introduce device-control or auto-execute wording", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="tent"
        ids={{ tentId: "t1" }}
        testId="tent-detail-one-tent-loop-next-step-card"
      />,
    );
    const card = screen.getByTestId("tent-detail-one-tent-loop-next-step-card");
    const text = (card.textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/relay|actuator|switchbot/);
    expect(text).not.toMatch(/auto[- ]?run|auto[- ]?execute/);
  });
});
