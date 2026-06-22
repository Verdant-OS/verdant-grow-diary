/**
 * AI Doctor entry/review One-Tent Loop card wiring — presenter-only test.
 * The card never triggers AI calls and never invents certainty.
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

describe("AI Doctor One-Tent Loop next-step card wiring", () => {
  it("renders with current step AI Doctor, next Alert", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="ai-doctor"
        testId="ai-doctor-one-tent-loop-next-step-card"
      />,
    );
    const card = screen.getByTestId("ai-doctor-one-tent-loop-next-step-card");
    expect(card.getAttribute("data-current-step")).toBe("ai-doctor");
    expect(card.getAttribute("data-next-step")).toBe("alert");
    expect(
      screen.getByTestId("ai-doctor-one-tent-loop-next-step-card-cta"),
    ).toHaveTextContent(/Review alert/i);
  });

  it("renders the Alert helper copy", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="ai-doctor"
        testId="ai-doctor-one-tent-loop-next-step-card"
      />,
    );
    expect(
      screen.getByTestId("ai-doctor-one-tent-loop-next-step-card-helper"),
    ).toHaveTextContent(
      /Open Alert page to review and plan approval-required actions\./,
    );
  });

  it("CTA goes to alert detail when alertId is present", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="ai-doctor"
        ids={{ alertId: "a1" }}
        testId="ai-doctor-one-tent-loop-next-step-card"
      />,
    );
    const cta = screen.getByTestId("ai-doctor-one-tent-loop-next-step-card-cta");
    expect(cta.getAttribute("href")).toBe("/alerts/a1");
    // With a specific alertId, the CTA label stays singular ("Review alert").
    expect(cta.textContent ?? "").toMatch(/Review alert(?!s)/);
  });

  it("fallback to /alerts uses a plural 'Review alerts' label so the operator knows no specific alert was opened", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="ai-doctor"
        testId="ai-doctor-one-tent-loop-next-step-card"
      />,
    );
    const cta = screen.getByTestId("ai-doctor-one-tent-loop-next-step-card-cta");
    expect(cta.getAttribute("href")).toBe("/alerts");
    expect(cta).toHaveTextContent(/Review alerts/i);
  });

  it("does not call fetch (no AI calls triggered by rendering)", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="ai-doctor"
        testId="ai-doctor-one-tent-loop-next-step-card"
      />,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not introduce device-control wording", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="ai-doctor"
        testId="ai-doctor-one-tent-loop-next-step-card"
      />,
    );
    const text = (
      screen.getByTestId("ai-doctor-one-tent-loop-next-step-card").textContent ?? ""
    ).toLowerCase();
    expect(text).not.toMatch(/relay|actuator|switchbot|auto[- ]?run|auto[- ]?execute/);
  });

  it("hides UUID-looking ids from visible text", () => {
    const uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const { container } = renderCard(
      <OneTentLoopNextStepCard
        current="ai-doctor"
        ids={{ alertId: uuid }}
        testId="ai-doctor-one-tent-loop-next-step-card"
      />,
    );
    expect(container.textContent ?? "").not.toContain(uuid);
  });

  it("AI Doctor source imports the card and includes a cautious context note", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/pages/AiDoctorSessionsIndex.tsx", "utf8");
    expect(src).toContain('import OneTentLoopNextStepCard from "@/components/OneTentLoopNextStepCard"');
    expect(src).toContain('current="ai-doctor"');
    expect(src).toContain("AI Doctor uses available context. Missing context will be shown.");
  });
});
