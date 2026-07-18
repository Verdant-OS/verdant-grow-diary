/**
 * Targeted test for the One-Tent Loop next-step card wiring in
 * Plant Detail. Pure presenter assertions — does not exercise data
 * fetching, Supabase, AI, or device control.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OneTentLoopNextStepCard from "@/components/OneTentLoopNextStepCard";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

// Spy on fetch to prove the card itself triggers no network calls.
const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockImplementation((() => {
  throw new Error("fetch should not be called by the next-step card");
}) as never);

function renderCard(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("PlantDetail One-Tent Loop next-step card wiring", () => {
  it("renders the card with current step Plant", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="plant"
        ids={{ plantId: "p1", tentId: "t1", growId: "g1" }}
        testId="plant-detail-one-tent-loop-next-step-card"
      />,
    );
    const card = screen.getByTestId("plant-detail-one-tent-loop-next-step-card");
    expect(card).toBeInTheDocument();
    expect(card.getAttribute("data-current-step")).toBe("plant");
    expect(card.textContent ?? "").toMatch(/Plant/);
  });

  it("shows the safe Add quick log CTA when plantId is available", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="plant"
        ids={{ plantId: "p1", tentId: "t1", growId: "g1" }}
        testId="plant-detail-one-tent-loop-next-step-card"
      />,
    );
    const cta = screen.getByTestId("plant-detail-one-tent-loop-next-step-card-cta");
    expect(cta).toHaveTextContent(/Add quick log/i);
  });

  it("opens the exact assigned plant in Quick Log without navigating or fetching", () => {
    const listener = vi.fn();
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener);
    try {
      renderCard(
        <OneTentLoopNextStepCard
          current="plant"
          ids={{ plantId: "p1", tentId: "t1", growId: "g1" }}
          testId="plant-detail-one-tent-loop-next-step-card"
        />,
      );
      const cta = screen.getByTestId("plant-detail-one-tent-loop-next-step-card-cta");
      expect(cta.tagName).toBe("BUTTON");
      expect(cta.querySelector("a")).toBeNull();
      fireEvent.click(cta);

      expect(listener).toHaveBeenCalledTimes(1);
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
        plantId: "p1",
        tentId: "t1",
        growId: "g1",
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener);
    }
  });

  it("falls back to the safe disabled state when ids are missing", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="plant"
        testId="plant-detail-one-tent-loop-next-step-card"
      />,
    );
    expect(
      screen.getByTestId("plant-detail-one-tent-loop-next-step-card-disabled"),
    ).toHaveTextContent(/Next step unavailable until this record is selected\./);
  });

  it("does not render UUID-looking internal IDs in visible text", () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    const { container } = renderCard(
      <OneTentLoopNextStepCard
        current="plant"
        ids={{ plantId: uuid, tentId: uuid, growId: uuid }}
        testId="plant-detail-one-tent-loop-next-step-card"
      />,
    );
    expect(container.textContent ?? "").not.toContain(uuid);
  });

  it("does not call fetch when rendered", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="plant"
        ids={{ plantId: "p1", tentId: "t1", growId: "g1" }}
        testId="plant-detail-one-tent-loop-next-step-card"
      />,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not introduce device-control or auto-execute wording", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="plant"
        ids={{ plantId: "p1" }}
        testId="plant-detail-one-tent-loop-next-step-card"
      />,
    );
    const card = screen.getByTestId("plant-detail-one-tent-loop-next-step-card");
    const text = (card.textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/relay|actuator|switchbot/);
    expect(text).not.toMatch(/auto[- ]?run|auto[- ]?execute/);
  });
});
