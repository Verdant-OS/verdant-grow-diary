/**
 * Targeted test for the One-Tent Loop next-step card wiring in
 * Grow Detail. Pure presenter assertions — no data fetching,
 * Supabase, AI, or device-control surfaces are exercised.
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

describe("GrowDetail One-Tent Loop next-step card wiring", () => {
  it("renders the card with current step Grow", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="grow"
        ids={{ growId: "g1" }}
        testId="grow-detail-one-tent-loop-next-step-card"
      />,
    );
    const card = screen.getByTestId("grow-detail-one-tent-loop-next-step-card");
    expect(card).toBeInTheDocument();
    expect(card.getAttribute("data-current-step")).toBe("grow");
    expect(card.textContent ?? "").toMatch(/Grow/);
  });

  it("announces the next step as Tent", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="grow"
        ids={{ growId: "g1" }}
        testId="grow-detail-one-tent-loop-next-step-card"
      />,
    );
    const card = screen.getByTestId("grow-detail-one-tent-loop-next-step-card");
    expect(card.getAttribute("data-next-step")).toBe("tent");
    expect(card.textContent ?? "").toMatch(/Tent/);
  });

  it("shows the Open tent CTA when a growId is available", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="grow"
        ids={{ growId: "g1" }}
        testId="grow-detail-one-tent-loop-next-step-card"
      />,
    );
    const cta = screen.getByTestId(
      "grow-detail-one-tent-loop-next-step-card-cta",
    );
    expect(cta).toHaveTextContent(/Open tent/i);
  });

  it("renders the safe disabled state when no growId is provided", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="grow"
        testId="grow-detail-one-tent-loop-next-step-card"
      />,
    );
    expect(
      screen.getByTestId("grow-detail-one-tent-loop-next-step-card-disabled"),
    ).toHaveTextContent(/Next step unavailable until this record is selected\./);
  });

  it("does not render UUID-looking internal IDs in visible text", () => {
    const uuid = "deadbeef-0000-1111-2222-333344445555";
    const { container } = renderCard(
      <OneTentLoopNextStepCard
        current="grow"
        ids={{ growId: uuid, tentId: uuid }}
        testId="grow-detail-one-tent-loop-next-step-card"
      />,
    );
    expect(container.textContent ?? "").not.toContain(uuid);
  });

  it("does not call fetch when rendered", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="grow"
        ids={{ growId: "g1" }}
        testId="grow-detail-one-tent-loop-next-step-card"
      />,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not introduce device-control or auto-execute wording", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="grow"
        ids={{ growId: "g1" }}
        testId="grow-detail-one-tent-loop-next-step-card"
      />,
    );
    const card = screen.getByTestId("grow-detail-one-tent-loop-next-step-card");
    const text = (card.textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/relay|actuator|switchbot/);
    expect(text).not.toMatch(/auto[- ]?run|auto[- ]?execute/);
  });
});
