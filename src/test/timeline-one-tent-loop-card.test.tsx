/**
 * Timeline page One-Tent Loop card wiring — presenter-only test.
 * No data fetching, no Supabase, no AI calls.
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

describe("Timeline One-Tent Loop next-step card wiring", () => {
  it("renders with current step Timeline", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="timeline"
        ids={{ growId: "g1" }}
        testId="timeline-one-tent-loop-next-step-card"
      />,
    );
    const card = screen.getByTestId("timeline-one-tent-loop-next-step-card");
    expect(card.getAttribute("data-current-step")).toBe("timeline");
    expect(card.getAttribute("data-next-step")).toBe("sensor-snapshot");
  });

  it("shows the Review sensor snapshot CTA", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="timeline"
        ids={{ growId: "g1" }}
        testId="timeline-one-tent-loop-next-step-card"
      />,
    );
    expect(
      screen.getByTestId("timeline-one-tent-loop-next-step-card-cta"),
    ).toHaveTextContent(/Review sensor snapshot/i);
  });

  it("renders the Sensor Snapshot helper copy", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="timeline"
        testId="timeline-one-tent-loop-next-step-card"
      />,
    );
    expect(
      screen.getByTestId("timeline-one-tent-loop-next-step-card-helper"),
    ).toHaveTextContent(
      /Open Sensor Snapshot from Timeline to cross-check telemetry and proceed\./,
    );
  });

  it("does not call fetch", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="timeline"
        testId="timeline-one-tent-loop-next-step-card"
      />,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not introduce device-control or automation wording", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="timeline"
        testId="timeline-one-tent-loop-next-step-card"
      />,
    );
    const text = (
      screen.getByTestId("timeline-one-tent-loop-next-step-card").textContent ?? ""
    ).toLowerCase();
    expect(text).not.toMatch(/relay|actuator|switchbot|auto[- ]?run|auto[- ]?execute/);
  });

  it("does not render UUID-looking ids in visible text", () => {
    const uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const { container } = renderCard(
      <OneTentLoopNextStepCard
        current="timeline"
        ids={{ growId: uuid }}
        testId="timeline-one-tent-loop-next-step-card"
      />,
    );
    expect(container.textContent ?? "").not.toContain(uuid);
  });

  it("Timeline source imports the card and renders it near the top", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/pages/Timeline.tsx", "utf8");
    expect(src).toContain('import OneTentLoopNextStepCard from "@/components/OneTentLoopNextStepCard"');
    expect(src).toContain('current="timeline"');
    expect(src).toContain('testId="timeline-one-tent-loop-next-step-card"');
  });
});
