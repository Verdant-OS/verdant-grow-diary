import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import GuidedGrowWalkPanel from "@/components/GuidedGrowWalkPanel";
import {
  ALERT_WALK_GUIDANCE_LEAD,
  ALERT_WALK_GUIDANCE_STEPS,
  type GrowWalkVisitMode,
} from "@/lib/growWalkContracts";

vi.mock("@/lib/sensor", () => ({
  useLatestTentSensorSnapshot: () => ({
    status: "empty",
    snapshot: { status: "empty", captured_at: null, source: null, metrics: {} },
  }),
}));

const PLACEHOLDER = /coming later/i;

function Harness({ initial = "fast_check" as GrowWalkVisitMode }) {
  const [visitMode, setVisitMode] = useState<GrowWalkVisitMode>(initial);
  return (
    <GuidedGrowWalkPanel
      visitMode={visitMode}
      onVisitModeChange={setVisitMode}
      targetOk
      tentId="tent-1"
      targetType="tent"
      testIdPrefix="ql"
    />
  );
}

function renderPanel(initial: GrowWalkVisitMode = "fast_check") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness initial={initial} />
    </QueryClientProvider>,
  );
}

afterEach(() => cleanup());

describe("Alert Walk guidance", () => {
  it("replaces the coming-later placeholder with the final in-person steps", () => {
    renderPanel("alert_walk");

    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument();
    const guidance = screen.getByTestId("ql-alert-walk-guidance");
    expect(guidance).toHaveTextContent(ALERT_WALK_GUIDANCE_LEAD);
    for (const step of ALERT_WALK_GUIDANCE_STEPS) {
      expect(guidance).toHaveTextContent(step);
    }
    expect(guidance.querySelectorAll("li")).toHaveLength(ALERT_WALK_GUIDANCE_STEPS.length);
  });

  it("keeps the guidance off other visit modes", () => {
    renderPanel("fast_check");
    expect(screen.queryByTestId("ql-alert-walk-guidance")).not.toBeInTheDocument();
    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("ql-visit-mode-routine_walk"));
    expect(screen.queryByTestId("ql-alert-walk-guidance")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("ql-visit-mode-alert_walk"));
    expect(screen.getByTestId("ql-alert-walk-guidance")).toHaveTextContent(
      ALERT_WALK_GUIDANCE_LEAD,
    );
    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument();
  });
});
