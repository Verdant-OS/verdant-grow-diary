/**
 * Sensors page One-Tent Loop card wiring — presenter-only test.
 * Confirms the card never classifies missing/stale/invalid telemetry as
 * healthy and that the allowed source labels remain canonical.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OneTentLoopNextStepCard from "@/components/OneTentLoopNextStepCard";
import { ONE_TENT_LOOP_SENSOR_SOURCES } from "@/lib/oneTentLoopNavigationRules";

const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockImplementation((() => {
  throw new Error("fetch should not be called by the next-step card");
}) as never);

function renderCard(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("Sensors One-Tent Loop next-step card wiring", () => {
  it("renders with current step Sensor snapshot, next AI Doctor", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="sensor-snapshot"
        ids={{ growId: "g1", tentId: "t1" }}
        testId="sensors-one-tent-loop-next-step-card"
      />,
    );
    const card = screen.getByTestId("sensors-one-tent-loop-next-step-card");
    expect(card.getAttribute("data-current-step")).toBe("sensor-snapshot");
    expect(card.getAttribute("data-next-step")).toBe("ai-doctor");
    expect(
      screen.getByTestId("sensors-one-tent-loop-next-step-card-cta"),
    ).toHaveTextContent(/Open AI Doctor/i);
  });

  it("never describes telemetry as healthy", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="sensor-snapshot"
        testId="sensors-one-tent-loop-next-step-card"
      />,
    );
    const text = (
      screen.getByTestId("sensors-one-tent-loop-next-step-card").textContent ?? ""
    ).toLowerCase();
    expect(text).not.toMatch(/healthy/);
  });

  it("preserves canonical source labels", () => {
    expect(ONE_TENT_LOOP_SENSOR_SOURCES).toEqual([
      "live",
      "manual",
      "csv",
      "demo",
      "stale",
      "invalid",
    ]);
  });

  it("does not call fetch or introduce device wording", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="sensor-snapshot"
        testId="sensors-one-tent-loop-next-step-card"
      />,
    );
    const text = (
      screen.getByTestId("sensors-one-tent-loop-next-step-card").textContent ?? ""
    ).toLowerCase();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(text).not.toMatch(/relay|actuator|switchbot|auto[- ]?run|auto[- ]?execute/);
  });

  it("hides UUID-looking ids from visible text", () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    const { container } = renderCard(
      <OneTentLoopNextStepCard
        current="sensor-snapshot"
        ids={{ growId: uuid, tentId: uuid }}
        testId="sensors-one-tent-loop-next-step-card"
      />,
    );
    expect(container.textContent ?? "").not.toContain(uuid);
  });

  it("Sensors source imports and renders the card near the top", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/pages/Sensors.tsx", "utf8");
    expect(src).toContain('import OneTentLoopNextStepCard from "@/components/OneTentLoopNextStepCard"');
    expect(src).toContain('current="sensor-snapshot"');
    expect(src).toContain('testId="sensors-one-tent-loop-next-step-card"');
    // Page must not silently classify unknown telemetry as healthy.
    expect(src.toLowerCase()).not.toMatch(/unknown.*healthy|invalid.*healthy|stale.*healthy/);
  });
});
