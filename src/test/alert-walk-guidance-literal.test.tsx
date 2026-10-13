import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import GuidedGrowWalkPanel from "@/components/GuidedGrowWalkPanel";
import { ALERT_WALK_GUIDANCE_STEPS } from "@/lib/growWalkContracts";

vi.mock("@/lib/sensor", () => ({
  useLatestTentSensorSnapshot: () => ({
    status: "empty",
    snapshot: { status: "empty", captured_at: null, source: null, metrics: {} },
  }),
}));

/**
 * True when a step tells the grower to operate equipment.
 * "Change something" and "the equipment" do not match: the verb has to
 * aim at a fan, light, heater, humidifier, dehumidifier, pump, or timer.
 */
export function alertWalkStepOperatesEquipment(step: string): boolean {
  const device = /\b(?:fans?|lights?|heaters?|humidifiers?|dehumidifiers?|pumps?|timers?)\b/i;
  const operate =
    /\bturn\b[^.]{0,48}\b(?:up|down)\b|\bswitch(?:es)?\b[^.]{0,48}\b(?:on|off)\b|\b(?:set|raise|lower|increase|decrease)\b/i;
  return device.test(step) && operate.test(step);
}

function renderAlertWalk() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <GuidedGrowWalkPanel
        visitMode="alert_walk"
        onVisitModeChange={() => {}}
        targetOk
        tentId="tent-1"
        targetType="tent"
        testIdPrefix="ql"
      />
    </QueryClientProvider>,
  );
}

afterEach(() => cleanup());

describe("Alert Walk literal guidance", () => {
  it("renders the lead and the four steps verbatim", () => {
    renderAlertWalk();
    const guidance = screen.getByTestId("ql-alert-walk-guidance");
    expect(guidance).toHaveTextContent("Verify the alert in person before changing anything.");
    const list = guidance.querySelector("ol");
    expect(list).not.toBeNull();
    expect(list?.className).toContain("list-decimal");
    const steps = [...guidance.querySelectorAll("li")].map((item) => item.textContent);
    expect(steps).toEqual([
      "Open the alert and note what it says.",
      "Check the tent in person: the reading, the plant, and the equipment.",
      "Log what you actually saw.",
      "Change something only if you confirmed the cause.",
    ]);
  });

  it("does not tell the grower to operate a fan, light, heater, humidifier, dehumidifier, pump, or timer", () => {
    expect(alertWalkStepOperatesEquipment("Turn the exhaust fan up now.")).toBe(true);
    for (const step of ALERT_WALK_GUIDANCE_STEPS) {
      expect(alertWalkStepOperatesEquipment(step)).toBe(false);
    }
  });
});
