/**
 * Alerts page One-Tent Loop card wiring — presenter-only test.
 * Confirms next step points to approval-required Action Queue, the
 * approval-required note is present, and no side effects fire on render.
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

describe("Alerts One-Tent Loop next-step card wiring", () => {
  it("renders with current step Alert, next Action Queue", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="alert"
        ids={{ alertId: "a1" }}
        testId="alerts-one-tent-loop-next-step-card"
      />,
    );
    const card = screen.getByTestId("alerts-one-tent-loop-next-step-card");
    expect(card.getAttribute("data-current-step")).toBe("alert");
    expect(card.getAttribute("data-next-step")).toBe("action-queue");
    expect(card.textContent ?? "").toMatch(/Action Queue/);
    expect(
      screen.getByTestId("alerts-one-tent-loop-next-step-card-cta"),
    ).toHaveTextContent(/Add to Action Queue/i);
  });

  it("renders the approval-required Action Queue helper copy", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="alert"
        testId="alerts-one-tent-loop-next-step-card"
      />,
    );
    expect(
      screen.getByTestId("alerts-one-tent-loop-next-step-card-helper"),
    ).toHaveTextContent(
      /Review the approval-required Action Queue before taking action\./,
    );
  });

  it("routes Add to Action Queue to the /actions surface (never back to /alerts)", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="alert"
        testId="alerts-one-tent-loop-next-step-card"
      />,
    );
    const cta = screen.getByTestId("alerts-one-tent-loop-next-step-card-cta");
    expect(cta.getAttribute("href")).toBe("/actions");
    // Regression: CTA must not misleadingly land on /alerts while saying
    // "Add to Action Queue".
    expect(cta.getAttribute("href")).not.toMatch(/^\/alerts/);
    expect(cta).toHaveTextContent(/Add to Action Queue/i);
  });

  it("routes to /actions even when an alertId is present (Add to Action Queue is an action-queue navigation)", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="alert"
        ids={{ alertId: "a1" }}
        testId="alerts-one-tent-loop-next-step-card"
      />,
    );
    const cta = screen.getByTestId("alerts-one-tent-loop-next-step-card-cta");
    expect(cta.getAttribute("href")).toBe("/actions");
  });

  it("does not call fetch on render", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="alert"
        testId="alerts-one-tent-loop-next-step-card"
      />,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not introduce device-control or auto-execute wording", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="alert"
        testId="alerts-one-tent-loop-next-step-card"
      />,
    );
    const text = (
      screen.getByTestId("alerts-one-tent-loop-next-step-card").textContent ?? ""
    ).toLowerCase();
    expect(text).not.toMatch(/relay|actuator|switchbot|auto[- ]?run|auto[- ]?execute/);
  });

  it("hides UUID-looking ids from visible text", () => {
    const uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const { container } = renderCard(
      <OneTentLoopNextStepCard
        current="alert"
        ids={{ alertId: uuid }}
        testId="alerts-one-tent-loop-next-step-card"
      />,
    );
    expect(container.textContent ?? "").not.toContain(uuid);
  });

  it("Alerts source imports the card and includes the approval-required note", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/pages/Alerts.tsx", "utf8");
    expect(src).toContain('import OneTentLoopNextStepCard from "@/components/OneTentLoopNextStepCard"');
    expect(src).toContain('current="alert"');
    expect(src).toContain('testId="alerts-one-tent-loop-next-step-card"');
    expect(src).toContain("Action Queue items are approval-required.");
  });
});
